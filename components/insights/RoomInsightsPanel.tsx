
import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Home, Palette, TrendingUp, ShoppingBag, Lightbulb, X, ChevronRight, ChevronLeft, Search, Copy, Check, Map, Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { DetailedRoomAnalysis, RoomInsight } from '../../types/spatial.types';
import { useClickOutside } from '../../hooks/useClickOutside';

interface RoomInsightsPanelProps {
  roomAnalysis: DetailedRoomAnalysis | null;
  isVisible: boolean;
  onClose: () => void;
  status: string;
  mode: 'waiting' | 'viewing';
}

export const RoomInsightsPanel: React.FC<RoomInsightsPanelProps> = ({ 
  roomAnalysis, 
  isVisible,
  onClose,
  status,
  mode
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedSysIndex, setCopiedSysIndex] = useState<number | null>(null);
  const [showTechnical, setShowTechnical] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  useClickOutside(panelRef, () => {
    if (isVisible) onClose();
  });

  const insights: RoomInsight[] = roomAnalysis?.insights || [];
  const isPlan = roomAnalysis?.is_2d_plan || false;

  useEffect(() => {
    if (mode === 'waiting' && insights.length > 0 && !isPaused) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % insights.length);
      }, 8000); 
      return () => clearInterval(interval);
    }
  }, [mode, insights.length, isPaused]);

  if (!isVisible || insights.length === 0) return null;

  const safeIndex = currentIndex >= insights.length ? 0 : currentIndex;
  const current = insights[safeIndex];
  
  const getIcon = (category: string = '') => {
    const c = (category || '').toLowerCase();
    if (c.includes('visualization')) return <Map className="w-5 h-5" />;
    if (c.includes('critique')) return <TrendingUp className="w-5 h-5" />;
    if (c.includes('style')) return <Palette className="w-5 h-5" />;
    if (c.includes('layout')) return <Home className="w-5 h-5" />;
    if (c.includes('shop')) return <ShoppingBag className="w-5 h-5" />;
    return <TrendingUp className="w-5 h-5" />;
  };

  const handleNext = () => setCurrentIndex((prev) => (prev + 1) % insights.length);
  const handlePrev = () => setCurrentIndex((prev) => (prev - 1 + insights.length) % insights.length);

  const handleSuggestionClick = async (suggestion: string, index: number) => {
    const isShopping = (current.category || '').toLowerCase().includes('shopping');

    if (isShopping) {
      const query = encodeURIComponent(suggestion);
      window.open(`https://www.google.com/search?q=${query}&tbm=shop`, '_blank');
    } else {
      try {
        await navigator.clipboard.writeText(suggestion);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
      } catch (err) {
        console.error("Failed to copy", err);
      }
    }
  };

  const handleCopySystemPrompt = async (prompt: string, index: number) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedSysIndex(index);
      setTimeout(() => setCopiedSysIndex(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  const getTitle = () => {
    if (mode === 'waiting') return 'Analyzing Space...';
    if (isPlan) return '2D Plan Visualization';
    return 'Room Design Analysis';
  };

  const safeCategory = current.category || 'Insight';
  const safeSuggestions = Array.isArray(current.suggestions) ? current.suggestions : [];

  return (
    <div className="fixed inset-x-0 bottom-0 pointer-events-none z-50 flex flex-col items-center justify-end pb-6">
      <div 
        ref={panelRef}
        className="bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden pointer-events-auto transition-all animate-in slide-in-from-bottom-10"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
             <div className={`p-2 rounded-lg ${mode === 'waiting' ? 'bg-indigo-500/10' : 'bg-slate-800'}`}>
               <Sparkles className={`w-4 h-4 ${mode === 'waiting' ? 'text-indigo-400 animate-pulse' : 'text-slate-400'}`} />
             </div>
             <div>
               <h3 className="text-sm font-bold text-white">
                 {getTitle()}
               </h3>
               {mode === 'waiting' && <p className="text-xs text-slate-400">Generating insights...</p>}
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 relative min-h-[200px]">
          <div className="flex items-start gap-4 animate-in fade-in duration-300" key={safeIndex}>
            <div className={`p-3 bg-slate-800 rounded-xl border border-slate-700 shrink-0 ${isPlan ? 'text-sky-400' : 'text-indigo-400'}`}>
               {getIcon(safeCategory)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${isPlan ? 'bg-sky-500/10 text-sky-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                  {safeCategory}
                </span>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">{current.title || 'Analysis'}</h4>
              <p className="text-sm text-slate-300 leading-relaxed mb-5">
                {current.description || 'No description provided.'}
              </p>

              {/* Suggestions */}
              {safeSuggestions.length > 0 && (
                <div className="space-y-2 mb-4">
                  <div className="flex flex-wrap gap-2">
                    {safeSuggestions.map((s, i) => (
                      <button 
                        key={i}
                        onClick={() => handleSuggestionClick(s, i)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all text-left group ${
                          (safeCategory.toLowerCase().includes('shopping')) 
                            ? 'bg-slate-800 hover:bg-emerald-600/20 hover:text-emerald-300 border-slate-700 hover:border-emerald-500/50 text-emerald-400' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        {s.length > 80 ? s.substring(0, 80) + '...' : s}
                        {copiedIndex === i ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 opacity-0 group-hover:opacity-50" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Technical System Instruction (Collapsible) */}
              {current.system_instruction && (
                <div className="mt-4 border-t border-slate-800 pt-2">
                   <button 
                     onClick={() => setShowTechnical(!showTechnical)}
                     className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-300 transition-colors py-2"
                   >
                      <Terminal className="w-3.5 h-3.5" />
                      {showTechnical ? 'Hide Technical Details' : 'Show Technical Details'}
                      {showTechnical ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                   </button>
                   
                   {showTechnical && (
                       <div className="mt-2 animate-in slide-in-from-top-2 fade-in">
                           <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] font-bold text-indigo-400 uppercase">System Prompt</span>
                              <button 
                                onClick={() => handleCopySystemPrompt(current.system_instruction!, safeIndex)}
                                className="text-[10px] flex items-center gap-1 text-slate-500 hover:text-white transition-colors"
                              >
                                 {copiedSysIndex === safeIndex ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                 {copiedSysIndex === safeIndex ? 'Copied' : 'Copy'}
                              </button>
                           </div>
                           <div className="bg-black/30 rounded-lg p-3 border border-indigo-500/20 font-mono text-[10px] text-indigo-200/80 break-all leading-relaxed">
                              {current.system_instruction}
                           </div>
                       </div>
                   )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800 flex items-center justify-between">
          <div className="flex gap-1.5">
            {insights.map((_, i) => (
              <div 
                key={i} 
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentIndex ? 'bg-indigo-500 w-4' : 'bg-slate-700'}`} 
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrev} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={handleNext} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
