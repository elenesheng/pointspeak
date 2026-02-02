import { useState, useRef, useCallback, useMemo } from 'react';
import { AppStatus, ReasoningLogType, ReasoningLogMetadata, EditHistoryEntry } from '../types/ui.types';
import { DetailedRoomAnalysis, IdentifiedObject, Coordinate } from '../types/spatial.types';
import { IntentTranslation } from '../types/ai.types';
import { mapApiError } from '../utils/errorHandler';
import { GEMINI_CONFIG } from '../config/gemini.config';
import { useSpatialStore } from '../store/spatialStore';
import { useLearningStore } from '../store/learningStore';
import { useShallow } from 'zustand/react/shallow';
import { convertToJPEG, normalizeBase64 } from '../utils/imageProcessing';
import { analyzeRoomSpace, updateInsightsAfterEdit } from '../services/gemini/roomAnalysisService';
import { scanImageForObjects } from '../services/gemini/objectDetectionService';
import { translateIntentWithSpatialAwareness } from '../services/gemini/intentParsingService';
import { performImageEdit } from '../services/gemini/imageEditingService';
import { analyzeReferenceImage } from '../services/gemini/referenceAnalysisService';

interface UseGeminiAgentProps {
  addLog: (content: string, type: ReasoningLogType, metadata?: ReasoningLogMetadata) => void;
  pins: Coordinate[];
}

interface OverrideData {
  forceAction?: IntentTranslation;
  forceObject?: IdentifiedObject;
}

type BoundingBox = [number, number, number, number];

const calculateDirtyRegion = (
  targetObject?: IdentifiedObject,
  pins?: Coordinate[]
): BoundingBox | null => {
  if (targetObject?.box_2d) {
    const pad = 50;
    return [
      Math.max(0, targetObject.box_2d[0] - pad),
      Math.max(0, targetObject.box_2d[1] - pad),
      Math.min(1000, targetObject.box_2d[2] + pad),
      Math.min(1000, targetObject.box_2d[3] + pad),
    ];
  }

  if (pins && pins.length > 0) {
    const xs = pins.map((p) => p.x);
    const ys = pins.map((p) => p.y);
    const pad = 100;
    return [
      Math.max(0, Math.min(...ys) - pad),
      Math.max(0, Math.min(...xs) - pad),
      Math.min(1000, Math.max(...ys) + pad),
      Math.min(1000, Math.max(...xs) + pad),
    ];
  }

  return null;
};

const smartMergeObjects = (
  oldObjects: IdentifiedObject[],
  newObjects: IdentifiedObject[],
  dirtyRegion: BoundingBox | null
): IdentifiedObject[] => {
  if (!dirtyRegion) return newObjects;

  const intersects = (box: BoundingBox, region: BoundingBox): boolean => {
    return !(box[3] < region[1] || box[1] > region[3] || box[2] < region[0] || box[0] > region[2]);
  };

  const survivors = oldObjects.filter((obj) => {
    if (!obj.box_2d) return false;
    return !intersects(obj.box_2d, dirtyRegion);
  });

  const additions = newObjects.filter((obj) => {
    if (!obj.box_2d) return false;
    return intersects(obj.box_2d, dirtyRegion);
  });

  return [...survivors, ...additions];
};

export const useGeminiAgent = ({ addLog, pins }: UseGeminiAgentProps) => {
  const learningStore = useLearningStore();
  
  const currentVersionId = useSpatialStore(state => state.currentVersionId);
  const versions = useSpatialStore(state => state.versions);
  const versionOrder = useSpatialStore(state => state.versionOrder);
  
  const currentSnapshot = currentVersionId ? (versions[currentVersionId] || null) : null;
  const scannedObjects = currentSnapshot?.objects || [];
  const selectedObject = currentSnapshot?.selectedObjectId 
    ? (currentSnapshot.objects.find(o => o.id === currentSnapshot.selectedObjectId) || null)
    : null;
  const roomAnalysis = currentSnapshot?.roomAnalysis || null;
  
  // Primitives
  const generatedImage = versionOrder.length > 1 && currentSnapshot 
    ? `data:image/png;base64,${currentSnapshot.base64}` 
    : null;
  const currentWorkingImage = currentSnapshot?.base64 || null;
  const currentEditIndex = currentVersionId ? versionOrder.indexOf(currentVersionId) : -1;
  
  // Store actions (these don't need to trigger re-renders, just need access)
  const store = useSpatialStore();
  
  const [status, setStatus] = useState<AppStatus>('Idle');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeModel, setActiveModel] = useState<string>(GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO);
  
  // Feedback UI
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  
  // Reference Image
  const [activeRefImage, setActiveRefImage] = useState<string | null>(null);
  const [activeRefDesc, setActiveRefDesc] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  const operationIdRef = useRef<number>(0);

  // Map store versions to UI history format (memoized to prevent unnecessary recalculations)
  const editHistory: EditHistoryEntry[] = useMemo(() => {
    return versionOrder.map(id => {
      const v = versions[id];
      if (!v) {
        return {
          base64: '',
          timestamp: new Date(),
          operation: '',
          description: '',
          scannedObjects: [],
          roomAnalysis: null,
          selectedObject: null
        };
      }
      return {
        base64: v.base64,
        timestamp: v.timestamp,
        operation: v.operation,
        description: v.description,
        scannedObjects: v.objects,
        roomAnalysis: v.roomAnalysis,
        selectedObject: v.selectedObjectId ? v.objects.find(o => o.id === v.selectedObjectId) || null : null
      };
    });
  }, [versionOrder, versions]);

  const cancelOperation = useCallback(() => {
    if (!isProcessing) return;
    operationIdRef.current += 1;
    setIsProcessing(false);
    setStatus('Idle');
    setEstimatedTime(0);
    if (timerRef.current) clearInterval(timerRef.current);
    addLog('Operation cancelled by user.', 'action');
  }, [isProcessing, addLog]);

  // 1. Initial Room Scan + Object Detection
  const performInitialScan = async (base64: string, addToHistory: boolean = false) => {
    operationIdRef.current += 1;
    const currentOpId = operationIdRef.current;

    setStatus('Scanning Room...');
    addLog('Initiating architectural deep scan & object detection...', 'thought');
    setIsProcessing(true);

    try {
      // Convert PNG to JPEG for API calls (API services expect JPEG)
      const jpegBase64 = await convertToJPEG(normalizeBase64(base64));
      
      // Add timeout to prevent hanging - wrap in Promise.race
      const scanPromise = Promise.all([
        analyzeRoomSpace(jpegBase64),
        scanImageForObjects(jpegBase64)
      ]);
      
      const timeoutPromise = new Promise<[Awaited<ReturnType<typeof analyzeRoomSpace>>, Awaited<ReturnType<typeof scanImageForObjects>>]>((_, reject) => {
        setTimeout(() => reject(new Error('Scan timeout after 60 seconds')), 60000);
      });
      
      const [analysis, objects] = await Promise.race([
        scanPromise,
        timeoutPromise
      ]);

      if (currentOpId !== operationIdRef.current) {
        setStatus('Ready');
        setIsProcessing(false);
        return;
      }

      if (addToHistory) {
         store.addVersion({
            base64,
            operation: 'Visualization',
            description: 'Generated View',
            objects,
            roomAnalysis: analysis,
            selectedObjectId: null
         });
      } else {
         store.initialize(base64, objects, analysis);
      }
      
      addLog('✓ Room Analysis & Object Scan Complete', 'analysis', analysis);
      addLog(`✓ Detected ${objects.length} interactable objects`, 'success');

    } catch (err) {
      if (currentOpId !== operationIdRef.current) {
        setStatus('Ready');
        setIsProcessing(false);
        return;
      }
      
      const appErr = mapApiError(err);
      console.warn("Room scan failed:", appErr);
      
      // Still initialize store even on partial failure to allow editing
      const fallbackAnalysis = { 
        room_type: "Detected Room", 
        constraints: [], 
        traffic_flow: "Standard Layout", 
        insights: [] 
      };

      if (!addToHistory) {
        store.initialize(base64, [], fallbackAnalysis);
      }
      
      addLog('Room analysis failed, but ready for commands.', 'error');
    } finally {
      if (currentOpId === operationIdRef.current) {
        setStatus('Ready');
        setIsProcessing(false);
      }
    }
  };

  // 2. Identify Object
  const identifyObjectAtLocation = async (base64: string, x: number, y: number) => {
    operationIdRef.current += 1;
    const currentOpId = operationIdRef.current;
    
    // Just simulated delay for UI feel, no actual async needed for hit testing existing objects
    setStatus('Analyzing Source...');
    setIsProcessing(true);
    await new Promise(r => setTimeout(r, 50));
    if (currentOpId !== operationIdRef.current) return;

    // Use current objects from store (read directly for async operation)
    const state = useSpatialStore.getState();
    const objects = state.currentVersionId ? (state.versions[state.currentVersionId]?.objects || []) : [];
    
    let candidates = objects.filter(obj => {
       if (!obj.box_2d) return false;
       const [ymin, xmin, ymax, xmax] = obj.box_2d;
       return x >= xmin && x <= xmax && y >= ymin && y <= ymax;
    });
    
    candidates.sort((a, b) => {
        if (!a.box_2d || !b.box_2d) return 0;
        const areaA = (a.box_2d[2] - a.box_2d[0]) * (a.box_2d[3] - a.box_2d[1]);
        const areaB = (b.box_2d![2] - b.box_2d![0]) * (b.box_2d![3] - b.box_2d![1]);
        return areaA - areaB;
    });
    
    let foundObject = candidates.length > 0 ? candidates[0] : null;

    if (!foundObject) {
       // Fuzzy search surfaces
       const FUZZY_RADIUS = 30;
       const nearbySurfaces = objects.filter(obj => {
          if (!obj.box_2d) return false;
          if (obj.category !== 'Surface' && obj.category !== 'Structure') return false;
          const [ymin, xmin, ymax, xmax] = obj.box_2d;
          return x >= (xmin - FUZZY_RADIUS) && x <= (xmax + FUZZY_RADIUS) && 
                 y >= (ymin - FUZZY_RADIUS) && y <= (ymax + FUZZY_RADIUS);
       });
       if (nearbySurfaces.length > 0) foundObject = nearbySurfaces[0];
    }

    if (foundObject) {
       store.setSelectedObject(foundObject.id);
       addLog(`Selected: ${foundObject.name} (${foundObject.category})`, 'success', foundObject);
    } else {
       // Manual selection not persistent in store logic for simplicty, just log
       store.setSelectedObject(null);
       addLog('No specific object detected at click.', 'thought');
    }
    
    if (currentOpId === operationIdRef.current) {
       setStatus('Ready');
       setIsProcessing(false);
    }
  };

  // 3. Analyze Reference
  const analyzeReference = async (referenceBase64: string): Promise<string | null> => {
     operationIdRef.current += 1;
    const currentOpId = operationIdRef.current;
    
    setIsProcessing(true);
    setStatus('Analyzing Reference...');
    addLog('Analyzing reference material...', 'thought');
    setActiveRefImage(referenceBase64);

    try {
      // Convert PNG to JPEG for API call
      const jpegBase64 = await convertToJPEG(normalizeBase64(referenceBase64));
      const desc = await analyzeReferenceImage(jpegBase64);
      if (currentOpId !== operationIdRef.current) return null;
      setActiveRefDesc(desc);
      addLog(`✓ Reference analyzed: ${desc}`, 'success');
      return desc;
    } catch (err) {
      if (currentOpId !== operationIdRef.current) return null;
      addLog('Failed to analyze reference image.', 'error');
      return null;
    } finally {
      if (currentOpId === operationIdRef.current) {
        setStatus('Ready');
        setIsProcessing(false);
      }
    }
  };

  const executeCommand = async (
    inputBase64: string,
    userText: string,
    forceOverride: boolean = false,
    overrideData?: OverrideData,
    referenceDescription?: string,
    referenceImageBase64?: string
  ): Promise<string | undefined> => {
    operationIdRef.current += 1;
    const currentOpId = operationIdRef.current;

    const workingBase64 = inputBase64 || currentWorkingImage;
    if (!roomAnalysis || !workingBase64) {
      addLog("No active image to edit. Please upload a photo.", 'error');
      return;
    }

    const refImageToUse = referenceImageBase64 || activeRefImage;
    const refDescToUse = referenceDescription || activeRefDesc;

    let effectiveSelectedObject = selectedObject;
    if (!effectiveSelectedObject) {
       effectiveSelectedObject = {
         id: 'global_room_context',
         name: 'Entire Room',
         position: 'Global Context',
         parent_structure: 'Room',
         visual_details: 'The entire view of the room including all furniture and structure',
         category: 'Structure'
       };
       addLog('No object selected. Assuming Global Room Edit.', 'thought');
    }

    setIsProcessing(true);
    setStatus('Analyzing Point...');
    addLog(forceOverride ? '⚠️ User Override: Executing.' : 'Understanding intent...', forceOverride ? 'action' : 'thought');

    const isPro = activeModel === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO;
    setEstimatedTime(isPro ? 20 : 10); 
    
    timerRef.current = window.setInterval(() => {
       setEstimatedTime(prev => Math.max(0, prev - 1));
    }, 1000);

    let translation: IntentTranslation | undefined = undefined;
    let targetObject: IdentifiedObject | undefined = undefined;
    
    try {

      // Target Identification
      if (pins.length === 2 && !overrideData) {
        const targetX = pins[1].x;
        const targetY = pins[1].y;
        
        // Hit test against current objects (read directly for async operation)
        const state = useSpatialStore.getState();
        const objects = state.currentVersionId ? (state.versions[state.currentVersionId]?.objects || []) : [];
        let targetCandidates = objects.filter(obj => {
           if (!obj.box_2d) return false;
           const [ymin, xmin, ymax, xmax] = obj.box_2d;
           return targetX >= xmin && targetX <= xmax && targetY >= ymin && targetY <= ymax;
        });
        
        targetCandidates.sort((a, b) => {
           if (!a.box_2d || !b.box_2d) return 0;
           return ((a.box_2d[2] - a.box_2d[0]) * (a.box_2d[3] - a.box_2d[1])) - 
                  ((b.box_2d[2] - b.box_2d[0]) * (b.box_2d[3] - b.box_2d[1]));
        });

        targetObject = targetCandidates.length > 0 ? targetCandidates[0] : undefined;
        
        if (!targetObject) {
             targetObject = { id: 'target', name: 'Target Spot', position: `[${targetX.toFixed(0)},${targetY.toFixed(0)}]` };
        }
      }

      // Reasoning
      if (forceOverride && overrideData) {
        translation = overrideData.forceAction;
      } else {
        // Convert PNG to JPEG for API call
        const jpegWorkingBase64 = await convertToJPEG(normalizeBase64(workingBase64));
        translation = await translateIntentWithSpatialAwareness(
          jpegWorkingBase64,
          userText,
          effectiveSelectedObject,
          roomAnalysis,
          pins,
          targetObject,
          refDescToUse || undefined
        );
        
        if (currentOpId !== operationIdRef.current) return;

        if (translation.validation && !translation.validation.valid) {
             addLog('⚠️ SPATIAL WARNING: ' + translation.validation.warnings.join(', '), 'validation', {
                 ...translation.validation,
                 canForce: true,
                 forceAction: translation,
                 forceObject: effectiveSelectedObject
             });
             setIsProcessing(false);
             setStatus('Ready');
             if (timerRef.current) clearInterval(timerRef.current);
             setEstimatedTime(0);
             return; 
        }
        addLog(translation.interpreted_intent, 'intent', translation);
      }

      const modelName = activeModel === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO ? 'Pro' : 'Flash';
      
      setStatus(`Editing Image (${isPro ? 'Pro' : 'Fast'})...` as AppStatus);
      addLog(`⚡ Generating with ${modelName}...`, 'thought');

      // Get original image for quality reference (lossless quality target)
      // This helps the model maintain quality by seeing the original as a reference
      const state = useSpatialStore.getState();
      const originalImage = state.versionOrder.length > 0 
        ? state.versions[state.versionOrder[0]]?.base64 || null
        : null;
      const isUsingOriginalAsReference = !!originalImage && !refImageToUse;
      const qualityReferenceImage = originalImage || refImageToUse;

      // Get learning context - SMART: Only pass relevant warnings for this operation type
      const learningContext = learningStore.getLearningContext(translation.operation_type);
      if (learningContext.warningsForAI.length > 0) {
        addLog(`🧠 Applying ${learningContext.warningsForAI.length} learned insight(s)`, 'thought');
      }

      const editedImageBase64 = await performImageEdit(
        workingBase64,
        translation, 
        effectiveSelectedObject, 
        roomAnalysis, 
        activeModel, 
        targetObject,
        refDescToUse || undefined,
        qualityReferenceImage || null,
        isUsingOriginalAsReference, // Pass flag to indicate original image reference
        scannedObjects, // Pass all detected objects for scene context
        learningContext // Pass learning context for AI behavior adjustment
      );
      
      if (currentOpId !== operationIdRef.current) return;

      const pureBase64 = editedImageBase64.startsWith('data:') ? editedImageBase64.split(',')[1] : editedImageBase64;
      
      // OPTIMISTIC UPDATE: Commit to store immediately with existing objects
      // This shows the result instantly, objects will update in background
      store.addVersion({
        base64: pureBase64,
        operation: translation.operation_type,
        description: translation.interpreted_intent,
        objects: scannedObjects, // Use existing objects immediately
        roomAnalysis: { ...roomAnalysis }, // Use existing insights
        selectedObjectId: effectiveSelectedObject?.id || null
      });

      // Record success immediately
      learningStore.recordSuccess(translation.interpreted_intent, roomAnalysis.room_type);
      addLog('✓ Image successfully edited', 'success');
      
      // Update objects and insights in background (non-blocking)
      // This runs after the result is already shown to the user
      const jpegPureBase64 = await convertToJPEG(normalizeBase64(pureBase64));
      
      Promise.all([
        roomAnalysis ? updateInsightsAfterEdit(jpegPureBase64, roomAnalysis, translation.interpreted_intent) : Promise.resolve(null),
        scanImageForObjects(jpegPureBase64, true) // Fast mode enabled
      ]).then(([newInsights, newObjectsFull]) => {
        // Only update if operation hasn't been cancelled
        if (currentOpId !== operationIdRef.current) return;
        
        // Update current version with new objects and insights
        if (newObjectsFull && newObjectsFull.length > 0) {
          store.updateCurrentObjects(newObjectsFull);
          addLog(`✓ Objects updated (${newObjectsFull.length} detected)`, 'thought');
        }
        
        if (newInsights) {
          store.updateCurrentVersion({
            roomAnalysis: { ...roomAnalysis, insights: newInsights }
          });
        }
      }).catch(err => {
        console.warn('[Background] Object detection failed:', err);
      });

      return pureBase64;

    } catch (err) {
      if (currentOpId !== operationIdRef.current) return;
      const appErr = mapApiError(err);
      
      // Record failure for learning (translation might not be defined if error occurred before parsing)
      const failedAction = translation?.interpreted_intent || userText || 'Unknown action';
      // Determine failure reason based on error message
      const errorLower = appErr.message.toLowerCase();
      let failureReason: 'hallucination' | 'quality' | 'incomplete' | 'other' = 'other';
      if (errorLower.includes('hallucin') || errorLower.includes('invent')) {
        failureReason = 'hallucination';
      } else if (errorLower.includes('quality') || errorLower.includes('blur')) {
        failureReason = 'quality';
      } else if (errorLower.includes('incomplete') || errorLower.includes('partial')) {
        failureReason = 'incomplete';
      }
      learningStore.recordFailure(failedAction, failureReason, roomAnalysis?.room_type || 'unknown');
      
      addLog(`Failed: ${appErr.message}`, 'error');
      return undefined;
    } finally {
      if (currentOpId === operationIdRef.current) {
        setActiveRefImage(null);
        setActiveRefDesc(null);
        setStatus('Ready');
        setIsProcessing(false);
        setEstimatedTime(0);
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }
  };

  const jumpToEdit = useCallback(
    (index: number) => {
      store.jumpToVersion(index);
    },
    [store]
  );

  const undoEdit = useCallback(() => currentEditIndex > 0 && jumpToEdit(currentEditIndex - 1), [currentEditIndex, jumpToEdit]);
  const redoEdit = useCallback(() => currentEditIndex < versionOrder.length - 1 && jumpToEdit(currentEditIndex + 1), [currentEditIndex, versionOrder.length, jumpToEdit]);
  const resetToOriginal = useCallback(() => jumpToEdit(0), [jumpToEdit]);
  
  const exportHistory = useCallback(() => {
    if (versionOrder.length === 0) return;
    addLog(`📥 Exporting ${versionOrder.length} versions...`, 'action');
    
    versionOrder.forEach((id, i) => {
        const v = versions[id];
        const link = document.createElement('a');
        // Export as PNG to preserve quality (or convert to JPEG if preferred)
        link.href = `data:image/png;base64,${v.base64}`;
        const num = (i + 1).toString().padStart(2, '0');
        const safeDesc = (v.description || v.operation).replace(/[^a-z0-9]/gi, '_').substring(0, 20);
        link.download = `${num}_${safeDesc}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
  }, [versionOrder, versions, addLog]);

  const resetAgent = () => {
    operationIdRef.current += 1;
    setStatus('Idle');
    setIsProcessing(false);
    setActiveRefImage(null);
    setActiveRefDesc(null);
    store.reset();
  };

  const setSelectedObjectWrapper = (obj: IdentifiedObject | null) => {
      store.setSelectedObject(obj ? obj.id : null);
  };

  return {
    status,
    roomAnalysis,
    selectedObject,
    generatedImage,
    isProcessing,
    activeModel,
    setActiveModel,
    performInitialScan,
    identifyObjectAtLocation,
    executeCommand,
    analyzeReference,
    resetAgent,
    setSelectedObject: setSelectedObjectWrapper,
    editHistory,
    currentEditIndex,
    undoEdit,
    redoEdit,
    resetToOriginal,
    jumpToEdit,
    canUndo: currentEditIndex > 0,
    canRedo: currentEditIndex < versionOrder.length - 1,
    estimatedTime, 
    scannedObjects,
    exportHistory,
    cancelOperation
  };
};
