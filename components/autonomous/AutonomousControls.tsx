
import React, { useState } from 'react';
import { Play, Pause, Square, Settings, Zap, DollarSign } from 'lucide-react';
import { AutonomousConfig, AgentState } from '../../services/gemini/autonomousAgentService';

interface AutonomousControlsProps {
  isAutonomousMode: boolean;
  agentState: AgentState | null;
  onStart: (config: AutonomousConfig) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  disabled: boolean;
}

export const AutonomousControls: React.FC<AutonomousControlsProps> = ({
  isAutonomousMode,
  agentState,
  onStart,
  onPause,
  onResume,
  onStop,
  disabled
}) => {
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<AutonomousConfig>({
    testMode: true,
    maxIterations: 20,
    iterationDelay: 5000,
    maxCost: 1.0,
    designGoal: 'modern minimalist'
  });
  
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-purple-400" />
          <h3 className="font-bold text-white">Autonomous Marathon Agent</h3>
        </div>
        
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
        >
          <Settings className="w-4 h-4 text-slate-400" />
        </button>
      </div>
      
      {/* Configuration Panel */}
      {showConfig && (
        <div className="bg-slate-900 rounded-lg p-3 mb-3 space-y-3 text-sm animate-in fade-in slide-in-from-top-2">
          <div>
            <label className="block text-slate-400 mb-1 text-xs">Design Goal</label>
            <input
              type="text"
              value={config.designGoal}
              onChange={(e) => setConfig({ ...config, designGoal: e.target.value })}
              placeholder="e.g., modern minimalist, cozy rustic"
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-xs focus:ring-1 focus:ring-purple-500 outline-none"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 mb-1 text-xs">Max Iterations</label>
              <input
                type="number"
                value={config.maxIterations}
                onChange={(e) => setConfig({ ...config, maxIterations: parseInt(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-xs focus:ring-1 focus:ring-purple-500 outline-none"
              />
            </div>
            
            <div>
              <label className="block text-slate-400 mb-1 text-xs">Max Budget ($)</label>
              <input
                type="number"
                step="0.10"
                value={config.maxCost}
                onChange={(e) => setConfig({ ...config, maxCost: parseFloat(e.target.value) })}
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-xs focus:ring-1 focus:ring-purple-500 outline-none"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-slate-400 mb-1 text-xs">Delay Between Iterations (ms)</label>
            <input
              type="number"
              step="1000"
              value={config.iterationDelay}
              onChange={(e) => setConfig({ ...config, iterationDelay: parseInt(e.target.value) })}
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-xs focus:ring-1 focus:ring-purple-500 outline-none"
            />
          </div>
          
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="testMode"
              checked={config.testMode}
              onChange={(e) => setConfig({ ...config, testMode: e.target.checked })}
              className="rounded bg-slate-800 border-slate-600 text-purple-500 focus:ring-purple-500"
            />
            <label htmlFor="testMode" className="text-slate-300 text-xs cursor-pointer">
              Test Mode (FREE - No image generation)
            </label>
          </div>
        </div>
      )}
      
      {/* Status Display */}
      {agentState && (
        <div className="bg-slate-900 rounded-lg p-3 mb-3 space-y-2 text-xs border border-slate-800">
          <div className="flex justify-between">
            <span className="text-slate-400">Iteration:</span>
            <span className="text-white font-bold">{agentState.currentIteration}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Total Cost:</span>
            <span className="text-green-400 font-bold">${agentState.totalCost.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Improvements:</span>
            <span className="text-purple-400 font-bold">{agentState.improvements.length}</span>
          </div>
        </div>
      )}
      
      {/* Control Buttons */}
      <div className="flex gap-2">
        {!isAutonomousMode ? (
          <button
            onClick={() => onStart(config)}
            disabled={disabled}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-bold text-xs transition-all shadow-lg shadow-purple-900/20"
          >
            <Play className="w-3.5 h-3.5" />
            START MARATHON
          </button>
        ) : (
          <>
            {agentState?.isPaused ? (
              <button
                onClick={onResume}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs"
              >
                <Play className="w-3.5 h-3.5" />
                RESUME
              </button>
            ) : (
              <button
                onClick={onPause}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-xs"
              >
                <Pause className="w-3.5 h-3.5" />
                PAUSE
              </button>
            )}
            
            <button
              onClick={onStop}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs"
            >
              <Square className="w-3.5 h-3.5" />
              STOP
            </button>
          </>
        )}
      </div>
      
      {/* Warning for Production Mode */}
      {!config.testMode && (
        <div className="mt-3 flex items-start gap-2 text-[10px] text-amber-300 bg-amber-900/20 border border-amber-800/50 rounded p-2">
          <DollarSign className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>
            Production mode enabled. Generates real images (~$0.04/each).
            Budget limit: ${config.maxCost.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
};
