
import React, { useState } from 'react';
import { X, Zap, Settings, Play, Pause, Square, ChevronDown, ChevronUp, Download, FileText, Image } from 'lucide-react';
import { AutonomousConfig, AgentState, IterationAnalysis } from '../../services/gemini/autonomousAgentService';

interface AutonomousAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  agentState: AgentState | null;
  onStart: (config: AutonomousConfig) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  disabled: boolean;
  analyses: IterationAnalysis[];
  onExportReport: () => void;
  onExportImages: () => void;
}

export const AutonomousAgentModal: React.FC<AutonomousAgentModalProps> = ({
  isOpen,
  onClose,
  agentState,
  onStart,
  onPause,
  onResume,
  onStop,
  disabled,
  analyses,
  onExportReport,
  onExportImages
}) => {
  const [config, setConfig] = useState<AutonomousConfig>({
    testMode: true,
    maxIterations: 20,
    iterationDelay: 5000,
    maxCost: 1.0,
    designGoal: 'modern minimalist',
    styleKeywords: ['modern', 'minimalist', 'neutral tones']
  });
  
  const [showConfig, setShowConfig] = useState(true);
  const [showAnalysis, setShowAnalysis] = useState(true);
  const [styleInput, setStyleInput] = useState('modern, minimalist, neutral tones');
  const [isInitializing, setIsInitializing] = useState(false);
  
  const isRunning = agentState?.isRunning || false;
  
  if (!isOpen) return null;
  
  const handleStart = () => {
    // Parse style keywords from comma-separated input
    const keywords = styleInput.split(',').map(s => s.trim()).filter(Boolean);
    
    // Show loading immediately
    setIsInitializing(true);
    
    onStart({ ...config, styleKeywords: keywords });
    
    // Clear loading after a short delay (UI will show controls by then)
    setTimeout(() => setIsInitializing(false), 1000);
  };
  
  const handleClose = () => {
    if (isRunning) {
      if (window.confirm('Agent is running. Stop immediately and close?')) {
        onStop();
        onClose();
      }
    } else {
      onClose();
    }
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      {/* Modal Container */}
      <div className="w-[90vw] max-w-6xl h-[85vh] bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-600/20 rounded-lg">
              <Zap className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Autonomous Marathon Agent</h2>
              <p className="text-xs text-slate-400">AI-powered iterative design with learning</p>
            </div>
          </div>
          
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Content Area - Split Layout */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left: Configuration & Controls */}
          <div className="w-96 border-r border-slate-800 flex flex-col overflow-y-auto">
            
            {/* Configuration Section */}
            <div className="p-4 border-b border-slate-800">
              <button
                onClick={() => setShowConfig(!showConfig)}
                className="w-full flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-750 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-slate-400" />
                  <span className="font-medium text-white">Configuration</span>
                </div>
                {showConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              
              {showConfig && (
                <div className="mt-3 space-y-3 animate-in slide-in-from-top-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Design Goal
                    </label>
                    <input
                      type="text"
                      value={config.designGoal}
                      onChange={(e) => setConfig({ ...config, designGoal: e.target.value })}
                      placeholder="e.g., modern minimalist"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none"
                      disabled={isRunning}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Style Keywords (comma-separated)
                      <span className="block text-[10px] text-slate-500 mt-0.5">
                        Examples: mid-century modern, warm tones, organic shapes
                      </span>
                    </label>
                    <textarea
                      value={styleInput}
                      onChange={(e) => setStyleInput(e.target.value)}
                      placeholder="modern, minimalist, neutral tones"
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none resize-none"
                      rows={3}
                      disabled={isRunning}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Max Iterations</label>
                      <input
                        type="number"
                        value={config.maxIterations}
                        onChange={(e) => setConfig({ ...config, maxIterations: parseInt(e.target.value) })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none"
                        disabled={isRunning}
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Budget ($)</label>
                      <input
                        type="number"
                        step="0.10"
                        value={config.maxCost}
                        onChange={(e) => setConfig({ ...config, maxCost: parseFloat(e.target.value) })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none"
                        disabled={isRunning}
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">Delay (ms)</label>
                    <input
                      type="number"
                      step="1000"
                      value={config.iterationDelay}
                      onChange={(e) => setConfig({ ...config, iterationDelay: parseInt(e.target.value) })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-purple-500 outline-none"
                      disabled={isRunning}
                    />
                  </div>
                  
                  <div className="flex items-start gap-2 p-3 bg-slate-800/50 rounded-lg">
                    <input
                      type="checkbox"
                      id="testModeCheck"
                      checked={config.testMode}
                      onChange={(e) => setConfig({ ...config, testMode: e.target.checked })}
                      className="mt-0.5 rounded"
                      disabled={isRunning}
                    />
                    <label htmlFor="testModeCheck" className="text-xs text-slate-300 cursor-pointer">
                      <span className="font-medium">Test Mode (FREE)</span>
                      <span className="block text-slate-500 mt-0.5">
                        Analyzes decisions without generating images. Perfect for testing logic.
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
            
            {/* Status Display */}
            {agentState && (
              <div className="p-4 border-b border-slate-800 space-y-3">
                <div className="text-xs font-bold text-slate-400 uppercase">Current Status</div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-800 rounded-lg p-3">
                    <div className="text-xs text-slate-400">Iteration</div>
                    <div className="text-2xl font-bold text-white mt-1">
                      {agentState.currentIteration}
                    </div>
                  </div>
                  
                  <div className="bg-slate-800 rounded-lg p-3">
                    <div className="text-xs text-slate-400">Cost</div>
                    <div className="text-2xl font-bold text-green-400 mt-1">
                      ${agentState.totalCost.toFixed(2)}
                    </div>
                  </div>
                </div>
                
                {agentState.overallProgress && (
                  <div className="bg-slate-800 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Quality</span>
                      <span className="text-white font-bold">
                        {(agentState.overallProgress.avgQuality * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Style Match</span>
                      <span className="text-purple-400 font-bold">
                        {(agentState.overallProgress.avgStyleScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400">Success Rate</span>
                      <span className="text-emerald-400 font-bold">
                        {(agentState.overallProgress.successRate * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Controls */}
            <div className="p-4 space-y-3">
              {!isRunning ? (
                <button
                  onClick={handleStart}
                  disabled={disabled || isInitializing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-bold transition-all shadow-lg"
                >
                  {isInitializing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      STARTING...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      START MARATHON
                    </>
                  )}
                </button>
              ) : (
                <div className="flex gap-2">
                  {agentState?.isPaused ? (
                    <button
                      onClick={onResume}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold"
                    >
                      <Play className="w-4 h-4" />
                      RESUME
                    </button>
                  ) : (
                    <button
                      onClick={onPause}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold"
                    >
                      <Pause className="w-4 h-4" />
                      PAUSE
                    </button>
                  )}
                  
                  <button
                    onClick={onStop}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold"
                  >
                    <Square className="w-4 h-4" />
                    STOP
                  </button>
                </div>
              )}
              
              {/* Export Buttons */}
              {analyses.length > 0 && (
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <button
                    onClick={onExportReport}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    Export Analysis Report
                  </button>
                  
                  {!config.testMode && (
                    <button
                      onClick={onExportImages}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      <Image className="w-4 h-4" />
                      Export All Images
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {/* Right: Analysis Panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-800">
              <button
                onClick={() => setShowAnalysis(!showAnalysis)}
                className="w-full flex items-center justify-between p-3 bg-slate-800 hover:bg-slate-750 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="font-medium text-white">
                    Iteration Analysis ({analyses.length})
                  </span>
                </div>
                {showAnalysis ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            </div>
            
            {showAnalysis && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {analyses.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-slate-500 text-sm">
                    No iterations yet. Start the agent to see analysis.
                  </div>
                ) : (
                  analyses.slice().reverse().map((analysis) => (
                    <div
                      key={analysis.iteration}
                      className={`border rounded-xl p-4 ${
                        analysis.success
                          ? 'bg-emerald-900/10 border-emerald-700/30'
                          : 'bg-rose-900/10 border-rose-700/30'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-bold text-white mb-1">
                            Iteration {analysis.iteration}: {analysis.decision.action} {analysis.decision.target}
                          </div>
                          <div className="text-xs text-slate-400">
                            {new Date(analysis.timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        
                        <div className={`px-2 py-1 rounded text-xs font-bold ${
                          analysis.success ? 'bg-emerald-600/20 text-emerald-300' : 'bg-rose-600/20 text-rose-300'
                        }`}>
                          {analysis.success ? '✓ SUCCESS' : '✗ FAILED'}
                        </div>
                      </div>
                      
                      {/* Scores */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-slate-800/50 rounded p-2">
                          <div className="text-xs text-slate-400">Quality</div>
                          <div className="text-lg font-bold text-blue-400">
                            {(analysis.qualityScore * 100).toFixed(0)}%
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded p-2">
                          <div className="text-xs text-slate-400">Style Match</div>
                          <div className="text-lg font-bold text-purple-400">
                            {(analysis.styleScore * 100).toFixed(0)}%
                          </div>
                        </div>
                      </div>
                      
                      {/* Decision Details */}
                      <div className="space-y-2 text-sm">
                        <div>
                          <div className="text-xs font-medium text-slate-400 mb-1">Reasoning:</div>
                          <div className="text-slate-300">{analysis.decision.reason}</div>
                        </div>
                        
                        {analysis.decision.styleAlignment && (
                          <div>
                            <div className="text-xs font-medium text-purple-400 mb-1">Style Alignment:</div>
                            <div className="text-slate-300">{analysis.decision.styleAlignment}</div>
                          </div>
                        )}
                        
                        {analysis.strengths.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-emerald-400 mb-1">✓ Strengths:</div>
                            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                              {analysis.strengths.map((s, i) => (
                                <li key={i} className="text-xs">{s}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {analysis.weaknesses.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-rose-400 mb-1">✗ Weaknesses:</div>
                            <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                              {analysis.weaknesses.map((w, i) => (
                                <li key={i} className="text-xs">{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {analysis.styleNotes && (
                          <div>
                            <div className="text-xs font-medium text-purple-400 mb-1">Style Notes:</div>
                            <div className="text-slate-300 text-xs">{analysis.styleNotes}</div>
                          </div>
                        )}
                        
                        <div className="pt-2 border-t border-slate-700/50">
                          <div className="text-xs font-medium text-amber-400 mb-1">💡 Lesson Learned:</div>
                          <div className="text-slate-300 text-xs italic">{analysis.lessonLearned}</div>
                        </div>
                        
                        {analysis.betterApproach && (
                          <div className="bg-slate-800/50 rounded p-2">
                            <div className="text-xs font-medium text-amber-400 mb-1">⚠️ Better Approach:</div>
                            <div className="text-slate-300 text-xs">{analysis.betterApproach}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
