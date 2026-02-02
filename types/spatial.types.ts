export interface Coordinate {
  x: number;
  y: number;
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

export interface RoomConstraint {
  type: string;
  location: string;
  description: string;
}

export interface RoomInsight {
  category: string;
  title: string;
  description: string;
  suggestions: string[];
  system_instruction?: string; // Technical corrective prompt for the system
}

export interface DetailedRoomAnalysis {
  room_type: string;
  is_2d_plan?: boolean; // New field for detection
  constraints: RoomConstraint[];
  traffic_flow: string;
  insights?: RoomInsight[]; // Dynamic AI insights
}

export interface HierarchyPart {
  name: string;
  visual_details: string;
}

export interface IdentifiedObject {
  id: string;
  name: string; // The active name used for logic
  position: string;
  box_2d?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] Normalized 0-1000
  parent_structure?: string; 
  
  // Hierarchy Details
  specific_part?: HierarchyPart; // Micro level (e.g., "Freezer Handle")
  whole_object?: HierarchyPart;  // Macro level (e.g., "Refrigerator")
  
  category?: 'Appliance' | 'Furniture' | 'Fixture' | 'Structure' | 'Decor' | 'Surface';
  
  visual_details?: string; // The active visuals used for logic
  material_breakdown?: string;
  neighbors_to_protect?: string;
  confidence?: number;
}
