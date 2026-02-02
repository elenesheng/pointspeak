import React, { useRef, useEffect } from 'react';
import { ReasoningLog, AppStatus, EditHistoryEntry } from '../../types/ui.types';
import { IntentTranslation } from '../../types/ai.types';
import { IdentifiedObject } from '../../types/spatial.types';
import { LogEntry } from './LogEntry';
import { Zap, Target, Sparkles, ChevronDown, Download, XCircle } from 'lucide-react';
import { GEMINI_CONFIG } from '../../config/gemini.config';

interface ReasoningPanelProps {
  logs: ReasoningLog[];
  status: AppStatus;
  isProcessing: boolean;
  onForceExecute: (action: IntentTranslation, object: IdentifiedObject) => void;
  onAlternativeClick: (suggestion: string) => void;
  activeModel: string;
  onModelChange: (model: string) => void;
  editHistory: EditHistoryEntry[];
  currentEditIndex: number;
  onJumpToHistory: (index: number) => void;
  onExportHistory?: () => void;
  onCancel?: () => void;
}

export const ReasoningPanel: React.FC<ReasoningPanelProps> = ({ 
  logs, status, isProcessing, onForceExecute, onAlternativeClick, activeModel, onModelChange,
  editHistory, currentEditIndex, onJumpToHistory, onExportHistory, onCancel
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const isPro = activeModel === GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO;

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-900 border-l border-slate-800">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
             <Zap className="w-4 h-4 text-indigo-400" />
             <h2 className="font-semibold text-sm text-slate-300">Gemini Spatial Agent</h2>
          </div>
          
          {/* Model Toggle - Hidden for now, functionality preserved */}
          {/* 
          <div className="relative group">
            <button className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${isPro ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'bg-slate-800 text-slate-400 border-slate-700'}`}>
              {isPro ? 'Pro Model' : 'Fast Model'}
              <ChevronDown className="w-3 h-3 opacity-50" />
            </button>
            <div className="absolute right-0 top-full mt-2 w-48 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all">
               <button 
                 onClick={() => onModelChange(GEMINI_CONFIG.MODELS.IMAGE_EDITING_FLASH)}
                 className="w-full text-left px-4 py-3 hover:bg-slate-800 flex flex-col gap-1 border-b border-slate-800"
               >
                 <span className="text-sm font-bold text-slate-300">Nano Banana</span>
                 <span className="text-xs text-slate-500">Fast, Standard Quality</span>
               </button>
               <button 
                 onClick={() => onModelChange(GEMINI_CONFIG.MODELS.IMAGE_EDITING_PRO)}
                 className="w-full text-left px-4 py-3 hover:bg-slate-800 flex flex-col gap-1 bg-indigo-900/10"
               >
                 <span className="text-sm font-bold text-indigo-400">Nano Banana Pro</span>
                 <span className="text-xs text-slate-500">2K Resolution, Smart</span>
               </button>
            </div>
          </div>
          */}
        </div>
        
        {/* Status Bar */}
        <div className="flex items-center gap-3 bg-slate-950/50 p-3 rounded-xl border border-slate-800">
          <div className={`w-2 h-2 rounded-full ${status !== 'Ready' && status !== 'Idle' ? 'bg-indigo-500 animate-pulse' : 'bg-emerald-500'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Status</p>
            <p className="text-sm font-medium text-slate-200 truncate">{status}</p>
          </div>
          {isProcessing && (
             <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500 animate-spin" />
                {onCancel && (
                    <button 
                      onClick={onCancel}
                      className="p-1 hover:bg-slate-800 rounded-full text-slate-500 hover:text-rose-400 transition-colors"
                      title="Cancel Operation"
                    >
                       <XCircle className="w-4 h-4" />
                    </button>
                )}
             </div>
          )}
        </div>
      </div>

      {/* Edit History Timeline */}
      {editHistory.length > 1 && (
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
          <div className="flex-1 overflow-hidden">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2 tracking-wide">Timeline</p>
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {editHistory.map((entry, index) => (
                <div key={index} className="relative group shrink-0">
                  <button
                    onClick={() => onJumpToHistory(index)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-2 border ${
                      index === currentEditIndex 
                        ? 'bg-slate-800 text-white border-indigo-500/50 ring-1 ring-indigo-500/50' 
                        : 'bg-slate-800/50 text-slate-400 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    {index === 0 ? (
                        <>📷 Original</>
                    ) : (
                        <>
                        <span className="w-4 h-4 rounded-full bg-white/10 flex items-center justify-center text-[9px]">{index}</span>
                        {entry.operation}
                        </>
                    )}
                  </button>
                  
                  {/* Hover Preview */}
                  {index > 0 && (
                    <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-200 bg-slate-900 p-2 rounded-xl border border-slate-700 shadow-2xl z-50">
                      <img 
                        src={`data:image/jpeg;base64,${entry.base64}`} 
                        alt={entry.description}
                        className="w-32 h-32 object-cover rounded-lg"
                      />
                      <p className="text-xs text-slate-400 mt-2 text-center max-w-[128px]">{entry.description}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          
          {onExportHistory && (
             <button onClick={onExportHistory} className="ml-4 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-700" title="Download All Versions">
                <Download className="w-4 h-4" />
             </button>
          )}
        </div>
      )}

      {/* Logs Feed */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-slate-900 min-h-0"
      >
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-12">
            <Target className="w-12 h-12 mb-4 text-slate-600" />
            <p className="text-sm font-medium text-slate-400">Ready for spatial input.<br/>Upload a photo to initialize.</p>
          </div>
        ) : (
          logs.map((log) => (
            <LogEntry 
              key={log.id} 
              log={log} 
              onForceExecute={onForceExecute}
              onAlternativeClick={onAlternativeClick}
            />
          ))
        )}
      </div>
    </div>
  );
};
