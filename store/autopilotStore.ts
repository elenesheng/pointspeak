/**
 * Autopilot store for managing automated editing configuration and progress.
 */
import { create } from 'zustand';

export interface AutopilotConfig {
  enabled: boolean;
  autoFixThreshold: number; // 0.0 - 1.0
  maxAttempts: number;
  style?: string;
  generateAllRooms: boolean;
}

export interface AutopilotProgress {
  currentRoom: string;
  currentPass: number;
  totalPasses: number;
  roomsCompleted: number;
  totalRooms: number;
  status: string;
}

interface AutopilotState {
  isRunning: boolean;
  config: AutopilotConfig;
  progress: AutopilotProgress | null;
  
  // Actions
  setConfig: (config: Partial<AutopilotConfig>) => void;
  startAutopilot: () => void;
  stopAutopilot: () => void;
  updateProgress: (progress: Partial<AutopilotProgress> | null) => void;
  reset: () => void;
}

const defaultConfig: AutopilotConfig = {
  enabled: true,
  autoFixThreshold: 0.8,
  maxAttempts: 3,
  generateAllRooms: false,
};

export const useAutopilotStore = create<AutopilotState>((set) => ({
  isRunning: false,
  config: defaultConfig,
  progress: null,

  setConfig: (newConfig) => {
    set((state) => ({
      config: { ...state.config, ...newConfig },
    }));
  },

  startAutopilot: () => {
    set({ isRunning: true });
  },

  stopAutopilot: () => {
    set({ isRunning: false, progress: null });
  },

  updateProgress: (progressUpdate) => {
    set((state) => {
      if (progressUpdate === null) {
        return { progress: null };
      }
      return {
        progress: state.progress
          ? { ...state.progress, ...progressUpdate }
          : ({
              currentRoom: '',
              currentPass: 1,
              totalPasses: 1,
              roomsCompleted: 0,
              totalRooms: 1,
              status: '',
              ...progressUpdate,
            } as AutopilotProgress),
      };
    });
  },

  reset: () => {
    set({
      isRunning: false,
      config: defaultConfig,
      progress: null,
    });
  },
}));

