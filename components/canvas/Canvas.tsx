
import React, { useRef, useState, useEffect } from 'react';
import { Upload, Trash2, ScanSearch, Trash, ImageIcon, Move, Sparkles, Undo2, Redo2, RotateCcw, ImageOff, Timer, Layers, Zap, Map as MapIcon, ArrowRight, LayoutTemplate, Camera, Info } from 'lucide-react';
import { Coordinate, IdentifiedObject } from '../../types/spatial.types';
import { AppStatus } from '../../types/ui.types';

interface CanvasProps {
  imageUrl: string | null;
  generatedImage: string | null;
  status: AppStatus;
  pins: Coordinate[];
  isProcessing: boolean;
  onImageClick: (e: React.MouseEvent<HTMLDivElement>, rect: DOMRect) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onReset: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  canUndo: boolean;
  canRedo: boolean;
  currentEditIndex: number;
  onUndo: () => void;
  onRedo: () => void;
  onResetToOriginal: () => void;
  hasInsights: boolean;
  onToggleInsights: () => void;
  estimatedTime?: number;
  onOpenAutonomous?: () => void;
  detectedObjects?: IdentifiedObject[];
  onGenerateFromPlan?: (planBase64: string, maskBase64: string, refBase64: string | null, stylePrompt: string) => void;
  // Multi-View Props
  visualizationViews?: string[];
  activeViewIndex?: number;
  onViewSwitch?: (index: number) => void;
}

// --- MORPHOLOGICAL OPERATIONS (Lightweight Client-Side) ---

const getPixelIndex = (x: number, y: number, width: number) => (y * width + x) * 4;

// EROSION: Shrinks white areas. Removes thin lines (text, furniture lines).
// Pixel is kept WHITE only if ALL neighbors are WHITE.
const applyErosion = (data: Uint8ClampedArray, width: number, height: number) => {
  const output = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = getPixelIndex(x, y, width);
      // Check 3x3 kernel
      let allWhite = true;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (data[getPixelIndex(x + kx, y + ky, width)] === 0) {
            allWhite = false;
            break;
          }
        }
        if (!allWhite) break;
      }
      const val = allWhite ? 255 : 0;
      output[idx] = output[idx + 1] = output[idx + 2] = val;
      output[idx + 3] = 255;
    }
  }
  return output;
};

// DILATION: Expands white areas. Restores wall thickness after erosion.
// Pixel becomes WHITE if ANY neighbor is WHITE.
const applyDilation = (data: Uint8ClampedArray, width: number, height: number) => {
  const output = new Uint8ClampedArray(data);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = getPixelIndex(x, y, width);
      let anyWhite = false;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          if (data[getPixelIndex(x + kx, y + ky, width)] === 255) {
            anyWhite = true;
            break;
          }
        }
        if (anyWhite) break;
      }
      const val = anyWhite ? 255 : 0;
      output[idx] = output[idx + 1] = output[idx + 2] = val;
      output[idx + 3] = 255;
    }
  }
  return output;
};

// Robust Mask Generation Pipeline
const generateBinaryMask = async (imageSrc: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get canvas context");

        ctx.drawImage(img, 0, 0);
        let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        let data = imageData.data;

        // 1. Thresholding (Invert: Dark walls become White, Light background becomes Black)
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
          // Threshold logic: If dark (<128), it's structure -> Make White. Else Black.
          const val = brightness < 150 ? 255 : 0; 
          data[i] = data[i + 1] = data[i + 2] = val;
          data[i + 3] = 255;
        }

        // 2. Morphological Opening (Erode -> Dilate)
        // This removes thin noise (text) but keeps thick blocks (walls)
        let processedData = applyErosion(data, canvas.width, canvas.height); // Remove text
        processedData = applyDilation(processedData, canvas.width, canvas.height); // Restore walls
        processedData = applyDilation(processedData, canvas.width, canvas.height); // Thicken slightly for safety

        imageData.data.set(processedData);
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = imageSrc;
  });
};

export const Canvas: React.FC<CanvasProps> = ({ 
  imageUrl, generatedImage, status, pins, isProcessing,
  onImageClick, onFileUpload, onReset, fileInputRef,
  canUndo, canRedo, currentEditIndex, onUndo, onRedo, onResetToOriginal,
  hasInsights, onToggleInsights, estimatedTime, onOpenAutonomous,
  detectedObjects = [], onGenerateFromPlan,
  visualizationViews = [], activeViewIndex = 0, onViewSwitch
}) => {
  const [imgError, setImgError] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [hoveredObject, setHoveredObject] = useState<IdentifiedObject | null>(null);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const imageRef = useRef<HTMLImageElement>(null);
  
  // New Render Mode State
  const [uploadMode, setUploadMode] = useState<'photo' | 'plan'>('photo');
  const [planFile, setPlanFile] = useState<File | null>(null);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [planPreview, setPlanPreview] = useState<string | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const [stylePrompt, setStylePrompt] = useState("");

  const planInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setImgError(false);
  }, [generatedImage, imageUrl]);

  // Clean local state function
  const cleanLocalState = () => {
    setPlanFile(null);
    setRefFile(null);
    setPlanPreview(null);
    setRefPreview(null);
    setStylePrompt("");
    if (planInputRef.current) planInputRef.current.value = '';
    if (refInputRef.current) refInputRef.current.value = '';
  };

  const handleModeSwitch = (mode: 'photo' | 'plan') => {
      onReset(); // Clear parent state immediately
      setUploadMode(mode);
      cleanLocalState();
  };

  const handleFullReset = () => {
    onReset(); // Call parent reset
    cleanLocalState(); // Clear local state
    setUploadMode('photo'); // Reset to default mode
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !imageUrl || isProcessing) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
      setCursorPos({ x, y });
      setShowCrosshair(true);

      // Check for hovered object
      if (detectedObjects.length > 0) {
        const normX = (x / rect.width) * 1000;
        const normY = (y / rect.height) * 1000;
        
        // Find smallest object that contains cursor
        const match = detectedObjects
          .filter(obj => obj.box_2d && 
             normX >= obj.box_2d[1] && normX <= obj.box_2d[3] &&
             normY >= obj.box_2d[0] && normY <= obj.box_2d[2]
          )
          .sort((a, b) => {
             const areaA = (a.box_2d![2] - a.box_2d![0]) * (a.box_2d![3] - a.box_2d![1]);
             const areaB = (b.box_2d![2] - b.box_2d![0]) * (b.box_2d![3] - b.box_2d![1]);
             return areaA - areaB;
          })[0];
          
        setHoveredObject(match || null);
      }
    } else {
      setShowCrosshair(false);
      setHoveredObject(null);
    }
  };

  const handleMouseLeave = () => {
    setShowCrosshair(false);
    setCursorPos(null);
    setHoveredObject(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !imageUrl || isProcessing) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const rippleId = Date.now();
    setRipples(prev => [...prev, { x, y, id: rippleId }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== rippleId));
    }, 1000);
    
    onImageClick(e, rect);
  };

  const handlePlanUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
       const file = e.target.files[0];
       setPlanFile(file);
       const reader = new FileReader();
       reader.onload = (e) => setPlanPreview(e.target?.result as string);
       reader.readAsDataURL(file);
    }
  };

  const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
       const file = e.target.files[0];
       setRefFile(file);
       const reader = new FileReader();
       reader.onload = (e) => setRefPreview(e.target?.result as string);
       reader.readAsDataURL(file);
    }
  };

  const executeRender = async () => {
      if (planPreview && onGenerateFromPlan) {
          try {
             const maskDataUrl = await generateBinaryMask(planPreview);
             
             const planBase64 = planPreview.split(',')[1];
             const maskBase64 = maskDataUrl.split(',')[1];
             const refBase64 = refPreview ? refPreview.split(',')[1] : null;
             
             onGenerateFromPlan(planBase64, maskBase64, refBase64, stylePrompt);
          } catch (e) {
             console.error("Failed to generate mask", e);
             // Fallback
             const planBase64 = planPreview.split(',')[1];
             onGenerateFromPlan(planBase64, planBase64, refPreview ? refPreview.split(',')[1] : null, stylePrompt);
          }
      }
  };

  const activeImage = (generatedImage && !imgError) ? generatedImage : imageUrl;

  const handleImageError = () => {
    setImgError(true);
  };

  const getStatusIcon = () => {
    if (status === 'Removing Object...') return <Trash className="w-16 h-16 text-rose-400 animate-pulse" />;
    if (status === 'Repositioning Object...') return <Move className="w-16 h-16 text-sky-400 animate-pulse" />;
    if (status === 'Transforming Object...') return <Sparkles className="w-16 h-16 text-purple-400 animate-pulse" />;
    if (status === 'Generating Visualization...') return <ImageIcon className="w-16 h-16 text-emerald-400 animate-pulse" />;
    return <ScanSearch className="w-16 h-16 text-indigo-400 animate-pulse" />;
  };

  const getInstructionText = () => {
    if (pins.length === 0) return "👆 Click to select source object";
    if (pins.length === 1) return "👆 Click target location (optional) or type command";
    return "✅ Ready - Type your command below";
  };
  
  const isRefining = status === 'Refining object detection...';
  const shouldBlur = isProcessing && !isRefining;

  if (!imageUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-auto bg-slate-900/50">
        
        {/* Tab Switcher */}
        <div className="flex p-1 bg-slate-800 rounded-xl mb-8 border border-slate-700">
           <button 
             onClick={() => handleModeSwitch('photo')}
             className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${uploadMode === 'photo' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
           >
             <ScanSearch className="w-4 h-4" /> Analyze Photo
           </button>
           <button 
             onClick={() => handleModeSwitch('plan')}
             className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${uploadMode === 'plan' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
           >
             <MapIcon className="w-4 h-4" /> Visualize Plan
           </button>
        </div>

        {uploadMode === 'photo' ? (
            /* Classic Upload */
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="max-w-md w-full aspect-square border-2 border-dashed border-slate-700 rounded-3xl flex flex-col items-center justify-center gap-6 group cursor-pointer hover:border-indigo-500/50 hover:bg-slate-800/50 transition-all animate-in zoom-in-95 duration-300"
            >
              <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform">
                <Upload className="w-10 h-10 text-slate-500 group-hover:text-indigo-400" />
              </div>
              <div className="text-center px-8">
                <p className="text-xl font-bold text-slate-200">Point & Speak Analysis</p>
                <p className="text-sm text-slate-500 mt-2">Upload an existing interior photo to edit, rearrange, or analyze using spatial reasoning.</p>
              </div>
            </div>
        ) : (
            /* Plan Visualization Mode */
            <div className="w-full max-w-4xl grid grid-cols-2 gap-8 animate-in zoom-in-95 duration-300">
               {/* Left: Inputs */}
               <div className="space-y-6">
                  <div className="space-y-2">
                     <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">1. Floor Plan (Structure)</label>
                     <div 
                        onClick={() => planInputRef.current?.click()}
                        className={`h-40 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${planPreview ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/50'}`}
                     >
                        {planPreview ? (
                           <img src={planPreview} className="h-full w-full object-contain rounded-xl p-2" alt="Plan" />
                        ) : (
                           <>
                           <LayoutTemplate className="w-8 h-8 text-slate-500 mb-2" />
                           <span className="text-sm text-slate-400">Upload Floor Plan</span>
                           </>
                        )}
                     </div>

                     {/* Helper Tip */}
                     <div className="flex items-start gap-2 bg-indigo-500/10 p-2 rounded-lg border border-indigo-500/20 mt-2">
                        <Info className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-indigo-200 leading-tight">
                        <strong>Tip:</strong> For best 3D visualization, upload a <u>single room plan</u> (e.g. just the Kitchen) rather than a whole floor blueprint.
                        </p>
                     </div>
                  </div>

                  <div className="space-y-2">
                     <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">2. Reference Image (Style)</label>
                     <div 
                        onClick={() => refInputRef.current?.click()}
                        className={`h-40 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all ${refPreview ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-700 hover:border-indigo-500/50 hover:bg-slate-800/50'}`}
                     >
                        {refPreview ? (
                           <img src={refPreview} className="h-full w-full object-contain rounded-xl p-2" alt="Ref" />
                        ) : (
                           <>
                           <ImageIcon className="w-8 h-8 text-slate-500 mb-2" />
                           <span className="text-sm text-slate-400">Upload Style Reference (Optional)</span>
                           </>
                        )}
                     </div>
                  </div>
               </div>

               {/* Right: Prompt & Action */}
               <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 flex flex-col">
                  <h3 className="text-lg font-bold text-white mb-1">Visualization Studio</h3>
                  <p className="text-xs text-slate-400 mb-6">Generates a realistic photo respecting the plan's structure and the reference's style.</p>
                  
                  <div className="flex-1">
                      <label className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2 block">Additional Requirements</label>
                      <textarea 
                         value={stylePrompt}
                         onChange={(e) => setStylePrompt(e.target.value)}
                         placeholder="E.g., Make it a cozy mid-century modern living room with warm lighting..."
                         className="w-full h-32 bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 resize-none focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                  </div>

                  <button 
                     onClick={executeRender}
                     disabled={!planFile || isProcessing}
                     className="w-full mt-6 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-900/20 flex items-center justify-center gap-2 transition-all"
                  >
                     {isProcessing ? (
                        <>
                           <Sparkles className="w-4 h-4 animate-spin" /> Generating...
                        </>
                     ) : (
                        <>
                           <Sparkles className="w-4 h-4" /> Generate Visualization
                           <ArrowRight className="w-4 h-4" />
                        </>
                     )}
                  </button>
               </div>
            </div>
        )}

        {/* Hidden Inputs */}
        <input type="file" ref={fileInputRef as any} onChange={onFileUpload} className="hidden" accept="image/*" />
        <input type="file" ref={planInputRef} onChange={handlePlanUpload} className="hidden" accept="image/*" />
        <input type="file" ref={refInputRef} onChange={handleRefUpload} className="hidden" accept="image/*" />
      </div>
    );
  }

  return (
    <div className="flex-1 relative flex flex-col bg-slate-900 overflow-hidden">
      {/* Top Bar */}
      <div className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md z-10">
        <div className="flex items-center gap-3">
          <span className="font-bold tracking-tight text-lg">PointSpeak</span>
          {!isProcessing && (
            <span className="text-xs text-slate-400 bg-slate-800 px-3 py-1.5 rounded-full border border-slate-700">
              {getInstructionText()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
           {/* Insights Toggle */}
           {hasInsights && (
             <button
               onClick={onToggleInsights}
               className="flex items-center gap-2 px-3 py-2 mr-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-medium transition-all"
               title="View Room Insights"
             >
               <Sparkles className="w-3.5 h-3.5" />
               Insights
             </button>
           )}

           <div className="flex items-center gap-1 mr-2 border-r border-slate-700 pr-3">
             <button
               onClick={onUndo}
               disabled={!canUndo}
               className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 rounded-lg text-xs text-slate-300 transition-all"
               title="Undo (Ctrl+Z)"
             >
               <Undo2 className="w-3.5 h-3.5" /> 
             </button>
             <button
               onClick={onRedo}
               disabled={!canRedo}
               className="flex items-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 rounded-lg text-xs text-slate-300 transition-all"
               title="Redo (Ctrl+Y)"
             >
               <Redo2 className="w-3.5 h-3.5" /> 
             </button>
             {currentEditIndex > 0 && (
               <button
                 onClick={onResetToOriginal}
                 className="flex items-center gap-1 px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs ml-1 transition-all"
                 title="Reset to Original"
               >
                 <RotateCcw className="w-3.5 h-3.5" />
               </button>
             )}
           </div>

           {/* Autonomous Button */}
           {onOpenAutonomous && (
              <button
                onClick={onOpenAutonomous}
                className="p-2 mr-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-all shadow-lg shadow-purple-900/20 group"
                title="Open Autonomous Agent"
              >
                <Zap className="w-5 h-5 group-hover:animate-pulse" />
              </button>
           )}

           <button onClick={handleFullReset} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Clear Session">
             <Trash2 className="w-5 h-5" />
           </button>
        </div>
      </div>

      {/* Image Area */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-auto relative">
        <div 
          className={`relative max-h-full max-w-full inline-block rounded-xl shadow-2xl overflow-hidden group ${isProcessing ? 'cursor-wait' : 'cursor-none'}`}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {imgError ? (
            <div className="flex flex-col items-center justify-center w-[500px] h-[500px] bg-slate-800 text-slate-400 border border-slate-700 rounded-xl">
               <ImageOff className="w-12 h-12 mb-4 opacity-50" />
               <p className="text-sm font-medium">Failed to load generated image.</p>
               <p className="text-xs text-slate-500 mt-1 mb-4">Please Undo to try again.</p>
               <button onClick={onUndo} disabled={!canUndo} className="px-4 py-2 bg-slate-700 rounded-lg hover:bg-slate-600 text-xs font-bold text-slate-200 transition-colors disabled:opacity-50">
                 Undo Last Action
               </button>
            </div>
          ) : (
            <img 
              ref={imageRef}
              src={activeImage!} 
              alt="Workspace" 
              onError={handleImageError}
              className={`max-h-[80vh] w-auto object-contain block select-none transition-all duration-700 ${shouldBlur ? 'blur-md grayscale scale-[0.98]' : 'blur-0 grayscale-0 scale-100'}`}
            />
          )}

          {ripples.map(ripple => (
            <div
              key={ripple.id}
              className="absolute w-20 h-20 border-2 border-indigo-400 rounded-full pointer-events-none z-25"
              style={{
                left: `${ripple.x}px`,
                top: `${ripple.y}px`,
                transform: 'translate(-50%, -50%)',
                animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1)'
              }}
            />
          ))}

          {/* Hovered Object Overlay */}
          {hoveredObject && hoveredObject.box_2d && !isProcessing && (
            <div 
               className="absolute z-20 pointer-events-none animate-in fade-in duration-200"
               style={{
                 top: `${hoveredObject.box_2d[0] / 10}%`,
                 left: `${hoveredObject.box_2d[1] / 10}%`,
                 height: `${(hoveredObject.box_2d[2] - hoveredObject.box_2d[0]) / 10}%`,
                 width: `${(hoveredObject.box_2d[3] - hoveredObject.box_2d[1]) / 10}%`,
               }}
            >
               <div className="w-full h-full border border-white/50 bg-white/5 rounded-sm shadow-[0_0_15px_rgba(255,255,255,0.2)]" />
               <div className="absolute -top-6 left-0 bg-slate-900/90 text-white text-[10px] font-bold px-2 py-1 rounded shadow-lg border border-slate-700 whitespace-nowrap">
                  {hoveredObject.name}
               </div>
            </div>
          )}

          {showCrosshair && cursorPos && !isProcessing && imageRef.current && (
            <>
              <div 
                className="absolute top-0 bottom-0 w-px bg-indigo-400/50 pointer-events-none z-30"
                style={{ left: `${cursorPos.x}px` }}
              />
              <div 
                className="absolute left-0 right-0 h-px bg-indigo-400/50 pointer-events-none z-30"
                style={{ top: `${cursorPos.y}px` }}
              />
              <div 
                className="absolute w-2 h-2 bg-indigo-400 rounded-full pointer-events-none z-30 animate-pulse"
                style={{ 
                  left: `${cursorPos.x}px`, 
                  top: `${cursorPos.y}px`,
                  transform: 'translate(-50%, -50%)'
                }}
              />
              {!hoveredObject && (
                <div 
                  className="absolute bg-slate-900/90 text-indigo-300 px-2 py-1 rounded text-xs font-mono pointer-events-none z-30 backdrop-blur-sm border border-indigo-500/30"
                  style={{ 
                    left: `${cursorPos.x + 15}px`, 
                    top: `${cursorPos.y - 25}px`
                  }}
                >
                  [{Math.round((cursorPos.x / imageRef.current.offsetWidth) * 1000)}, {Math.round((cursorPos.y / imageRef.current.offsetHeight) * 1000)}]
                </div>
              )}
            </>
          )}
          
          {isRefining && (
            <div className="absolute top-4 right-4 z-40 flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-3 py-1.5 rounded-full border border-indigo-500/30 shadow-xl animate-in fade-in slide-in-from-top-2">
               <Layers className="w-3 h-3 text-indigo-400 animate-pulse" />
               <span className="text-[10px] font-bold text-slate-200">Updating Scene...</span>
            </div>
          )}
          
          {shouldBlur && status !== 'Idle' && status !== 'Analyzing Source...' && status !== 'Target Set' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
                <div className="relative">
                  {getStatusIcon()}
                  <div className="absolute inset-0 blur-xl rounded-full bg-indigo-500/20" />
                </div>
                <p className="mt-4 font-mono text-sm tracking-widest uppercase animate-pulse text-indigo-300">
                  {status}
                </p>
                {estimatedTime !== undefined && estimatedTime > 0 && (
                   <div className="mt-2 flex items-center gap-1.5 px-3 py-1 bg-slate-900/50 rounded-full border border-slate-700/50 backdrop-blur-md">
                      <Timer className="w-3 h-3 text-slate-400" />
                      <span className="text-xs font-mono text-slate-300">~{estimatedTime}s remaining</span>
                   </div>
                )}
            </div>
          )}

          {!shouldBlur && (
          <>
            {pins.length === 2 && (
              <svg className="absolute inset-0 pointer-events-none w-full h-full z-10">
                 <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
                  </marker>
                  <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="1" />
                  </linearGradient>
                </defs>
                <line 
                  x1={`${pins[0].x / 10}%`} y1={`${pins[0].y / 10}%`} 
                  x2={`${pins[1].x / 10}%`} y2={`${pins[1].y / 10}%`} 
                  stroke="url(#arrowGradient)" strokeWidth="3" strokeDasharray="8,8" markerEnd="url(#arrowhead)"
                >
                  <animate attributeName="stroke-dashoffset" from="16" to="0" dur="0.5s" repeatCount="indefinite" />
                </line>
              </svg>
            )}
            {pins.map((pin, index) => (
              <div 
                key={index}
                className="absolute z-20"
                style={{ 
                  left: `${pin.x / 10}%`, 
                  top: `${pin.y / 10}%`, 
                  transform: 'translate(-50%, -50%)',
                  animation: 'zoom-in 0.3s ease-out'
                }}
              >
                <div className={`absolute inset-0 w-16 h-16 rounded-full ${index === 0 ? 'bg-red-500/20 border-2 border-red-500/50' : 'bg-green-500/20 border-2 border-green-500/50'}`} 
                     style={{ animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite', transform: 'translate(-50%, -50%)' }}
                />
                <div className={`absolute w-6 h-6 rounded-full border-3 border-white shadow-2xl ${index === 0 ? 'bg-red-500' : 'bg-green-500'}`} 
                     style={{ transform: 'translate(-50%, -50%)' }}
                />
                <div className={`absolute top-8 left-1/2 -translate-x-1/2 ${index === 0 ? 'bg-red-500' : 'bg-green-500'} text-white text-[10px] font-bold px-2 py-1 rounded-full whitespace-nowrap shadow-lg`}>
                  {index === 0 ? '🎯 SOURCE' : '📍 TARGET'}
                </div>
              </div>
            ))}
          </>
          )}
        </div>
        
        {/* Multi-View Switcher UI */}
        {visualizationViews && visualizationViews.length > 1 && !isProcessing && (
           <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-900/80 backdrop-blur-xl p-2 rounded-2xl border border-slate-700 shadow-2xl z-40 animate-in slide-in-from-bottom-6">
              <div className="text-[10px] font-bold text-slate-500 uppercase px-2 flex items-center gap-1.5">
                 <Camera className="w-3 h-3" /> Angles
              </div>
              <div className="w-px h-4 bg-slate-700" />
              {visualizationViews.map((view, i) => (
                <button
                   key={i}
                   onClick={() => onViewSwitch && onViewSwitch(i)}
                   className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${activeViewIndex === i ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                >
                   {i === 0 ? 'Wide' : i === 1 ? 'Eye' : 'Detail'}
                </button>
              ))}
           </div>
        )}
        
      </div>
    </div>
  );
};
