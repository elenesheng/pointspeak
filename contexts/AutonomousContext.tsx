
import React, { createContext, useContext, ReactNode } from 'react';
import { AgentState, IterationAnalysis, AutonomousConfig } from '../services/gemini/autonomousAgentService';

export interface AutonomousContextType {
  isAutonomousMode: boolean;
  agentState: AgentState | null;
  analyses: IterationAnalysis[];
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  startMarathon: (config: AutonomousConfig) => void;
  pauseAgent: () => void;
  resumeAgent: () => void;
  stopAgent: () => void;
  exportAnalysisReport: () => void;
  exportImages: () => void;
  disabled: boolean;
}

const AutonomousContext = createContext<AutonomousContextType | undefined>(undefined);

export const AutonomousProvider: React.FC<{ value: AutonomousContextType; children: ReactNode }> = ({ value, children }) => {
  return (
    <AutonomousContext.Provider value={value}>
      {children}
    </AutonomousContext.Provider>
  );
};

export const useAutonomousContext = () => {
  const context = useContext(AutonomousContext);
  if (!context) {
    throw new Error('useAutonomousContext must be used within an AutonomousProvider');
  }
  return context;
};
