
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
  
  // For smart quick actions based on analysis
  qualityAnalysis?: any;
  learningStore?: any;
}

export const InputArea: React.FC<InputAreaProps> = ({ 
  userInput, setUserInput, onSend, disabled, placeholder, 
  onReferenceUpload, referenceImagePreview, onClearReference,
  selectedObject, onObjectUpdate, onClearSelection,
  onVisualize, detectedObjects = [], onGetIdeas,
  isRenderedView = false, isPlan = false,
  qualityAnalysis, learningStore
}) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && onReferenceUpload) {
      onReferenceUpload(e.target.files[0]);
    }
  };

  // Generate smart quick actions based on analysis and user preferences
  const getSmartQuickActions = () => {
    if (!selectedObject) return [];
    
    const actions: Array<{ label: string; prompt: string; icon: React.ReactNode; priority: number }> = [];
    
    // Always include Remove
    actions.push({
      label: 'Remove',
      prompt: `Remove ${selectedObject.name}`,
      icon: <Trash2 className="w-3.5 h-3.5" />,
      priority: 0
    });
    
    // Get quality issues for this object
    if (qualityAnalysis?.issues) {
      const objectIssues = qualityAnalysis.issues.filter((issue: any) => 
        issue.location?.toLowerCase().includes(selectedObject.name.toLowerCase()) ||
        issue.title?.toLowerCase().includes(selectedObject.name.toLowerCase())
      );
      
      // Add fix actions for quality issues
      objectIssues.slice(0, 2).forEach((issue: any) => {
        if (issue.auto_fixable && issue.fix_prompt) {
          actions.push({
            label: issue.title || 'Fix',
            prompt: issue.fix_prompt,
            icon: <Hammer className="w-3.5 h-3.5" />,
            priority: 1
          });
        }
      });
    }
    
    // Get user preferences from learning store
    if (learningStore?.patterns) {
      const patterns = learningStore.patterns;
      
      // Add preferred styles
      if (patterns.likedStyles && patterns.likedStyles.length > 0) {
        const topStyle = patterns.likedStyles[0];
        actions.push({
          label: topStyle,
          prompt: `Change ${selectedObject.name} to ${topStyle} style`,
          icon: <Sparkles className="w-3.5 h-3.5" />,
          priority: 2
        });
      }
      
      // Add modernize if user likes modern styles
      if (patterns.likedStyles?.some((s: string) => /modern|contemporary|minimal/i.test(s))) {
        actions.push({
          label: 'Modernize',
          prompt: `Modernize ${selectedObject.name}`,
          icon: <Sparkles className="w-3.5 h-3.5" />,
          priority: 3
        });
      }
    }
    
    // Category-based defaults (fallback)
    const category = selectedObject.category;
    if (category === 'Appliance') {
      actions.push({
        label: 'Stainless Steel',
        prompt: `Change ${selectedObject.name} to Stainless Steel`,
        icon: <Palette className="w-3.5 h-3.5" />,
        priority: 4
      });
    } else if (category === 'Furniture') {
      actions.push({
        label: 'Modern Style',
        prompt: `Change ${selectedObject.name} style to modern`,
        icon: <Sparkles className="w-3.5 h-3.5" />,
        priority: 4
      });
    } else if (category === 'Surface') {
      actions.push({
        label: 'Marble',
        prompt: `Change ${selectedObject.name} to white marble`,
        icon: <Palette className="w-3.5 h-3.5" />,
        priority: 4
      });
    } else if (category === 'Decor') {
      actions.push({
        label: 'Modernize',
        prompt: `Replace ${selectedObject.name} with a modern alternative`,
        icon: <Sparkles className="w-3.5 h-3.5" />,
        priority: 4
      });
    }
    
    // Sort by priority and return top 4
    return actions.sort((a, b) => a.priority - b.priority).slice(0, 4);
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

      {/* Smart Quick Actions - Based on analysis and user preferences */}
      {selectedObject && !isInteractionDisabled && (() => {
        const smartActions = getSmartQuickActions();
        return (
          <div className="mb-3 flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {smartActions.map((action, index) => (
              <button
                key={index}
                onClick={() => setUserInput(action.prompt)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
                  action.priority === 0 
                    ? 'bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 text-rose-300'
                    : action.priority === 1
                    ? 'bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-300'
                    : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 text-slate-300'
                }`}
              >
                {action.icon} {action.label}
              </button>
            ))}
          </div>
        );
      })()}

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
             disabled={isInteractionDisabled}
             className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-indigo-400 rounded-lg transition-all border border-slate-700 hover:border-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
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
