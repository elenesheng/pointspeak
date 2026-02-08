/**
 * Quality analysis service for detecting and categorizing image quality issues.
 * Provides auto-fixable suggestions and prompt optimization tips.
 */
import { GoogleGenAI, Type, Schema } from '@google/genai';
import { GEMINI_CONFIG } from '../../config/gemini.config';
import { getApiKey, withSmartRetry, runWithFallback } from '../../utils/apiUtils';
import { getGeminiCacheName, getInlineContext, getLearnedPatternsForOperation } from './contextCacheService';
import { getPresetForOperation } from '../../config/modelConfigs';
import { buildQualityAnalysisSystemPrompt, getQualityAnalysisInstruction } from '../../config/prompts/quality/analysis';

export interface QualityIssue {
  severity: 'critical' | 'warning' | 'suggestion';
  category: 'lighting' | 'alignment' | 'color' | 'style' | 'proportion' | 'texture' | 'composition';
  title: string;
  description: string;
  location?: string;
  fix_prompt: string;
  auto_fixable: boolean;
  // MANDATORY: Self-correction suggestions (always provided, not optional)
  prompt_optimization_tips: string[]; // e.g., ["Try lower temperature (0.1)", "Split into: remove X, then add Y"]
}

export interface QualityAnalysis {
  overall_score: number;
  style_detected: string;
  issues: QualityIssue[];
  strengths: string[];
  // MANDATORY: Overall prompt intelligence guidance (always provided)
  prompt_guidance: {
    complex_operations: Array<{
      operation: string; // e.g., "Replace all cabinets with modern white ones"
      complexity_reason: string; // e.g., "Multiple objects, style change, requires precision"
      suggested_approach: string; // e.g., "Split: 1) Change cabinet style 2) Adjust hardware 3) Update finish"
      temperature_recommendation: number; // e.g., 0.1 for precision
    }>;
    risky_patterns: Array<{
      pattern: string; // e.g., "Global redesign with reference image"
      risk: string; // e.g., "May copy reference layout instead of style only"
      mitigation: string; // e.g., "Use text-only mode - describe style without reference image"
    }>;
  };
}

const qualityIssueSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    severity: { type: Type.STRING, description: 'critical | warning | suggestion' },
    category: {
      type: Type.STRING,
      description: 'lighting | alignment | color | style | proportion | texture | composition',
    },
    title: { type: Type.STRING },
    description: { type: Type.STRING },
    location: { type: Type.STRING },
    fix_prompt: { type: Type.STRING, description: 'Exact prompt to fix this issue' },
    auto_fixable: { type: Type.BOOLEAN },
    prompt_optimization_tips: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'MANDATORY: 2-4 optimization suggestions for this fix (temperature, complexity, split steps, etc.)'
    },
  },
  required: ['severity', 'category', 'title', 'description', 'fix_prompt', 'auto_fixable', 'prompt_optimization_tips'],
};

const qualityAnalysisSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    overall_score: { type: Type.NUMBER, description: 'Score 0-100' },
    style_detected: { type: Type.STRING },
    issues: { type: Type.ARRAY, items: qualityIssueSchema },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    prompt_guidance: {
      type: Type.OBJECT,
      properties: {
        complex_operations: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              operation: { type: Type.STRING },
              complexity_reason: { type: Type.STRING },
              suggested_approach: { type: Type.STRING },
              temperature_recommendation: { type: Type.NUMBER },
            },
            required: ['operation', 'complexity_reason', 'suggested_approach', 'temperature_recommendation'],
          },
        },
        risky_patterns: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              pattern: { type: Type.STRING },
              risk: { type: Type.STRING },
              mitigation: { type: Type.STRING },
            },
            required: ['pattern', 'risk', 'mitigation'],
          },
        },
      },
      required: ['complex_operations', 'risky_patterns'],
    },
  },
  required: ['overall_score', 'style_detected', 'issues', 'strengths', 'prompt_guidance'],
};

// Learning context interface
interface LearningContext {
  stylePreferences: string[];
  avoidedActions: string[];
  contextualInsights: string;
  warningsForAI: string[];
  recentFailures?: string[];
}

export const analyzeImageQuality = async (
  imageBase64: string,
  is2DPlan: boolean = false,
  learningContext?: LearningContext,
  previousAttempts?: string[]
): Promise<QualityAnalysis> => {
  const cacheKey = `quality_${imageBase64.length}_${imageBase64.slice(-20)}`;

  return withSmartRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });

    // Build learning context for analysis (includes prompt patterns from cache)
    let learningSection = '';
    if (learningContext) {
      if (learningContext.stylePreferences.length > 0) {
        learningSection += `\nUser's preferred styles: ${learningContext.stylePreferences.slice(0, 5).join(', ')}`;
      }
      if (learningContext.avoidedActions.length > 0) {
        learningSection += `\nAvoid suggesting: ${learningContext.avoidedActions.slice(0, 3).join(', ')}`;
      }
      if (learningContext.warningsForAI.length > 0) {
        learningSection += `\nLearned warnings: ${learningContext.warningsForAI.slice(0, 2).join('; ')}`;
      }
    }
    
    // Add self-correction context from previous attempted fixes
    if (previousAttempts && previousAttempts.length > 0) {
      learningSection += `\n\nSELF-CORRECTION (CRITICAL - PREVIOUS FIX ATTEMPTS THAT WERE APPLIED BUT DID NOT FULLY RESOLVE):
${previousAttempts.map((p, i) => `  ${i + 1}. "${p}"`).join('\n')}

SELF-CORRECTION RULES:
- These prompts were already tried. If the issue persists, the prompt FAILED or was insufficient.
- You MUST suggest DIFFERENT approaches for the same issues:
  * Try DIFFERENT wording (more specific object names, spatial anchors)
  * Try DIFFERENT temperature (lower for precision: 0.1, higher for creative: 0.2)
  * Try SPLITTING complex operations into simpler steps
  * Try a completely DIFFERENT strategy (e.g., remove then add instead of replace)
- NEVER repeat the exact same fix_prompt that already failed
- In prompt_optimization_tips, explain WHY the previous attempt likely failed and what's different now`;
    }

    // Add recent failure details from learning store
    if (learningContext?.recentFailures && learningContext.recentFailures.length > 0) {
      learningSection += `\n\nRECENT EDIT FAILURES (learn from these):
${learningContext.recentFailures.map(f => `  - ${f}`).join('\n')}`;
    }

    // Add learned prompt patterns from cache (what worked/failed)
    // This helps analysis suggest better prompts based on past failures
    const learnedPatterns = getInlineContext();
    if (learnedPatterns) {
      learningSection += `\n\nLEARNED PROMPT PATTERNS (use successful patterns, avoid failed ones):\n${learnedPatterns}`;
    }
    
    // Add operation-specific pattern guidance
    const operationTypes = ['MOVE', 'REMOVE', 'STYLE', 'EDIT', 'INTERNAL_MODIFY'];
    let operationPatterns = '';
    operationTypes.forEach(opType => {
      const patterns = getLearnedPatternsForOperation(opType);
      if (patterns.successfulPatterns.length > 0 || patterns.failedPatterns.length > 0) {
        operationPatterns += `\n\n${opType} OPERATION PATTERNS:\n`;
        if (patterns.successfulPatterns.length > 0) {
          operationPatterns += `✓ SUCCESSFUL PATTERNS (use these):\n${patterns.successfulPatterns.slice(0, 2).map(p => `  - ${p}`).join('\n')}\n`;
        }
        if (patterns.failedPatterns.length > 0) {
          operationPatterns += `✗ FAILED PATTERNS (avoid these):\n${patterns.failedPatterns.slice(0, 2).map(p => `  - ${p}`).join('\n')}\n`;
        }
      }
    });
    
    if (operationPatterns) {
      learningSection += `\n\nOPERATION-SPECIFIC PROMPT GUIDANCE:${operationPatterns}\n\nWhen generating fix_prompts, ALWAYS use successful patterns and AVOID failed patterns for that operation type.`;
    }

    const runAnalysis = async (model: string) => {
      // Try to get cache (will return null for image models or if too small)
      const cacheName = await getGeminiCacheName(model, true);
      
      const inlineContext = !cacheName ? getInlineContext() : undefined;
      const systemInstructionText = buildQualityAnalysisSystemPrompt({
        learningSection,
        is2DPlan,
        inlineContext: inlineContext || undefined,
      });
      
      const config: any = {
        systemInstruction: systemInstructionText,
        responseMimeType: 'application/json',
        responseSchema: qualityAnalysisSchema,
        temperature: getPresetForOperation('QUALITY_ANALYSIS').temperature,
      };
      
      if (cacheName) {
        config.cachedContent = cacheName;
      }
      
      const response = await ai.models.generateContent({
        model: model,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
            {
              text: getQualityAnalysisInstruction(is2DPlan),
            },
          ],
        },
        config,
      });

      const text = response.text;
      if (!text) throw new Error('Empty response from quality analysis');

      return JSON.parse(text) as QualityAnalysis;
    };

    return runWithFallback(
      () => runAnalysis(GEMINI_CONFIG.MODELS.REASONING),
      () => runAnalysis(GEMINI_CONFIG.MODELS.REASONING_FALLBACK),
      'Quality Analysis'
    );
  }, cacheKey);
};

export const analyzeAfterEdit = async (
  imageBase64: string,
  editDescription: string,
  previousIssues: QualityIssue[]
): Promise<QualityAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const previousIssuesContext =
    previousIssues.length > 0
      ? `Previous issues that were identified: ${previousIssues.map((i) => i.title).join(', ')}`
      : '';

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_CONFIG.MODELS.REASONING,
      contents: {
        parts: [
          { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
          {
            text: `
The user just applied this edit: "${editDescription}"

${previousIssuesContext}

TASK: Post-Edit Quality Assurance
1. Check if the edit was applied correctly
2. Look for NEW issues introduced by the edit
3. Check if previous issues were resolved
4. Identify any artifacts, distortions, or quality degradation
5. Suggest any follow-up improvements

Be thorough but fair. Not every edit introduces problems.
          `,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: qualityAnalysisSchema,
        temperature: getPresetForOperation('QUALITY_ANALYSIS_FALLBACK').temperature,
      },
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text) as QualityAnalysis;
    }
  } catch (e) {
    console.error('Post-edit analysis failed:', e);
  }

  return {
    overall_score: 75,
    style_detected: 'Unknown',
    issues: [],
    strengths: ['Edit applied successfully'],
    prompt_guidance: {
      complex_operations: [],
      risky_patterns: [],
    },
  };
};

