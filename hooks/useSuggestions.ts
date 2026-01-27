
import { useState, useCallback, useRef } from 'react';
import { DesignSuggestion } from '../types/ai.types';
import { DetailedRoomAnalysis, IdentifiedObject } from '../types/spatial.types';
import { generateDesignSuggestions } from '../services/gemini/suggestionService';
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
    forceRefresh: boolean = false
  ) => {
    if (!roomAnalysis) {
      addLog("Wait for room analysis to complete first.", 'error');
      return;
    }

    // Generate a context key based on image size and goal
    const contextKey = `${imageBase64.length}_${userGoal}_${detectedObjects.length}`;

    // If context hasn't changed and not forcing, just open and return
    if (!forceRefresh && contextKey === lastContextRef.current && suggestions.length > 0) {
        setIsOpen(true);
        return;
    }

    setIsGenerating(true);
    setIsOpen(true);
    
    // Silent log if it's an auto-refresh
    if (userGoal !== 'auto-refresh') {
        addLog(`🧠 Brainstorming ideas...`, 'thought');
    }

    try {
      // Get learning context for personalized suggestions
      const learningContext = {
        stylePreferences: learningStore.getStylePreferences(),
        avoidedActions: learningStore.getAvoidedActions(),
        contextualInsights: learningStore.getContextualInsights(roomAnalysis.room_type, !!roomAnalysis.is_2d_plan)
      };
      
      const results = await generateDesignSuggestions(
        imageBase64,
        roomAnalysis,
        detectedObjects,
        userGoal === 'auto-refresh' ? "Improve this room" : userGoal,
        learningContext
      );
      
      if (results.length > 0) {
          setSuggestions(results);
          lastContextRef.current = contextKey;
          if (userGoal !== 'auto-refresh') {
              addLog(`✨ Generated ${results.length} design suggestions.`, 'success');
          }
      }
    } catch (error) {
      console.error(error);
      if (userGoal !== 'auto-refresh') {
          addLog("Failed to generate suggestions.", 'error');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [addLog, suggestions.length]);

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
