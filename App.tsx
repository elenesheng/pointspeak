
import React, { useState, useRef, useEffect } from 'react';
import { Target, Key, Sparkles, Zap } from 'lucide-react';

// Hooks
import { useReasoningLogs } from './hooks/useReasoningLogs';
import { usePinManagement } from './hooks/usePinManagement';
import { useImageUpload } from './hooks/useImageUpload';
import { useGeminiAgent } from './hooks/useGeminiAgent';
import { useAutonomousAgent } from './hooks/useAutonomousAgent';

// Components
import { Canvas } from './components/canvas/Canvas';
import { ReasoningPanel } from './components/reasoning/ReasoningPanel';
import { InputArea } from './components/input/InputArea';
import { RoomInsightsPanel } from './components/insights/RoomInsightsPanel';
import { AutonomousAgentModal } from './components/autonomous/AutonomousAgentModal';

const App: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [isKeyChecking, setIsKeyChecking] = useState<boolean>(true);

  const { logs, addLog, clearLogs } = useReasoningLogs();
  const { pins, addPin, resetPins } = usePinManagement();
  
  const { 
    status, roomAnalysis, selectedObject, generatedImage, isProcessing, activeModel, setActiveModel,
    performInitialScan, identifyObjectAtLocation, executeCommand, analyzeReference, resetAgent, setSelectedObject,
    editHistory, currentEditIndex, undoEdit, redoEdit, resetToOriginal, jumpToEdit, canUndo, canRedo
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

  const { imageUrl, handleFileUpload, clearImage } = useImageUpload(
    () => resetAll(),
    (base64) => performInitialScan(base64)
  );
  
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceDesc, setReferenceDesc] = useState<string | null>(null);

  const [userInput, setUserInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [showInsights, setShowInsights] = useState(false);

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

  const handleStartAutonomous = async (config: any) => {
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
      const desc = await analyzeReference(base64);
      setReferenceDesc(desc);
    };
    reader.readAsDataURL(file);
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
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Canvas 
        imageUrl={imageUrl}
        generatedImage={generatedImage}
        status={status}
        pins={pins}
        isProcessing={isProcessing}
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
      />

      <div className="w-[420px] h-full flex flex-col border-l border-slate-800 bg-slate-900 z-20 shadow-2xl">
          <ReasoningPanel 
            logs={logs}
            status={status}
            isProcessing={isProcessing}
            onForceExecute={(action, object) => handleSend({ forceAction: action, forceObject: object })}
            onAlternativeClick={(suggestion) => setUserInput(suggestion)}
            activeModel={activeModel}
            onModelChange={setActiveModel}
            editHistory={editHistory}
            currentEditIndex={currentEditIndex}
            onJumpToHistory={jumpToEdit}
          />
          
          <InputArea 
            userInput={userInput}
            setUserInput={setUserInput}
            onSend={() => handleSend()}
            disabled={!imageUrl || isProcessing || isAutonomousMode}
            placeholder={pins.length === 2 ? "Type 'Move'..." : selectedObject ? `Modify ${selectedObject.name}...` : "Type to edit entire room..."}
            onReferenceUpload={handleReferenceUpload}
            referenceImagePreview={referenceImage}
            onClearReference={() => { setReferenceImage(null); setReferenceDesc(null); }}
            // Pass hierarchy handlers
            selectedObject={selectedObject}
            onObjectUpdate={setSelectedObject}
            onClearSelection={() => {
              setSelectedObject(null);
              resetPins();
            }}
          />
      </div>

      {/* Insights Panel */}
      <RoomInsightsPanel 
        roomAnalysis={roomAnalysis}
        isVisible={showInsights}
        onClose={() => setShowInsights(false)}
        status={status}
        mode={isProcessing ? 'waiting' : 'viewing'}
      />

      {/* Autonomous Modal */}
      <AutonomousAgentModal
        isOpen={isModalOpen}
        onClose={closeModal}
        agentState={agentState}
        onStart={handleStartAutonomous}
        onPause={pauseAgent}
        onResume={resumeAgent}
        onStop={stopAgent}
        disabled={!imageUrl || (isProcessing && !isAutonomousMode)}
        analyses={analyses}
        onExportReport={exportAnalysisReport}
        onExportImages={exportImages}
      />
    </div>
  );
};

export default App;
