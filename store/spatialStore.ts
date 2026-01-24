
import { create } from 'zustand';
import { DetailedRoomAnalysis, IdentifiedObject } from '../types/spatial.types';

export interface VersionSnapshot {
  id: string;
  timestamp: Date;
  base64: string;
  operation: string;
  description: string;
  // Full state capture per version
  objects: IdentifiedObject[];
  roomAnalysis: DetailedRoomAnalysis | null;
  selectedObjectId: string | null;
}

interface SpatialState {
  versions: Record<string, VersionSnapshot>;
  versionOrder: string[]; // IDs in chronological order
  currentVersionId: string | null;
  
  // Actions
  initialize: (base64: string, objects: IdentifiedObject[], analysis: DetailedRoomAnalysis | null) => void;
  addVersion: (snapshotData: Omit<VersionSnapshot, 'id' | 'timestamp'>) => void;
  jumpToVersion: (index: number) => void;
  setSelectedObject: (id: string | null) => void;
  updateCurrentObjects: (objects: IdentifiedObject[]) => void;
  
  // Getters
  getCurrentSnapshot: () => VersionSnapshot | null;
  getCurrentObjects: () => IdentifiedObject[];
  getSelectedObject: () => IdentifiedObject | null;
}

export const useSpatialStore = create<SpatialState>((set, get) => ({
  versions: {},
  versionOrder: [],
  currentVersionId: null,

  initialize: (base64, objects, analysis) => {
    const id = Math.random().toString(36).substr(2, 9);
    const snapshot: VersionSnapshot = {
      id,
      timestamp: new Date(),
      base64,
      operation: 'Original',
      description: 'Original Upload',
      objects,
      roomAnalysis: analysis,
      selectedObjectId: null
    };
    
    set({
      versions: { [id]: snapshot },
      versionOrder: [id],
      currentVersionId: id
    });
  },

  addVersion: (data) => {
    const id = Math.random().toString(36).substr(2, 9);
    const snapshot: VersionSnapshot = {
      ...data,
      id,
      timestamp: new Date()
    };
    
    set(state => {
      // If we are in the middle of history, we branch off (discarding future versions)
      const currentIndex = state.currentVersionId 
        ? state.versionOrder.indexOf(state.currentVersionId) 
        : -1;
        
      const newOrder = currentIndex >= 0 
        ? state.versionOrder.slice(0, currentIndex + 1)
        : [];
      
      return {
        versions: { ...state.versions, [id]: snapshot },
        versionOrder: [...newOrder, id],
        currentVersionId: id
      };
    });
  },

  jumpToVersion: (index) => {
    const state = get();
    if (index >= 0 && index < state.versionOrder.length) {
      set({ currentVersionId: state.versionOrder[index] });
    }
  },

  setSelectedObject: (id) => {
    set(state => {
      if (!state.currentVersionId) return state;
      
      const currentSnapshot = state.versions[state.currentVersionId];
      const updatedSnapshot = { ...currentSnapshot, selectedObjectId: id };
      
      return {
        versions: { ...state.versions, [state.currentVersionId]: updatedSnapshot }
      };
    });
  },
  
  updateCurrentObjects: (objects) => {
    set(state => {
      if (!state.currentVersionId) return state;
      const currentSnapshot = state.versions[state.currentVersionId];
      const updatedSnapshot = { ...currentSnapshot, objects };
      return {
        versions: { ...state.versions, [state.currentVersionId]: updatedSnapshot }
      };
    });
  },

  getCurrentSnapshot: () => {
    const state = get();
    return state.currentVersionId ? state.versions[state.currentVersionId] : null;
  },

  getCurrentObjects: () => {
    const state = get();
    if (!state.currentVersionId) return [];
    return state.versions[state.currentVersionId].objects || [];
  },

  getSelectedObject: () => {
    const state = get();
    if (!state.currentVersionId) return null;
    const snap = state.versions[state.currentVersionId];
    if (!snap.selectedObjectId) return null;
    return snap.objects.find(o => o.id === snap.selectedObjectId) || null;
  }
}));
