
import { GoogleGenAI } from "@google/genai";
import { DetailedRoomAnalysis, IdentifiedObject } from "../../types/spatial.types";
import { IntentTranslation } from "../../types/ai.types";
import { GEMINI_CONFIG } from "../../config/gemini.config";
import { PROMPT_VERSIONS, AUTONOMOUS_PROMPTS } from "../../config/prompts.config";
import { getApiKey } from "../../utils/apiUtils";
import { scanImageForObjects } from "./objectDetectionService";
import { validateSpatialChange } from "./validationService";

export interface AutonomousConfig {
  testMode: boolean;
  maxIterations: number;
  iterationDelay: number;
  maxCost: number;
  designGoal: string;
  styleKeywords?: string[];
}

export interface AutonomousDecision {
  iteration: number;
  action: 'MOVE' | 'EDIT' | 'REMOVE' | 'WAIT';
  target: string;
  reason: string;
  prompt: string;
  confidence: number;
  estimatedCost: number;
  styleAlignment?: string;
}

export interface IterationAnalysis {
  iteration: number;
  timestamp: Date;
  decision: AutonomousDecision;
  qualityScore: number; // 0-1
  success: boolean;
  strengths: string[];
  weaknesses: string[];
  styleScore: number; // 0-1
  styleNotes: string;
  lessonLearned: string;
  betterApproach?: string;
  imageBase64?: string;
}

// New Structured Memory
export interface Pattern {
  id: string;
  content: string;
  score: number; // 0 to 1 confidence
  frequency: number;
  lastIteration: number;
}

export interface LearnedPatterns {
  execution: Pattern[]; // What actions work/fail
  style: Pattern[];     // What aesthetic choices work/fail
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
  analyses: IterationAnalysis[];
  overallProgress: {
    avgQuality: number;
    avgStyleScore: number;
    successRate: number;
    totalChanges: number;
  };
  learnedPatterns: LearnedPatterns;
  // PERCEPTION STATE
  detectedObjects: IdentifiedObject[];
}

export class CostTracker {
  private spent = 0;
  private maxCost: number;
  constructor(maxCost: number) { this.maxCost = maxCost; }
  trackImageGeneration(): boolean {
    if (this.spent + 0.04 > this.maxCost) return false;
    this.spent += 0.04;
    return true;
  }
  getSpent(): number { return this.spent; }
}

export class AutonomousDesignAgent {
  private config: AutonomousConfig;
  private costTracker: CostTracker;
  private state: AgentState;
  private shouldStop = false;
  
  // Memory Settings
  private readonly MEMORY_CAP = 15;
  private readonly MEMORY_DECAY = 0.7; // Old score weight
  private readonly NEW_INFO_WEIGHT = 0.3; // New score weight
  private readonly SUMMARIZE_INTERVAL = 5;

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
      overallProgress: { avgQuality: 0, avgStyleScore: 0, successRate: 0, totalChanges: 0 },
      learnedPatterns: { execution: [], style: [] },
      detectedObjects: []
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
    
    // --- PHASE 0: INITIAL PERCEPTION ---
    if (this.state.detectedObjects.length === 0) {
       console.log("👁️ Agent initializing perception...");
       this.state.detectedObjects = await scanImageForObjects(initialImageBase64);
    }
    
    onProgress(this.state);
    
    for (let i = 0; i < this.config.maxIterations; i++) {
      if (this.shouldStop) break;
      if (this.state.isPaused) await this.waitForResume();
      if (this.shouldStop) break;
      
      this.state.currentIteration = i + 1;
      onProgress(this.state);
      
      try {
        // --- MEMORY CONSOLIDATION ---
        if (i > 0 && i % this.SUMMARIZE_INTERVAL === 0) {
           await this.summarizeMemories();
           onProgress(this.state);
        }

        // --- PHASE 1: DECISION (with Perception Awareness) ---
        const decision = await this.makeInformedDecision(
          this.state.currentImageBase64,
          this.state.learnedPatterns,
          this.state.detectedObjects
        );
        
        if (this.shouldStop) break;
        decision.iteration = i + 1;
        this.state.decisions.push(decision);
        onDecision(decision);
        
        if (decision.action === 'WAIT') {
          await this.sleep(this.config.iterationDelay);
          continue;
        }

        // --- PHASE 2: PRE-FLIGHT VALIDATION (New) ---
        // 2a. Object Existence Check
        const targetExists = this.state.detectedObjects.some(obj => 
           obj.name.toLowerCase().includes(decision.target.toLowerCase()) || 
           decision.target.toLowerCase().includes(obj.name.toLowerCase()) ||
           decision.target.toLowerCase() === 'room'
        );

        if (!targetExists && decision.action !== 'EDIT') { // EDIT might mean global style
           console.warn(`[Validation] Target '${decision.target}' not found in perception. Skipping.`);
           this.handleValidationFailure(decision, `Target '${decision.target}' does not exist.`, onAnalysis);
           continue; 
        }

        // 2b. Spatial Constraints Check
        if (!this.config.testMode) {
           const translation = this.convertDecisionToTranslation(decision);
           const validation = await validateSpatialChange(translation, roomAnalysis);
           
           if (!validation.valid) {
              const reason = validation.warnings.join(', ');
              console.warn(`[Validation] Action blocked: ${reason}`);
              this.handleValidationFailure(decision, `Blocked by Physics: ${reason}`, onAnalysis);
              continue; // Skip execution
           }
        }
        
        // --- PHASE 3: EXECUTION ---
        let resultImageBase64 = this.state.currentImageBase64;
        
        if (this.config.testMode) {
          console.log(`[TEST] Executing: ${decision.prompt}`);
          this.state.improvements.push(`[Test] ${decision.action} ${decision.target}`);
          await this.sleep(1000); 
        } else {
          if (!this.costTracker.trackImageGeneration()) {
            this.state.errors.push('Budget limit reached');
            break;
          }
          if (this.shouldStop) break;
          
          const result = await executeCommand(
            this.state.currentImageBase64,
            decision.prompt,
            true,
            {
              forceAction: this.convertDecisionToTranslation(decision),
              forceObject: { name: decision.target }
            }
          );
          
          if (result) {
            resultImageBase64 = result;
            this.state.currentImageBase64 = result;
            this.state.improvements.push(`${decision.action} - ${decision.target}`);
            
            // --- PHASE 3.5: PERCEPTION UPDATE ---
            // Update the agent's internal model of the world after change
            console.log("👁️ Agent updating perception...");
            this.state.detectedObjects = await scanImageForObjects(resultImageBase64);

          } else {
            this.state.errors.push(`Generation failed: ${decision.target}`);
            continue;
          }
        }
        
        if (this.shouldStop) break;

        // --- PHASE 4: ANALYSIS & ASYMMETRIC SCORING ---
        const analysis = await this.analyzeIteration(
          resultImageBase64,
          decision,
          this.config.designGoal,
          i + 1
        );

        // Asymmetric Scoring Logic
        const prevStyleScore = this.state.overallProgress.avgStyleScore || 0;
        let effectiveConfidence = analysis.qualityScore;
        
        if (analysis.success && analysis.styleScore < prevStyleScore - 0.1) {
            console.warn(`[Agent] Quality good, but Style dropped. Penalizing.`);
            effectiveConfidence *= 0.5; 
            analysis.success = false; 
            analysis.lessonLearned += " (Note: Visuals good, but hurt style goal)";
        }

        this.state.analyses.push(analysis);
        onAnalysis(analysis);
        
        // --- PHASE 5: LEARNING ---
        this.updateLearning(analysis, effectiveConfidence);
        this.updateOverallProgress();
        this.state.totalCost = this.costTracker.getSpent();
        
        onProgress(this.state);
        
        if (this.shouldStop) break;
        await this.sleep(this.config.iterationDelay);
        
      } catch (error: any) {
        this.state.errors.push(error.message);
        if (this.shouldStop) break;
      }
    }
    
    this.state.isRunning = false;
    onProgress(this.state);
  }

  private handleValidationFailure(
      decision: AutonomousDecision, 
      reason: string,
      onAnalysis: (analysis: IterationAnalysis) => void
  ) {
      // Create a "Failed" analysis without running the expensive Critic model
      const failureAnalysis: IterationAnalysis = {
          iteration: this.state.currentIteration,
          timestamp: new Date(),
          decision,
          qualityScore: 0,
          styleScore: 0,
          success: false,
          strengths: [],
          weaknesses: [reason],
          styleNotes: "N/A",
          lessonLearned: `Avoid ${decision.action} on ${decision.target}: ${reason}`,
          betterApproach: "Check constraints before acting."
      };
      
      this.state.analyses.push(failureAnalysis);
      onAnalysis(failureAnalysis);
      this.updateLearning(failureAnalysis, 0.8); // High confidence in the constraint
      this.updateOverallProgress();
  }
  
  private async makeInformedDecision(
    currentImageBase64: string,
    learnedPatterns: LearnedPatterns,
    detectedObjects: IdentifiedObject[]
  ): Promise<AutonomousDecision> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    
    // Format Memory for Prompt
    const topExecution = learnedPatterns.execution
      .filter(p => p.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(p => `- ${p.content} (Conf: ${(p.score*100).toFixed(0)}%)`)
      .join('\n');

    const topStyle = learnedPatterns.style
      .filter(p => p.score > 0.4)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(p => `- ${p.content} (Conf: ${(p.score*100).toFixed(0)}%)`)
      .join('\n');

    // Format Perception for Prompt
    const visibleObjectsStr = detectedObjects
      .slice(0, 15) // Limit to avoid token overflow
      .map(o => `- ${o.name} (${o.category})`)
      .join('\n');

    const learningContext = `
      EXECUTION RULES (What works):
      ${topExecution || "None yet."}

      STYLE RULES (Aesthetic guide):
      ${topStyle || "None yet."}
    `;

    const recentChanges = this.state.decisions.slice(-3).map(d => d.action + ' ' + d.target).join(', ');
    const styleGuidance = this.config.styleKeywords ? `Keywords: ${this.config.styleKeywords.join(', ')}` : '';

    const promptText = AUTONOMOUS_PROMPTS.DECISION_MAKING(
        this.config.designGoal,
        styleGuidance,
        this.state.currentIteration,
        recentChanges,
        visibleObjectsStr || "None detected",
        learningContext
    );

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_CONFIG.MODELS.REASONING_FALLBACK,
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: currentImageBase64 } },
            { text: AUTONOMOUS_PROMPTS.SYSTEM_IDENTITY + "\n" + promptText }
          ]
        }],
        config: { responseMimeType: 'application/json', temperature: 0.7 }
      });
      
      const decision = JSON.parse(response.text || '{}');
      
      return {
        iteration: 0,
        action: decision.action || 'WAIT',
        target: decision.target || 'Room',
        reason: decision.reason || 'Thinking...',
        prompt: decision.prompt || 'Wait',
        confidence: decision.confidence || 0.5,
        estimatedCost: 0.04,
        styleAlignment: decision.styleAlignment
      };
    } catch (error) {
      console.error('Decision failed:', error);
      return { iteration: 0, action: 'WAIT', target: 'Error', reason: 'Failed to decide', prompt: '', confidence: 0, estimatedCost: 0 };
    }
  }
  
  private async analyzeIteration(
    imageBase64: string,
    decision: AutonomousDecision,
    targetStyle: string,
    iteration: number
  ): Promise<IterationAnalysis> {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const styleKeywords = this.config.styleKeywords?.join(', ') || targetStyle;
    
    const promptText = AUTONOMOUS_PROMPTS.ANALYSIS_CRITIC(styleKeywords, `${decision.action} ${decision.target}`);

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_CONFIG.MODELS.REASONING_FALLBACK,
        contents: [{
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            { text: promptText }
          ]
        }],
        config: { responseMimeType: 'application/json', temperature: 0.2 }
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
      return {
        iteration, timestamp: new Date(), decision,
        qualityScore: 0, styleScore: 0, success: false,
        strengths: [], weaknesses: ['Analysis Failed'], styleNotes: '', lessonLearned: ''
      };
    }
  }

  // --- MEMORY MANAGEMENT ---

  private updateLearning(analysis: IterationAnalysis, effectiveConfidence: number): void {
    // 1. Create or Update Execution Pattern
    const execContent = analysis.success 
       ? `${analysis.decision.action} on ${analysis.decision.target} works well.`
       : `Avoid ${analysis.decision.action} on ${analysis.decision.target}: ${analysis.weaknesses[0] || 'failed'}`;
    
    this.addOrUpdatePattern('execution', execContent, effectiveConfidence);

    // 2. Create or Update Style Pattern
    if (analysis.lessonLearned) {
       this.addOrUpdatePattern('style', analysis.lessonLearned, effectiveConfidence);
    }
  }

  private addOrUpdatePattern(type: 'execution' | 'style', content: string, score: number) {
    const list = this.state.learnedPatterns[type];
    
    // Simple deduplication based on content similarity
    const existingIndex = list.findIndex(p => p.content === content);

    if (existingIndex >= 0) {
      // Decay old score, boost with new score
      const old = list[existingIndex];
      old.score = (old.score * this.MEMORY_DECAY) + (score * this.NEW_INFO_WEIGHT);
      old.frequency++;
      old.lastIteration = this.state.currentIteration;
    } else {
      // Add new
      list.push({
        id: Math.random().toString(36).substr(2, 9),
        content,
        score,
        frequency: 1,
        lastIteration: this.state.currentIteration
      });
    }

    // Sort and Cap immediately to keep memory clean
    list.sort((a, b) => b.score - a.score);
    if (list.length > this.MEMORY_CAP) {
      list.length = this.MEMORY_CAP; // Hard crop low scores
    }
  }

  private async summarizeMemories() {
    console.log("🧠 Dreaming/Consolidating Memories...");
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    // Consolidate Style Patterns
    const styleRaw = this.state.learnedPatterns.style.map(p => p.content).join('\n');
    if (styleRaw.length > 50) {
        try {
            const prompt = AUTONOMOUS_PROMPTS.PATTERN_SUMMARIZATION(styleRaw);
            const res = await ai.models.generateContent({
                model: GEMINI_CONFIG.MODELS.REASONING_FALLBACK,
                contents: [{ text: prompt }],
                config: { responseMimeType: 'application/json' }
            });
            const newRules: string[] = JSON.parse(res.text || '[]');
            
            // Replace old patterns with consolidated high-confidence ones
            this.state.learnedPatterns.style = newRules.map(rule => ({
                id: Math.random().toString(36).substr(2, 9),
                content: rule,
                score: 0.95, // High confidence for distilled wisdom
                frequency: 1,
                lastIteration: this.state.currentIteration
            }));
            
            this.state.improvements.push(`🧠 Consolidated ${styleRaw.split('\n').length} style observations into ${newRules.length} core rules.`);
        } catch (e) {
            console.warn("Memory consolidation failed", e);
        }
    }
  }

  // --- UTILS ---

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
  
  exportAnalysisReport(): string {
    return JSON.stringify({
      metadata: { ...this.config, timestamp: new Date() },
      memory: this.state.learnedPatterns,
      history: this.state.analyses
    }, null, 2);
  }
  
  exportImages(): { iteration: number; base64: string }[] {
    return this.state.analyses.filter(a => a.imageBase64).map(a => ({
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
      spatial_check_required: true, // Enable strict checks
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
  
  pause(): void { this.state.isPaused = true; }
  resume(): void { this.state.isPaused = false; }
  
  stop(): void {
    this.shouldStop = true;
    this.state.isRunning = false;
    if (this.state.isPaused) this.state.isPaused = false;
  }
  
  getState(): AgentState { return { ...this.state }; }
}
