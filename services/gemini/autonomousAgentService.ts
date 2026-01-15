
import { GoogleGenAI } from "@google/genai";
import { DetailedRoomAnalysis, IdentifiedObject } from "../../types/spatial.types";
import { IntentTranslation } from "../../types/ai.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { getApiKey } from "../../utils/apiUtils";

export interface AutonomousConfig {
  testMode: boolean;
  maxIterations: number;
  iterationDelay: number;
  maxCost: number;
  designGoal: string;
  styleKeywords?: string[]; // NEW: e.g., ["mid-century modern", "warm tones", "minimalist"]
}

export interface AutonomousDecision {
  iteration: number;
  action: 'MOVE' | 'EDIT' | 'REMOVE' | 'WAIT';
  target: string;
  reason: string;
  prompt: string;
  confidence: number;
  estimatedCost: number;
  styleAlignment?: string; // NEW: How this aligns with the target style
}

export interface IterationAnalysis {
  iteration: number;
  timestamp: Date;
  decision: AutonomousDecision;
  
  // Quality Analysis (FREE - text-based)
  qualityScore: number; // 0-1
  success: boolean;
  
  // What worked / didn't work
  strengths: string[];
  weaknesses: string[];
  
  // Style adherence
  styleScore: number; // 0-1 (how well it matches target style)
  styleNotes: string;
  
  // Learning
  lessonLearned: string;
  betterApproach?: string;
  
  // Image (if production mode)
  imageBase64?: string;
}

export interface AgentState {
  isRunning: boolean;
  isPaused: boolean;
  currentIteration: number;
  totalCost: number;
  decisions: AutonomousDecision[];
  improvements: string[];
  errors: string[];
  currentImageBase64: string;
  
  // NEW: Analysis tracking
  analyses: IterationAnalysis[];
  overallProgress: {
    avgQuality: number;
    avgStyleScore: number;
    successRate: number;
    totalChanges: number;
  };
  
  // NEW: Learning memory
  learnedPatterns: {
    successPatterns: string[];
    failurePatterns: string[];
    styleInsights: string[];
  };
}

export class CostTracker {
  private spent = 0;
  private maxCost: number;
  
  constructor(maxCost: number) {
    this.maxCost = maxCost;
  }
  
  trackImageGeneration(): boolean {
    if (this.spent + 0.04 > this.maxCost) {
      return false;
    }
    this.spent += 0.04;
    return true;
  }
  
  getSpent(): number {
    return this.spent;
  }
}

export class AutonomousDesignAgent {
  private config: AutonomousConfig;
  private costTracker: CostTracker;
  private state: AgentState;
  private shouldStop = false;
  
  constructor(config: AutonomousConfig) {
    this.config = config;
    this.costTracker = new CostTracker(config.maxCost);
    this.state = {
      isRunning: false,
      isPaused: false,
      currentIteration: 0,
      totalCost: 0,
      decisions: [],
      improvements: [],
      errors: [],
      currentImageBase64: '',
      analyses: [],
      overallProgress: {
        avgQuality: 0,
        avgStyleScore: 0,
        successRate: 0,
        totalChanges: 0
      },
      learnedPatterns: {
        successPatterns: [],
        failurePatterns: [],
        styleInsights: []
      }
    };
  }
  
  async run(
    initialImageBase64: string,
    roomAnalysis: DetailedRoomAnalysis,
    onDecision: (decision: AutonomousDecision) => void,
    onAnalysis: (analysis: IterationAnalysis) => void,
    onProgress: (state: AgentState) => void,
    executeCommand: (imageBase64: string, userText: string, forceOverride: boolean, overrideData?: any) => Promise<string | undefined>
  ): Promise<void> {
    this.state.isRunning = true;
    this.shouldStop = false;
    this.state.currentImageBase64 = initialImageBase64;
    
    // ✅ FIX: Immediately notify UI that we're running
    onProgress(this.state);
    
    for (let i = 0; i < this.config.maxIterations; i++) {
      // ✅ Check stop BEFORE starting iteration
      if (this.shouldStop) {
        console.log('Agent stopped by user before iteration', i + 1);
        break;
      }

      if (this.state.isPaused) {
        await this.waitForResume();
        // ✅ Check again after resume
        if (this.shouldStop) break;
      }
      
      this.state.currentIteration = i + 1;
      
      // ✅ Notify UI immediately at start of iteration
      onProgress(this.state);
      
      try {
        // STEP 1: Make informed decision
        const decision = await this.makeInformedDecision(
          this.state.currentImageBase64,
          roomAnalysis,
          this.state.learnedPatterns
        );
        
        // ✅ Check stop before executing
        if (this.shouldStop) {
          console.log('Agent stopped before executing decision');
          break;
        }

        decision.iteration = i + 1;
        this.state.decisions.push(decision);
        onDecision(decision);
        
        if (decision.action === 'WAIT') {
          await this.sleep(this.config.iterationDelay * 2);
          continue;
        }
        
        // Execute Decision
        if (this.config.testMode) {
          console.log(`[TEST MODE] Would execute: ${decision.prompt}`);
          this.state.improvements.push(`[Simulated] ${decision.action} - ${decision.target}`);
          
          const analysis = await this.analyzeIteration(
              this.state.currentImageBase64, 
              decision, 
              this.config.designGoal, 
              i + 1
          );
          
          // ✅ Check stop
          if (this.shouldStop) break;

          this.state.analyses.push(analysis);
          onAnalysis(analysis);
          this.updateLearning(analysis);
          this.updateOverallProgress();

        } else {
          // PRODUCTION MODE
          if (!this.costTracker.trackImageGeneration()) {
            this.state.errors.push('Budget limit reached');
            break;
          }
          
          // ✅ Check stop before expensive operation
          if (this.shouldStop) {
            console.log('Agent stopped before image generation');
            break;
          }
          
          const newImageBase64 = await executeCommand(
            this.state.currentImageBase64,
            decision.prompt,
            true,
            {
              forceAction: this.convertDecisionToTranslation(decision),
              forceObject: { name: decision.target }
            }
          );
          
          // ✅ Check stop after generation
          if (this.shouldStop) {
            console.log('Agent stopped after image generation');
            break;
          }
          
          if (newImageBase64) {
            this.state.currentImageBase64 = newImageBase64;
            this.state.improvements.push(`${decision.action} - ${decision.target}`);
            
            // STEP 2: ANALYZE the result (FREE - text analysis)
            const analysis = await this.analyzeIteration(
              this.state.currentImageBase64,
              decision,
              this.config.designGoal,
              i + 1
            );
            
            // ✅ Check stop
            if (this.shouldStop) break;
            
            this.state.analyses.push(analysis);
            onAnalysis(analysis);
            
            // STEP 3: LEARN from the result
            this.updateLearning(analysis);
            this.updateOverallProgress();

          } else {
            this.state.errors.push(`Failed to generate for: ${decision.target}`);
            // Don't break, just continue to next iteration maybe?
          }
        }
        
        this.state.totalCost = this.costTracker.getSpent();
        
        // ✅ Update progress after each iteration
        onProgress(this.state);
        
        // ✅ Check stop before sleep
        if (this.shouldStop) break;
        
        await this.sleep(this.config.iterationDelay);
        
      } catch (error: any) {
        this.state.errors.push(error.message);
        console.error('Autonomous agent error:', error);
        
        // ✅ Check if error was due to user stopping
        if (this.shouldStop) break;
      }
    }
    
    this.state.isRunning = false;
    onProgress(this.state);
  }
  
  /**
   * Make decision informed by past learning
   */
  private async makeInformedDecision(
    currentImageBase64: string,
    roomAnalysis: DetailedRoomAnalysis,
    learnedPatterns: any
  ): Promise<AutonomousDecision> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const styleGuidance = this.config.styleKeywords?.length 
      ? `\n\nSTYLE REQUIREMENTS:\n${this.config.styleKeywords.map(k => `- ${k}`).join('\n')}`
      : '';
    
    const learningContext = `
LEARNED PATTERNS (from previous iterations):
Success Patterns: ${learnedPatterns.successPatterns.join(', ') || 'None yet'}
Failure Patterns: ${learnedPatterns.failurePatterns.join(', ') || 'None yet'}
Style Insights: ${learnedPatterns.styleInsights.join(', ') || 'None yet'}
`;

    const prompt = `You are an autonomous interior designer working on a ${this.config.designGoal} room renovation.
${styleGuidance}

CURRENT PROGRESS:
- Iteration: ${this.state.currentIteration}
- Changes Made: ${this.state.decisions.map(d => `${d.action} ${d.target}`).join(', ') || 'None'}

${learningContext}

CRITICAL INSTRUCTIONS:
1. Analyze the CURRENT image (reflects all previous changes)
2. Each change must BUILD ON previous work
3. STRICTLY follow the style requirements above
4. Use your learned patterns to make better decisions
5. If style keywords include "mid-century modern", use: 
   - Warm wood tones
   - Clean lines
   - Tapered furniture legs
   - Organic shapes
   - Earthy color palette

DECISION TYPES:
- EDIT: Change colors, materials, styles (most common for style adherence)
- MOVE: Relocate items
- REMOVE: Delete items that don't fit the style
- WAIT: Skip if good or needs settling

OUTPUT (JSON):
{
  "action": "EDIT",
  "target": "Sofa",
  "reason": "Current sofa is modern minimalist, but target is mid-century. Need warm-toned fabric with tapered legs.",
  "prompt": "Change the sofa to a mid-century modern design with warm caramel leather upholstery, tapered wooden legs, and button tufting",
  "confidence": 0.85,
  "styleAlignment": "This aligns with mid-century modern's signature warm tones and organic forms"
}

Be specific about HOW the change matches the style.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_CONFIG.MODELS.REASONING_FALLBACK,
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: currentImageBase64 } },
            { text: prompt }
          ]
        }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.7
        }
      });
      
      const decision = JSON.parse(response.text || '{}');
      
      return {
        iteration: 0,
        action: decision.action || 'WAIT',
        target: decision.target || 'Room',
        reason: decision.reason || 'Analyzing...',
        prompt: decision.prompt || 'Wait',
        confidence: decision.confidence || 0.5,
        estimatedCost: decision.action === 'WAIT' ? 0 : 0.04,
        styleAlignment: decision.styleAlignment || ''
      };
      
    } catch (error) {
      console.error('Decision failed:', error);
      return {
        iteration: 0,
        action: 'WAIT',
        target: 'System',
        reason: 'Error',
        prompt: 'Wait',
        confidence: 0,
        estimatedCost: 0
      };
    }
  }
  
  /**
   * Analyze iteration result (FREE - uses text model)
   */
  private async analyzeIteration(
    imageBase64: string,
    decision: AutonomousDecision,
    targetStyle: string,
    iteration: number
  ): Promise<IterationAnalysis> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    const styleKeywords = this.config.styleKeywords?.join(', ') || targetStyle;
    
    const prompt = `You are a QUALITY ANALYST evaluating an AI designer's work.

WHAT WAS ATTEMPTED:
- Action: ${decision.action}
- Target: ${decision.target}
- Reasoning: ${decision.reason}
- Style Goal: ${styleKeywords}

TASK: Analyze this result critically and provide learning feedback.

EVALUATION CRITERIA:
1. Quality Score (0-100): Visual realism, no artifacts
2. Style Score (0-100): How well it matches "${styleKeywords}"
3. Success: true/false
4. Strengths: What worked well (2-3 points)
5. Weaknesses: What didn't work (1-2 points)
6. Style Notes: Specific observations about style adherence
7. Lesson: What should be learned from this iteration
8. Better Approach: If it failed, what should have been done instead

For style scoring:
- If target is "mid-century modern", check for: warm woods, organic shapes, tapered legs, earthy colors
- If target is "minimalist", check for: clean lines, neutral palette, uncluttered
- If target is "industrial", check for: exposed materials, metal, concrete, brick

OUTPUT (JSON):
{
  "qualityScore": 75,
  "styleScore": 80,
  "success": true,
  "strengths": ["Realistic texture application", "Color matches style palette"],
  "weaknesses": ["Minor edge artifact"],
  "styleNotes": "Successfully incorporated mid-century warm wood tones and organic shapes",
  "lessonLearned": "Warm tones work well for mid-century aesthetic",
  "betterApproach": null
}

Be honest and specific.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_CONFIG.MODELS.REASONING_FALLBACK,
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: prompt }
          ]
        }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.3
        }
      });
      
      const result = JSON.parse(response.text || '{}');
      
      return {
        iteration,
        timestamp: new Date(),
        decision,
        qualityScore: result.qualityScore / 100,
        styleScore: result.styleScore / 100,
        success: result.success || false,
        strengths: result.strengths || [],
        weaknesses: result.weaknesses || [],
        styleNotes: result.styleNotes || '',
        lessonLearned: result.lessonLearned || '',
        betterApproach: result.betterApproach,
        imageBase64: this.config.testMode ? undefined : imageBase64
      };
      
    } catch (error) {
      console.error('Analysis failed:', error);
      return {
        iteration,
        timestamp: new Date(),
        decision,
        qualityScore: 0.5,
        styleScore: 0.5,
        success: false,
        strengths: [],
        weaknesses: ['Analysis failed'],
        styleNotes: '',
        lessonLearned: 'Analysis error occurred'
      };
    }
  }
  
  /**
   * Update learning patterns based on new analysis
   */
  private updateLearning(analysis: IterationAnalysis): void {
    if (analysis.success && analysis.qualityScore > 0.7) {
      // This was a good decision - remember it
      const pattern = `${analysis.decision.action} ${analysis.decision.target}: ${analysis.lessonLearned}`;
      if (!this.state.learnedPatterns.successPatterns.includes(pattern)) {
        this.state.learnedPatterns.successPatterns.push(pattern);
      }
    } else {
      // This failed - remember to avoid it
      const pattern = `Avoid: ${analysis.decision.action} ${analysis.decision.target} - ${analysis.weaknesses.join(', ')}`;
      if (!this.state.learnedPatterns.failurePatterns.includes(pattern)) {
        this.state.learnedPatterns.failurePatterns.push(pattern);
      }
    }
    
    // Learn style insights
    if (analysis.styleScore > 0.7 && analysis.styleNotes) {
      if (!this.state.learnedPatterns.styleInsights.includes(analysis.styleNotes)) {
        this.state.learnedPatterns.styleInsights.push(analysis.styleNotes);
      }
    }
  }
  
  /**
   * Update overall statistics
   */
  private updateOverallProgress(): void {
    const total = this.state.analyses.length;
    if (total === 0) return;
    
    const avgQuality = this.state.analyses.reduce((sum, a) => sum + a.qualityScore, 0) / total;
    const avgStyle = this.state.analyses.reduce((sum, a) => sum + a.styleScore, 0) / total;
    const successes = this.state.analyses.filter(a => a.success).length;
    
    this.state.overallProgress = {
      avgQuality,
      avgStyleScore: avgStyle,
      successRate: successes / total,
      totalChanges: this.state.improvements.length
    };
  }
  
  /**
   * Export complete analysis report
   */
  exportAnalysisReport(): string {
    const report = {
      metadata: {
        designGoal: this.config.designGoal,
        styleKeywords: this.config.styleKeywords,
        totalIterations: this.state.analyses.length,
        totalCost: this.state.totalCost,
        testMode: this.config.testMode,
        completedAt: new Date().toISOString()
      },
      overallProgress: this.state.overallProgress,
      learnedPatterns: this.state.learnedPatterns,
      iterationDetails: this.state.analyses.map(a => ({
        iteration: a.iteration,
        timestamp: a.timestamp,
        action: `${a.decision.action} - ${a.decision.target}`,
        reason: a.decision.reason,
        qualityScore: `${(a.qualityScore * 100).toFixed(0)}%`,
        styleScore: `${(a.styleScore * 100).toFixed(0)}%`,
        success: a.success,
        strengths: a.strengths,
        weaknesses: a.weaknesses,
        styleNotes: a.styleNotes,
        lessonLearned: a.lessonLearned
      }))
    };
    
    return JSON.stringify(report, null, 2);
  }
  
  /**
   * Export all generated images (production mode only)
   */
  exportImages(): { iteration: number; base64: string }[] {
    return this.state.analyses
      .filter(a => a.imageBase64)
      .map(a => ({
        iteration: a.iteration,
        base64: a.imageBase64!
      }));
  }
  
  private convertDecisionToTranslation(decision: AutonomousDecision): IntentTranslation {
    return {
      operation_type: decision.action === 'WAIT' ? 'EDIT' : decision.action,
      interpreted_intent: decision.reason,
      proposed_action: decision.prompt,
      active_subject_name: decision.target,
      spatial_check_required: false,
      imagen_prompt: decision.prompt,
      validation: { valid: true, warnings: [] }
    };
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  private async waitForResume(): Promise<void> {
    while (this.state.isPaused) {
      if (this.shouldStop) break;
      await this.sleep(1000);
    }
  }
  
  pause(): void {
    this.state.isPaused = true;
  }
  
  resume(): void {
    this.state.isPaused = false;
  }
  
  stop(): void {
    this.shouldStop = true;
    this.state.isRunning = false;
    // Resume if paused so loop can exit
    if (this.state.isPaused) {
        this.state.isPaused = false;
    }
  }
  
  getState(): AgentState {
    return { ...this.state };
  }
}
