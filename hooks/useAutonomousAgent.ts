
import { useState, useCallback, useRef } from 'react';
import { 
  AutonomousDesignAgent, 
  AutonomousConfig, 
  AgentState, 
  AutonomousDecision,
  IterationAnalysis 
} from '../services/gemini/autonomousAgentService';
import { DetailedRoomAnalysis } from '../types/spatial.types';
import { ReasoningLogType } from '../types/ui.types';

export const useAutonomousAgent = (
  addLog: (content: string, type: ReasoningLogType, metadata?: any) => void
) => {
  const [isAutonomousMode, setIsAutonomousMode] = useState(false);
  const [agentState, setAgentState] = useState<AgentState | null>(null);
  const [analyses, setAnalyses] = useState<IterationAnalysis[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const agentRef = useRef<AutonomousDesignAgent | null>(null);

  const startAutonomousMode = useCallback(async (
    config: AutonomousConfig,
    initialImageBase64: string,
    roomAnalysis: DetailedRoomAnalysis,
    executeCommand: (imageBase64: string, userText: string, forceOverride: boolean, overrideData?: any) => Promise<string | undefined>
  ) => {
    if (agentRef.current) {
      agentRef.current.stop();
    }
    
    // FIX 1: Set state IMMEDIATELY before async work starts
    setIsAutonomousMode(true);
    setAnalyses([]); // Clear previous analyses
    
    addLog(
      `🤖 Autonomous Marathon Started: ${config.designGoal}`,
      'action',
      { 
        mode: config.testMode ? 'TEST' : 'PRODUCTION',
        styleKeywords: config.styleKeywords 
      }
    );
    
    const agent = new AutonomousDesignAgent(config);
    agentRef.current = agent;

    // FIX 2: Set initial state immediately so UI can render controls
    const initialState = agent.getState();
    initialState.isRunning = true; // Force running state locally for immediate feedback
    setAgentState(initialState);
    
    try {
      await agent.run(
        initialImageBase64,
        roomAnalysis,
        // On each decision
        (decision: AutonomousDecision) => {
          addLog(
            `🎯 #${decision.iteration}: ${decision.action} ${decision.target}`,
            'action',
            decision
          );
          addLog(`💭 ${decision.reason}`, 'thought');
          if (decision.styleAlignment) {
            addLog(`🎨 Style: ${decision.styleAlignment}`, 'thought');
          }
        },
        // On each analysis
        (analysis: IterationAnalysis) => {
          setAnalyses(prev => [...prev, analysis]);
          
          const emoji = analysis.success ? '✅' : '❌';
          addLog(
            `${emoji} Quality: ${(analysis.qualityScore * 100).toFixed(0)}% | Style: ${(analysis.styleScore * 100).toFixed(0)}%`,
            analysis.success ? 'success' : 'error',
            analysis
          );
          
          if (analysis.lessonLearned) {
            addLog(`💡 Learned: ${analysis.lessonLearned}`, 'thought');
          }
        },
        // On progress update
        (state: AgentState) => {
          setAgentState({ ...state });
        },
        // Execute command
        executeCommand
      );
      
      // Marathon completed
      const finalState = agent.getState();
      addLog(
        `🏁 Marathon Complete! ${finalState.improvements.length} changes made`,
        'success',
        {
          avgQuality: finalState.overallProgress.avgQuality,
          avgStyle: finalState.overallProgress.avgStyleScore,
          totalCost: finalState.totalCost
        }
      );
      
    } catch (e) {
      console.error("Autonomous loop error", e);
      addLog("❌ Autonomous marathon crashed", 'error');
    } finally {
      setIsAutonomousMode(false);
    }
  }, [addLog]);

  const pauseAgent = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.pause();
      setAgentState(prev => prev ? { ...prev, isPaused: true } : null);
      addLog("⏸️ Agent Paused", 'action');
    }
  }, [addLog]);

  const resumeAgent = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.resume();
      setAgentState(prev => prev ? { ...prev, isPaused: false } : null);
      addLog("▶️ Agent Resumed", 'action');
    }
  }, [addLog]);

  const stopAgent = useCallback(() => {
    if (agentRef.current) {
      agentRef.current.stop();
      setIsAutonomousMode(false);
      addLog("⏹️ Agent Stopped", 'action');
    }
  }, [addLog]);
  
  // Export analysis report as JSON
  const exportAnalysisReport = useCallback(() => {
    if (!agentRef.current) return;
    
    const report = agentRef.current.exportAnalysisReport();
    const blob = new Blob([report], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `autonomous-design-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog("📥 Analysis report exported", 'success');
  }, [addLog]);
  
  // Export all generated images as ZIP (simplified version)
  const exportImages = useCallback(() => {
    if (!agentRef.current) return;
    
    const images = agentRef.current.exportImages();
    
    if (images.length === 0) {
      addLog("⚠️ No images to export (test mode or no iterations)", 'error');
      return;
    }
    
    // For simplicity, download each image separately
    // In production, you'd use JSZip library to create a single ZIP
    images.forEach(({ iteration, base64 }) => {
      const a = document.createElement('a');
      a.href = `data:image/jpeg;base64,${base64}`;
      a.download = `iteration-${iteration}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
    
    addLog(`📥 Exported ${images.length} images`, 'success');
  }, [addLog]);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => {
    if (isAutonomousMode) {
      if (window.confirm('Agent is running. Stop and close?')) {
        stopAgent();
        setIsModalOpen(false);
      }
    } else {
      setIsModalOpen(false);
    }
  }, [isAutonomousMode, stopAgent]);

  return {
    isAutonomousMode,
    agentState,
    analyses,
    isModalOpen,
    openModal,
    closeModal,
    startAutonomousMode,
    pauseAgent,
    resumeAgent,
    stopAgent,
    exportAnalysisReport,
    exportImages
  };
};
