
import { useState, useRef, useCallback, useEffect } from 'react';
import { AppStatus, ReasoningLogType, EditHistoryEntry } from '../types/ui.types';
import { DetailedRoomAnalysis, IdentifiedObject, Coordinate } from '../types/spatial.types';
import { IntentTranslation } from '../types/ai.types';
import { mapApiError } from '../utils/errorHandler';
import { GEMINI_CONFIG } from '../config/gemini.config';

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
  // If we have a specific target object (e.g. from a Move or Edit on an object)
  if (targetObject?.box_2d) {
    const pad = 50; // Padding to catch bleed/shadows
    return [
      Math.max(0, targetObject.box_2d[0] - pad),
      Math.max(0, targetObject.box_2d[1] - pad),
      Math.min(1000, targetObject.box_2d[2] + pad),
      Math.min(1000, targetObject.box_2d[3] + pad)
    ];
  }
  
  // If we used pins (e.g. Move Source -> Target)
  if (pins && pins.length > 0) {
     const xs = pins.map(p => p.x);
     const ys = pins.map(p => p.y);
     const pad = 100; // Larger padding for point-based edits
     return [
       Math.max(0, Math.min(...ys) - pad),
       Math.max(0, Math.min(...xs) - pad),
       Math.min(1000, Math.max(...ys) + pad),
       Math.min(1000, Math.max(...xs) + pad)
     ];
  }
  
  // If global edit (no target, no pins), return null to signify full rescan
  return null; 
};

// Helper: Merge old accurate objects with new objects from the dirty region
const smartMergeObjects = (
  oldObjects: IdentifiedObject[], 
  newObjects: IdentifiedObject[], 
  dirtyRegion: [number, number, number, number] | null
) => {
  if (!dirtyRegion) return newObjects; // Global edit, replace all

  // [ymin, xmin, ymax, xmax]
  const intersects = (box: [number, number, number, number], region: [number, number, number, number]) => {
     return !(box[3] < region[1] || box[1] > region[3] || box[2] < region[0] || box[0] > region[2]);
  };

  // 1. Keep OLD objects strictly OUTSIDE dirty region (Preserve Accuracy)
  const survivors = oldObjects.filter(obj => {
     if (!obj.box_2d) return false; 
     return !intersects(obj.box_2d, dirtyRegion);
  });

  // 2. Keep NEW objects strictly INSIDE/INTERSECTING dirty region (Capture Changes)
  const additions = newObjects.filter(obj => {
     if (!obj.box_2d) return false;
     return intersects(obj.box_2d, dirtyRegion);
  });

  return [...survivors, ...additions];
};

export const useGeminiAgent = ({ addLog, pins }: UseGeminiAgentProps) => {
  const [status, setStatus] = useState<AppStatus>('Idle');
  const [roomAnalysis, setRoomAnalysis] = useState<DetailedRoomAnalysis | null>(null);
  const [selectedObject, setSelectedObject] = useState<IdentifiedObject | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeModel, setActiveModel] = useState<string>(GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO);
  
  // Scanned Objects State
  const [scannedObjects, setScannedObjects] = useState<IdentifiedObject[]>([]);
  
  // Feedback UI
  const [estimatedTime, setEstimatedTime] = useState<number>(0);
  
  // Reference Image
  const [activeRefImage, setActiveRefImage] = useState<string | null>(null);
  const [activeRefDesc, setActiveRefDesc] = useState<string | null>(null);

  // History
  const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([]);
  const [currentEditIndex, setCurrentEditIndex] = useState<number>(-1);
  const [currentWorkingImage, setCurrentWorkingImage] = useState<string | null>(null);

  const timerRef = useRef<number | null>(null);
  
  // OPERATION ID REF - Critical for invalidation
  const operationIdRef = useRef<number>(0);

  // 1. Initial Room Scan + Object Detection
  const performInitialScan = async (base64: string) => {
    // Increment Op ID to invalidate previous runs
    operationIdRef.current += 1;
    const currentOpId = operationIdRef.current;

    setStatus('Scanning Room...');
    addLog('Initiating architectural deep scan & object detection...', 'thought');
    setIsProcessing(true);
    
    const initialEntry: EditHistoryEntry = {
      base64: base64,
      timestamp: new Date(),
      operation: 'Original',
      description: 'Original Upload'
    };
    
    // Set immediate UI state
    setEditHistory([initialEntry]);
    setCurrentEditIndex(0);
    setCurrentWorkingImage(base64);
    setGeneratedImage(null);
    setScannedObjects([]);

    try {
      const timeoutPromise = new Promise<DetailedRoomAnalysis>((_, reject) => 
        setTimeout(() => reject(new Error("Analysis timed out")), 60000)
      );

      // Run Analysis and Object Scan in parallel
      const [analysis, objects] = await Promise.all([
        Promise.race([analyzeRoomSpace(base64), timeoutPromise]),
        scanImageForObjects(base64)
      ]);

      // STALE CHECK
      if (currentOpId !== operationIdRef.current) {
        console.log(`[Abort] Scan operation ${currentOpId} aborted.`);
        return; 
      }

      setRoomAnalysis(analysis);
      setScannedObjects(objects);
      
      addLog('✓ Room Analysis & Object Scan Complete', 'analysis', analysis);
      addLog(`✓ Detected ${objects.length} interactable objects`, 'success');

    } catch (err) {
      if (currentOpId !== operationIdRef.current) return;
      
      const appErr = mapApiError(err);
      console.warn("Room scan failed or timed out:", appErr);
      
      setRoomAnalysis({ 
        room_type: "Detected Room", 
        constraints: [], 
        traffic_flow: "Standard Layout", 
        insights: [
           { category: 'Critique', title: 'Analysis Pending', description: 'Could not complete deep scan. You can still edit the image.', suggestions: [] }
        ] 
      });
      addLog('Room analysis skipped (timeout/error), but ready for commands.', 'error');
    } finally {
      if (currentOpId === operationIdRef.current) {
        setStatus('Ready');
        setIsProcessing(false);
      }
    }
  };

  // 2. Identify Object (Hit Test with Fuzzy Fallback)
  const identifyObjectAtLocation = async (base64: string, x: number, y: number) => {
    operationIdRef.current += 1;
    const currentOpId = operationIdRef.current;

    setStatus('Analyzing Source...');
    setIsProcessing(true);
    
    // Simulate short processing time for UI feedback
    await new Promise(r => setTimeout(r, 50));

    // Stale Check
    if (currentOpId !== operationIdRef.current) return;

    // --- PHASE 1: PRECISE HIT TEST ---
    let candidates = scannedObjects.filter(obj => {
       if (!obj.box_2d) return false;
       const [ymin, xmin, ymax, xmax] = obj.box_2d;
       return x >= xmin && x <= xmax && y >= ymin && y <= ymax;
    });

    // Sort by area (Smallest -> Largest)
    candidates.sort((a, b) => {
        if (!a.box_2d || !b.box_2d) return 0;
        const areaA = (a.box_2d[2] - a.box_2d[0]) * (a.box_2d[3] - a.box_2d[1]);
        const areaB = (b.box_2d![2] - b.box_2d![0]) * (b.box_2d![3] - b.box_2d![1]);
        return areaA - areaB;
    });

    let foundObject = candidates.length > 0 ? candidates[0] : null;

    // --- PHASE 2: FUZZY HIT TEST (If Precise Misses) ---
    if (!foundObject) {
       const FUZZY_RADIUS = 30; // +/- 30 units (3% of image)
       
       const nearbySurfaces = scannedObjects.filter(obj => {
          if (!obj.box_2d) return false;
          // Only check large items
          if (obj.category !== 'Surface' && obj.category !== 'Structure') return false;

          const [ymin, xmin, ymax, xmax] = obj.box_2d;
          // Check if click is within expanded box
          return x >= (xmin - FUZZY_RADIUS) && x <= (xmax + FUZZY_RADIUS) && 
                 y >= (ymin - FUZZY_RADIUS) && y <= (ymax + FUZZY_RADIUS);
       });
       
       // Sort by distance to center of object (Prioritize closer objects)
       nearbySurfaces.sort((a, b) => {
          if (!a.box_2d || !b.box_2d) return 0;
          const centerA_x = (a.box_2d[1] + a.box_2d[3]) / 2;
          const centerA_y = (a.box_2d[0] + a.box_2d[2]) / 2;
          const distA = Math.sqrt(Math.pow(x - centerA_x, 2) + Math.pow(y - centerA_y, 2));

          const centerB_x = (b.box_2d![1] + b.box_2d![3]) / 2;
          const centerB_y = (b.box_2d![0] + b.box_2d![2]) / 2;
          const distB = Math.sqrt(Math.pow(x - centerB_x, 2) + Math.pow(y - centerB_y, 2));
          
          return distA - distB;
       });

       if (nearbySurfaces.length > 0) {
          foundObject = nearbySurfaces[0];
          addLog(`(Fuzzy Match) Snapped to nearby ${foundObject.name}`, 'thought');
       }
    }

    if (foundObject) {
       setSelectedObject(foundObject);
       addLog(`Selected: ${foundObject.name} (${foundObject.category})`, 'success', foundObject);
    } else {
       // Manual Fallback
       const manualObj: IdentifiedObject = {
         id: 'manual_selection',
         name: 'Selected Area',
         position: `[${x.toFixed(0)},${y.toFixed(0)}]`,
         parent_structure: 'Object',
         visual_details: 'User selected area',
         category: 'Furniture'
       };
       setSelectedObject(manualObj);
       addLog('No specific object detected at click. Using generic selection.', 'thought');
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
    
    setIsProcessing(true); // Lock UI
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
        setIsProcessing(false); // Unlock UI
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
        
        let targetCandidates = scannedObjects.filter(obj => {
           if (!obj.box_2d) return false;
           const [ymin, xmin, ymax, xmax] = obj.box_2d;
           return targetX >= xmin && targetX <= xmax && targetY >= ymin && targetY <= ymax;
        });
        
        if (targetCandidates.length === 0) {
            const FUZZY_RADIUS = 30;
            targetCandidates = scannedObjects.filter(obj => {
                if (!obj.box_2d) return false;
                if (obj.category !== 'Surface' && obj.category !== 'Structure') return false;
                const [ymin, xmin, ymax, xmax] = obj.box_2d;
                return targetX >= (xmin - FUZZY_RADIUS) && targetX <= (xmax + FUZZY_RADIUS) && 
                       targetY >= (ymin - FUZZY_RADIUS) && targetY <= (ymax + FUZZY_RADIUS);
            });
        }
        
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

      // Stale check
      if (currentOpId !== operationIdRef.current) return;

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
      const displayImage = editedImageBase64.startsWith('data:') ? editedImageBase64 : `data:image/jpeg;base64,${editedImageBase64}`;

      const newEntry: EditHistoryEntry = {
        base64: pureBase64,
        timestamp: new Date(),
        operation: translation.operation_type,
        description: translation.interpreted_intent
      };
      const newHistory = [...editHistory.slice(0, currentEditIndex + 1), newEntry];
      setEditHistory(newHistory);
      setCurrentEditIndex(newHistory.length - 1);
      setCurrentWorkingImage(pureBase64);
      setGeneratedImage(displayImage);

      addLog('✓ Image successfully edited', 'success');

      // --- CRITICAL: POST-EDIT REFINEMENT (Partial Rescan) ---
      if (roomAnalysis) {
        // Change Status but KEEP isProcessing=true to block input
        setStatus('Refining object detection...');
        
        // 1. Calculate Dirty Region
        const dirtyRegion = calculateDirtyRegion(targetObject || effectiveSelectedObject, pins);
        
        // 2. Parallel: Update Insights + Scan New Image
        const [newInsights, newObjectsFull] = await Promise.all([
          updateInsightsAfterEdit(pureBase64, roomAnalysis, translation.interpreted_intent),
          scanImageForObjects(pureBase64)
        ]);
        
        if (currentOpId !== operationIdRef.current) return;
        
        setRoomAnalysis(prev => prev ? { ...prev, insights: newInsights } : null);
        addLog('💡 Insights updated', 'thought');
        
        // 3. Smart Merge
        const mergedObjects = smartMergeObjects(scannedObjects, newObjectsFull, dirtyRegion);
        setScannedObjects(mergedObjects);
        addLog(`✓ Smart Scan: Updated objects in edited region, preserved others.`, 'thought');
      }

      return pureBase64; // Return for Autonomous Agent chaining

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
    if (index < 0 || index >= editHistory.length) return;
    const entry = editHistory[index];
    setCurrentEditIndex(index);
    setCurrentWorkingImage(entry.base64);
    setGeneratedImage(index === 0 ? null : `data:image/jpeg;base64,${entry.base64}`);
    
    // Scan newly jumped image
    operationIdRef.current += 1;
    const currentOpId = operationIdRef.current;
    
    scanImageForObjects(entry.base64).then(newObjects => {
       if (currentOpId === operationIdRef.current) {
          setScannedObjects(newObjects);
       }
    });

    addLog(`↻ Jumped to state: ${entry.description}`, 'action');
  }, [editHistory, addLog]);

  const undoEdit = useCallback(() => currentEditIndex > 0 && jumpToEdit(currentEditIndex - 1), [currentEditIndex, jumpToEdit]);
  const redoEdit = useCallback(() => currentEditIndex < editHistory.length - 1 && jumpToEdit(currentEditIndex + 1), [currentEditIndex, editHistory.length, jumpToEdit]);
  const resetToOriginal = useCallback(() => jumpToEdit(0), [jumpToEdit]);

  const resetAgent = () => {
    // CRITICAL: Invalidate all running operations
    operationIdRef.current += 1;
    
    setStatus('Idle');
    setRoomAnalysis(null);
    setSelectedObject(null);
    setGeneratedImage(null);
    setEditHistory([]);
    setCurrentEditIndex(-1);
    setCurrentWorkingImage(null);
    setActiveRefImage(null);
    setActiveRefDesc(null);
    setEstimatedTime(0);
    setScannedObjects([]);
    setIsProcessing(false);
    if (timerRef.current) clearInterval(timerRef.current);
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
    setSelectedObject,
    editHistory,
    currentEditIndex,
    undoEdit,
    redoEdit,
    resetToOriginal,
    jumpToEdit,
    canUndo: currentEditIndex > 0,
    canRedo: currentEditIndex < editHistory.length - 1,
    estimatedTime, 
    scannedObjects, 
  };
};
