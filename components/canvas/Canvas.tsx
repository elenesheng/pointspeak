
import React, { useRef, useState, useEffect } from 'react';
import { Upload, Trash2, ScanSearch, Trash, ImageIcon, Move, Sparkles, Undo2, Redo2, RotateCcw, ImageOff, Timer, Layers, Zap } from 'lucide-react';
import { Coordinate } from '../../types/spatial.types';
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
  // New props for insights toggle
  hasInsights: boolean;
  onToggleInsights: () => void;
  // New props for timer
  estimatedTime?: number;
  onOpenAutonomous?: () => void;
}

export const Canvas: React.FC<CanvasProps> = ({ 
  imageUrl, generatedImage, status, pins, isProcessing,
  onImageClick, onFileUpload, onReset, fileInputRef,
  canUndo, canRedo, currentEditIndex, onUndo, onRedo, onResetToOriginal,
  hasInsights, onToggleInsights, estimatedTime, onOpenAutonomous
}) => {
  const [imgError, setImgError] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [showCrosshair, setShowCrosshair] = useState(false);
  const [ripples, setRipples] = useState<Array<{ x: number; y: number; id: number }>>([]);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setImgError(false);
  }, [generatedImage, imageUrl]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !imageUrl || isProcessing) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
      setCursorPos({ x, y });
      setShowCrosshair(true);
    } else {
      setShowCrosshair(false);
    }
  };

  const handleMouseLeave = () => {
    setShowCrosshair(false);
    setCursorPos(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !imageUrl || isProcessing) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Add ripple effect
    const rippleId = Date.now();
    setRipples(prev => [...prev, { x, y, id: rippleId }]);
    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== rippleId));
    }, 1000);
    
    onImageClick(e, rect);
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
      <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
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
        <input type="file" ref={fileInputRef as any} onChange={onFileUpload} className="hidden" accept="image/*" />
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

           <button onClick={onReset} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Clear Session">
             <Trash2 className="w-5 h-5" />
           </button>
        </div>
      </div>

      {/* Image Area */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
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
              <div 
                className="absolute bg-slate-900/90 text-indigo-300 px-2 py-1 rounded text-xs font-mono pointer-events-none z-30 backdrop-blur-sm border border-indigo-500/30"
                style={{ 
                  left: `${cursorPos.x + 15}px`, 
                  top: `${cursorPos.y - 25}px`
                }}
              >
                [{Math.round((cursorPos.x / imageRef.current.offsetWidth) * 1000)}, {Math.round((cursorPos.y / imageRef.current.offsetHeight) * 1000)}]
              </div>
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
      </div>
    </div>
  );
};
