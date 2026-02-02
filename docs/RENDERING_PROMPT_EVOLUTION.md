# Rendering Service: Prompt Evolution & Strategy Documentation

## Overview

This document traces the evolution of prompts and strategies in `renderingService.ts`, explaining each iteration, why it was needed, and how it improved the 3D visualization quality.

---

## 🎯 Core Problem Statement

**Initial Challenge:** Converting 2D floor plans to photorealistic 3D eye-level interior views while:
1. Maintaining exact structural layout (no wall drift)
2. Preserving windows/doors as glass portals (not solid walls)
3. Achieving correct eye-level perspective (not top-down views)
4. Generating high-quality, photorealistic materials and lighting

---

## 📈 Evolution Timeline

### **Phase 1: Basic Perspective Constraints**

#### Initial Approach
```typescript
// Simple perspective instructions
"Generate a photorealistic 3D interior photograph from this floor plan.
Camera at human eye level (1.6m). Floor at bottom, ceiling at top."
```

#### Why It Failed
- Too vague - model defaulted to top-down views
- No explicit prohibition of aerial/bird's-eye views
- Missing architectural photography terminology

#### What We Learned
- LLMs need explicit negative constraints ("Do NOT create top-down view")
- Professional terminology (e.g., "2-point perspective") helps anchor the model

---

### **Phase 2: Negative Constraint Overload**

#### Approach
```typescript
"What You MUST NOT Create:
- Top-down aerial view
- Bird's eye view
- Isometric or axonometric projection
- Any view where you can see the entire floor layout from above"
```

#### Why It Partially Worked
- Explicit prohibitions helped reduce top-down outputs
- But: Too many "DO NOT" statements can confuse the model
- Negative framing doesn't guide positive behavior

#### What We Learned
- **Negative constraints are necessary but insufficient**
- Need to pair with positive enforcement (what TO do)
- Too many "DO NOT" rules can create cognitive overload

---

### **Phase 3: Positive Constraint Enforcement**

#### Key Innovation: Vanishing Point & Verticality
```typescript
"Visual Requirements:
- Horizon line centered vertically (approximately 50% from top) to enforce eye-level perspective
- All vertical architectural lines (walls, door frames, window frames) remain perfectly parallel to image edges
- Zero-Tilt: All vertical edges must be 90° to the horizon"
```

#### Why This Worked
- **Positive framing**: "DO this" instead of "DON'T do that"
- **Specific geometric constraints**: Horizon at 50% is measurable
- **Professional terminology**: "Zero-Tilt" is architectural photography language
- **Visual anchors**: Model can verify its output against these rules

#### Key Insight
- Models respond better to **constructive instructions** than prohibitions
- Using domain-specific terminology (architectural photography) aligns with training data

---

### **Phase 4: Role-Based Framing**

#### Innovation: "Architectural Visualizer" → "Photographer"
```typescript
// BEFORE:
"ACT AS: An Architectural Visualizer. Your task is to perform a MATERIAL MAPPING onto a FIXED GEOMETRIC SHELL."

// AFTER:
"ACT AS: A Professional Interior Photographer. Your task is to create a 3D eye-level photograph from architectural plans."
```

#### Why This Worked
- **Cognitive shift**: "Architect" thinks in maps/plans → "Photographer" thinks in views/perspectives
- **Training data alignment**: Photography datasets have more eye-level interior photos than architectural blueprints
- **Task reframing**: "Material mapping" sounds like texture application → "Photograph" implies camera positioning

#### Key Insight
- **Role framing** changes how the model interprets the task
- Match the role to the desired output style (photographer = eye-level, architect = top-down)

---

### **Phase 5: Spatial Grounding with Anchor Keywords**

#### Innovation: "Load-Bearing" & "Immutable Anchors"
```typescript
"The walls, doors, and windows provided in the input are IMMUTABLE ANCHORS.
The White pixels in the mask are LOAD-BEARING. They cannot be moved, thinned, or removed."
```

#### Why This Worked
- **Domain-specific terminology**: "Load-bearing" is architectural language the model recognizes
- **Semantic anchoring**: "IMMUTABLE ANCHORS" creates a mental model of fixed points
- **Visual + semantic**: Combines mask (visual) with terminology (semantic)

#### Key Insight
- Use **domain-specific keywords** that align with training data
- "Load-bearing" triggers architectural reasoning, not just visual matching

---

### **Phase 6: Map vs. View Correction**

#### Innovation: Explicit 2D → 3D Translation
```typescript
// BEFORE:
"Treat the Floor Plan image as the blueprint"

// AFTER:
"The 2D Plan is a MAP; the output MUST be a 3D PERSPECTIVE VIEW.
You are a photographer standing INSIDE the room."
```

#### Why This Worked
- **Prevents blueprint mode**: Too many "blueprint" references kept model in 2D thinking
- **Spatial positioning**: "Standing INSIDE" forces eye-level perspective
- **Semantic differentiation**: "MAP" (reference) vs "VIEW" (output) clarifies task

#### Key Insight
- **Avoid overusing source terminology** (blueprint, plan) - it anchors model to 2D
- **Emphasize output format** (3D view, photograph) to guide generation

---

### **Phase 7: 3D Extrusion Language**

#### Innovation: "EXTRUDE" Command
```typescript
"3D EXTRUSION TASK: Convert this 2D Floor Plan into a 3D eye-level photograph.
EXTRUDE the white lines into 3D walls. Do not move them."
```

#### Why This Worked
- **Action-oriented**: "EXTRUDE" is a 3D modeling term that implies vertical extension
- **Clear transformation**: 2D lines → 3D walls (not 2D plan → 2D rendering)
- **Preserves structure**: "Do not move them" maintains layout while allowing 3D transformation

#### Key Insight
- **Use action verbs** that imply the desired transformation
- "Extrude" = 3D, "Match" = 2D, "Render" = ambiguous

---

### **Phase 8: Image Order Optimization**

#### Innovation: Mask as Last Visual Context
```typescript
// Image order: Blueprint → Aesthetic (if exists) → Mask (THE TRUTH) → Instructions
const parts: ContentPart[] = [
  { inlineData: { mimeType: 'image/jpeg', data: planBase64 } }, // The Blueprint
  { inlineData: { mimeType: 'image/jpeg', data: referenceBase64 } }, // The Aesthetic
  { inlineData: { mimeType: 'image/png', data: maskBase64 } }, // THE TRUTH (Last image)
  { text: instructionText } // The Rules
];
```

#### Why This Worked
- **Recency effect**: Model's "spatial memory" is freshest on boundaries right before reading rules
- **Visual-text association**: Mask (visual) immediately followed by instructions (text) creates strong link
- **Attention mechanism**: Gemini pays high attention to relationship between last image and text

#### Key Insight
- **Order matters**: Last image before text gets highest attention weight
- **Semantic labeling**: Comments like "THE TRUTH" help developers understand intent

---

### **Phase 9: Multi-Stage Rendering (Clay Render)**

#### Innovation: Two-Stage Process
```typescript
// STAGE 1: Geometry (temperature: 0.2)
"Generate an 'ARCHITECTURAL WHITE MODEL' (Clay Render).
Focus on light and shadow over volume (ambient occlusion).
NO textures or patterns - just clean geometric forms."

// STAGE 2: Style (temperature: 0.4)
"Add realistic materials, furniture, and styling.
Preserve the existing perspective geometry EXACTLY."
```

#### Why This Worked
- **Cognitive separation**: Geometry first, then style (reduces cognitive load)
- **Temperature progression**: 0.2 (structure) → 0.4 (creativity for materials)
- **Clay render concept**: "Ambient occlusion" is a 3D rendering term that forces depth perception
- **Deterministic structure**: Stage 1 locks geometry before Stage 2 adds variation

#### Key Insight
- **Separate concerns**: Structure vs. style are different cognitive tasks
- **Progressive temperature**: Start deterministic, increase for creative tasks
- **Domain terminology**: "Clay render", "ambient occlusion" trigger 3D reasoning

---

### **Phase 10: Portal Logic (Semantic Differentiation)**

#### Innovation: Mask for Position, Plan for Semantics
```typescript
"SPATIAL AUTHORITY:
- Use the Structural Mask (black/white image) for POSITION.
- Use the Floor Plan image for SEMANTICS:
    - IDENTIFY PORTALS: Look for window and door symbols in the Floor Plan.
    - RULE: If a line in the mask corresponds to a window or balcony door symbol in the plan, render it as a GLASS OPENING (Portal), not a solid wall.
    - SIGHTLINES: Ensure you can see 'through' windows and balcony doors."
```

#### Why This Worked
- **Solves window blocking**: Model was treating all white pixels as solid walls
- **Cross-referencing**: Mask (where) + Plan (what) = complete understanding
- **Semantic labels**: "PORTAL", "GLASS OPENING" differentiate from "WALL"
- **Sightlines concept**: "See through" triggers transparency reasoning

#### Key Insight
- **Semantic differentiation**: Same visual input (white pixel) can mean different things (wall vs. glass)
- **Cross-modal reasoning**: Use multiple inputs (mask + plan) to disambiguate
- **Domain concepts**: "Portal", "sightlines" are architectural terms that guide interpretation

---

### **Phase 11: Lighting Guidance**

#### Innovation: Window-Based Light Source
```typescript
"LIGHT SOURCE: All light must originate from the WINDOW positions defined in the floor plan.
If no window is present in a section of the mask, use realistic interior recessed lighting.

WINDOW TREATMENT:
- Windows should show a realistic exterior view or a soft photographic 'bloom' of natural daylight
- Primary light MUST enter through window/balcony portals"
```

#### Why This Worked
- **Prevents hallucinated windows**: Forces model to use actual window positions
- **Photographic realism**: "Bloom" is a real photography phenomenon (lens flare, overexposure)
- **Lighting logic**: If light comes through window, window must exist (mathematical constraint)
- **Secondary lighting**: Interior lights prevent dark corners when no windows present

#### Key Insight
- **Physical constraints**: Light source logic prevents architectural hallucinations
- **Photographic terminology**: "Bloom" aligns with photography training data
- **Fallback logic**: Interior lighting for windowless areas maintains realism

---

### **Phase 12: Temperature Optimization**

#### Innovation: Progressive Temperature Strategy
```typescript
// Stage 1: Structure
temperature: 0.2  // Balanced for 3D perspective while maintaining structure

// Stage 2: Style
temperature: 0.4  // Higher for realistic materials, lighting, and textures

// Main render (single-stage)
temperature: 0.2  // Balanced for overall quality
```

#### Why This Worked
- **Stage 1 (0.2)**: Enough variation for 3D perspective, but deterministic enough for structure
- **Stage 2 (0.4)**: Higher creativity for realistic material textures, lighting, reflections
- **Too low (0.0)**: Stage 1 was too deterministic, produced flat/2D-looking results
- **Too high (0.5+)**: Structure drifts, walls move, layout breaks

#### Key Insight
- **Temperature is task-specific**: Structure needs lower temp, style needs higher temp
- **Progressive increase**: Start conservative, increase for creative tasks
- **Model-dependent**: Gemini Pro Image works well at 0.2-0.4 range

---

## 🎓 Key Principles Discovered

### 1. **Positive > Negative**
- ✅ "Horizon at 50%" > ❌ "Not top-down"
- ✅ "Standing INSIDE" > ❌ "Not looking down"
- ✅ "EXTRUDE vertically" > ❌ "Don't flatten"

### 2. **Domain Terminology**
- Use architectural/photography terms the model recognizes:
  - "Load-bearing", "Zero-Tilt", "Ambient occlusion", "Clay render"
  - "Photographic bloom", "Sightlines", "Portals"

### 3. **Role Framing**
- Match role to desired output:
  - "Photographer" → eye-level views
  - "Architect" → top-down plans
  - "Visualizer" → 3D renders

### 4. **Semantic Cross-Referencing**
- Use multiple inputs to disambiguate:
  - Mask (position) + Plan (semantics) = complete understanding
  - Visual (mask) + Textual (instructions) = reinforced constraints

### 5. **Progressive Complexity**
- Start simple (structure), then complex (style)
- Lower temperature (structure), higher temperature (style)
- Separate cognitive tasks (geometry vs. materials)

### 6. **Image Order Matters**
- Last image before text gets highest attention
- Mask (structure) should be last visual context before rules

### 7. **Action-Oriented Language**
- "EXTRUDE" (3D transformation)
- "Standing INSIDE" (spatial positioning)
- "See through" (transparency)

### 8. **Physical Constraints**
- Light source logic prevents hallucinations
- Structural anchors prevent drift
- Perspective rules prevent distortion

---

## 📊 Final Architecture

### **Single-Stage Render** (`generateMultiAngleRender`)
```
Input: Floor Plan + Mask + (Optional) Reference
Role: Professional Interior Photographer
Task: 3D EXTRUSION (2D → 3D)
Temperature: 0.2
Key Features:
- Portal identification (Mask for position, Plan for semantics)
- Eye-level perspective enforcement
- Window treatment with photographic bloom
```

### **Multi-Stage Render** (`generateMultiStageRender`)
```
STAGE 1: Architectural White Model
- Input: Floor Plan + Mask
- Task: 3D PERSPECTIVE structure (Clay Render)
- Temperature: 0.2
- Output: Geometry shell with voids for windows

STAGE 2: Style Application
- Input: Stage 1 result + (Optional) Reference
- Task: Material mapping and lighting
- Temperature: 0.4
- Output: Photorealistic 3D interior
```

---

## 🔬 Why This Combination Works

1. **Role Framing** → Model thinks like a photographer (eye-level)
2. **3D Extrusion** → Forces vertical transformation (not 2D rendering)
3. **Portal Logic** → Prevents window blocking (semantic differentiation)
4. **Image Order** → Mask as last visual context (strong association)
5. **Multi-Stage** → Separates structure (deterministic) from style (creative)
6. **Temperature Progression** → 0.2 (structure) → 0.4 (materials)
7. **Lighting Guidance** → Physical constraints prevent hallucinations
8. **Domain Terminology** → Aligns with training data (architectural/photography)

---

## 🚀 Future Improvements

### Potential Enhancements
1. **Seed-based consistency**: Use seed values for `isAlreadyVisualized` re-renders
2. **Object-aware rendering**: Use detected objects to guide furniture placement
3. **Style transfer refinement**: More explicit material translation rules
4. **Perspective validation**: Post-generation check for eye-level compliance
5. **Adaptive temperature**: Adjust based on plan complexity

### Lessons for Other Services
- Apply role framing to other AI tasks
- Use domain terminology from training data
- Separate deterministic from creative tasks
- Optimize image/text ordering for attention
- Use physical constraints to prevent hallucinations

---

## 📝 Summary

The evolution from basic perspective constraints to a sophisticated multi-stage rendering system demonstrates:

1. **Iterative refinement**: Each phase solved a specific problem
2. **Domain expertise**: Architectural/photography terminology was crucial
3. **Cognitive modeling**: Understanding how models interpret instructions
4. **Multi-modal reasoning**: Combining visual (mask) and semantic (plan) inputs
5. **Progressive complexity**: Separating structure from style

The final system achieves:
- ✅ Exact structural layout preservation
- ✅ Correct eye-level perspective
- ✅ Glass portals (windows/doors) preserved
- ✅ High-quality photorealistic materials
- ✅ Realistic lighting from window positions

**Key Takeaway**: Success came from **speaking the model's language** (domain terminology) while **guiding its reasoning** (role framing, semantic differentiation) and **constraining its behavior** (physical rules, temperature control).

