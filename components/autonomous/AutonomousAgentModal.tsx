
import React, { useState } from 'react';
import { X, Zap, Settings, Play, Pause, Square, ChevronDown, ChevronUp, FileText, Image, Brain, TrendingUp, Star, HelpCircle, Eye, Code, Lightbulb } from 'lucide-react';
import { AutonomousConfig, IterationAnalysis } from '../../services/gemini/autonomousAgentService';
import { useAutonomousContext } from '../../contexts/AutonomousContext';

// Helper for Star Rating
const StarRating: React.FC<{ score: number; label: string }> = ({ score, label }) => {
  const stars = Math.round(score * 5);
  const textLabel = score > 0.8 ? 'Excellent' : score > 0.6 ? 'Good' : score > 0.4 ? 'Average' : 'Needs Work';
  
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">{label}</div>
      <div className="flex items-center gap-1">
        <div className="flex">
          {[...Array(5)].map((_, i) => (
            <Star 
              key={i} 
              className={`w-3.5 h-3.5 ${i < stars ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}`} 
            />
          ))}
        </div>
        <span className="text-xs font-medium text-slate-300 ml-1">{textLabel}</span>
      </div>
    </div>
  );
};

// Narrative Generator
const generateSummary = (analysis: IterationAnalysis) => {
  if (analysis.success) {
    const strength = analysis.strengths[0] ? analysis.strengths[0].toLowerCase() : "looks consistent";
    return `The room is improving. The new ${analysis.decision.target.toLowerCase()} ${strength}.`;
  } else {
    const weakness = analysis.weaknesses[0] ? analysis.weaknesses[0].toLowerCase() : "didn't fit the style";
    return `This attempt missed the mark. The ${analysis.decision.target.toLowerCase()} ${weakness}.`;
  }
};

export const AutonomousAgentModal: React.FC = () => {
  const {
    isModalOpen,
    closeModal,
    agentState,
    startMarathon,
    pauseAgent,
    resumeAgent,
    stopAgent,
    disabled,
    analyses,
    exportAnalysisReport,
    exportImages
  } = useAutonomousContext();

  const [config, setConfig] = useState<AutonomousConfig>({
    testMode: true,
    maxIterations: 20,
    iterationDelay: 5000,
    maxCost: 1.0,
    designGoal: 'modern minimalist',
    styleKeywords: ['modern', 'minimalist', 'neutral tones']
  });
  
  const [viewMode, setViewMode] = useState<'simple' | 'expert'>('simple');
  const [showConfig, setShowConfig] = useState(true);
  const [showBrain, setShowBrain] = useState(true);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);
  const [styleInput, setStyleInput] = useState('modern, minimalist, neutral tones');
  const [isInitializing, setIsInitializing] = useState(false);
  
  const isRunning = agentState?.isRunning || false;
  
  if (!isModalOpen) return null;
  
  const handleStart = () => {
    const keywords = styleInput.split(',').map(s => s.trim()).filter(Boolean);
    setIsInitializing(true);
    startMarathon({ ...config, styleKeywords: keywords });
    setTimeout(() => setIsInitializing(false), 1000);
  };
  
  const handleClose = () => {
    if (isRunning) {
      if (window.confirm('Agent is running. Stop immediately and close?')) {
        stopAgent();
        closeModal();
      }
    } else {
      closeModal();
    }
  };

  const SimpleFeedItem: React.FC<{ analysis: IterationAnalysis }> = ({ analysis }) => (
    <div className={`border rounded-xl p-6 mb-4 transition-all ${analysis.success ? 'bg-slate-900/80 border-emerald-900/30 shadow-[0_4px_20px_-5px_rgba(16,185,129,0.1)]' : 'bg-slate-900/80 border-rose-900/30'}`}>
       <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
             <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-lg ${analysis.success ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}>
                {analysis.iteration}
             </div>
             <div>
                <h4 className="font-bold text-white text-lg leading-tight">
                  {analysis.decision.action === 'WAIT' ? 'Thinking...' : `${analysis.decision.action} ${analysis.decision.target}`}
                </h4>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
                  {analysis.success ? 'Successful Change' : 'Correction Needed'}
                </p>
             </div>
          </div>
       </div>

       {/* Narrative Summary */}
       <div className="text-slate-300 text-sm italic border-l-2 border-slate-700 pl-4 mb-5 leading-relaxed">
         "{generateSummary(analysis)}"
       </div>
       
       {/* Why This? */}
       <div className="bg-slate-950/50 rounded-lg p-4 mb-5 border border-slate-800/50">
          <div className="flex items-center gap-2 mb-2 text-indigo-400">
            <HelpCircle className="w-4 h-4" />
            <span className="text-xs font-bold uppercase tracking-wider">Why did the AI do this?</span>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {analysis.decision.reason}
          </p>
          {analysis.decision.styleAlignment && (
            <p className="text-xs text-slate-500 mt-2">
              <span className="font-semibold">Style Goal:</span> {analysis.decision.styleAlignment}
            </p>
          )}
       </div>

       {/* Ratings */}
       <div className="grid grid-cols-2 gap-4 mb-4 bg-slate-950/30 p-3 rounded-lg">
          <StarRating score={analysis.qualityScore} label="Visual Realism" />
          <StarRating score={analysis.styleScore} label="Style Match" />
       </div>

       {/* Learning */}
       <div className="flex items-start gap-2 text-xs bg-indigo-900/10 p-3 rounded-lg border border-indigo-500/10">
          <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-indigo-300 block mb-0.5">What I learned:</span>
            <span className="text-slate-400">{analysis.lessonLearned}</span>
          </div>
       </div>
    </div>
  );

  const ExpertFeedItem: React.FC<{ analysis: IterationAnalysis }> = ({ analysis }) => (
    <div className={`border rounded-xl p-5 mb-3 text-sm font-mono ${analysis.success ? 'bg-slate-900/50 border-emerald-900/30' : 'bg-slate-900/50 border-rose-900/30'}`}>
        <div className="flex justify-between mb-2">
           <span className="font-bold text-white">#{analysis.iteration} {analysis.decision.action} {analysis.decision.target}</span>
           <span className={analysis.success ? 'text-emerald-400' : 'text-rose-400'}>{analysis.success ? 'SUCCESS' : 'FAIL'}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2 text-xs">
           <div>Q: {(analysis.qualityScore*100).toFixed(1)}%</div>
           <div>S: {(analysis.styleScore*100).toFixed(1)}%</div>
        </div>
        <div className="text-xs text-slate-500 mb-1">Reason: {analysis.decision.reason}</div>
        <div className="text-xs text-amber-500/80">Mem: {analysis.lessonLearned}</div>
    </div>
  );
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-[90vw] max-w-7xl h-[85vh] bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Autonomous Designer</h2>
              <p className="text-xs text-slate-400">Self-Correcting Spatial Intelligence</p>
            </div>
            
            {/* View Mode Toggle */}
            <div className="ml-6 bg-slate-800 p-1 rounded-lg flex border border-slate-700">
               <button 
                 onClick={() => setViewMode('simple')}
                 className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'simple' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
               >
                 <Eye className="w-3.5 h-3.5" /> Simple
               </button>
               <button 
                 onClick={() => setViewMode('expert')}
                 className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${viewMode === 'expert' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
               >
                 <Code className="w-3.5 h-3.5" /> Expert
               </button>
            </div>
          </div>
          
          <button onClick={handleClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* COL 1: Config & Status */}
          <div className="w-80 border-r border-slate-800 flex flex-col overflow-y-auto bg-slate-950/30">
            {/* Status Display */}
            {agentState && (
              <div className="p-4 border-b border-slate-800 space-y-3 bg-slate-900/50">
                <div className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                   <TrendingUp className="w-3 h-3" /> Live Metrics
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800 rounded-lg p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400">Iteration</div>
                    <div className="text-2xl font-bold text-white mt-1">{agentState.currentIteration}</div>
                  </div>
                  <div className="bg-slate-800 rounded-lg p-3 border border-slate-700/50">
                    <div className="text-xs text-slate-400">Cost</div>
                    <div className="text-2xl font-bold text-green-400 mt-1">${agentState.totalCost.toFixed(2)}</div>
                  </div>
                </div>
                
                {agentState.overallProgress && (
                  <div className="bg-slate-800 rounded-lg p-3 space-y-2 border border-slate-700/50">
                    {viewMode === 'simple' ? (
                        <>
                        <div className="flex justify-between items-center text-xs mb-1">
                           <span className="text-slate-400">Overall Progress</span>
                           <span className="text-purple-400 font-bold">{(agentState.overallProgress.avgStyleScore * 100).toFixed(0)}% Match</span>
                        </div>
                        <div className="w-full bg-slate-700 h-2 rounded-full overflow-hidden">
                           <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${agentState.overallProgress.avgStyleScore * 100}%` }} />
                        </div>
                        </>
                    ) : (
                        <>
                        <div className="flex justify-between text-xs">
                           <span className="text-slate-400">Quality Score</span>
                           <span className="text-white font-bold">{(agentState.overallProgress.avgQuality * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                           <span className="text-slate-400">Style Match</span>
                           <span className="text-purple-400 font-bold">{(agentState.overallProgress.avgStyleScore * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                           <span className="text-slate-400">Success Rate</span>
                           <span className="text-emerald-400 font-bold">{(agentState.overallProgress.successRate * 100).toFixed(0)}%</span>
                        </div>
                        </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Config Toggle */}
            <div className="p-4 border-b border-slate-800">
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="w-full flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-750 rounded-lg transition-colors border border-slate-700"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span className="font-medium text-white">Configuration</span>
                </div>
                {showConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              {showConfig && (
                <div className="mt-3 space-y-4 animate-in slide-in-from-top-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Design Goal</label>
                    <input
                      type="text"
                      value={config.designGoal}
                      onChange={(e) => setConfig({ ...config, designGoal: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none"
                      disabled={isRunning}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase tracking-wide">Style Keywords</label>
                    <textarea
                      value={styleInput}
                      onChange={(e) => setStyleInput(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                      rows={2}
                      disabled={isRunning}
                    />
                  </div>

                  {/* Advanced Config Toggle */}
                  <div>
                     <button 
                        onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                        className="text-xs text-indigo-400 font-medium hover:text-indigo-300 flex items-center gap-1"
                     >
                        {showAdvancedConfig ? 'Hide' : 'Show'} Advanced Settings
                     </button>
                     
                     {showAdvancedConfig && (
                         <div className="grid grid-cols-2 gap-3 mt-3 animate-in fade-in">
                            <div>
                              <label className="block text-[10px] font-medium text-slate-500 mb-1">Max Steps</label>
                              <input type="number" value={config.maxIterations} onChange={(e) => setConfig({...config, maxIterations: parseInt(e.target.value)})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white" disabled={isRunning} />
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-slate-500 mb-1">Budget ($)</label>
                              <input type="number" step="0.1" value={config.maxCost} onChange={(e) => setConfig({...config, maxCost: parseFloat(e.target.value)})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white" disabled={isRunning} />
                            </div>
                            <div className="col-span-2">
                               <label className="block text-[10px] font-medium text-slate-500 mb-1">Delay (ms)</label>
                               <input type="number" step="1000" value={config.iterationDelay} onChange={(e) => setConfig({...config, iterationDelay: parseInt(e.target.value)})} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-2 text-xs text-white" disabled={isRunning} />
                            </div>
                         </div>
                     )}
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <input
                      type="checkbox"
                      id="testModeCheck"
                      checked={config.testMode}
                      onChange={(e) => setConfig({ ...config, testMode: e.target.checked })}
                      className="mt-0.5 rounded"
                      disabled={isRunning}
                    />
                    <label htmlFor="testModeCheck" className="text-xs text-slate-300 cursor-pointer">
                      <span className="font-medium">Test Mode (Free)</span>
                      <span className="block text-slate-500">Simulate decisions only.</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="p-4 space-y-3 mt-auto">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={disabled || isInitializing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-bold transition-all shadow-lg shadow-purple-900/20"
                >
                  {isInitializing ? 'Starting...' : <><Play className="w-4 h-4" /> Start Marathon</>}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={agentState?.isPaused ? resumeAgent : pauseAgent} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold shadow-lg shadow-amber-900/20">
                    {agentState?.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                    {agentState?.isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button onClick={stopAgent} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold shadow-lg shadow-rose-900/20">
                    <Square className="w-4 h-4" /> Stop
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* COL 2: Brain/Memory (Hidden in Simple Mode unless explicit or wide screen) */}
          {(viewMode === 'expert') && (
            <div className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/30">
              <div className="p-4 border-b border-slate-800">
                 <button onClick={() => setShowBrain(!showBrain)} className="w-full flex items-center justify-between text-white font-medium">
                    <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-pink-400" /> Agent Memory</div>
                    {showBrain ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                 </button>
              </div>
              
              {showBrain && agentState?.learnedPatterns && (
                 <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Style Rules */}
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">Learned Style Rules</h4>
                      {agentState.learnedPatterns.style.length === 0 ? (
                          <p className="text-xs text-slate-600 italic">No patterns learned yet...</p>
                      ) : (
                          <div className="space-y-2">
                             {agentState.learnedPatterns.style.map((p, i) => (
                                <div key={i} className="bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-xs text-slate-300 relative overflow-hidden">
                                   <div className="absolute top-0 left-0 bottom-0 bg-pink-500/10" style={{ width: `${p.score * 100}%` }} />
                                   <div className="relative z-10">
                                      {p.content}
                                      <div className="mt-1 flex justify-between text-[9px] text-slate-500 font-mono">
                                         <span>Conf: {(p.score * 100).toFixed(0)}%</span>
                                         <span>Freq: {p.frequency}</span>
                                      </div>
                                   </div>
                                </div>
                             ))}
                          </div>
                      )}
                    </div>

                    {/* Execution Rules */}
                    <div>
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-wider">Execution Strategy</h4>
                      <div className="space-y-2">
                         {agentState.learnedPatterns.execution.map((p, i) => (
                            <div key={i} className="bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-xs text-slate-300 relative overflow-hidden">
                               <div className="absolute top-0 left-0 bottom-0 bg-blue-500/10" style={{ width: `${p.score * 100}%` }} />
                               <div className="relative z-10">
                                  {p.content}
                               </div>
                            </div>
                         ))}
                      </div>
                    </div>
                 </div>
              )}
            </div>
          )}

          {/* COL 3: Feed */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
             <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/80 backdrop-blur-md">
                 <div className="flex items-center gap-2 text-white font-medium">
                    <FileText className="w-4 h-4 text-indigo-400" /> 
                    {viewMode === 'simple' ? 'Activity Feed' : 'Decision Stream'}
                 </div>
                 <div className="flex gap-2">
                    {analyses.length > 0 && (
                        <>
                        <button onClick={exportAnalysisReport} className="p-1.5 hover:bg-slate-800 rounded text-slate-400" title="Export Report"><FileText className="w-4 h-4" /></button>
                        {!config.testMode && <button onClick={exportImages} className="p-1.5 hover:bg-slate-800 rounded text-slate-400" title="Export Images"><Image className="w-4 h-4" /></button>}
                        </>
                    )}
                 </div>
             </div>
             
             <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
               {analyses.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-30 text-center">
                     <Brain className="w-16 h-16 mb-4 text-slate-500" />
                     <p className="text-lg font-medium text-slate-300">Agent is ready.</p>
                     <p className="text-sm">Click "Start Marathon" to begin the autonomous loop.</p>
                  </div>
               ) : (
                  <div className="space-y-4 max-w-3xl mx-auto w-full">
                    {analyses.slice().reverse().map((analysis) => (
                      <React.Fragment key={analysis.iteration}>
                         {viewMode === 'simple' ? (
                            <SimpleFeedItem analysis={analysis} />
                         ) : (
                            <ExpertFeedItem analysis={analysis} />
                         )}
                      </React.Fragment>
                    ))}
                  </div>
               )}
             </div>
          </div>
          
        </div>
      </div>
    </div>
  );
};
