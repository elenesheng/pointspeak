
import React from 'react';
import { ReasoningLog } from '../../types/ui.types';
import { 
  CheckCircle2, AlertCircle, Map, Target, Cpu, ShieldCheck, ShieldAlert,
  Eraser, Move, Palette, Sparkles, Activity, CornerDownRight, Zap, Lightbulb
} from 'lucide-react';

interface LogEntryProps {
  log: ReasoningLog;
  onForceExecute?: (action: any, object: any) => void;
  onAlternativeClick?: (suggestion: string) => void;
}

export const LogEntry: React.FC<LogEntryProps> = ({ log, onForceExecute, onAlternativeClick }) => {
  const getIcon = () => {
    switch(log.type) {
      case 'thought': return <Cpu className="w-4 h-4 text-slate-500" />;
      case 'action': return <Target className="w-4 h-4 text-indigo-500" />;
      case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-rose-500" />;
      case 'analysis': return <Map className="w-4 h-4 text-indigo-400" />;
      case 'validation': return log.metadata?.valid ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> : <Lightbulb className="w-4 h-4 text-amber-400" />;
      case 'intent':
        const op = log.metadata?.operation_type;
        if (op === 'REMOVE') return <Eraser className="w-4 h-4 text-rose-400" />;
        if (op === 'MOVE') return <Move className="w-4 h-4 text-sky-400" />;
        if (op === 'EDIT') return <Palette className="w-4 h-4 text-purple-400" />;
        return <Sparkles className="w-4 h-4 text-amber-400" />;
      default: return <Sparkles className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 group">
      <div className="mt-1">{getIcon()}</div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {log.type === 'validation' && !log.metadata?.valid ? 'Suggestion' : log.type}
          </span>
          <span className="text-[10px] font-mono text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
            {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
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
            <div className={`rounded-xl p-4 shadow-xl border bg-slate-500/10 border-slate-500/20`}>
              <h4 className="text-sm font-bold mb-2 flex items-center gap-2 text-slate-200">
                {log.metadata.operation_type} OPERATION
              </h4>
              <p className="text-sm text-slate-200 mb-4">{log.content}</p>
              <div className="bg-black/20 p-3 rounded-lg border border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Execution Plan</p>
                <p className="text-xs text-slate-300 leading-relaxed">{log.metadata.proposed_action}</p>
              </div>
            </div>
        ) : log.type === 'validation' && log.metadata && !log.metadata.valid ? (
            <div className="rounded-xl p-4 border shadow-xl bg-amber-500/10 border-amber-500/20">
               <h4 className="text-sm font-bold mb-3 flex items-center gap-2 text-amber-300">
                  🚫 Can't do that yet
               </h4>
               <p className="text-xs text-amber-200/90 mb-3 leading-relaxed">
                  The requested change might conflict with room constraints (e.g., blocking a doorway or overlapping solid objects).
               </p>
               <div className="space-y-3">
                 <div className="space-y-1.5 bg-black/20 p-3 rounded-lg">
                   {log.metadata.warnings.map((w: string, i: number) => (
                     <p key={i} className="text-xs text-amber-200/80 flex items-start gap-2">
                       <span className="mt-1 w-1 h-1 rounded-full bg-amber-500 shrink-0" />
                       {w}
                     </p>
                   ))}
                 </div>
                 
                 {log.metadata.alternative_suggestion && onAlternativeClick && (
                    <div className="pt-2">
                      <p className="text-[10px] font-bold text-amber-400/80 uppercase mb-2 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3" /> Try instead:
                      </p>
                      <button 
                        onClick={() => onAlternativeClick(log.metadata.alternative_suggestion!)}
                        className="w-full flex items-center gap-3 p-3 bg-amber-900/20 rounded-lg border border-amber-500/30 text-left hover:bg-amber-900/30 hover:border-amber-400/50 transition-all group"
                      >
                        <CornerDownRight className="w-3.5 h-3.5 text-amber-400 group-hover:translate-x-1 transition-transform" />
                        <span className="text-xs text-amber-100 group-hover:text-white transition-colors font-medium">
                          {log.metadata.alternative_suggestion}
                        </span>
                      </button>
                    </div>
                  )}

                 {log.metadata.canForce && onForceExecute && (
                   <div className="pt-2 border-t border-amber-500/20 mt-2">
                     <button 
                       onClick={() => onForceExecute(log.metadata.forceAction, log.metadata.forceObject)}
                       className="flex items-center gap-2 text-amber-500/70 hover:text-amber-400 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all w-full justify-center group"
                     >
                       <Zap className="w-3 h-3" />
                       Ignore warnings & try anyway
                     </button>
                   </div>
                 )}
               </div>
            </div>
        ) : (
          <div className={`text-sm leading-relaxed whitespace-pre-wrap ${log.type === 'success' ? 'text-slate-200 bg-slate-800/30 p-3 rounded-lg border border-slate-700/50' : 'text-slate-400 italic'}`}>
            {log.content}
          </div>
        )}
      </div>
    </div>
  );
};
