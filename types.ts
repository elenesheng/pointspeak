
export interface Coordinate {
  x: number;
  y: number;
}

export interface ReasoningLog {
  id: string;
  type: 'thought' | 'action' | 'success' | 'error' | 'analysis' | 'intent' | 'validation';
  content: string;
  timestamp: Date;
  metadata?: any;
}

export interface RoomConstraint {
  type: string;
  location: string;
  description: string;
}

export interface DetailedRoomAnalysis {
  room_type: string;
  constraints: RoomConstraint[];
  traffic_flow: string;
}

export interface IdentifiedObject {
  id: string;
  name: string;
  position: string;
}

export interface IntentTranslation {
  operation_type: 'REMOVE' | 'MOVE' | 'EDIT' | 'SWAP';
  interpreted_intent: string;
  proposed_action: string;
  spatial_check_required: boolean;
  new_position?: { description: string };
  removed_object_replacement?: string;
  imagen_prompt: string;
}

export interface SpatialValidation {
  valid: boolean;
  warnings: string[];
  alternative_suggestion?: string;
}

export interface AppState {
  imageUrl: string | null;
  pins: Coordinate[];
  status: 'Idle' | 'Scanning Room...' | 'Analyzing Source...' | 'Target Set' | 'Analyzing Point...' | 'Generating Response...' | 'Ready' | 'Validating...' | 'Generating Visualization...' | 'Removing Object...' | 'Repositioning Object...' | 'Transforming Object...' | 'Editing Image with Nano Banana Pro...';
  logs: ReasoningLog[];
  userInput: string;
  roomAnalysis: DetailedRoomAnalysis | null;
  selectedObject: IdentifiedObject | null;
  generatedImage: string | null;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio?: AIStudio;
  }
}
