
import { useState, useRef, useCallback } from 'react';
import { AppStatus, ReasoningLogType, EditHistoryEntry } from '../types/ui.types';
import { DetailedRoomAnalysis, IdentifiedObject, Coordinate } from '../types/spatial.types';
import { IntentTranslation } from '../types/ai.types';
import { mapApiError } from '../utils/errorHandler';
import { GEMINI_CONFIG } from '../config/gemini.config';

// Services
import { analyzeRoomSpace } from '../services/gemini/roomAnalysisService';
import { identifyObject } from '../services/gemini/objectDetectionService';
import { translateIntentWithSpatialAwareness } from '../services/gemini/intentParsingService';
import { performImageEdit } from '../services/gemini/imageEditingService';
import { analyzeReferenceImage } from '../services/gemini/referenceAnalysisService';

interface UseGeminiAgentProps {
  addLog: (content: string, type: ReasoningLogType, metadata?: any) => void;
  pins: Coordinate[];
}

export const useGeminiAgent = ({ addLog, pins }: UseGeminiAgentProps) => {
  const [status, setStatus] = useState<AppStatus>('Idle');
  const [roomAnalysis, setRoomAnalysis] = useState<DetailedRoomAnalysis | null>(null);
  const [selectedObject, setSelectedObject] = useState<IdentifiedObject | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeModel, setActiveModel] = useState<string>(GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO);
  
  // --- STATE: Reference Image Persistence ---
  const [activeRefImage, setActiveRefImage] = useState<string | null>(null);

  // --- HISTORY STATE ---
  const [editHistory, setEditHistory] = useState<EditHistoryEntry[]>([]);
  const [currentEditIndex, setCurrentEditIndex] = useState<number>(-1);
  const [currentWorkingImage, setCurrentWorkingImage] = useState<string | null>(null);

  // Debounce tracking
  const identificationRef = useRef<number | null>(null);

  // 1. Initial Room Scan
  const performInitialScan = async (base64: string) => {
    setStatus('Scanning Room...');
    addLog('Initiating architectural deep scan...', 'thought');
    
    // Initialize History
    const initialEntry: EditHistoryEntry = {
      base64: base64,
      timestamp: new Date(),
      operation: 'Original',
      description: 'Original Upload'
    };
    setEditHistory([initialEntry]);
    setCurrentEditIndex(0);
    setCurrentWorkingImage(base64);
    setGeneratedImage(null); // Reset generated view

    try {
      const analysis = await analyzeRoomSpace(base64);
      setRoomAnalysis(analysis);
      setStatus('Ready');
      addLog('✓ Room Analysis Complete', 'analysis', analysis);
    } catch (err) {
      const appErr = mapApiError(err);
      console.warn("Room scan failed:", appErr);
      setRoomAnalysis({ room_type: "Room", constraints: [], traffic_flow: "Unknown" });
      setStatus('Ready');
    }
  };

  // 2. Identify Object (Debounced)
  const identifyObjectAtLocation = async (base64: string, x: number, y: number) => {
    if (identificationRef.current) clearTimeout(identificationRef.current);

    setStatus('Analyzing Source...');
    
    return new Promise<void>((resolve) => {
      identificationRef.current = window.setTimeout(async () => {
        try {
          const obj = await identifyObject(base64, x, y);
          setSelectedObject(obj);
          setStatus('Ready');
          addLog(`Object Identified: ${obj.name} (${obj.position})`, 'success', obj);
        } catch (err) {
          addLog('Could not identify object. You can still type a command.', 'error');
          setStatus('Ready');
          setSelectedObject({
             id: 'manual', name: 'Selected Area', position: `[${x.toFixed(0)},${y.toFixed(0)}]`, parent_structure: 'Object'
          });
        }
        resolve();
      }, 300);
    });
  };

  // 3. Analyze Reference Image
  const analyzeReference = async (referenceBase64: string): Promise<string | null> => {
    setStatus('Analyzing Reference...');
    addLog('Analyzing reference material...', 'thought');
    
    // Persist the reference image in state for multimodal use
    setActiveRefImage(referenceBase64);

    try {
      const desc = await analyzeReferenceImage(referenceBase64);
      addLog(`✓ Reference analyzed: ${desc}`, 'success');
      setStatus('Ready');
      return desc;
    } catch (err) {
      addLog('Failed to analyze reference image.', 'error');
      setStatus('Ready');
      return null;
    }
  };

  // 4. Main Execution Pipeline
  const executeCommand = async (
    _unusedOriginalBase64: string, 
    userText: string, 
    forceOverride: boolean = false, 
    overrideData?: any,
    referenceDescription?: string,
    referenceImageBase64?: string
  ) => {
    // USE CURRENT WORKING IMAGE instead of original
    const workingBase64 = currentWorkingImage;
    if (!roomAnalysis || !selectedObject || !workingBase64) {
      addLog("No active image to edit. Please upload a photo.", 'error');
      return;
    }

    // Determine which reference image to use (Argument takes precedence, then State)
    const refImageToUse = referenceImageBase64 || activeRefImage;

    setIsProcessing(true);
    setStatus('Analyzing Point...');
    addLog(forceOverride ? '⚠️ User Override: Executing despite warnings.' : 'Understanding intent...', forceOverride ? 'action' : 'thought');

    try {
      let translation: IntentTranslation;
      let targetObject: IdentifiedObject | undefined = undefined;

      // Step A: Target Identification
      if (pins.length === 2 && !overrideData) {
        addLog('Scanning destination point...', 'analysis');
        try {
          targetObject = await identifyObject(workingBase64, pins[1].x, pins[1].y);
        } catch (e) {
          console.warn('Target identification failed, proceeding with coordinates only.');
          targetObject = { id: 'target', name: 'Target Spot', position: 'Destination', parent_structure: 'Room' };
        }
      }

      // Step B: Consolidated Reasoning
      if (forceOverride && overrideData) {
        translation = overrideData.forceAction;
      } else {
        translation = await translateIntentWithSpatialAwareness(
          workingBase64,
          userText,
          selectedObject,
          roomAnalysis,
          pins,
          targetObject
        );

        if (translation.validation && !translation.validation.valid) {
             addLog('⚠️ SPATIAL WARNING: ' + translation.validation.warnings.join(', '), 'validation', {
                 ...translation.validation,
                 canForce: true,
                 forceAction: translation,
                 forceObject: selectedObject
             });
             setStatus('Ready');
             setIsProcessing(false);
             return; 
        } else {
             addLog(translation.interpreted_intent, 'intent', translation);
             if (translation.conversational_response) {
                 addLog(translation.conversational_response, 'thought');
             }
        }
      }

      // Step C: Image Generation
      const modelName = activeModel === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO ? 'Nano Banana PRO' : 'Nano Banana Standard';
      setStatus('Editing Image...');
      const referenceMsg = referenceDescription ? ` + Material Ref` : "";
      addLog(`⚡ Generating with ${modelName}${referenceMsg}...`, 'thought');

      try {
        const editedImageBase64 = await performImageEdit(
          workingBase64, // Pass the CURRENT state
          translation, 
          selectedObject, 
          roomAnalysis, 
          activeModel, 
          targetObject,
          referenceDescription,
          refImageToUse
        );

        // CLEANUP BASE64 HEADER if present to store pure data or URL
        const pureBase64 = editedImageBase64.startsWith('data:') ? editedImageBase64.split(',')[1] : editedImageBase64;
        // For display we need the header
        const displayImage = editedImageBase64.startsWith('data:') ? editedImageBase64 : `data:image/jpeg;base64,${editedImageBase64}`;

        // UPDATE HISTORY
        const newEntry: EditHistoryEntry = {
          base64: pureBase64,
          timestamp: new Date(),
          operation: translation.operation_type,
          description: translation.interpreted_intent
        };

        // If we were in the middle of history, slice the future off
        const historyUpToNow = editHistory.slice(0, currentEditIndex + 1);
        const newHistory = [...historyUpToNow, newEntry];

        setEditHistory(newHistory);
        setCurrentEditIndex(newHistory.length - 1);
        setCurrentWorkingImage(pureBase64);
        setGeneratedImage(displayImage);

        addLog('✓ Image successfully edited', 'success');
      } catch (err) {
        const appErr = mapApiError(err);
        addLog(`Image editing failed: ${appErr.message}`, 'error');
      }

      addLog('Process Complete', 'success');

    } catch (err) {
      const appErr = mapApiError(err);
      addLog(appErr.message, 'error');
    } finally {
      setStatus('Ready');
      setIsProcessing(false);
    }
  };

  // --- HISTORY ACTIONS ---

  const jumpToEdit = useCallback((index: number) => {
    if (index < 0 || index >= editHistory.length) return;
    const entry = editHistory[index];
    setCurrentEditIndex(index);
    setCurrentWorkingImage(entry.base64);
    setGeneratedImage(index === 0 ? null : `data:image/jpeg;base64,${entry.base64}`);
    addLog(`↻ Jumped to state: ${entry.description}`, 'action');
  }, [editHistory, addLog]);

  const undoEdit = useCallback(() => {
    if (currentEditIndex > 0) {
      jumpToEdit(currentEditIndex - 1);
    }
  }, [currentEditIndex, jumpToEdit]);

  const redoEdit = useCallback(() => {
    if (currentEditIndex < editHistory.length - 1) {
      jumpToEdit(currentEditIndex + 1);
    }
  }, [currentEditIndex, editHistory.length, jumpToEdit]);

  const resetToOriginal = useCallback(() => {
    jumpToEdit(0);
  }, [jumpToEdit]);

  const resetAgent = () => {
    setStatus('Idle');
    setRoomAnalysis(null);
    setSelectedObject(null);
    setGeneratedImage(null);
    setEditHistory([]);
    setCurrentEditIndex(-1);
    setCurrentWorkingImage(null);
    setActiveRefImage(null);
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
    // History Exports
    editHistory,
    currentEditIndex,
    undoEdit,
    redoEdit,
    resetToOriginal,
    jumpToEdit,
    canUndo: currentEditIndex > 0,
    canRedo: currentEditIndex < editHistory.length - 1,
  };
};
