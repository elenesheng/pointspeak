import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DesignSuggestion } from '../types/ai.types';
import { addLearning, invalidateCache, clearLearnings as clearCacheLearnings } from '../services/gemini/contextCacheService';

export type FailureReason =
  | 'hallucination' // AI invented/changed things it shouldn't
  | 'quality' // Output quality is poor (blurry, artifacts)
  | 'style_mismatch' // Doesn't match desired style
  | 'wrong_target' // Changed wrong object
  | 'incomplete' // Didn't fully complete the task
  | 'other';

export interface UserPreference {
  style: string;
  confidence: number;
  examples: number;
  lastUsed: number;
}

export interface FailurePattern {
  action: string;
  reason: FailureReason;
  timestamp: number;
  context: string;
  operationType?: string; // REMOVE, EDIT, STYLE, etc.
  extractedKeywords: string[];
}

export interface EditFeedback {
  editDescription: string;
  wasLiked: boolean;
  wasApplied: boolean;
  timestamp: number;
  roomType: string;
  extractedStyles: string[];
  failureReason?: FailureReason;
}

export interface LearnedPattern {
  likedStyles: string[];
  dislikedStyles: string[];
  preferredColors: string[];
  preferredMaterials: string[];
  avoidedActions: string[];
  successfulPatterns: string[];
  failures: FailurePattern[];
  userPreferences: Record<string, UserPreference>;
  editHistory: EditFeedback[];
  totalLikes: number;
  totalDislikes: number;
  // Track failure reasons for smarter learning
  hallucinationCount: number;
  qualityIssueCount: number;
  styleMismatchCount: number;
}

interface LearningState {
  patterns: LearnedPattern;

  // Actions
  recordLike: (suggestion: DesignSuggestion, context: string) => void;
  recordDislike: (suggestion: DesignSuggestion, reason?: string) => void;
  recordFailure: (action: string, reason: FailureReason, context: string) => void;
  recordSuccess: (action: string, context: string) => void;
  recordEditApplied: (editDescription: string, roomType: string) => void;
  recordEditDisliked: (editDescription: string, reason: FailureReason, roomType: string) => void;
  getStylePreferences: () => string[];
  getAvoidedActions: () => string[];
  getContextualInsights: (roomType: string, is2D: boolean) => string;
  getLearningContext: (operationType?: string) => {
    stylePreferences: string[];
    avoidedActions: string[];
    contextualInsights: string;
    warningsForAI: string[];
  };
  getPreferenceScore: (style: string) => number;
  getFailureStats: () => { hallucinations: number; quality: number; style: number; total: number };
  clearSessionData: () => void; // Clear session-specific data when image is removed
}

const initialPatterns: LearnedPattern = {
  likedStyles: [],
  dislikedStyles: [],
  preferredColors: [],
  preferredMaterials: [],
  avoidedActions: [],
  successfulPatterns: [],
  failures: [],
  userPreferences: {},
  editHistory: [],
  totalLikes: 0,
  totalDislikes: 0,
  hallucinationCount: 0,
  qualityIssueCount: 0,
  styleMismatchCount: 0,
};

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      patterns: initialPatterns,

      recordLike: (suggestion, context) => {
        set((state) => {
          const patterns = { ...state.patterns };

          // Extract style keywords from suggestion
          const styleKeywords = extractStyleKeywords(suggestion);
          styleKeywords.forEach((style) => {
            if (!patterns.likedStyles.includes(style)) {
              patterns.likedStyles.push(style);
            }
            // Remove from disliked if present
            const dislikedIndex = patterns.dislikedStyles.indexOf(style);
            if (dislikedIndex > -1) {
              patterns.dislikedStyles.splice(dislikedIndex, 1);
            }
          });

          // Record successful pattern
          if (!patterns.successfulPatterns.includes(suggestion.suggested_prompt)) {
            patterns.successfulPatterns.push(suggestion.suggested_prompt);
          }

          // Update user preferences
          const prefKey = `${context}_${suggestion.action_type}`;
          if (!patterns.userPreferences[prefKey]) {
            patterns.userPreferences[prefKey] = {
              style: suggestion.title,
              confidence: 0.6,
              examples: 1,
              lastUsed: Date.now(),
            };
          } else {
            patterns.userPreferences[prefKey].confidence = Math.min(
              1.0,
              patterns.userPreferences[prefKey].confidence + 0.15
            );
            patterns.userPreferences[prefKey].examples += 1;
            patterns.userPreferences[prefKey].lastUsed = Date.now();
          }

          patterns.totalLikes += 1;

          return { patterns };
        });
      },

      recordDislike: (suggestion, reason) => {
        set((state) => {
          const patterns = { ...state.patterns };

          // Extract style keywords
          const styleKeywords = extractStyleKeywords(suggestion);
          styleKeywords.forEach((style) => {
            if (!patterns.dislikedStyles.includes(style)) {
              patterns.dislikedStyles.push(style);
            }
            // Remove from liked if present
            const likedIndex = patterns.likedStyles.indexOf(style);
            if (likedIndex > -1) {
              patterns.likedStyles.splice(likedIndex, 1);
            }
          });

          // Record avoided action
          if (!patterns.avoidedActions.includes(suggestion.suggested_prompt)) {
            patterns.avoidedActions.push(suggestion.suggested_prompt);
          }

          // Decrease preference confidence for related context
          const prefKey = Object.keys(patterns.userPreferences).find((k) =>
            k.includes(suggestion.action_type)
          );
          if (prefKey && patterns.userPreferences[prefKey]) {
            patterns.userPreferences[prefKey].confidence = Math.max(
              0,
              patterns.userPreferences[prefKey].confidence - 0.2
            );
          }

          patterns.totalDislikes += 1;

          return { patterns };
        });
      },

      recordFailure: (action, reason, context) => {
        set((state) => {
          const patterns = { ...state.patterns };
          const extractedKeywords = extractStyleKeywordsFromText(action);

          patterns.failures.push({
            action,
            reason,
            timestamp: Date.now(),
            context,
            extractedKeywords,
          });

          // Update failure reason counts
          if (reason === 'hallucination') {
            patterns.hallucinationCount += 1;
          } else if (reason === 'quality') {
            patterns.qualityIssueCount += 1;
          } else if (reason === 'style_mismatch') {
            patterns.styleMismatchCount += 1;
          }

          // Keep only last 30 failures
          if (patterns.failures.length > 30) {
            patterns.failures = patterns.failures.slice(-30);
          }

          // SMART CACHE: Add to bounded cache and invalidate
          addLearning({
            type: reason === 'hallucination' ? 'hallucination' : reason === 'quality' ? 'quality' : 'style',
            operation: extractedKeywords[0] || 'EDIT',
            description: action.slice(0, 100),
          });
          invalidateCache(); // Force refresh on next request

          return { patterns };
        });
      },

      recordSuccess: (action, context) => {
        set((state) => {
          const patterns = { ...state.patterns };
          if (!patterns.successfulPatterns.includes(action)) {
            patterns.successfulPatterns.push(action);
          }

          // Keep only last 50 successful patterns
          if (patterns.successfulPatterns.length > 50) {
            patterns.successfulPatterns = patterns.successfulPatterns.slice(-50);
          }

          // SMART CACHE: Add success to cache (lower priority, no invalidate)
          addLearning({
            type: 'success',
            operation: 'EDIT',
            description: action.slice(0, 50),
          });

          return { patterns };
        });
      },

      recordEditDisliked: (editDescription, reason, roomType) => {
        set((state) => {
          const patterns = { ...state.patterns };
          const extractedStyles = extractStyleKeywordsFromText(editDescription);

          // Record in edit history with failure reason
          patterns.editHistory.push({
            editDescription,
            wasLiked: false,
            wasApplied: true,
            timestamp: Date.now(),
            roomType,
            extractedStyles,
            failureReason: reason,
          });

          // Update failure counts
          if (reason === 'hallucination') {
            patterns.hallucinationCount += 1;
          } else if (reason === 'quality') {
            patterns.qualityIssueCount += 1;
          } else if (reason === 'style_mismatch') {
            patterns.styleMismatchCount += 1;
            extractedStyles.forEach((style) => {
              if (!patterns.dislikedStyles.includes(style)) {
                patterns.dislikedStyles.push(style);
              }
            });
          }

          patterns.totalDislikes += 1;

          // SMART CACHE: Add to bounded cache and force refresh
          addLearning({
            type: reason === 'hallucination' ? 'hallucination' : reason === 'quality' ? 'quality' : 'style',
            operation: 'EDIT',
            description: editDescription.slice(0, 100),
          });
          invalidateCache(); // Force refresh on next request

          // Keep only last 100 edits
          if (patterns.editHistory.length > 100) {
            patterns.editHistory = patterns.editHistory.slice(-100);
          }

          return { patterns };
        });
      },

      recordEditApplied: (editDescription, roomType) => {
        set((state) => {
          const patterns = { ...state.patterns };
          const extractedStyles = extractStyleKeywordsFromText(editDescription);

          patterns.editHistory.push({
            editDescription,
            wasLiked: true,
            wasApplied: true,
            timestamp: Date.now(),
            roomType,
            extractedStyles,
          });

          // Boost styles from applied edits
          extractedStyles.forEach((style) => {
            if (!patterns.likedStyles.includes(style)) {
              patterns.likedStyles.push(style);
            }
          });

          // Keep only last 100 edits
          if (patterns.editHistory.length > 100) {
            patterns.editHistory = patterns.editHistory.slice(-100);
          }

          return { patterns };
        });
      },

      getStylePreferences: () => {
        const state = get();
        // Return liked styles sorted by frequency in edit history
        const styleCount: Record<string, number> = {};
        state.patterns.editHistory.forEach((edit) => {
          edit.extractedStyles.forEach((style) => {
            styleCount[style] = (styleCount[style] || 0) + 1;
          });
        });

        return state.patterns.likedStyles.sort((a, b) => (styleCount[b] || 0) - (styleCount[a] || 0));
      },

      getAvoidedActions: () => {
        const state = get();
        return state.patterns.avoidedActions;
      },

      getContextualInsights: (roomType, is2D) => {
        const state = get();
        const patterns = state.patterns;

        const insights = [];

        if (patterns.likedStyles.length > 0) {
          insights.push(`User prefers: ${patterns.likedStyles.slice(0, 4).join(', ')}`);
        }

        if (patterns.dislikedStyles.length > 0) {
          insights.push(`Avoid: ${patterns.dislikedStyles.slice(0, 3).join(', ')}`);
        }

        // Find room-specific preferences
        const roomPrefs = Object.entries(patterns.userPreferences)
          .filter(([key]) => key.includes(roomType))
          .sort((a, b) => b[1].confidence - a[1].confidence)
          .slice(0, 2);

        if (roomPrefs.length > 0) {
          insights.push(`For ${roomType}: ${roomPrefs.map(([, v]) => v.style).join(', ')} work well`);
        }

        if (patterns.failures.length > 0) {
          const recentFailures = patterns.failures.slice(-3);
          insights.push(`Recent issues: ${recentFailures.map((f) => f.reason).join('; ')}`);
        }

        return insights.join('. ');
      },

      getLearningContext: (operationType?: string) => {
        const state = get();
        const patterns = state.patterns;
        const warningsForAI: string[] = [];

        // SMART FILTERING: Only include relevant warnings based on operation type
        const isStyleOp = operationType === 'STYLE';
        const isRemoveOp = operationType === 'REMOVE';
        const isMoveOp = operationType === 'MOVE';

        // Hallucination warnings - relevant for MOVE, EDIT, ADD (not REMOVE)
        if (patterns.hallucinationCount >= 3 && !isRemoveOp) {
          warningsForAI.push('Be precise. User reported unwanted changes in past edits.');
        }

        // Quality warnings - relevant for all operations
        if (patterns.qualityIssueCount >= 3) {
          warningsForAI.push('Prioritize output quality.');
        }

        // Style warnings - ONLY for style operations
        if (isStyleOp && patterns.styleMismatchCount >= 2 && patterns.likedStyles.length > 0) {
          warningsForAI.push(`Preferred styles: ${patterns.likedStyles.slice(0, 3).join(', ')}`);
        }

        // Recent failures - only include if threshold met AND relevant
        const recentFailures = patterns.failures.filter(
          (f) => Date.now() - f.timestamp < 30 * 60 * 1000 // Last 30 minutes only
        );
        
        if (recentFailures.length >= 2) {
          const relevantFailures = recentFailures.filter((f) => {
            // Match failure to current operation type
            if (isRemoveOp) return f.operationType === 'REMOVE';
            if (isStyleOp) return f.operationType === 'STYLE';
            if (isMoveOp) return f.operationType === 'MOVE';
            return true; // Include all for other operations
          });
          
          if (relevantFailures.length > 0) {
            warningsForAI.push(`Recent issues: ${relevantFailures[0].reason}`);
          }
        }

        // LIMIT: Max 2 warnings to avoid overwhelming
        const limitedWarnings = warningsForAI.slice(0, 2);

        return {
          // Style preferences only for STYLE operations
          stylePreferences: isStyleOp ? patterns.likedStyles.slice(0, 3) : [],
          // Avoided actions limited
          avoidedActions: patterns.avoidedActions.slice(0, 3),
          contextualInsights: '',
          warningsForAI: limitedWarnings,
        };
      },

      getFailureStats: () => {
        const state = get();
        const patterns = state.patterns;
        return {
          hallucinations: patterns.hallucinationCount,
          quality: patterns.qualityIssueCount,
          style: patterns.styleMismatchCount,
          total: patterns.totalDislikes,
        };
      },

      getPreferenceScore: (style: string) => {
        const state = get();
        if (state.patterns.likedStyles.includes(style.toLowerCase())) return 1;
        if (state.patterns.dislikedStyles.includes(style.toLowerCase())) return -1;
        return 0;
      },

      clearSessionData: () => {
        // Clear session-specific data but keep learned preferences
        set((state) => ({
          patterns: {
            ...state.patterns,
            // Keep these - they're learned across sessions
            likedStyles: state.patterns.likedStyles,
            dislikedStyles: state.patterns.dislikedStyles,
            userPreferences: state.patterns.userPreferences,
            // Clear these - they're session-specific
            editHistory: [],
            failures: [],
            successfulPatterns: [],
            avoidedActions: [],
          },
        }));
        // SMART CACHE: Clear cache learnings too
        clearCacheLearnings();
      },
    }),
    {
      name: 'pointspeak-learning',
      partialize: (state) => ({ patterns: state.patterns }),
    }
  )
);

const stylePatterns = [
  'modern',
  'traditional',
  'minimalist',
  'rustic',
  'industrial',
  'scandinavian',
  'mid-century',
  'contemporary',
  'bohemian',
  'coastal',
  'farmhouse',
  'luxury',
  'vintage',
  'art deco',
  'japandi',
  'mediterranean',
  'french country',
  'cottage',
  'eclectic',
  'transitional',
  'urban',
  'zen',
  'biophilic',
  'maximalist',
  'retro',
  'chic',
  'elegant',
  'cozy',
  'warm',
  'cool',
  'neutral',
  'bold',
  'sleek',
  'organic',
];

const colorPatterns = [
  'white',
  'black',
  'gray',
  'grey',
  'beige',
  'cream',
  'navy',
  'blue',
  'green',
  'emerald',
  'sage',
  'terracotta',
  'burgundy',
  'gold',
  'brass',
  'copper',
  'silver',
  'wood',
  'walnut',
  'oak',
  'marble',
  'concrete',
];

const materialPatterns = [
  'leather',
  'velvet',
  'linen',
  'cotton',
  'wool',
  'silk',
  'marble',
  'granite',
  'concrete',
  'wood',
  'metal',
  'glass',
  'ceramic',
  'stone',
  'brick',
  'steel',
  'brass',
  'copper',
  'chrome',
  'matte',
  'glossy',
];

function extractStyleKeywords(suggestion: DesignSuggestion): string[] {
  const text =
    `${suggestion.title} ${suggestion.description} ${suggestion.suggested_prompt}`.toLowerCase();
  return extractStyleKeywordsFromText(text);
}

function extractStyleKeywordsFromText(text: string): string[] {
  const keywords: string[] = [];
  const lowerText = text.toLowerCase();

  stylePatterns.forEach((style) => {
    if (lowerText.includes(style)) {
      keywords.push(style);
    }
  });

  colorPatterns.forEach((color) => {
    if (lowerText.includes(color)) {
      keywords.push(color);
    }
  });

  materialPatterns.forEach((material) => {
    if (lowerText.includes(material)) {
      keywords.push(material);
    }
  });

  return [...new Set(keywords)];
}

