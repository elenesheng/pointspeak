
import { useState, useRef, useCallback, useEffect } from 'react';
import { AppStatus, ReasoningLogType, EditHistoryEntry } from '../types/ui.types';
import { DetailedRoomAnalysis, IdentifiedObject, Coordinate } from '../types/spatial.types';
import { IntentTranslation } from '../types/ai.types';
import { mapApiError } from '../utils/errorHandler';
import { GEMINI_CONFIG } from '../config/gemini.config';
import { useSpatialStore } from '../store/spatialStore';

// Services
import { analyzeRoomSpace, updateInsightsAfterEdit } from '../services/gemini/roomAnalysisService';
import { scanImageForObjects } from '../services/gemini/objectDetectionService';
import { translateIntentWithSpatialAwareness } from '../services/gemini/intentParsingService';
import { performImageEdit } from '../services/gemini/imageEditingService';
import { analyzeReferenceImage } from '../services/gemini/referenceAnalysisService';

interface UseGeminiAgentProps {
  addLog: (content: string, type: ReasoningLogType, metadata?: any) => void;
  pins: Coordinate[];
}

// Helper: Calculate the bounding box of the edited area
const calculateDirtyRegion = (
  targetObject?: IdentifiedObject, 
  pins?: Coordinate[]
): [number, number, number, number] | null => {
  if (targetObject?.box_2d) {
    const pad = 50; 
    return [
      Math.max(0, targetObject.box_2d[0] - pad),
      Math.max(0, targetObject.box_2d[1] - pad),
      Math.min(1000, targetObject.box_2d[2] + pad),
      Math.min(1000, targetObject.box_2d[3] + pad)
    ];
  }
  
  if (pins && pins.length > 0) {
     const xs = pins.map(p => p.x);
     const ys = pins.map(p => p.y);
     const pad = 100;
     return [
       Math.max(0, Math.min(...ys) - pad),
       Math.max(0, Math.min(...xs) - pad),
       Math.min(1000, Math.max(...ys) + pad),
       Math.min(1000, Math.max(...xs) + pad)
     ];
  }
  
  return null; 
};

// Helper: Merge old accurate objects with new objects from the dirty region
const smartMergeObjects = (
  oldObjects: IdentifiedObject[], 
  newObjects: IdentifiedObject[], 
  dirtyRegion: [number, number, number, number] | null
) => {
  if (!dirtyRegion) return newObjects;

  const intersects = (box: [number, number, number, number], region: [number, number, number, number]) => {
     return !(box[3] < region[1] || box[1] > region[3] || box[2] < region[0] || box[0] > region[2]);
  };

  const survivors = oldObjects.filter(obj => {
     if (!obj.box_2d) return false; 
     return !intersects(obj.box_2d, dirtyRegion);
  });

  const additions = newObjects.filter(obj => {
     if (!obj.box_2d) return false;
     return intersects(obj.box_2d, dirtyRegion);
  });

  return [...survivors, ...additions];
};

export const useGeminiAgent = ({ addLog, pins }: UseGeminiAgentProps) => {
  const store = useSpatialStore();
  const { currentVersionId, versions, versionOrder } = store;
  
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

  // Derived State from Store
  const currentSnapshot = store.getCurrentSnapshot();
  const scannedObjects = store.getCurrentObjects();
  const selectedObject = store.getSelectedObject();
  const roomAnalysis = currentSnapshot?.roomAnalysis || null;
  const generatedImage = (versionOrder.length > 1 && currentSnapshot) ? `data:image/jpeg;base64,${currentSnapshot.base64}` : null;
  const currentWorkingImage = currentSnapshot?.base64 || null;
  const currentEditIndex = currentVersionId ? versionOrder.indexOf(currentVersionId) : -1;

  // Map store versions to UI history format
  const editHistory: EditHistoryEntry[] = versionOrder.map(id => {
    const v = versions[id];
    return {
      base64: v.base64,
      timestamp: v.timestamp,
      operation: v.operation,
      description: v.description,
      scannedObjects: v.objects,
      roomAnalysis: v.roomAnalysis,
      selectedObject: v.selectedObjectId ? v.objects.find(o => o.id === v.selectedObjectId) : null
    };
  });

  // 1. Initial Room Scan + Object Detection
  const performInitialScan = async (base64: string, addToHistory: boolean = false) => {
    operationIdRef.current += 1;
    const currentOpId = operationIdRef.current;

    setStatus('Scanning Room...');
    addLog('Initiating architectural deep scan & object detection...', 'thought');
    setIsProcessing(true);

    try {
      const [analysis, objects] = await Promise.all([
        analyzeRoomSpace(base64),
        scanImageForObjects(base64)
      ]);

      if (currentOpId !== operationIdRef.current) return;

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
      if (currentOpId !== operationIdRef.current) return;
      
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

    // Use current objects from store
    const objects = store.getCurrentObjects();
    
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
      const desc = await analyzeReferenceImage(referenceBase64);
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

  // 4. Main Execution
  const executeCommand = async (
    inputBase64: string, 
    userText: string, 
    forceOverride: boolean = false, 
    overrideData?: any,
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

    try {
      let translation: IntentTranslation;
      let targetObject: IdentifiedObject | undefined = undefined;

      // Target Identification
      if (pins.length === 2 && !overrideData) {
        const targetX = pins[1].x;
        const targetY = pins[1].y;
        
        // Hit test against current objects
        const objects = store.getCurrentObjects();
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
        translation = await translateIntentWithSpatialAwareness(
          workingBase64,
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

      const editedImageBase64 = await performImageEdit(
        workingBase64,
        translation, 
        effectiveSelectedObject, 
        roomAnalysis, 
        activeModel, 
        targetObject,
        refDescToUse || undefined,
        refImageToUse
      );
      
      if (currentOpId !== operationIdRef.current) return;

      const pureBase64 = editedImageBase64.startsWith('data:') ? editedImageBase64.split(',')[1] : editedImageBase64;
      
      // --- POST-EDIT REFINEMENT ---
      let updatedObjects = scannedObjects; // Start with current objects
      let updatedInsights = roomAnalysis.insights;
      
      if (roomAnalysis) {
        setStatus('Refining object detection...');
        const dirtyRegion = calculateDirtyRegion(targetObject || effectiveSelectedObject, pins);
        
        // Scan new image
        const [newInsights, newObjectsFull] = await Promise.all([
            updateInsightsAfterEdit(pureBase64, roomAnalysis, translation.interpreted_intent),
            scanImageForObjects(pureBase64)
        ]);
        
        if (currentOpId !== operationIdRef.current) return;
        
        if (newInsights) updatedInsights = newInsights;
        
        if (newObjectsFull) {
            // Merge logic preserves identity where possible
            updatedObjects = smartMergeObjects(scannedObjects, newObjectsFull, dirtyRegion);
            addLog(`✓ Smart Scan: Updated objects in edited region.`, 'thought');
        }
      }

      // COMMIT TO STORE (Create New Version)
      store.addVersion({
        base64: pureBase64,
        operation: translation.operation_type,
        description: translation.interpreted_intent,
        objects: updatedObjects,
        roomAnalysis: { ...roomAnalysis, insights: updatedInsights },
        selectedObjectId: effectiveSelectedObject?.id || null
      });

      addLog('✓ Image successfully edited', 'success');
      return pureBase64;

    } catch (err) {
      if (currentOpId !== operationIdRef.current) return;
      const appErr = mapApiError(err);
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

  const jumpToEdit = useCallback((index: number) => {
    store.jumpToVersion(index);
    const snapshot = store.getCurrentSnapshot();
    if(snapshot) {
        addLog(`↻ Restored state: ${snapshot.description}`, 'action');
    }
  }, [store, addLog]);

  const undoEdit = useCallback(() => currentEditIndex > 0 && jumpToEdit(currentEditIndex - 1), [currentEditIndex, jumpToEdit]);
  const redoEdit = useCallback(() => currentEditIndex < versionOrder.length - 1 && jumpToEdit(currentEditIndex + 1), [currentEditIndex, versionOrder.length, jumpToEdit]);
  const resetToOriginal = useCallback(() => jumpToEdit(0), [jumpToEdit]);
  
  const exportHistory = useCallback(() => {
    if (versionOrder.length === 0) return;
    addLog(`📥 Exporting ${versionOrder.length} versions...`, 'action');
    
    versionOrder.forEach((id, i) => {
        const v = versions[id];
        const link = document.createElement('a');
        link.href = `data:image/jpeg;base64,${v.base64}`;
        const num = (i + 1).toString().padStart(2, '0');
        const safeDesc = (v.description || v.operation).replace(/[^a-z0-9]/gi, '_').substring(0, 20);
        link.download = `${num}_${safeDesc}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
  }, [versionOrder, versions, addLog]);

  const resetAgent = () => {
    operationIdRef.current += 1;
    setStatus('Idle');
    setIsProcessing(false);
    // Note: We don't necessarily clear the store here if we want to keep history until explicit upload
    // But UI reset usually implies clearing state
    // For now, we rely on performInitialScan to reset the store when a new image is uploaded.
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
    exportHistory 
  };
};
