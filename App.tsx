
import React, { useState, useRef, useEffect } from 'react';
import { Target, Key } from 'lucide-react';

// Hooks
import { useReasoningLogs } from './hooks/useReasoningLogs';
import { usePinManagement } from './hooks/usePinManagement';
import { useImageUpload } from './hooks/useImageUpload';
import { useGeminiAgent } from './hooks/useGeminiAgent';

// Components
import { Canvas } from './components/canvas/Canvas';
import { ReasoningPanel } from './components/reasoning/ReasoningPanel';
import { InputArea } from './components/input/InputArea';

const App: React.FC = () => {
  // --- Auth State ---
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [isKeyChecking, setIsKeyChecking] = useState<boolean>(true);

  // --- Domain State via Hooks ---
  const { logs, addLog, clearLogs } = useReasoningLogs();
  const { pins, addPin, resetPins } = usePinManagement();
  
  // --- Gemini Agent ---
  const { 
    status, roomAnalysis, selectedObject, generatedImage, isProcessing, activeModel, setActiveModel,
    performInitialScan, identifyObjectAtLocation, executeCommand, analyzeReference, resetAgent, setSelectedObject,
    // History Exports
    editHistory, currentEditIndex, undoEdit, redoEdit, resetToOriginal, jumpToEdit, canUndo, canRedo
  } = useGeminiAgent({ addLog, pins });

  // --- Image Upload ---
  const { imageUrl, handleFileUpload, clearImage } = useImageUpload(
    () => resetAll(), // Clear logs/state on new upload
    (base64) => performInitialScan(base64)
  );
  
  // --- Reference Image ---
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceDesc, setReferenceDesc] = useState<string | null>(null);

  const [userInput, setUserInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Auth Check Effect ---
  useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio) {
          setApiKeySelected(await window.aistudio.hasSelectedApiKey());
        } else {
          setApiKeySelected(true); // Fallback for local dev
        }
      } catch (e) {
        setApiKeySelected(false);
      } finally {
        setIsKeyChecking(false);
      }
    };
    checkKey();
  }, []);

  // --- Keyboard Shortcuts ---
  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !isProcessing) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          if (canUndo) undoEdit();
        }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          if (canRedo) redoEdit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [canUndo, canRedo, undoEdit, redoEdit, isProcessing]);

  // --- Handlers ---

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
    setReferenceImage(null);
    setReferenceDesc(null);
    setUserInput('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Helper to get the ACTIVE image base64 (Original or Edited)
  // With history support, the Hook manages generatedImage to reflect current index.
  // If generatedImage is null, it means we are at index 0 (Original).
  const getActiveBase64 = () => {
    if (generatedImage) {
      return generatedImage.split(',')[1];
    }
    if (imageUrl) {
      return imageUrl.split(',')[1];
    }
    return null;
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>, rect: DOMRect) => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64 || isProcessing) return;

    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;
    
    // Add visual pin
    addPin({ x, y });

    // Logic: If 0 pins exist -> It's Source -> Identify
    // If 1 pin exists -> It's Target -> Don't Identify yet
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
    const activeBase64 = getActiveBase64();
    if (!activeBase64 || (!userInput.trim() && !overrideData) || !selectedObject) return;
    
    const refBase64 = referenceImage ? referenceImage.split(',')[1] : undefined;

    // If overrideData is present, it means we are forcing execution
    await executeCommand(
      activeBase64, 
      userInput, 
      !!overrideData, 
      overrideData,
      referenceDesc || undefined,
      refBase64
    );
    
    // Cleanup post-execution
    if (!overrideData) setUserInput('');
    setReferenceImage(null);
    setReferenceDesc(null);
  };

  const handleReferenceUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      setReferenceImage(result);
      
      const base64 = result.split(',')[1];
      const desc = await analyzeReference(base64);
      setReferenceDesc(desc);
      
      // Auto-fill input if empty to guide user
      if (!userInput && desc) {
        setUserInput(`Change material to...`); // Suggestion
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAlternativeClick = (suggestion: string) => {
    setUserInput(suggestion);
  };

  // --- Render ---

  if (isKeyChecking) return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-500">Checking permissions...</div>;

  if (!apiKeySelected) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/20">
          <Target className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2">PointSpeak Spatial Intelligence</h1>
        <p className="text-slate-400 max-w-md mb-8">
          Please connect your Google Cloud Project to access Gemini API capabilities.
          <br/>
          <span className="text-indigo-400 text-sm mt-2 block font-semibold">Gemini 3.0 Pro & 2.5 Flash Ready.</span>
        </p>
        <button onClick={handleConnectKey} className="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg">
          <Key className="w-5 h-5" /> Connect API Key
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Canvas Area - Flex Grow */}
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
        // History Props
        canUndo={canUndo}
        canRedo={canRedo}
        currentEditIndex={currentEditIndex}
        onUndo={undoEdit}
        onRedo={redoEdit}
        onResetToOriginal={resetToOriginal}
      />

      {/* Reasoning Sidebar - Fixed Width, Full Height Column */}
      <div className="w-[420px] h-full flex flex-col border-l border-slate-800 bg-slate-900 z-20 shadow-2xl">
          {/* Top Panel (Logs & History) */}
          <ReasoningPanel 
            logs={logs}
            status={status}
            isProcessing={isProcessing}
            onForceExecute={(action, object) => handleSend({ forceAction: action, forceObject: object })}
            onAlternativeClick={handleAlternativeClick}
            activeModel={activeModel}
            onModelChange={setActiveModel}
            // History Props
            editHistory={editHistory}
            currentEditIndex={currentEditIndex}
            onJumpToHistory={jumpToEdit}
          />
          
          {/* Bottom Panel (Input) */}
          <InputArea 
            userInput={userInput}
            setUserInput={setUserInput}
            onSend={() => handleSend()}
            disabled={!imageUrl || isProcessing || !selectedObject}
            placeholder={pins.length === 2 ? "Type 'Move' or 'Swap' to execute..." : selectedObject ? `Modify the ${selectedObject.name}...` : "Select object to interact..."}
            onReferenceUpload={handleReferenceUpload}
            referenceImagePreview={referenceImage}
            onClearReference={() => { setReferenceImage(null); setReferenceDesc(null); }}
          />
      </div>
    </div>
  );
};

export default App;
