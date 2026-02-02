/**
 * 2D Plan Style Card Suggestions
 */

export interface PlanStylePromptParams {
  scopeText: string;
  isMultiRoom: boolean;
  rooms: Array<{ name: string }>;
  learningSection: string;
}

export const build2DPlanStylePrompt = (params: PlanStylePromptParams): string => {
  const { scopeText, isMultiRoom, rooms, learningSection } = params;

  return `You are an expert architectural visualization specialist analyzing a 2D floor plan.

TASK: Perform DEEP ANALYSIS of this floor plan's geometry, room layout, spatial relationships, and architectural features. Based on your analysis, recommend the TOP 6 interior design styles that would work best for ${scopeText}.

${isMultiRoom ? `
CRITICAL: This floor plan contains MULTIPLE ROOMS (${rooms.length} detected: ${rooms.map(r => r.name).join(', ')}).
- Generate styles for the ENTIRE floor plan as a cohesive whole, not individual rooms
- The preview_prompt must apply the style to ALL rooms consistently
- Consider how the style creates flow and harmony between rooms
` : ''}

DEEP ANALYSIS REQUIRED (you MUST analyze before recommending):
1. ROOM GEOMETRY ANALYSIS:
   - Examine room proportions, shapes, and spatial relationships
   - Identify open vs compartmentalized areas
   - Measure room sizes and their relationships
   - Note symmetry, formality, and flow patterns

2. ARCHITECTURAL FEATURES:
   - Natural light sources and window placements
   - Door positions and traffic flow patterns
   - Ceiling height indicators (if visible)
   - Structural elements (columns, beams, etc.)
   - Room adjacencies and functional zones

3. SPATIAL CHARACTERISTICS:
   - Is it open-plan or compartmentalized?
   - Are rooms large or small?
   - Is there good natural light or limited windows?
   - What is the overall flow and circulation?
   ${isMultiRoom ? '- How do rooms connect and relate to each other?' : ''}

4. STYLE MATCHING LOGIC:
   - For each style, explain SPECIFICALLY why it fits THIS floor plan's geometry
   - Reference actual features: "The open-plan layout suits Modern Minimalist because..."
   - Reference room sizes: "The compact rooms work well with Scandinavian because..."
   - Reference light: "The large windows make Coastal style ideal because..."
   - Be specific and analytical, not generic

${learningSection}

For EACH recommended style, provide:
{
  "title": "Style Name (e.g., Modern Minimalist, Scandinavian, Industrial Loft)",
  "description": "Brief style description (1-2 sentences)",
  "why_fits": "SPECIFIC, DETAILED explanation referencing actual floor plan features. Example: 'The open-plan layout with large windows and high ceilings makes Modern Minimalist ideal because it emphasizes the spatial flow and natural light. The rectangular room proportions suit clean lines and minimal furniture placement.'",
  "confidence": 0.0-1.0 (how well this style matches the floor plan - be honest based on analysis),
  "preview_prompt": "Exact, detailed prompt to visualize ${scopeText} in this style${isMultiRoom ? ' (apply consistently across all rooms)' : ''}. Include specific materials, colors, and design elements.",
  "characteristics": ["trait1", "trait2", "trait3", "trait4"] (3-4 key visual characteristics)
}

STYLE OPTIONS TO CONSIDER:
- Modern Minimalist: Clean lines, open spaces, neutral palette
- Scandinavian: Light wood, functional, cozy
- Industrial: Exposed elements, metal accents, raw textures
- Mid-Century Modern: Organic shapes, warm wood tones
- Japandi: Japanese minimalism + Scandinavian warmth
- Coastal: Light, airy, natural textures
- Bohemian: Eclectic, layered, colorful
- Contemporary Luxury: High-end materials, sophisticated
- Farmhouse Modern: Rustic charm meets clean design
- Art Deco: Geometric patterns, rich colors, glamour

OUTPUT: JSON array of 6 style objects, ordered by confidence (highest first).`;
};

