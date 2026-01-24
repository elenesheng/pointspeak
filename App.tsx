
import React, { useState, useRef, useEffect } from 'react';
import { Target, Key } from 'lucide-react';

// Hooks
import { useReasoningLogs } from './hooks/useReasoningLogs';
import { usePinManagement } from './hooks/usePinManagement';
import { useImageUpload } from './hooks/useImageUpload';
import { useGeminiAgent } from './hooks/useGeminiAgent';
import { useAutonomousAgent } from './hooks/useAutonomousAgent';

// Services
import { generateMultiAngleRender } from './services/gemini/renderingService';

// Utils
import { cropBase64Image, generateBinaryMask } from './utils/imageProcessing';

// Components
import { Canvas } from './components/canvas/Canvas';
import { ReasoningPanel } from './components/reasoning/ReasoningPanel';
import { InputArea } from './components/input/InputArea';
import { RoomInsightsPanel } from './components/insights/RoomInsightsPanel';
import { AutonomousAgentModal } from './components/autonomous/AutonomousAgentModal';
import { AutonomousProvider } from './contexts/AutonomousContext';
import { AutonomousConfig } from './services/gemini/autonomousAgentService';
import { IdentifiedObject } from './types/spatial.types';

const App: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [isKeyChecking, setIsKeyChecking] = useState<boolean>(true);

  const { logs, addLog, clearLogs } = useReasoningLogs();
  const { pins, addPin, resetPins } = usePinManagement();
  
  const { 
    status, roomAnalysis, selectedObject, generatedImage, isProcessing, activeModel, setActiveModel,
    performInitialScan, identifyObjectAtLocation, executeCommand, analyzeReference, resetAgent, setSelectedObject,
    editHistory, currentEditIndex, undoEdit, redoEdit, resetToOriginal, jumpToEdit, canUndo, canRedo, scannedObjects,
    exportHistory
  } = useGeminiAgent({ addLog, pins });
  
  const {
    isAutonomousMode,
    agentState,
    analyses,
    isModalOpen,
    openModal,
    closeModal,
    startAutonomousMode,
    pauseAgent,
    resumeAgent,
    stopAgent,
    exportAnalysisReport,
    exportImages
  } = useAutonomousAgent(addLog);

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

  // Auto-show insights only for long-running processes (Initial Scan or Generation)
  useEffect(() => {
    if (isProcessing && status !== 'Analyzing Source...') {
      setShowInsights(true);
    }
  }, [isProcessing, status]);

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !isProcessing && !isAutonomousMode) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); if (canUndo) undoEdit(); }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); if (canRedo) redoEdit(); }
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [canUndo, canRedo, undoEdit, redoEdit, isProcessing, isAutonomousMode]);

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
    // Ensure autonomous mode is stopped if active
    if (isAutonomousMode) stopAgent();
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
    // Block clicks during autonomous mode
    if (isAutonomousMode) return;

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

  const handleSend = async (overrideData?: any) => {
    if (isAutonomousMode) return;
    
    const activeBase64 = getActiveBase64();
    if (!activeBase64 || (!userInput.trim() && !overrideData)) return;
    
    const refBase64 = referenceImage ? referenceImage.split(',')[1] : undefined;
    await executeCommand(activeBase64, userInput, !!overrideData, overrideData, referenceDesc || undefined, refBase64);
    
    if (!overrideData) setUserInput('');
    setReferenceImage(null);
    setReferenceDesc(null);
  };

  const handleStartAutonomous = async (config: AutonomousConfig) => {
    const workingImage = getActiveBase64();
    if (!workingImage || !roomAnalysis) {
      addLog("Cannot start autonomous mode: Missing image or analysis.", 'error');
      return;
    }
    
    await startAutonomousMode(
      config,
      workingImage,
      roomAnalysis,
      (img, text, force, override) => executeCommand(img, text, force, override)
    );
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
      
      // Auto-populate prompt AFTER analysis is complete
      if (selectedObject) {
         setUserInput(`Change ${selectedObject.name} using this reference`);
      } else {
         setUserInput(`Apply this reference style to the room`);
      }
    };
    reader.readAsDataURL(file);
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
  
  // Construct context value for Autonomous Agent
  const autonomousContextValue = {
    isAutonomousMode,
    agentState,
    analyses,
    isModalOpen,
    openModal,
    closeModal,
    startMarathon: handleStartAutonomous,
    pauseAgent,
    resumeAgent,
    stopAgent,
    exportAnalysisReport,
    exportImages,
    disabled: !imageUrl || (isProcessing && !isAutonomousMode)
  };

  if (isKeyChecking) return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-500">Checking permissions...</div>;

  if (!apiKeySelected) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/20">
          <Target className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2">PointSpeak Spatial Intelligence</h1>
        <button onClick={handleConnectKey} className="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg">
          <Key className="w-5 h-5" /> Connect API Key
        </button>
      </div>
    );
  }

  return (
    <AutonomousProvider value={autonomousContextValue}>
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
          canUndo={canUndo && !isAutonomousMode} 
          canRedo={canRedo && !isAutonomousMode} 
          currentEditIndex={currentEditIndex}
          onUndo={undoEdit} onRedo={redoEdit} onResetToOriginal={resetToOriginal}
          // Insights
          hasInsights={!!roomAnalysis?.insights && roomAnalysis.insights.length > 0}
          onToggleInsights={() => setShowInsights(!showInsights)}
          // Autonomous Trigger
          onOpenAutonomous={openModal}
          // Detected Objects for Visualization
          detectedObjects={scannedObjects}
          // New Render Prop
          onGenerateFromPlan={handleGenerateFromPlan}
          // Multi-View Props
          visualizationViews={visualizationViews}
          activeViewIndex={activeViewIndex}
          onViewSwitch={handleSwitchView}
        />

        <div className="w-[420px] h-full flex flex-col border-l border-slate-800 bg-slate-900 z-20 shadow-2xl">
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
            />
            
            <InputArea 
              userInput={userInput}
              setUserInput={setUserInput}
              onSend={() => handleSend()}
              disabled={!imageUrl || isProcessing || isAutonomousMode || isGeneratingRender}
              placeholder={pins.length === 2 ? "Type 'Move'..." : selectedObject ? `Modify ${selectedObject.name}...` : "Type to edit entire room..."}
              onReferenceUpload={handleReferenceUpload}
              referenceImagePreview={referenceImage}
              onClearReference={() => { setReferenceImage(null); setReferenceDesc(null); }}
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

        {/* Autonomous Modal */}
        <AutonomousAgentModal />
      </div>
    </AutonomousProvider>
  );
};

export default App;
