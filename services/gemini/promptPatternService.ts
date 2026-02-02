import { GoogleGenAI } from '@google/genai';
import { GEMINI_CONFIG } from '../../config/gemini.config';
import { getApiKey } from '../../utils/apiUtils';
import { addLearning } from './contextCacheService';
import { IntentTranslation } from '../../types/ai.types';
import { getPresetForOperation } from '../../config/modelConfigs';

/**
 * Analyzes prompt patterns when user likes/dislikes an edit
 * Uses reasoning to understand what worked/failed, then stores in cache
 */
export async function analyzePromptPattern(
  promptUsed: string,
  operationType: string,
  wasSuccessful: boolean,
  failureReason?: 'hallucination' | 'quality' | 'style' | 'wrong_target' | 'incomplete'
): Promise<void> {
  const ai = new GoogleGenAI({ apiKey: getApiKey() });

  const analysisPrompt = wasSuccessful
    ? `Analyze this successful image edit prompt pattern:

OPERATION: ${operationType}
PROMPT USED: "${promptUsed}"

TASK: Identify the key prompt pattern elements that made this successful:
1. What specific instructions worked well?
2. What level of detail was effective?
3. What constraints or guidance helped?
4. What should be reused for similar ${operationType} operations?

OUTPUT: A concise description of the successful pattern (max 100 words).`

    : `Analyze this failed image edit prompt pattern:

OPERATION: ${operationType}
PROMPT USED: "${promptUsed}"
FAILURE REASON: ${failureReason || 'unknown'}

TASK: Identify what went wrong in the prompt:
1. What was too vague or unclear?
2. What instructions caused the failure?
3. What should be avoided for similar ${operationType} operations?
4. What would have worked better?

OUTPUT: A concise description of the failure pattern and what to avoid (max 100 words).`;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_CONFIG.MODELS.REASONING,
      contents: { parts: [{ text: analysisPrompt }] },
      config: {
        temperature: getPresetForOperation('PROMPT_PATTERN').temperature,
        maxOutputTokens: getPresetForOperation('PROMPT_PATTERN').maxOutputTokens,
      },
    });

    const analysis = response.text?.trim() || 'Pattern analysis unavailable';

    // Store in cache for future reasoning calls
    addLearning({
      type: wasSuccessful ? 'success' : (failureReason || 'quality') as 'hallucination' | 'quality' | 'style',
      operation: operationType,
      description: analysis,
    });

    console.log(`[Prompt Pattern] ${wasSuccessful ? 'Success' : 'Failure'} pattern learned for ${operationType}:`, analysis);
  } catch (error) {
    console.warn('[Prompt Pattern] Failed to analyze pattern:', error);
    // Fallback: Store basic pattern without analysis
    addLearning({
      type: wasSuccessful ? 'success' : (failureReason || 'quality') as 'hallucination' | 'quality' | 'style',
      operation: operationType,
      description: wasSuccessful 
        ? `Successful ${operationType} pattern: ${promptUsed.slice(0, 100)}`
        : `Failed ${operationType} pattern (${failureReason}): ${promptUsed.slice(0, 100)}`,
    });
  }
}

/**
 * Extract the actual prompt pattern used for an edit
 */
export function extractPromptPattern(translation: IntentTranslation, buildPrompt: () => string): string {
  // Get the full prompt that was used
  const fullPrompt = buildPrompt();
  
  // Extract key parts: operation type + proposed action + constraints
  const pattern = [
    `Operation: ${translation.operation_type}`,
    `Action: ${translation.proposed_action}`,
    `Intent: ${translation.interpreted_intent}`,
  ].join(' | ');
  
  return pattern;
}

