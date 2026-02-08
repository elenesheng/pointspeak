
import { useState, useCallback, useRef } from 'react';
import { DesignSuggestion } from '../types/ai.types';
import { DetailedRoomAnalysis, IdentifiedObject } from '../types/spatial.types';
import { generateSuggestions, detectSuggestionMode } from '../services/gemini/suggestionService';
import { ReasoningLogType } from '../types/ui.types';
import { useLearningStore } from '../store/learningStore';

export const useSuggestions = (
  addLog: (content: string, type: ReasoningLogType) => void
) => {
  const [suggestions, setSuggestions] = useState<DesignSuggestion[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const learningStore = useLearningStore();
  
  // Cache key to prevent regeneration on same state
  const lastContextRef = useRef<string>("");

  const generateIdeas = useCallback(async (
    imageBase64: string,
    roomAnalysis: DetailedRoomAnalysis | null,
    detectedObjects: IdentifiedObject[],
    userGoal: string,
    forceRefresh: boolean = false,
    hasAppliedStyle: boolean = false
  ) => {
    if (!roomAnalysis) {
      addLog("Wait for room analysis to complete first.", 'error');
      return;
    }

    // Generate a context key based on actual image content (hash) and goal
    const imageHash = `${imageBase64.slice(0, 100)}_${imageBase64.length}`;
    const contextKey = `${imageHash}_${userGoal}_${detectedObjects.length}_${hasAppliedStyle}`;

    // If context hasn't changed and not forcing, just return (don't open in background)
    if (!forceRefresh && contextKey === lastContextRef.current && suggestions.length > 0) {
        // Only open if it's not a background/auto-refresh call
        if (userGoal !== 'auto-refresh') {
            setIsOpen(true);
        }
        return;
    }

    setIsGenerating(true);
    
    // Only open panel if it's NOT a background/auto-refresh call
    if (userGoal !== 'auto-refresh') {
        setIsOpen(true);
        addLog(`🧠 Brainstorming ideas...`, 'thought');
    }

    try {
      // Get learning context for personalized suggestions (includes style prefs, failures, warnings)
      const baseLearning = learningStore.getLearningContext();
      // Enrich with room-specific contextual insights
      const roomInsights = learningStore.getContextualInsights(
        roomAnalysis.room_type,
        !!roomAnalysis.is_2d_plan
      );
      const learningContext = {
        stylePreferences: baseLearning.stylePreferences || [],
        avoidedActions: baseLearning.avoidedActions || [],
        contextualInsights: [baseLearning.contextualInsights, roomInsights].filter(Boolean).join('. '),
      };

      // Use unified suggestion service with automatic mode detection
      const mode = detectSuggestionMode(roomAnalysis, detectedObjects, hasAppliedStyle);
      const results = await generateSuggestions({
        mode,
        imageBase64,
        roomAnalysis,
        detectedObjects,
        userGoal: userGoal === 'auto-refresh' ? 'Improve this room' : userGoal,
        learningContext,
      });
      
      if (results.length > 0) {
          setSuggestions(results);
          lastContextRef.current = contextKey;
          if (userGoal !== 'auto-refresh') {
              addLog(`✨ Generated ${results.length} design suggestions.`, 'success');
          }
      }
    } catch (error) {
      if (userGoal !== 'auto-refresh') {
          addLog("Failed to generate suggestions.", 'error');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [addLog, suggestions.length, learningStore]);

  const dismissSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }, []);
  
  const removeSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setIsOpen(false);
    lastContextRef.current = "";
  }, []);

  return {
    suggestions,
    isGenerating,
    isOpen,
    setIsOpen,
    generateIdeas,
    dismissSuggestion,
    removeSuggestion,
    clearSuggestions
  };
};
