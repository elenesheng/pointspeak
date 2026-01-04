
import React, { useRef } from 'react';
import { Send, ImagePlus, X } from 'lucide-react';

interface InputAreaProps {
  userInput: string;
  setUserInput: (s: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  onReferenceUpload?: (file: File) => void;
  referenceImagePreview?: string | null;
  onClearReference?: () => void;
}

export const InputArea: React.FC<InputAreaProps> = ({ 
  userInput, setUserInput, onSend, disabled, placeholder, 
  onReferenceUpload, referenceImagePreview, onClearReference 
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onReferenceUpload) {
      onReferenceUpload(e.target.files[0]);
    }
  };

  return (
    <div className="p-6 bg-slate-900 border-t border-slate-800 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
      
      {/* Reference Image Preview */}
      {referenceImagePreview && (
        <div className="mb-4 flex items-center gap-3 bg-slate-800 p-2 rounded-lg border border-slate-700 w-fit">
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

      <div className={`relative group transition-all duration-300 ${disabled ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
        <textarea 
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder={placeholder}
          className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 pr-12 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 min-h-[100px] resize-none transition-all shadow-inner font-medium"
        />
        
        <div className="absolute bottom-4 right-4 flex gap-2">
           {/* Reference Upload Button */}
           <button
             onClick={() => fileRef.current?.click()}
             className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 rounded-xl transition-all"
             title="Upload Reference Material"
           >
             <ImagePlus className="w-4 h-4" />
           </button>
           
           {/* Send Button */}
           <button 
             onClick={onSend}
             disabled={!userInput.trim() || disabled}
             className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
           >
             <Send className="w-4 h-4" />
           </button>
        </div>
        <input type="file" ref={fileRef} onChange={handleFileChange} className="hidden" accept="image/*" />
      </div>

      <div className="flex items-center justify-between mt-4">
          <p className="text-[10px] text-slate-600 uppercase font-bold tracking-widest">
            Spatial Reasoning Engine v3.0 PRO
          </p>
          <div className="flex gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_5px_rgba(16,185,129,0.5)]"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
          </div>
      </div>
    </div>
  );
};
