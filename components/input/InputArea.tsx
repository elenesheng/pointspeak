
import React, { useRef } from 'react';
import { Send, ImagePlus, X, Layers, Box, Globe, Minimize2, Info } from 'lucide-react';
import { IdentifiedObject } from '../../types/spatial.types';

interface InputAreaProps {
  userInput: string;
  setUserInput: (s: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  onReferenceUpload?: (file: File) => void;
  referenceImagePreview?: string | null;
  onClearReference?: () => void;
  
  // New props for hierarchy
  selectedObject: IdentifiedObject | null;
  onObjectUpdate: (obj: IdentifiedObject) => void;
  onClearSelection?: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ 
  userInput, setUserInput, onSend, disabled, placeholder, 
  onReferenceUpload, referenceImagePreview, onClearReference,
  selectedObject, onObjectUpdate, onClearSelection
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onReferenceUpload) {
      onReferenceUpload(e.target.files[0]);
    }
  };

  const hasHierarchy = selectedObject && selectedObject.specific_part && selectedObject.whole_object;
  const isWholeSelected = selectedObject?.name === selectedObject?.whole_object?.name;

  const toggleHierarchy = (useWhole: boolean) => {
    if (!selectedObject || !selectedObject.whole_object || !selectedObject.specific_part) return;

    const targetPart = useWhole ? selectedObject.whole_object : selectedObject.specific_part;
    
    onObjectUpdate({
      ...selectedObject,
      name: targetPart.name,
      visual_details: targetPart.visual_details
    });
  };

  const isInteractionDisabled = disabled; 

  return (
    <div className="p-6 bg-slate-900 border-t border-slate-800 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
      
      {/* Context Indicator */}
      <div className="mb-4 flex items-center gap-2 animate-in slide-in-from-bottom-2 min-h-[28px]">
         <span className="text-[10px] font-bold text-slate-500 uppercase mr-2">Target Scope:</span>
         
         {selectedObject ? (
           <div className="flex items-center gap-2">
             {hasHierarchy ? (
              <>
                <button 
                  onClick={() => toggleHierarchy(false)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!isWholeSelected ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                  <Layers className="w-3 h-3" />
                  {selectedObject.specific_part?.name} (Part)
                </button>

                <button 
                  onClick={() => toggleHierarchy(true)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isWholeSelected ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                  <Box className="w-3 h-3" />
                  {selectedObject.whole_object?.name} (Whole)
                </button>
              </>
             ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600/20 border border-indigo-500 text-indigo-300">
                 <Box className="w-3 h-3" />
                 {selectedObject.name}
              </div>
             )}

             {/* Clear Selection Button */}
             <button 
               onClick={onClearSelection}
               className="p-1.5 hover:bg-slate-800 rounded-md text-slate-500 hover:text-rose-400 transition-colors"
               title="Deselect (Return to Global Context)"
             >
               <X className="w-3.5 h-3.5" />
             </button>
           </div>
         ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
               <Globe className="w-3 h-3" />
               Global Room Context
            </div>
         )}
      </div>

      {/* Reference Image Preview */}
      {referenceImagePreview && (
        <div className="mb-4 flex items-center gap-3 bg-slate-800 p-2 rounded-lg border border-slate-700 w-fit animate-in fade-in zoom-in-95">
          <img src={referenceImagePreview} alt="Ref" className="w-10 h-10 object-cover rounded-md" />
          <div className="flex flex-col">
            <span className="text-[10px] text-indigo-400 font-bold uppercase">Reference Active</span>
            <span className="text-[10px] text-slate-400">Material/Pattern will be applied</span>
          </div>
          <button onClick={onClearReference} className="p-1 hover:bg-slate-700 rounded-full text-slate-500 hover:text-white">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className={`relative group transition-all duration-300 ${isInteractionDisabled ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
        <textarea 
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder={selectedObject ? `Modify ${selectedObject.name}...` : "Describe a change for the whole room (e.g., 'Make it minimalist')..."}
          className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pr-12 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 min-h-[100px] resize-none transition-all shadow-inner font-medium"
        />
        
        <div className="absolute bottom-4 right-4 flex gap-2">
           <button
             onClick={() => fileRef.current?.click()}
             className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 rounded-xl transition-all"
             title="Upload Reference Material"
           >
             <ImagePlus className="w-4 h-4" />
           </button>
           
           <button 
             onClick={onSend}
             disabled={!userInput.trim() || isInteractionDisabled}
             className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
           >
             <Send className="w-4 h-4" />
           </button>
        </div>
        <input type="file" ref={fileRef} onChange={handleFileChange} className="hidden" accept="image/*" />
      </div>

      <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-1.5 group cursor-help relative">
             <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest group-hover:text-indigo-400 transition-colors">
               Powered by Gemini multimodal reasoning
             </p>
             <Info className="w-3 h-3 text-slate-700 group-hover:text-indigo-400 transition-colors" />
             
             {/* Tooltip */}
             <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-800 border border-slate-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                <p className="text-xs text-slate-300 leading-relaxed">
                   Under the hood, the system understands objects, space, and design style before editing. It builds a 3D mental model of your room to ensure realistic results.
                </p>
             </div>
          </div>
          
          <div className="flex gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
          </div>
      </div>
    </div>
  );
};
