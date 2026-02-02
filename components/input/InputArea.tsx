
import React, { useRef } from 'react';
import { Send, ImagePlus, X, Layers, Box, Globe, Info, Sparkles, ChevronDown, Palette, Trash2, Sofa, Hammer, Lightbulb } from 'lucide-react';
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
  
  // New visualize prop
  onVisualize?: (object: IdentifiedObject, prompt: string) => void;

  // New detected objects for room selection
  detectedObjects?: IdentifiedObject[];
  
  // New Suggestion Trigger
  onGetIdeas?: (goal: string) => void;
  
  // New flag for Rendered View (Plan to 3D)
  isRenderedView?: boolean;
  isPlan?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({ 
  userInput, setUserInput, onSend, disabled, placeholder, 
  onReferenceUpload, referenceImagePreview, onClearReference,
  selectedObject, onObjectUpdate, onClearSelection,
  onVisualize, detectedObjects = [], onGetIdeas,
  isRenderedView = false, isPlan = false
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onReferenceUpload) {
      onReferenceUpload(e.target.files[0]);
    }
  };

  const hasHierarchy = selectedObject && selectedObject.specific_part && selectedObject.whole_object;
  const isWholeSelected = selectedObject?.name === selectedObject?.whole_object?.name;
  
  // Filter for rooms/structure to populate dropdown
  const rooms = detectedObjects.filter(o => o.category === 'Structure');
  
  // Show dropdown if it's a plan, a render, or if we detected multiple rooms (complex scene)
  // Temporarily hidden
  const showRoomDropdown = false; // (isPlan || isRenderedView || rooms.length > 1) && rooms.length > 0;

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
  const category = selectedObject?.category || 'General';

  return (
    <div className="p-4 bg-slate-900 border-t border-slate-800 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]">
      
      {/* Context Indicator */}
      <div className="mb-3 flex items-center gap-2 animate-in slide-in-from-bottom-2 min-h-[28px]">
         <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mr-2">Scope:</span>
         
         {selectedObject ? (
           <div className="flex items-center gap-2">
             {hasHierarchy ? (
              <>
                <button 
                  onClick={() => toggleHierarchy(false)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!isWholeSelected ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  {selectedObject.specific_part?.name} (Part)
                </button>

                <button 
                  onClick={() => toggleHierarchy(true)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${isWholeSelected ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                  <Box className="w-3.5 h-3.5" />
                  {selectedObject.whole_object?.name} (Whole)
                </button>
              </>
             ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/10 border border-indigo-500/30 text-indigo-300">
                 <Box className="w-3.5 h-3.5" />
                 {selectedObject.name}
              </div>
             )}

             {/* Clear Selection Button */}
             <button 
               onClick={onClearSelection}
               className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-500 hover:text-rose-400 transition-colors"
               title="Deselect (Return to Global Context)"
             >
               <X className="w-4 h-4" />
             </button>
           </div>
         ) : (
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                   <Globe className="w-3.5 h-3.5" />
                   Global Room Context
                </div>
                
                {showRoomDropdown && (
                   <div className="h-5 w-px bg-slate-800"></div> 
                )}

                {showRoomDropdown && (
                  <div className="relative group">
                    <select 
                        onChange={(e) => {
                            const r = rooms.find(room => room.id === e.target.value);
                            if(r) onObjectUpdate(r);
                        }}
                        className="appearance-none bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-300 text-xs rounded-lg pl-3 pr-8 py-1.5 outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer transition-all"
                        value=""
                    >
                        <option value="" disabled>Select a room...</option>
                        {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                )}
            </div>
         )}
      </div>

      {/* Smart Quick Actions - Always show Remove, other actions are category-specific */}
      {selectedObject && !isInteractionDisabled && (
        <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {/* Remove - Always available */}
          <button
            onClick={() => setUserInput(`Remove ${selectedObject.name}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 text-xs text-rose-300 whitespace-nowrap transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Remove
          </button>

          {/* Appliance-specific actions */}
          {category === 'Appliance' && (
            <>
              <button
                onClick={() => setUserInput(`Change ${selectedObject.name} to Stainless Steel`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
              >
                <Palette className="w-3.5 h-3.5" /> Stainless Steel
              </button>
              <button
                onClick={() => setUserInput(`Change ${selectedObject.name} to Matte Black`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
              >
                <Palette className="w-3.5 h-3.5" /> Matte Black
              </button>
            </>
          )}

          {/* Furniture-specific actions */}
          {category === 'Furniture' && (
            <>
              <button
                onClick={() => setUserInput(`Upholster ${selectedObject.name} in Cognac Leather`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
              >
                <Sofa className="w-3.5 h-3.5" /> Leather
              </button>
              <button
                onClick={() => setUserInput(`Change ${selectedObject.name} style to modern`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> Modern Style
              </button>
            </>
          )}

          {/* Surface-specific actions (floors, countertops, walls) */}
          {category === 'Surface' && (
            <>
              <button
                onClick={() => setUserInput(`Change ${selectedObject.name} to white marble`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
              >
                <Palette className="w-3.5 h-3.5" /> Marble
              </button>
              <button
                onClick={() => setUserInput(`Change ${selectedObject.name} to dark oak wood`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
              >
                <Palette className="w-3.5 h-3.5" /> Dark Oak
              </button>
            </>
          )}

          {/* Decor-specific actions */}
          {category === 'Decor' && (
            <button
              onClick={() => setUserInput(`Replace ${selectedObject.name} with a modern alternative`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Modernize
            </button>
          )}

          {/* Fixture-specific actions (sinks, faucets, lights) */}
          {category === 'Fixture' && (
            <>
              <button
                onClick={() => setUserInput(`Change ${selectedObject.name} to brushed gold`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
              >
                <Palette className="w-3.5 h-3.5" /> Gold
              </button>
              <button
                onClick={() => setUserInput(`Change ${selectedObject.name} to matte black`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
              >
                <Palette className="w-3.5 h-3.5" /> Black
              </button>
            </>
          )}

          {/* Structure-specific actions (walls, rooms) */}
          {category === 'Structure' && (
            <button
              onClick={() => setUserInput(`Paint ${selectedObject.name} in warm white`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-xs text-slate-300 whitespace-nowrap transition-colors"
            >
              <Palette className="w-3.5 h-3.5" /> Repaint
            </button>
          )}
        </div>
      )}

      {/* Reference Image Preview */}
      {referenceImagePreview && (
        <div className="mb-4 flex items-center gap-3 bg-slate-800 p-2 rounded-lg border border-slate-700 w-fit animate-in fade-in zoom-in-95">
          <img src={referenceImagePreview} alt="Ref" className="w-12 h-12 object-cover rounded-md" />
          <div className="flex flex-col">
            <span className="text-xs text-indigo-400 font-bold uppercase">Reference Active</span>
            <span className="text-xs text-slate-400">Material will be applied</span>
          </div>
          <button onClick={onClearReference} className="p-1 hover:bg-slate-700 rounded-full text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className={`relative group transition-all duration-300 ${isInteractionDisabled ? 'opacity-50 grayscale pointer-events-none' : ''}`}>
        <textarea 
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && onSend()}
          placeholder={selectedObject ? `Modify ${selectedObject.name}...` : isPlan ? "Describe how to visualize this floor plan..." : "Describe a change for the whole room..."}
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 pr-12 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 min-h-[100px] resize-none transition-all shadow-inner font-medium"
        />
        
        <div className="absolute bottom-3 right-3 flex gap-2">
           <button
             onClick={() => fileRef.current?.click()}
             className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 rounded-lg transition-all border border-slate-700 hover:border-slate-600"
             title="Upload Reference Material"
           >
             <ImagePlus className="w-4 h-4" />
           </button>
           
           {/* Brainstorm Button - Neutral Secondary Action */}
           {onGetIdeas && !selectedObject && (
              <button
                onClick={() => onGetIdeas(userInput || (isPlan ? "Visualize this plan" : "Improve this room"))}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg transition-all border border-slate-700 hover:border-slate-600"
                title="Get AI Design Ideas"
              >
                <Lightbulb className="w-4 h-4" />
              </button>
           )}
           
           {/* Visualize Button - Conditional & Secondary Color */}
           {selectedObject && onVisualize && (isRenderedView || isPlan) && (
              <button 
                onClick={() => onVisualize(selectedObject, userInput)}
                disabled={isInteractionDisabled}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-emerald-400 rounded-lg transition-all border border-slate-700 hover:border-slate-600 text-xs font-bold"
                title="Generate 3D Render of this object/room"
              >
                <Sparkles className="w-4 h-4" />
                Visualize
              </button>
           )}

           {/* Send Button - Primary Action */}
           <button 
             onClick={onSend}
             disabled={!userInput.trim() || isInteractionDisabled}
             className="p-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-lg transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
           >
             <Send className="w-4 h-4" />
           </button>
        </div>
        <input 
            type="file" 
            ref={fileRef} 
            onChange={handleFileChange} 
            className="hidden" 
            accept="image/*"
            onClick={(e) => (e.currentTarget.value = '')} 
        />
      </div>

      <div className="flex items-center justify-between mt-3 px-1">
          <div className="flex items-center gap-1.5 group cursor-help relative">
             <p className="text-xs text-slate-500 font-medium group-hover:text-indigo-400 transition-colors">
               Gemini Spatial Reasoning
             </p>
             <Info className="w-3.5 h-3.5 text-slate-600 group-hover:text-indigo-400 transition-colors" />
             
             {/* Tooltip */}
             <div className="absolute bottom-full left-0 mb-2 w-64 p-3 bg-slate-800 border border-slate-700 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 pointer-events-none">
                <p className="text-xs text-slate-300 leading-relaxed">
                   Under the hood, the system understands objects, space, and design style before editing. It builds a 3D mental model of your room to ensure realistic results.
                </p>
             </div>
          </div>
          
          <div className="flex gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/50"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-slate-700"></div>
          </div>
      </div>
    </div>
  );
};
