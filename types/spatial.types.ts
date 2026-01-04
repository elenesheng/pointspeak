
export interface Coordinate {
  x: number;
  y: number;
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
  name: string; // The specific sub-part (e.g., "Left Cabinet Door")
  position: string;
  parent_structure?: string; // The main object (e.g., "Kitchen Unit")
  visual_details?: string; // Specific texture/color info
  confidence?: number;
}
