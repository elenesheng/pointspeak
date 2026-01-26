
import React, { useState, useRef, useEffect } from 'react';
import { Target, Key } from 'lucide-react';

// Hooks
import { useReasoningLogs } from './hooks/useReasoningLogs';
import { usePinManagement } from './hooks/usePinManagement';
import { useImageUpload } from './hooks/useImageUpload';
import { useGeminiAgent } from './hooks/useGeminiAgent';
import { useSuggestions } from './hooks/useSuggestions';

// Services
import { generateMultiAngleRender } from './services/gemini/renderingService';

// Utils
import { cropBase64Image, generateBinaryMask } from './utils/imageProcessing';

// Components
import { Canvas } from './components/canvas/Canvas';
import { ReasoningPanel } from './components/reasoning/ReasoningPanel';
import { InputArea } from './components/input/InputArea';
import { RoomInsightsPanel } from './components/insights/RoomInsightsPanel';
import { DesignAssistant } from './components/suggestions/DesignAssistant';
import { IdentifiedObject } from './types/spatial.types';
import { IntentTranslation } from './types/ai.types';

const App: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [isKeyChecking, setIsKeyChecking] = useState<boolean>(true);

  const { logs, addLog, clearLogs } = useReasoningLogs();
  const { pins, addPin, resetPins } = usePinManagement();
  
  const { 
    status, roomAnalysis, selectedObject, generatedImage, isProcessing, activeModel, setActiveModel,
    performInitialScan, identifyObjectAtLocation, executeCommand, analyzeReference, resetAgent, setSelectedObject,
    editHistory, currentEditIndex, undoEdit, redoEdit, resetToOriginal, jumpToEdit, canUndo, canRedo, scannedObjects,
    exportHistory, cancelOperation
  } = useGeminiAgent({ addLog, pins });
  
  // Design Assistant Hook
  const { 
    suggestions, 
    isGenerating: isGeneratingSuggestions, 
    isOpen: isAssistantOpen, 
    setIsOpen: setIsAssistantOpen, 
    generateIdeas, 
    dismissSuggestion,
    removeSuggestion,
    clearSuggestions 
  } = useSuggestions(addLog);

  const { imageUrl, handleFileUpload, clearImage, setImageUrl } = useImageUpload(
    () => resetAll(),
    (base64) => performInitialScan(base64)
  );
  
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceDesc, setReferenceDesc] = useState<string | null>(null);

  const [userInput, setUserInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showInsights, setShowInsights] = useState(false);
  const [isGeneratingRender, setIsGeneratingRender] = useState(false);
  
  // Multi-View State
  const [visualizationViews, setVisualizationViews] = useState<string[]>([]);
  const [activeViewIndex, setActiveViewIndex] = useState(0);

  useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio) {
          setApiKeySelected(await window.aistudio.hasSelectedApiKey());
        } else {
          setApiKeySelected(true); 
        }
      } catch (e) {
        setApiKeySelected(false);
      } finally {
        setIsKeyChecking(false);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !isProcessing) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); if (canUndo) undoEdit(); }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); if (canRedo) redoEdit(); }
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [canUndo, canRedo, undoEdit, redoEdit, isProcessing]);

  const handleConnectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setApiKeySelected(true);
    }
  };

  const resetAll = () => {
    resetPins();
    clearLogs();
    clearImage();
    resetAgent();
    clearSuggestions();
    setReferenceImage(null);
    setReferenceDesc(null);
    setUserInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Reset Views
    setVisualizationViews([]);
    setActiveViewIndex(0);
  };

  const getActiveBase64 = () => {
    if (generatedImage) return generatedImage.split(',')[1];
    if (imageUrl) return imageUrl.split(',')[1];
    return null;
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>, rect: DOMRect) => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64) return;

    if (pins.length === 1 && isProcessing) {
       addLog('Wait for source identification before setting target.', 'error');
       return;
    }
    
    if (isProcessing && status !== 'Ready') return;

    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;
    
    addPin({ x, y });

    if (pins.length === 0 || pins.length === 2) {
       if (pins.length === 2) {
           setSelectedObject(null);
           addLog(`Resetting. New source at: [${x.toFixed(0)}, ${y.toFixed(0)}]`, 'action');
       } else {
           addLog(`Source identified: [${x.toFixed(0)}, ${y.toFixed(0)}]`, 'action');
       }
       await identifyObjectAtLocation(activeBase64, x, y);

    } else if (pins.length === 1) {
       addLog(`Target location set: [${x.toFixed(0)}, ${y.toFixed(0)}]. Ready for command.`, 'action');
    }
  };

  const handleObjectSelect = (obj: IdentifiedObject) => {
    setSelectedObject(obj);
    
    // Minimal fix: Auto-place pins to room center
    if (obj.category === 'Structure' && obj.box_2d) {
        const cx = (obj.box_2d[1] + obj.box_2d[3]) / 2;
        const cy = (obj.box_2d[0] + obj.box_2d[2]) / 2;
        resetPins();
        addPin({ x: cx, y: cy });
        addLog(`Room active: ${obj.name}`, 'action');
    }
  };

  const handleSend = async (overrideData?: any, textOverride?: string) => {
    const activeBase64 = getActiveBase64();
    const textToSend = textOverride || userInput;
    
    if (!activeBase64 || (!textToSend.trim() && !overrideData)) return;
    
    // Capture reference before cleanup
    const refBase64 = referenceImage ? referenceImage.split(',')[1] : undefined;
    
    // Clear input immediately 
    setUserInput(''); 
    
    // Cleanup Reference UI immediately so next generation doesn't use it by mistake
    setReferenceImage(null);
    setReferenceDesc(null);
    
    await executeCommand(
        activeBase64, 
        textToSend, 
        !!overrideData, 
        overrideData, 
        referenceDesc || undefined, 
        refBase64
    );
  };
  
  const handleGetIdeas = async (goal: string) => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64) return;
    
    await generateIdeas(activeBase64, roomAnalysis, scannedObjects, goal);
  };
  
  const handleApplySuggestion = (suggestion: any) => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64) return;
    
    // 1. Remove this specific suggestion from the list immediately (visual feedback)
    removeSuggestion(suggestion.id);
    
    // 2. Close panel
    setIsAssistantOpen(false);
    
    addLog(`✨ Applying idea: ${suggestion.title}`, 'action');
    
    // Auto-select target if possible
    if (suggestion.target_object_name) {
       const target = scannedObjects.find(o => o.name.toLowerCase() === suggestion.target_object_name.toLowerCase());
       if (target) setSelectedObject(target);
    }
    
    // Send immediately with explicit text override
    setTimeout(() => {
        handleSend(null, suggestion.suggested_prompt);
    }, 100);
  };
  
  const handleEditSuggestion = (suggestion: any) => {
      // Just populate input and close panel
      setUserInput(suggestion.suggested_prompt);
      setIsAssistantOpen(false);
      
      // Auto-select target if possible
      if (suggestion.target_object_name) {
         const target = scannedObjects.find(o => o.name.toLowerCase() === suggestion.target_object_name.toLowerCase());
         if (target) setSelectedObject(target);
      }
  };

  const handleReferenceUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      setReferenceImage(result);
      const base64 = result.split(',')[1];
      
      // analyzeReference now handles its own isProcessing state, locking the UI
      const desc = await analyzeReference(base64);
      setReferenceDesc(desc);
      
      // Auto-populate prompt AFTER analysis is complete (if not cancelled)
      if (desc) {
          if (selectedObject) {
             setUserInput(`Change ${selectedObject.name} using this reference`);
          } else {
             setUserInput(`Apply this reference style to the room`);
          }
      }
    };
    reader.readAsDataURL(file);
  };
  
  const handleClearReference = () => {
      // If we are currently analyzing, we must cancel the operation
      if (status === 'Analyzing Reference...') {
          cancelOperation();
      }
      setReferenceImage(null);
      setReferenceDesc(null);
  };

  const handleGenerateFromPlan = async (
      planBase64: string, 
      maskBase64: string, 
      refBase64: string | null, 
      stylePrompt: string,
      existingObjects?: IdentifiedObject[]
  ) => {
    setIsGeneratingRender(true);
    addLog('📐 Initiating Visualization Pipeline...', 'thought');
    addLog('Generating photorealistic projection...', 'analysis');

    if (existingObjects && existingObjects.length > 0) {
        addLog(`Using ${existingObjects.length} ground-truth objects.`, 'thought');
    }

    try {
      const resultImages = await generateMultiAngleRender(planBase64, maskBase64, refBase64, stylePrompt, existingObjects);
      
      addLog(`✓ Visualization complete.`, 'success');
      
      setVisualizationViews(resultImages);
      setActiveViewIndex(0);
      
      // Load the first view automatically
      const firstImage = resultImages[0];
      setImageUrl(firstImage);
      
      // Perform initial scan on the first view
      const pureBase64 = firstImage.split(',')[1];
      // IMPORTANT: Add to history instead of resetting, preserving Plan context
      performInitialScan(pureBase64, true);

    } catch (e: any) {
      addLog(`Render failed: ${e.message}`, 'error');
    } finally {
      setIsGeneratingRender(false);
    }
  };

  const handleVisualizeObject = async (targetObject: IdentifiedObject, prompt: string) => {
      const activeBase64 = getActiveBase64();
      if (!activeBase64 || !targetObject.box_2d) {
         addLog("Could not visualize: Missing image or selection bounds.", 'error');
         return;
      }

      setIsGeneratingRender(true);
      addLog(`🔍 Isolating "${targetObject.name}" for 3D visualization...`, 'thought');

      try {
         // 1. Calculate Padded Crop Box
         const pad = 50; // Padding to include walls/context
         const [ymin, xmin, ymax, xmax] = targetObject.box_2d;
         const paddedBox: [number, number, number, number] = [
            Math.max(0, ymin - pad),
            Math.max(0, xmin - pad),
            Math.min(1000, ymax + pad),
            Math.min(1000, xmax + pad)
         ];

         // 2. Crop Image
         const croppedBase64 = await cropBase64Image(activeBase64, paddedBox);
         const croppedDataUrl = `data:image/jpeg;base64,${croppedBase64}`;
         
         // 3. Generate Mask for Crop
         const maskDataUrl = await generateBinaryMask(croppedDataUrl);
         const maskBase64 = maskDataUrl.split(',')[1];
         
         // 4. Render
         const refBase64 = referenceImage ? referenceImage.split(',')[1] : null;
         
         addLog(`Rendering detailed view...`, 'action');
         // We pass the single target object as "existingObjects" to enforce its presence
         await handleGenerateFromPlan(croppedBase64, maskBase64, refBase64, prompt || `Visualize ${targetObject.name} in realistic style`, [targetObject]);

      } catch (e: any) {
         addLog(`Visualization failed: ${e.message}`, 'error');
         setIsGeneratingRender(false);
      }
  };

  const handleSwitchView = (index: number) => {
    if (index < 0 || index >= visualizationViews.length) return;
    
    // Switch Active View
    const newImage = visualizationViews[index];
    setActiveViewIndex(index);
    setImageUrl(newImage);
    
    // IMPORTANT: Reset agent state for the new view (new perspective = new objects)
    resetAgent();
    setVisualizationViews(visualizationViews); // Preserve views array after reset
    setActiveViewIndex(index); // Preserve index after reset
    setImageUrl(newImage); // Preserve image after reset

    addLog(`Switched view. Scanning new perspective...`, 'action');
    
    const pureBase64 = newImage.split(',')[1];
    performInitialScan(pureBase64);
  };
  
  const handleCanvasQuickAction = (action: 'remove' | 'style', object: IdentifiedObject) => {
     handleObjectSelect(object);
     
     if (action === 'remove') {
        addLog(`Quick Action: Removing ${object.name}...`, 'action');
        const removeTranslation: IntentTranslation = {
           operation_type: 'REMOVE',
           interpreted_intent: `Quick Remove: ${object.name}`,
           proposed_action: `Remove the ${object.name} completely. Inpaint the background to match surroundings.`,
           spatial_check_required: false,
           imagen_prompt: `Remove ${object.name}`,
           active_subject_name: object.name
        };
        handleSend({ forceAction: removeTranslation, forceObject: object });
     } else if (action === 'style') {
        setUserInput(`Change material of ${object.name} to...`);
     }
  };

  if (isKeyChecking) return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-500">Checking permissions...</div>;

  if (!apiKeySelected) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/20">
          <Target className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2">SpaceVision Spatial Intelligence</h1>
        <button onClick={handleConnectKey} className="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg">
          <Key className="w-5 h-5" /> Connect API Key
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Canvas 
        imageUrl={imageUrl}
        generatedImage={generatedImage}
        status={isGeneratingRender ? 'Generating Visualization...' : status}
        pins={pins}
        isProcessing={isProcessing || isGeneratingRender}
        onImageClick={handleImageClick}
        onFileUpload={handleFileUpload}
        onReset={resetAll}
        fileInputRef={fileInputRef}
        canUndo={canUndo} 
        canRedo={canRedo} 
        currentEditIndex={currentEditIndex}
        onUndo={undoEdit} onRedo={redoEdit} onResetToOriginal={resetToOriginal}
        // Insights
        hasInsights={!!roomAnalysis?.insights && roomAnalysis.insights.length > 0}
        onToggleInsights={() => setShowInsights(!showInsights)}
        // Design Assistant Trigger
        onOpenAutonomous={() => setIsAssistantOpen(true)}
        // Detected Objects for Visualization
        detectedObjects={scannedObjects}
        // New Render Prop
        onGenerateFromPlan={handleGenerateFromPlan}
        // Multi-View Props
        visualizationViews={visualizationViews}
        activeViewIndex={activeViewIndex}
        onViewSwitch={handleSwitchView}
        // Quick Actions
        onQuickAction={handleCanvasQuickAction}
      />

      <div className="w-[420px] h-full flex flex-col border-l border-slate-800 bg-slate-900 z-20 shadow-2xl relative">
          <ReasoningPanel 
            logs={logs}
            status={isGeneratingRender ? 'Generating Visualization...' : status}
            isProcessing={isProcessing || isGeneratingRender}
            onForceExecute={(action, object) => handleSend({ forceAction: action, forceObject: object })}
            onAlternativeClick={(suggestion) => setUserInput(suggestion)}
            activeModel={activeModel}
            onModelChange={setActiveModel}
            editHistory={editHistory}
            currentEditIndex={currentEditIndex}
            onJumpToHistory={jumpToEdit}
            onExportHistory={exportHistory}
            onCancel={cancelOperation}
          />
          
          <InputArea 
            userInput={userInput}
            setUserInput={setUserInput}
            onSend={() => handleSend()}
            disabled={!imageUrl || isProcessing || isGeneratingRender}
            placeholder={pins.length === 2 ? "Type 'Move'..." : selectedObject ? `Modify ${selectedObject.name}...` : "Type to edit entire room..."}
            onReferenceUpload={handleReferenceUpload}
            referenceImagePreview={referenceImage}
            onClearReference={handleClearReference}
            // Pass hierarchy handlers
            selectedObject={selectedObject}
            onObjectUpdate={handleObjectSelect}
            onClearSelection={() => {
              setSelectedObject(null);
              resetPins();
            }}
            // New Visualization Handler
            onVisualize={handleVisualizeObject}
            // Pass detected objects for Room Selection
            detectedObjects={scannedObjects}
            // Trigger Assistant
            onGetIdeas={handleGetIdeas}
            // Is Rendered View Flag
            isRenderedView={visualizationViews.length > 0}
            // 2D Plan Flag
            isPlan={roomAnalysis?.is_2d_plan || false}
          />

          {/* Design Assistant Panel */}
          <DesignAssistant 
            isOpen={isAssistantOpen}
            onClose={() => setIsAssistantOpen(false)}
            suggestions={suggestions}
            isGenerating={isGeneratingSuggestions}
            onApply={handleApplySuggestion}
            onDismiss={dismissSuggestion}
            onEditPreview={handleEditSuggestion}
          />
      </div>

      {/* Insights Panel */}
      <RoomInsightsPanel 
        roomAnalysis={roomAnalysis}
        isVisible={showInsights}
        onClose={() => setShowInsights(false)}
        status={status}
        mode={(isProcessing || isGeneratingRender) ? 'waiting' : 'viewing'}
      />
    </div>
  );
};

export default App;
