import { Coordinate, DetailedRoomAnalysis, IdentifiedObject } from './spatial.types';

export type ReasoningLogType = 'thought' | 'action' | 'success' | 'error' | 'analysis' | 'intent' | 'validation';

// Using Record type to allow any object to be passed as metadata
// This is intentionally loose to support various logging contexts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReasoningLogMetadata = Record<string, any>;

export interface ReasoningLog {
  id: string;
  type: ReasoningLogType;
  content: string;
  timestamp: Date;
  metadata?: ReasoningLogMetadata;
}

export interface EditHistoryEntry {
  base64: string;
  timestamp: Date;
  operation: string;
  description: string;
  scannedObjects?: IdentifiedObject[];
  roomAnalysis?: DetailedRoomAnalysis | null;
  selectedObject?: IdentifiedObject | null;
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
  | 'Editing Image (Pro)...'
  | 'Editing Image (Fast)...'
  | 'Refining object detection...'
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
