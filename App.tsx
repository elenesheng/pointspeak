
import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  MousePointer2, 
  Send, 
  Sparkles, 
  Info, 
  Trash2, 
  Zap,
  Target,
  CheckCircle2,
  AlertCircle,
  ScanSearch,
  Map,
  Activity,
  Cpu,
  ShieldCheck,
  ShieldAlert,
  CornerDownRight,
  ImageIcon,
  Eye,
  EyeOff,
  Move,
  Eraser,
  Palette
} from 'lucide-react';
import { getGeminiResponse, analyzeRoomSpace, identifyObject, translateIntentWithSpatialAwareness, validateSpatialChange, generateImageWithImagen3 } from './services/geminiService';
import { AppState, ReasoningLog, Coordinate, DetailedRoomAnalysis, IdentifiedObject, IntentTranslation, SpatialValidation } from './types';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    imageUrl: null,
    pin: null,
    status: 'Idle',
    logs: [],
    userInput: '',
    roomAnalysis: null,
    selectedObject: null,
    generatedImage: null,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [showGenerated, setShowGenerated] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.logs]);

  // When generated image arrives, default to showing it
  useEffect(() => {
    if (state.generatedImage) {
      setShowGenerated(true);
    }
  }, [state.generatedImage]);

  const addLog = (content: string, type: ReasoningLog['type'] = 'thought', metadata?: any) => {
    const newLog: ReasoningLog = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      content,
      timestamp: new Date(),
      metadata,
    };
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, newLog]
    }));
  };

  const performInitialScan = async (base64: string) => {
    setState(prev => ({ ...prev, status: 'Scanning Room...' }));
    addLog('Initiating architectural deep scan...', 'thought');
    
    try {
      const analysis: DetailedRoomAnalysis = await analyzeRoomSpace(base64);
      
      setState(prev => ({ 
        ...prev, 
        roomAnalysis: analysis,
        status: 'Ready' 
      }));
      
      addLog('✓ Room Analysis Complete', 'analysis', analysis);
    } catch (err) {
      console.error(err);
      addLog('Primary scan failed. Manual analysis available.', 'error');
      setState(prev => ({ ...prev, status: 'Ready' }));
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      setState(prev => ({
        ...prev,
        imageUrl: result,
        pin: null,
        status: 'Scanning Room...',
        logs: [],
        roomAnalysis: null,
        selectedObject: null,
        generatedImage: null,
      }));
      
      const pureBase64 = result.split(',')[1];
      await performInitialScan(pureBase64);
    };
    reader.readAsDataURL(file);
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !state.imageUrl || state.status === 'Scanning Room...' || isProcessing) return;
    
    // Prevent clicking if we are showing the generated image
    if (state.generatedImage && showGenerated) {
       setShowGenerated(false); // Switch back to original to allow pointing
       // We don't return here, we let the click process on the original image logic below
       // But wait, if they click on generated image, coordinate mapping might be wrong if aspect ratio differs.
       // For now, let's just let them point on the original image mostly.
    }

    const rect = imageRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;

    setState(prev => ({
      ...prev,
      pin: { x, y },
      status: 'Analyzing Point...',
      selectedObject: null
    }));
    
    addLog(`Spatial focus lock: [${x.toFixed(0)}, ${y.toFixed(0)}]. Identifying target...`, 'action');

    try {
      // Always use original image for object ID
      const base64 = state.imageUrl.split(',')[1];
      const obj = await identifyObject(base64, x, y);
      
      setState(prev => ({ 
        ...prev, 
        selectedObject: obj,
        status: 'Ready'
      }));
      
      addLog(`Object Identified: ${obj.name} (${obj.position})`, 'success', obj);
    } catch (err) {
      addLog('Could not identify object at this location.', 'error');
      setState(prev => ({ ...prev, status: 'Ready' }));
    }
  };

  const handleAlternativeClick = (suggestion: string) => {
    setState(prev => ({ ...prev, userInput: suggestion }));
  };

  const handleSend = async () => {
    if (!state.userInput.trim() || !state.imageUrl || isProcessing || !state.selectedObject || !state.roomAnalysis) return;

    setIsProcessing(true);
    const base64 = state.imageUrl.split(',')[1];
    const userText = state.userInput;
    const identifiedObject = state.selectedObject;
    const spatialContext = state.roomAnalysis;

    setState(prev => ({ ...prev, status: 'Analyzing Point...', userInput: '' }));
    
    addLog('Understanding intent...', 'thought');

    try {
      // Step 3.2: Translate Intent
      const translation: IntentTranslation = await translateIntentWithSpatialAwareness(
        base64, 
        userText, 
        identifiedObject, 
        spatialContext
      );

      addLog(translation.interpreted_intent, 'intent', translation);

      // Step 4: Spatial Validation
      let proceedToGeneration = false;
      if (translation.spatial_check_required || translation.operation_type === 'MOVE') {
        setState(prev => ({ ...prev, status: 'Validating...' }));
        addLog('Performing safety check...', 'thought');
        
        const validation: SpatialValidation = await validateSpatialChange(translation, spatialContext);
        
        if (!validation.valid) {
          addLog('⚠️ SPATIAL WARNING', 'validation', validation);
          setState(prev => ({ ...prev, status: 'Ready' }));
          setIsProcessing(false);
          return;
        } else {
          addLog('✓ Spatial Check Passed.', 'validation', validation);
          proceedToGeneration = true;
        }
      } else {
        proceedToGeneration = true;
      }

      // Step 5: Image Generation (if applicable)
      if (proceedToGeneration) {
        let statusText: AppState['status'] = 'Generating Visualization...';
        if (translation.operation_type === 'REMOVE') statusText = 'Removing Object...';
        if (translation.operation_type === 'MOVE') statusText = 'Repositioning Object...';
        if (translation.operation_type === 'EDIT') statusText = 'Transforming Object...';
        
        setState(prev => ({ ...prev, status: statusText }));
        
        addLog(`Generative Engine Active: ${translation.operation_type} operation...`, 'thought');
        
        try {
           const genImage = await generateImageWithImagen3(translation.imagen_prompt);
           setState(prev => ({ ...prev, generatedImage: genImage }));
           addLog('Visualization complete.', 'success');
        } catch (genErr) {
           console.error("Image gen failed", genErr);
           addLog('Visualization failed. Continuing with text response.', 'error');
        }
      }
      
      // Final Follow up
      setState(prev => ({ ...prev, status: 'Generating Response...' }));
      await getGeminiResponse(base64, `The user wants to: ${userText}. You've interpreted this as: ${translation.interpreted_intent}. Proposed action: ${translation.proposed_action}. Explain why this is a good idea or any spatial concerns.`, state.pin, (chunk) => {
        // stream updates status but we add log at the end
      }).then(fullText => {
        addLog(fullText, 'success');
        setState(prev => ({ ...prev, status: 'Ready' }));
      });

    } catch (err) {
      console.error(err);
      addLog('Process interrupted. Please try again.', 'error');
      setState(prev => ({ ...prev, status: 'Ready' }));
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAll = () => {
    setState({
      imageUrl: null,
      pin: null,
      status: 'Idle',
      logs: [],
      userInput: '',
      roomAnalysis: null,
      selectedObject: null,
      generatedImage: null,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Left Panel: The Canvas */}
      <div className="flex-1 relative flex flex-col bg-slate-900 overflow-hidden">
        {/* Top Bar Left */}
        <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold tracking-tight text-lg">PointSpeak</span>
          </div>
          
          <div className="flex items-center gap-2">
            {!state.imageUrl ? (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-all shadow-lg shadow-indigo-900/20"
              >
                <Upload className="w-4 h-4" />
                Upload Room
              </button>
            ) : (
              <div className="flex items-center gap-2">
                 {state.generatedImage && (
                    <button
                      onClick={() => setShowGenerated(!showGenerated)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${showGenerated ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                    >
                      {showGenerated ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {showGenerated ? 'View Result' : 'View Original'}
                    </button>
                 )}
                <button 
                  onClick={resetAll}
                  className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                  title="Clear Session"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            )}
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              className="hidden" 
              accept="image/*" 
            />
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
          {!state.imageUrl ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="max-w-md w-full aspect-square border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center gap-6 group cursor-pointer hover:border-indigo-500/50 hover:bg-slate-800/50 transition-all"
            >
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-10 h-10 text-slate-500 group-hover:text-indigo-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-medium text-slate-300">Start Spatial Analysis</p>
                <p className="text-sm text-slate-500 mt-1">Upload a photo to point and chat</p>
              </div>
            </div>
          ) : (
            <div 
              className={`relative max-h-full max-w-full inline-block rounded-xl shadow-2xl overflow-hidden group ${state.status === 'Scanning Room...' || isProcessing ? 'cursor-wait' : 'cursor-crosshair'}`}
              onClick={handleImageClick}
            >
              {/* Main Image Layer */}
              <img 
                ref={imageRef}
                src={(state.generatedImage && showGenerated) ? state.generatedImage : state.imageUrl} 
                alt="Workspace" 
                className={`max-h-[80vh] w-auto object-contain block select-none transition-all duration-700 ${(state.status === 'Scanning Room...' || isProcessing) ? 'brightness-50 grayscale' : 'brightness-100 grayscale-0'}`}
              />
              
              {/* Scan Overlay */}
              {(state.status !== 'Ready' && state.status !== 'Idle' && state.status !== 'Analyzing Point...') && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
                   <div className="relative">
                      {(state.status === 'Generating Visualization...' || state.status === 'Removing Object...' || state.status === 'Repositioning Object...' || state.status === 'Transforming Object...') ? <ImageIcon className="w-16 h-16 text-emerald-400 animate-pulse" /> : <ScanSearch className="w-16 h-16 text-indigo-400 animate-pulse" />}
                      <div className={`absolute inset-0 blur-xl rounded-full ${(state.status === 'Generating Visualization...' || state.status.includes('Object...')) ? 'bg-emerald-500/20' : 'bg-indigo-500/20'}`} />
                   </div>
                   <p className={`mt-4 font-mono text-sm tracking-widest uppercase animate-pulse ${(state.status === 'Generating Visualization...' || state.status.includes('Object...')) ? 'text-emerald-300' : 'text-indigo-300'}`}>
                     {state.status === 'Scanning Room...' ? 'Scanning Geometry' : 
                      state.status === 'Validating...' ? 'Checking Safety' : 
                      state.status}
                   </p>
                </div>
              )}

              {/* Point Indicator on Hover */}
              {!state.pin && state.status !== 'Scanning Room...' && !isProcessing && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/5 pointer-events-none transition-opacity flex items-center justify-center">
                  <div className="flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/10">
                    <MousePointer2 className="w-4 h-4 text-white" />
                    <span className="text-xs font-medium text-white">Click to focus Gemini Agent</span>
                  </div>
                </div>
              )}

              {/* Placed Pin - Only show if showing original image, otherwise it might be misplaced or confusing */}
              {state.pin && (!state.generatedImage || !showGenerated) && (
                <div 
                  className="absolute w-6 h-6 flex items-center justify-center z-20 transition-all duration-300"
                  style={{ 
                    left: `${state.pin.x / 10}%`, 
                    top: `${state.pin.y / 10}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div className="w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow-xl pin-pulse relative" />
                </div>
              )}
              
              {/* Label for generated image */}
              {state.generatedImage && showGenerated && (
                <div className="absolute top-4 right-4 bg-emerald-600/90 text-white px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-lg backdrop-blur-md border border-emerald-400/30">
                  AI Generated Concept
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Overlay */}
        {state.imageUrl && state.status === 'Ready' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
            {state.selectedObject && (
              <div className="bg-indigo-600/90 text-white px-4 py-1.5 rounded-full text-xs font-bold shadow-xl border border-indigo-400/30 animate-in fade-in zoom-in duration-300">
                Focusing on: {state.selectedObject.name}
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-900/90 border border-slate-800 rounded-full backdrop-blur-md shadow-2xl">
              <span className="text-sm font-medium text-slate-300 italic">
                {state.pin ? "Type a command for this object." : "Click anywhere on the image to set a spatial focus point."}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right Panel: The Brain */}
      <div className="w-[420px] border-l border-slate-800 flex flex-col bg-slate-900 shadow-2xl z-20">
        {/* Agent Header */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
               <Zap className="w-4 h-4 text-indigo-400" />
               <h2 className="font-bold text-xs uppercase tracking-[0.2em] text-slate-500 font-bold">GEMINI SPATIAL AGENT</h2>
            </div>
            <div className="flex items-center gap-2 bg-indigo-500/10 px-2 py-0.5 rounded text-[10px] font-bold text-indigo-400 border border-indigo-500/20">
              V3.0 PRO
            </div>
          </div>
          
          {/* Status Bar */}
          <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800 shadow-inner">
            <div className={`w-2 h-2 rounded-full ${state.status !== 'Ready' && state.status !== 'Idle' ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`} />
            <div className="flex-1">
              <p className="text-[10px] font-bold text-slate-500 uppercase">AI Status</p>
              <p className="text-sm font-semibold text-slate-200">{state.status}</p>
            </div>
            {(isProcessing || state.status === 'Scanning Room...' || state.status === 'Analyzing Point...' || state.status === 'Validating...' || state.status.includes('Object...') || state.status === 'Generating Visualization...') && <Sparkles className="w-4 h-4 text-indigo-500 animate-spin" />}
          </div>
        </div>

        {/* Reasoning Feed */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-hide bg-slate-900/50"
        >
          {state.logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-12">
              <Target className="w-12 h-12 mb-4 text-indigo-500" />
              <p className="text-sm font-medium">Ready for spatial input.<br/>Upload a photo to initialize the environment scan.</p>
            </div>
          ) : (
            state.logs.map((log) => (
              <div 
                key={log.id} 
                className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 group`}
              >
                <div className="mt-1">
                  {log.type === 'thought' && <Cpu className="w-4 h-4 text-slate-500" />}
                  {log.type === 'action' && <Target className="w-4 h-4 text-indigo-500" />}
                  {log.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  {log.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-500" />}
                  {log.type === 'analysis' && <Map className="w-4 h-4 text-indigo-400" />}
                  {log.type === 'intent' && (
                    log.metadata?.operation_type === 'REMOVE' ? <Eraser className="w-4 h-4 text-rose-400" /> :
                    log.metadata?.operation_type === 'MOVE' ? <Move className="w-4 h-4 text-sky-400" /> :
                    log.metadata?.operation_type === 'EDIT' ? <Palette className="w-4 h-4 text-purple-400" /> :
                    <Sparkles className="w-4 h-4 text-amber-400" />
                  )}
                  {log.type === 'validation' && (log.metadata?.valid ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <ShieldAlert className="w-4 h-4 text-rose-400" />)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{log.type}</span>
                    <span className="text-[10px] font-mono text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">{log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  </div>
                  
                  {log.type === 'analysis' && log.metadata ? (
                    <div className="bg-slate-800/50 border border-indigo-500/20 rounded-xl p-4 shadow-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <h4 className="text-sm font-bold text-indigo-100">{log.content}</h4>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Identified Room</p>
                          <p className="text-sm font-semibold text-slate-200">{log.metadata.room_type}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Architectural Constraints</p>
                          <div className="space-y-2">
                            {log.metadata.constraints.map((c: any, i: number) => (
                              <div key={i} className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800">
                                <div className="flex justify-between items-start mb-1">
                                  <span className="text-[11px] font-bold text-slate-400 uppercase">{c.type}</span>
                                  <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">{c.location}</span>
                                </div>
                                <p className="text-xs text-slate-300 leading-relaxed">{c.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                            <Activity className="w-3 h-3" />
                            Traffic Flow
                          </p>
                          <p className="text-xs text-slate-400 leading-relaxed italic border-l-2 border-indigo-500/30 pl-3 py-1">
                            {log.metadata.traffic_flow}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : log.type === 'intent' && log.metadata ? (
                    <div className={`rounded-xl p-4 shadow-xl border ${
                      log.metadata.operation_type === 'REMOVE' ? 'bg-rose-500/10 border-rose-500/20' :
                      log.metadata.operation_type === 'MOVE' ? 'bg-sky-500/10 border-sky-500/20' :
                      log.metadata.operation_type === 'EDIT' ? 'bg-purple-500/10 border-purple-500/20' :
                      'bg-amber-500/10 border-amber-500/20'
                    }`}>
                       <h4 className={`text-sm font-bold mb-2 flex items-center gap-2 ${
                         log.metadata.operation_type === 'REMOVE' ? 'text-rose-200' :
                         log.metadata.operation_type === 'MOVE' ? 'text-sky-200' :
                         log.metadata.operation_type === 'EDIT' ? 'text-purple-200' :
                         'text-amber-200'
                       }`}>
                         {log.metadata.operation_type === 'REMOVE' ? <Eraser className="w-3.5 h-3.5" /> :
                          log.metadata.operation_type === 'MOVE' ? <Move className="w-3.5 h-3.5" /> :
                          log.metadata.operation_type === 'EDIT' ? <Palette className="w-3.5 h-3.5" /> :
                          <Sparkles className="w-3.5 h-3.5" />
                         }
                         {log.metadata.operation_type} OPERATION
                       </h4>
                       <p className="text-sm text-slate-200 mb-4">{log.content}</p>
                       <div className="space-y-3">
                         <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Execution Plan</p>
                           <p className="text-xs text-slate-300 leading-relaxed">{log.metadata.proposed_action}</p>
                         </div>
                         {log.metadata.new_position && (
                            <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                              <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest mb-1">Target Position</p>
                              <p className="text-xs text-slate-300 leading-relaxed">{log.metadata.new_position.description}</p>
                            </div>
                         )}
                         {log.metadata.removed_object_replacement && (
                            <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                              <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest mb-1">Void Fill</p>
                              <p className="text-xs text-slate-300 leading-relaxed">{log.metadata.removed_object_replacement}</p>
                            </div>
                         )}
                         {log.metadata.spatial_check_required && (
                           <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase bg-indigo-500/10 px-2 py-1 rounded w-fit">
                             <Target className="w-3 h-3" />
                             Spatial Validation Required
                           </div>
                         )}
                       </div>
                    </div>
                  ) : log.type === 'validation' && log.metadata ? (
                    <div className={`rounded-xl p-4 border shadow-xl ${log.metadata.valid ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
                      <h4 className={`text-sm font-bold mb-3 flex items-center gap-2 ${log.metadata.valid ? 'text-emerald-300' : 'text-rose-300'}`}>
                        {log.metadata.valid ? <ShieldCheck className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
                        {log.content}
                      </h4>
                      {!log.metadata.valid && (
                        <div className="space-y-3">
                          <div className="space-y-1.5">
                            {log.metadata.warnings.map((w: string, i: number) => (
                              <p key={i} className="text-xs text-rose-200/80 flex items-start gap-2">
                                <span className="mt-1 w-1 h-1 rounded-full bg-rose-500 shrink-0" />
                                {w}
                              </p>
                            ))}
                          </div>
                          {log.metadata.alternative_suggestion && (
                            <div className="pt-3 border-t border-rose-500/20">
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Safe Alternative Suggestion</p>
                              <button 
                                onClick={() => handleAlternativeClick(log.metadata.alternative_suggestion)}
                                className="w-full flex items-center gap-3 p-3 bg-slate-900 rounded-lg border border-slate-800 text-left hover:border-indigo-500/50 transition-colors group"
                              >
                                <CornerDownRight className="w-3.5 h-3.5 text-indigo-400" />
                                <span className="text-xs text-slate-300 group-hover:text-white transition-colors">
                                  {log.metadata.alternative_suggestion}
                                </span>
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {log.metadata.valid && (
                        <p className="text-xs text-emerald-200/60 italic">Architecture constraints respected. Safe for generation.</p>
                      )}
                    </div>
                  ) : (
                    <div className={`text-sm leading-relaxed whitespace-pre-wrap ${log.type === 'success' ? 'text-slate-200 bg-slate-800/30 p-3 rounded-lg border border-slate-700/50' : 'text-slate-400 italic'}`}>
                      {log.content}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Area */}
        <div className="p-6 bg-slate-900 border-t border-slate-800 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
          <div className={`relative group transition-all duration-300 ${(!state.selectedObject || state.status !== 'Ready' || isProcessing) ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
            <textarea 
              value={state.userInput}
              onChange={(e) => setState(prev => ({ ...prev, userInput: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={state.selectedObject ? `Modify the ${state.selectedObject.name}...` : "Place a pin to select object..."}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pr-12 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 min-h-[100px] resize-none transition-all shadow-inner font-medium"
            />
            <button 
              onClick={handleSend}
              disabled={!state.userInput.trim() || isProcessing || !state.selectedObject}
              className="absolute bottom-4 right-4 p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center justify-between mt-4">
             <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest">
               Spatial Reasoning Engine v3.0 PRO
             </p>
             <div className="flex gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
