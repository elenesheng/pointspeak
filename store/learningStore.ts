import { create } from 'zustand';
import { DesignSuggestion } from '../types/ai.types';

export interface UserPreference {
  style: string;
  confidence: number;
  examples: number;
}

export interface FailurePattern {
  action: string;
  reason: string;
  timestamp: Date;
  context: string;
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
}

interface LearningState {
  patterns: LearnedPattern;
  
  // Actions
  recordLike: (suggestion: DesignSuggestion, context: string) => void;
  recordDislike: (suggestion: DesignSuggestion, reason?: string) => void;
  recordFailure: (action: string, reason: string, context: string) => void;
  recordSuccess: (action: string, context: string) => void;
  getStylePreferences: () => string[];
  getAvoidedActions: () => string[];
  getContextualInsights: (roomType: string, is2D: boolean) => string;
}

const initialPatterns: LearnedPattern = {
  likedStyles: [],
  dislikedStyles: [],
  preferredColors: [],
  preferredMaterials: [],
  avoidedActions: [],
  successfulPatterns: [],
  failures: [],
  userPreferences: {}
};

export const useLearningStore = create<LearningState>((set, get) => ({
  patterns: initialPatterns,

  recordLike: (suggestion, context) => {
    set(state => {
      const patterns = { ...state.patterns };
      
      // Extract style keywords from suggestion
      const styleKeywords = extractStyleKeywords(suggestion);
      styleKeywords.forEach(style => {
        if (!patterns.likedStyles.includes(style)) {
          patterns.likedStyles.push(style);
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
          confidence: 0.5,
          examples: 1
        };
      } else {
        patterns.userPreferences[prefKey].confidence = Math.min(1.0, 
          patterns.userPreferences[prefKey].confidence + 0.1
        );
        patterns.userPreferences[prefKey].examples += 1;
      }

      return { patterns };
    });
  },

  recordDislike: (suggestion, reason) => {
    set(state => {
      const patterns = { ...state.patterns };
      
      // Extract style keywords
      const styleKeywords = extractStyleKeywords(suggestion);
      styleKeywords.forEach(style => {
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

      return { patterns };
    });
  },

  recordFailure: (action, reason, context) => {
    set(state => {
      const patterns = { ...state.patterns };
      patterns.failures.push({
        action,
        reason,
        timestamp: new Date(),
        context
      });
      
      // Keep only last 20 failures
      if (patterns.failures.length > 20) {
        patterns.failures = patterns.failures.slice(-20);
      }

      return { patterns };
    });
  },

  recordSuccess: (action, context) => {
    set(state => {
      const patterns = { ...state.patterns };
      if (!patterns.successfulPatterns.includes(action)) {
        patterns.successfulPatterns.push(action);
      }
      return { patterns };
    });
  },

  getStylePreferences: () => {
    const state = get();
    return state.patterns.likedStyles;
  },

  getAvoidedActions: () => {
    const state = get();
    return state.patterns.avoidedActions;
  },

  getContextualInsights: (roomType, is2D) => {
    const state = get();
    const patterns = state.patterns;
    
    let insights = [];
    
    if (patterns.likedStyles.length > 0) {
      insights.push(`User prefers: ${patterns.likedStyles.slice(0, 3).join(', ')}`);
    }
    
    if (patterns.dislikedStyles.length > 0) {
      insights.push(`Avoid: ${patterns.dislikedStyles.slice(0, 2).join(', ')}`);
    }
    
    if (patterns.failures.length > 0) {
      const recentFailures = patterns.failures.slice(-3);
      insights.push(`Recent issues: ${recentFailures.map(f => f.reason).join('; ')}`);
    }

    return insights.join('. ');
  }
}));

// Helper to extract style keywords from suggestions
function extractStyleKeywords(suggestion: DesignSuggestion): string[] {
  const keywords: string[] = [];
  const text = `${suggestion.title} ${suggestion.description} ${suggestion.suggested_prompt}`.toLowerCase();
  
  const stylePatterns = [
    'modern', 'traditional', 'minimalist', 'rustic', 'industrial', 'scandinavian',
    'mid-century', 'contemporary', 'bohemian', 'coastal', 'farmhouse', 'luxury',
    'vintage', 'art deco', 'japandi', 'mediterranean', 'french country', 'cottage'
  ];
  
  stylePatterns.forEach(style => {
    if (text.includes(style)) {
      keywords.push(style);
    }
  });
  
  return keywords;
}

