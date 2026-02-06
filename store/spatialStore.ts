
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
  versionOrder: string[];
  currentVersionId: string | null;

  // Actions
  initialize: (base64: string, objects: IdentifiedObject[], analysis: DetailedRoomAnalysis | null) => void;
  addVersion: (snapshotData: Omit<VersionSnapshot, 'id' | 'timestamp'>) => void;
  jumpToVersion: (index: number) => void;
  setSelectedObject: (id: string | null) => void;
  updateCurrentObjects: (objects: IdentifiedObject[]) => void;
  updateCurrentVersion: (updates: Partial<VersionSnapshot>) => void;
  reset: () => void;

  // Getters
  getCurrentSnapshot: () => VersionSnapshot | null;
  getCurrentObjects: () => IdentifiedObject[];
  getSelectedObject: () => IdentifiedObject | null;
  getOriginalImage: () => string | null;
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
      objects: [...objects], // Create new array
      roomAnalysis: analysis ? { ...analysis } : null, // Create new object if exists
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
      timestamp: new Date(),
      // Ensure arrays/objects are new references
      objects: [...(data.objects || [])],
      roomAnalysis: data.roomAnalysis ? { ...data.roomAnalysis } : null
    };
    
    set(state => {
      // CRITICAL: Always preserve the original (first version) - never delete it
      // If we are in the middle of history, we branch off (discarding future versions)
      // BUT: Always keep versionOrder[0] (the original)
      const currentIndex = state.currentVersionId 
        ? state.versionOrder.indexOf(state.currentVersionId) 
        : -1;
      
      // CRITICAL: Always preserve the original (index 0) - never delete it
      // Preserve original (index 0) and all versions up to current
      const originalVersionId = state.versionOrder.length > 0 ? state.versionOrder[0] : null;
      const preservedVersions = currentIndex >= 0 && state.versionOrder.length > 0
        ? state.versionOrder.slice(0, currentIndex + 1)
        : state.versionOrder;
      
      // Ensure original is always first - never overwrite it
      const newOrder = preservedVersions.length > 0 
        ? [...preservedVersions, id]
        : [id];
      
      // Preserve all versions including original - never delete original from versions object
      const allVersions = { ...state.versions, [id]: snapshot };
      // Ensure original version is never deleted
      if (originalVersionId && state.versions[originalVersionId]) {
        allVersions[originalVersionId] = state.versions[originalVersionId];
      }
      
      return {
        versions: allVersions,
        versionOrder: newOrder,
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
    set((state) => {
      if (!state.currentVersionId) return state;
      const currentSnapshot = state.versions[state.currentVersionId];
      // Create new array reference to trigger re-renders
      const updatedSnapshot = { 
        ...currentSnapshot, 
        objects: [...objects] // New array reference
      };
      return {
        versions: { ...state.versions, [state.currentVersionId]: updatedSnapshot },
      };
    });
  },

  updateCurrentVersion: (updates: Partial<VersionSnapshot>) => {
    set((state) => {
      if (!state.currentVersionId) return state;
      const currentVersion = state.versions[state.currentVersionId];
      if (!currentVersion) return state;
      
      // CRITICAL: Never update the original version (index 0) - it must remain immutable
      const isOriginal = state.versionOrder.length > 0 && state.versionOrder[0] === state.currentVersionId;
      if (isOriginal) {
        console.warn('[Versioning] Attempted to update original version - ignoring to preserve original');
        return state;
      }
      
      const updatedSnapshot = {
        ...currentVersion,
        ...updates,
        // Ensure nested objects are new references
        objects: updates.objects ? [...updates.objects] : currentVersion.objects,
        roomAnalysis: updates.roomAnalysis 
          ? (updates.roomAnalysis ? { ...updates.roomAnalysis } : null)
          : currentVersion.roomAnalysis,
      };
      
      return {
        versions: {
          ...state.versions,
          [state.currentVersionId]: updatedSnapshot,
        },
      };
    });
  },

  reset: () => {
    set({
      versions: {},
      versionOrder: [],
      currentVersionId: null,
    });
  },

  getCurrentSnapshot: () => {
    const state = get();
    if (!state.currentVersionId) return null;
    // Return reference directly - Zustand selectors handle re-renders
    return state.versions[state.currentVersionId] || null;
  },

  getCurrentObjects: () => {
    const state = get();
    if (!state.currentVersionId) return [];
    // Return reference directly - Zustand selectors handle re-renders
    return state.versions[state.currentVersionId]?.objects || [];
  },

  getSelectedObject: () => {
    const state = get();
    if (!state.currentVersionId) return null;
    const snap = state.versions[state.currentVersionId];
    if (!snap?.selectedObjectId) return null;
    // Return reference directly - Zustand selectors handle re-renders
    return snap.objects.find(o => o.id === snap.selectedObjectId) || null;
  },

  getOriginalImage: () => {
    const state = get();
    // Get the first version (original upload)
    if (state.versionOrder.length === 0) return null;
    const originalVersionId = state.versionOrder[0];
    const originalVersion = state.versions[originalVersionId];
    return originalVersion ? originalVersion.base64 : null;
  }
}));
