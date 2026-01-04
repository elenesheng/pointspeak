
import { Coordinate, DetailedRoomAnalysis, IdentifiedObject } from './spatial.types';

export type ReasoningLogType = 'thought' | 'action' | 'success' | 'error' | 'analysis' | 'intent' | 'validation';

export interface ReasoningLog {
  id: string;
  type: ReasoningLogType;
  content: string;
  timestamp: Date;
  metadata?: any;
}

export interface EditHistoryEntry {
  base64: string;
  timestamp: Date;
  operation: string;
  description: string;
}

export type AppStatus = 
  | 'Idle' 
  | 'Scanning Room...' 
  | 'Analyzing Source...' 
  | 'Target Set' 
  | 'Analyzing Point...' 
  | 'Generating Response...' 
  | 'Ready' 
  | 'Validating...' 
  | 'Generating Visualization...' 
  | 'Removing Object...' 
  | 'Repositioning Object...' 
  | 'Transforming Object...' 
  | 'Editing Image...'
  | 'Analyzing Reference...';

export interface AppState {
  imageUrl: string | null;
  pins: Coordinate[];
  status: AppStatus;
  logs: ReasoningLog[];
  userInput: string;
  roomAnalysis: DetailedRoomAnalysis | null;
  selectedObject: IdentifiedObject | null;
  generatedImage: string | null;
}
