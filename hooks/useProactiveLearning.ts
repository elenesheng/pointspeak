import { useEffect, useState, useRef } from 'react';
import { useLearningStore } from '../store/learningStore';
import { IdentifiedObject } from '../types/spatial.types';

export interface ProactiveSuggestion {
  type: 'preference' | 'warning' | 'pattern';
  message: string;
  action?: string;
  confidence: number;
}

interface UseProactiveLearningProps {
  selectedObject: IdentifiedObject | null;
  roomType: string;
  addLog: (message: string, type: string) => void;
}

/**
 * Proactively suggests actions based on learned patterns from user feedback.
 */
export const useProactiveLearning = ({
  selectedObject,
  roomType,
  addLog,
}: UseProactiveLearningProps) => {
  const [suggestions, setSuggestions] = useState<ProactiveSuggestion[]>([]);
  const learningStore = useLearningStore();
  const lastObjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedObject || lastObjectIdRef.current === selectedObject.id) {
      return;
    }
    lastObjectIdRef.current = selectedObject.id;

    const patterns = learningStore.patterns;
    const proactiveSuggestions: ProactiveSuggestion[] = [];

    // Check learned style preferences
    if (patterns.likedStyles.length > 3) {
      const topStyle = getMostFrequent(patterns.likedStyles);
      proactiveSuggestions.push({
        type: 'preference',
        message: `Based on your preferences, you usually like "${topStyle}" for ${selectedObject.category}`,
        action: `Change ${selectedObject.name} to ${topStyle} style`,
        confidence: 0.8,
      });
    }

    // Check failure patterns
    const objectFailures = patterns.failures.filter((f) =>
      f.extractedKeywords.some((k) =>
        k.toLowerCase().includes(selectedObject.category.toLowerCase())
      )
    );

    if (objectFailures.length > 0) {
      const commonFailure = getMostFrequentFailure(objectFailures);
      proactiveSuggestions.push({
        type: 'warning',
        message: `⚠️ Previously, edits to ${selectedObject.category} had ${commonFailure.reason} issues. Autopilot will use extra caution.`,
        confidence: 0.7,
      });
    }

    // Check successful patterns for this room type
    const roomSuccesses = patterns.successfulPatterns.filter((p) =>
      p.toLowerCase().includes(roomType.toLowerCase())
    );

    if (roomSuccesses.length > 2) {
      const pattern = roomSuccesses[0];
      proactiveSuggestions.push({
        type: 'pattern',
        message: `💡 In ${roomType}s, you usually do: "${pattern}"`,
        action: pattern,
        confidence: 0.6,
      });
    }

    setSuggestions(proactiveSuggestions);

    // Log suggestions
    proactiveSuggestions.forEach((suggestion) => {
      if (suggestion.type === 'warning') {
        addLog(suggestion.message, 'warning');
      } else if (suggestion.type === 'preference') {
        addLog(`🤖 ${suggestion.message}`, 'suggestion');
      }
    });
  }, [selectedObject, roomType, learningStore, addLog]);

  return suggestions;
};

function getMostFrequent(arr: string[]): string {
  if (arr.length === 0) return '';
  const counts: Record<string, number> = {};
  arr.forEach((item) => (counts[item] = (counts[item] || 0) + 1));
  return Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b));
}

function getMostFrequentFailure(failures: any[]): any {
  if (failures.length === 0) return null;
  const reasons = failures.map((f) => f.reason);
  const mostCommon = getMostFrequent(reasons);
  return failures.find((f) => f.reason === mostCommon) || failures[0];
}

