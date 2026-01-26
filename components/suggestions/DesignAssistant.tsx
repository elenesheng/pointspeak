
import React, { useRef } from 'react';
import { Sparkles, X, ArrowRight, Palette, Move, Trash2, Lightbulb, Pencil } from 'lucide-react';
import { DesignSuggestion } from '../../types/ai.types';
import { useClickOutside } from '../../hooks/useClickOutside';

interface DesignAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: DesignSuggestion[];
  isGenerating: boolean;
  onApply: (suggestion: DesignSuggestion) => void;
  onDismiss: (id: string) => void;
  onEditPreview: (suggestion: DesignSuggestion) => void;
}

export const DesignAssistant: React.FC<DesignAssistantProps> = ({
  isOpen,
  onClose,
  suggestions,
  isGenerating,
  onApply,
  onDismiss,
  onEditPreview
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(panelRef, () => {
    if (isOpen) onClose();
  });

  if (!isOpen) return null;

  const getIcon = (hint: string) => {
    switch (hint) {
      case 'remove': return <Trash2 className="w-4 h-4 text-rose-400" />;
      case 'layout': return <Move className="w-4 h-4 text-sky-400" />;
      case 'color': return <Palette className="w-4 h-4 text-purple-400" />;
      default: return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div ref={panelRef} className="absolute right-0 top-16 bottom-0 w-80 bg-slate-900/95 border-l border-slate-800 shadow-2xl z-40 transform transition-transform animate-in slide-in-from-right duration-300 flex flex-col backdrop-blur-md">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-600 rounded-lg">
            <Lightbulb className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-bold text-slate-100 text-sm">Design Assistant</h3>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3">
             <Sparkles className="w-8 h-8 text-indigo-400 animate-spin" />
             <p className="text-sm text-slate-400 font-medium">Analyzing room aesthetics...</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-sm">
            No suggestions yet. Ask for ideas!
          </div>
        ) : (
          suggestions.map((suggestion) => (
            <div 
              key={suggestion.id}
              className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 hover:border-indigo-500/50 transition-all group relative"
            >
              {/* Card Actions */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button 
                   onClick={(e) => { e.stopPropagation(); onEditPreview(suggestion); }}
                   className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-700"
                   title="Edit text before sending"
                 >
                    <Pencil className="w-3 h-3" />
                 </button>
                 <button 
                   onClick={(e) => { e.stopPropagation(); onDismiss(suggestion.id); }}
                   className="p-1.5 bg-slate-800 hover:bg-rose-900/50 rounded-lg text-slate-400 hover:text-rose-400 transition-colors border border-slate-700 hover:border-rose-800"
                   title="Dismiss suggestion"
                 >
                    <X className="w-3 h-3" />
                 </button>
              </div>

              <div className="flex items-start justify-between mb-2">
                <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 group-hover:bg-slate-700 transition-colors">
                  {getIcon(suggestion.icon_hint)}
                </div>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1 bg-slate-800 rounded-lg mr-12">
                  {suggestion.action_type}
                </span>
              </div>
              
              <h4 className="text-sm font-bold text-slate-200 mb-1">{suggestion.title}</h4>
              <p className="text-xs text-slate-400 mb-4 leading-relaxed">{suggestion.description}</p>
              
              <button
                onClick={() => onApply(suggestion)}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Visualize This
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
      
      <div className="p-4 border-t border-slate-800 bg-slate-900/50 text-[10px] text-slate-500 text-center">
        AI suggestions based on room analysis.
      </div>
    </div>
  );
};
