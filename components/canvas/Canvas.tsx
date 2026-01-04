
import React, { useRef, useState, useEffect } from 'react';
import { Upload, Trash2, ScanSearch, Trash, ImageIcon, Move, Sparkles, Undo2, Redo2, RotateCcw, ImageOff } from 'lucide-react';
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
  // History Props
  canUndo: boolean;
  canRedo: boolean;
  currentEditIndex: number;
  onUndo: () => void;
  onRedo: () => void;
  onResetToOriginal: () => void;
}

export const Canvas: React.FC<CanvasProps> = ({ 
  imageUrl, generatedImage, status, pins, isProcessing,
  onImageClick, onFileUpload, onReset, fileInputRef,
  canUndo, canRedo, currentEditIndex, onUndo, onRedo, onResetToOriginal
}) => {
  const [imgError, setImgError] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset error state when image changes
  useEffect(() => {
    setImgError(false);
  }, [generatedImage, imageUrl]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || !imageUrl || isProcessing) return;
    
    // We no longer hide generated image on click. 
    // The user interacts directly with the current state.
    
    const rect = imageRef.current.getBoundingClientRect();
    onImageClick(e, rect);
  };

  // Logic: Use generated image if available (and valid), otherwise fallback to original.
  // This supports the iterative workflow: Edit -> Result becomes "Current" -> Edit again.
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
        </div>
        <div className="flex items-center gap-2">
           {/* History Controls */}
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

           <button onClick={onReset} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white" title="Clear Session">
             <Trash2 className="w-5 h-5" />
           </button>
        </div>
      </div>

      {/* Image Area */}
      <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
        <div 
          className={`relative max-h-full max-w-full inline-block rounded-xl shadow-2xl overflow-hidden group ${isProcessing ? 'cursor-wait' : 'cursor-crosshair'}`}
          onClick={handleClick}
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
              className={`max-h-[80vh] w-auto object-contain block select-none transition-all duration-700 ${isProcessing ? 'brightness-50 grayscale' : 'brightness-100 grayscale-0'}`}
            />
          )}
          
          {/* Status Overlay */}
          {status !== 'Ready' && status !== 'Idle' && status !== 'Analyzing Source...' && status !== 'Target Set' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-30 pointer-events-none">
                <div className="relative">
                  {getStatusIcon()}
                  <div className="absolute inset-0 blur-xl rounded-full bg-indigo-500/20" />
                </div>
                <p className="mt-4 font-mono text-sm tracking-widest uppercase animate-pulse text-indigo-300">
                  {status}
                </p>
            </div>
          )}

          {/* Pins - Only show if not processing (or if you want them always visible on top of current image) */}
          {/* Note: Pins are coordinates relative to the original image dimensions usually, but since we assume 
              edits maintain aspect ratio/dimension mostly, we map them 0-1000 relative to container */}
          
            <>
              {pins.length === 2 && (
                <svg className="absolute inset-0 pointer-events-none w-full h-full z-10">
                   <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
                      <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
                    </marker>
                  </defs>
                  <line 
                    x1={`${pins[0].x / 10}%`} y1={`${pins[0].y / 10}%`} 
                    x2={`${pins[1].x / 10}%`} y2={`${pins[1].y / 10}%`} 
                    stroke="#10b981" strokeWidth="3" strokeDasharray="8,8" markerEnd="url(#arrowhead)"
                  />
                </svg>
              )}
              {pins.map((pin, index) => (
                <div 
                  key={index}
                  className="absolute w-6 h-6 flex items-center justify-center z-20 transition-all duration-300"
                  style={{ left: `${pin.x / 10}%`, top: `${pin.y / 10}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <div className={`w-3 h-3 rounded-full border-2 border-white shadow-xl pin-pulse relative ${index === 0 ? 'bg-red-500' : 'bg-green-500'}`} />
                </div>
              ))}
            </>
          
        </div>
      </div>
    </div>
  );
};
