import React from 'react';
import { DetailedRoomAnalysis } from '../types/spatial.types';

interface RoomVisualizerProps {
  analysis: DetailedRoomAnalysis;
}

const RoomVisualizer: React.FC<RoomVisualizerProps> = ({ analysis }) => {
  // Simple SVG mapping
  // We represent the room as a rectangle.
  // This is a symbolic visualization as we don't have exact coordinates, only descriptions.
  
  // Filter constraints to derive openings (windows/doors) and other furniture-like constraints
  const openings = analysis.constraints.filter(c => 
    c.type.toLowerCase().includes('window') || c.type.toLowerCase().includes('door')
  );
  
  const furniture = analysis.constraints.filter(c => 
    !c.type.toLowerCase().includes('window') && !c.type.toLowerCase().includes('door')
  );
  
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-full">
      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
        <i className="fas fa-layer-group text-indigo-500"></i>
        Spatial Map (Symbolic)
      </h3>
      <div className="relative aspect-square w-full border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center overflow-hidden bg-gray-50">
        <svg viewBox="0 0 400 400" className="w-full h-full p-4">
          {/* Room Base */}
          <rect x="50" y="50" width="300" height="300" fill="none" stroke="#6366f1" strokeWidth="4" rx="8" />
          
          {/* Openings */}
          {openings.map((op, i) => {
            const isWindow = op.type.toLowerCase().includes('window');
            const color = isWindow ? '#38bdf8' : '#fb923c';
            // Placeholder placement logic based on simple keywords found in the location description
            let x = 50, y = 50, w = 40, h = 40;
            const loc = op.location.toLowerCase();
            if (loc.includes('north')) { x = 180; y = 35; w = 40; h = 20; }
            else if (loc.includes('south')) { x = 180; y = 345; w = 40; h = 20; }
            else if (loc.includes('east')) { x = 345; y = 180; w = 20; h = 40; }
            else if (loc.includes('west')) { x = 35; y = 180; w = 20; h = 40; }
            
            return (
              <g key={i}>
                <rect x={x} y={y} width={w} height={h} fill={color} rx="2" />
                <text x={x + (w/2)} y={y - 5} textAnchor="middle" fontSize="10" className="font-bold uppercase fill-gray-500">{op.type}</text>
              </g>
            );
          })}

          {/* Furniture placeholders - Distributed procedurally for visual effect since we don't have exact (x,y) */}
          {furniture.map((f, i) => {
            const angle = (i / (furniture.length || 1)) * Math.PI * 2;
            const x = 200 + Math.cos(angle) * 80 - 20;
            const y = 200 + Math.sin(angle) * 80 - 20;
            const label = f.description.length > 10 ? f.description.substring(0, 8) + '...' : f.description;
            return (
              <g key={i}>
                <rect x={x} y={y} width="40" height="40" fill="#e0e7ff" stroke="#818cf8" rx="4" />
                <text x={x + 20} y={y + 25} textAnchor="middle" fontSize="8" className="fill-indigo-700 font-medium">
                  {label}
                </text>
              </g>
            );
          })}
          
          {/* Center Info */}
          <text x="200" y="200" textAnchor="middle" fontSize="14" className="fill-gray-400 font-bold uppercase tracking-widest">
            {analysis.room_type}
          </text>
        </svg>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-sky-400 rounded-sm"></div> Window</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-orange-400 rounded-sm"></div> Door</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-indigo-100 border border-indigo-300 rounded-sm"></div> Furniture/Constraint</div>
      </div>
    </div>
  );
};

export default RoomVisualizer;
