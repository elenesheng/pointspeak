
import React, { useState, useEffect } from 'react';
import { Sparkles, Home, Palette, TrendingUp, ShoppingBag, Lightbulb, X, ChevronRight, ChevronLeft, Search, Copy, Check, Map, Terminal } from 'lucide-react';
import { DetailedRoomAnalysis, RoomInsight } from '../../types/spatial.types';

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

  // Use AI provided insights or fallback
  const insights: RoomInsight[] = roomAnalysis?.insights || [];
  const isPlan = roomAnalysis?.is_2d_plan || false;

  // Auto-advance only in waiting mode, with pause on hover
  useEffect(() => {
    if (mode === 'waiting' && insights.length > 0 && !isPaused) {
      const interval = setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % insights.length);
      }, 8000); 
      return () => clearInterval(interval);
    }
  }, [mode, insights.length, isPaused]);

  if (!isVisible || insights.length === 0) return null;

  // Safety: Ensure index is valid even if array length changes
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
    if (mode === 'waiting') return 'While You Wait...';
    if (isPlan) return '2D Plan Visualization';
    return 'Room Design Critique';
  };

  const getSubtitle = () => {
    if (mode === 'waiting') return 'Analyzing design implications...';
    if (isPlan) return 'AI Styles to Make it Alive';
    return 'Objective Design Analysis (Good vs Bad)';
  };

  const safeCategory = current.category || 'Insight';
  const safeSuggestions = Array.isArray(current.suggestions) ? current.suggestions : [];

  return (
    <div className="fixed inset-x-0 bottom-0 pointer-events-none z-50 flex flex-col items-center justify-end pb-6">
      <div 
        className="bg-slate-900/90 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden pointer-events-auto transition-all animate-in slide-in-from-bottom-10"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
             <div className={`p-2 rounded-lg ${mode === 'waiting' ? 'bg-indigo-500/10' : (isPlan ? 'bg-sky-500/10' : 'bg-rose-500/10')}`}>
               <Sparkles className={`w-4 h-4 ${mode === 'waiting' ? 'text-indigo-400 animate-pulse' : (isPlan ? 'text-sky-400' : 'text-rose-400')}`} />
             </div>
             <div>
               <h3 className="text-sm font-bold text-white">
                 {getTitle()}
               </h3>
               <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                 {getSubtitle()}
               </p>
             </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 relative min-h-[220px]">
          <div className="flex items-start gap-4 animate-in fade-in duration-300" key={safeIndex}>
            <div className={`p-3 bg-slate-800 rounded-xl border border-slate-700 shrink-0 ${isPlan ? 'text-sky-400' : 'text-indigo-400'}`}>
               {getIcon(safeCategory)}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${isPlan ? 'bg-sky-500/10 text-sky-400' : 'bg-indigo-500/10 text-indigo-400'}`}>
                  {safeCategory}
                </span>
              </div>
              <h4 className="text-xl font-bold text-white mb-2">{current.title || 'Analysis'}</h4>
              <p className="text-sm text-slate-300 leading-relaxed mb-4">
                {current.description || 'No description provided.'}
              </p>

              {/* Suggestions */}
              {safeSuggestions.length > 0 && (
                <div className="space-y-2 mb-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
                    <Lightbulb className="w-3 h-3" /> 
                    {(safeCategory.toLowerCase().includes('shopping')) ? 'Recommended Products' : 'Suggestions'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {safeSuggestions.map((s, i) => (
                      <button 
                        key={i}
                        onClick={() => handleSuggestionClick(s, i)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all text-left group ${
                          (safeCategory.toLowerCase().includes('shopping')) 
                            ? 'bg-slate-800 hover:bg-emerald-600/20 hover:text-emerald-300 border-slate-700 hover:border-emerald-500/50 text-emerald-400' 
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        {s.length > 80 ? s.substring(0, 80) + '...' : s}
                        {copiedIndex === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 opacity-0 group-hover:opacity-50" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Technical System Instruction Display */}
              {current.system_instruction && (
                <div className="mt-4 pt-3 border-t border-slate-800/50">
                   <div className="flex justify-between items-center mb-2">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase flex items-center gap-1">
                        <Terminal className="w-3 h-3" />
                        System Fix / Debug Command
                      </p>
                      <button 
                        onClick={() => handleCopySystemPrompt(current.system_instruction!, safeIndex)}
                        className="text-[10px] flex items-center gap-1 text-slate-500 hover:text-white transition-colors"
                      >
                         {copiedSysIndex === safeIndex ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                         {copiedSysIndex === safeIndex ? 'Copied' : 'Copy Code'}
                      </button>
                   </div>
                   <div className="bg-black/40 rounded-lg p-3 border border-indigo-500/20 font-mono text-[10px] text-indigo-200/80 break-all leading-relaxed relative group/code">
                      {current.system_instruction}
                   </div>
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
