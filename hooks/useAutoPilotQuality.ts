import { useEffect, useRef } from 'react';
import { analyzeImageQuality } from '../services/gemini/qualityAnalysisService';
import { useLearningStore } from '../store/learningStore';
import { useAutopilotStore } from '../store/autopilotStore';
import { QualityAnalysis } from '../services/gemini/qualityAnalysisService';

import { DetailedRoomAnalysis } from '../types/spatial.types';

interface UseAutoPilotQualityProps {
  imageBase64: string | null;
  roomAnalysis: DetailedRoomAnalysis | null;
  onAutoFix: (fixes: string[]) => Promise<void>;
  addLog: (message: string, type: string) => void;
}

/**
 * AUTOPILOT: Automatically detects quality issues and applies fixes
 * Runs in background using requestIdleCallback pattern
 */
export const useAutoPilotQuality = ({
  imageBase64,
  roomAnalysis,
  onAutoFix,
  addLog,
}: UseAutoPilotQualityProps) => {
  const learningStore = useLearningStore();
  const { config, isRunning: autopilotRunning } = useAutopilotStore();
  const attemptCountRef = useRef(0);
  const analyzingRef = useRef(false);
  const lastImageHashRef = useRef<string | null>(null);

  useEffect(() => {
    // CRITICAL: Only run if full autopilot is explicitly running (user pressed button)
    // Do NOT auto-run quality fixes in background - only when user explicitly enables autopilot
    if (!autopilotRunning || !config.enabled || !imageBase64 || !roomAnalysis || analyzingRef.current) {
      return;
    }

    const imageHash = `${imageBase64.slice(0, 100)}_${imageBase64.length}`;
    if (lastImageHashRef.current === imageHash) {
      return; // Already analyzed this image
    }

    const runAutoPilotQuality = async () => {
      if (analyzingRef.current) return;
      analyzingRef.current = true;
      lastImageHashRef.current = imageHash;

      try {
        const learningContext = learningStore.getLearningContext();
        const analysis = await analyzeImageQuality(
          imageBase64,
          roomAnalysis.is_2d_plan || false,
          learningContext
        );

        // Check if quality is below threshold AND we have auto-fixable issues
        // Fix ALL auto-fixable issues, not just critical ones
        if (analysis.overall_score < config.autoFixThreshold * 100) {
          const autoFixableIssues = analysis.issues.filter(
            (issue) => issue.auto_fixable
          );

          if (
            autoFixableIssues.length > 0 &&
            attemptCountRef.current < config.maxAttempts
          ) {
            attemptCountRef.current++;

            addLog(
              `🤖 Autopilot: Found ${autoFixableIssues.length} quality issues. Auto-fixing... (Attempt ${attemptCountRef.current}/${config.maxAttempts})`,
              'action'
            );

            // Extract fix actions - fix ALL auto-fixable issues
            const fixes = autoFixableIssues.map((issue) => issue.fix_prompt);

            // Trigger auto-fix
            await onAutoFix(fixes);

            // Record this autopilot action for learning
            learningStore.recordSuccess(
              `Autopilot quality fix: ${fixes.join(', ')}`,
              roomAnalysis.room_type || 'unknown'
            );
          } else if (attemptCountRef.current >= config.maxAttempts) {
            addLog(
              `🤖 Autopilot: Quality refinement complete after ${attemptCountRef.current} attempts.`,
              'success'
            );
            attemptCountRef.current = 0; // Reset for next image
          }
        } else {
          if (attemptCountRef.current > 0) {
            addLog(
              `✓ Autopilot: Quality check passed (${analysis.overall_score.toFixed(0)}%)`,
              'success'
            );
          }
          attemptCountRef.current = 0; // Reset for next image
        }
      } catch (error) {
        console.warn('[AutoPilot Quality] Failed:', error);
      } finally {
        analyzingRef.current = false;
      }
    };

    // Use requestIdleCallback for truly non-blocking execution
    const idleCallback = window.requestIdleCallback
      ? window.requestIdleCallback(() => runAutoPilotQuality(), { timeout: 2000 })
      : setTimeout(() => runAutoPilotQuality(), 2000);

    return () => {
      if (window.requestIdleCallback && typeof idleCallback === 'number') {
        window.cancelIdleCallback(idleCallback);
      } else if (typeof idleCallback === 'number') {
        clearTimeout(idleCallback);
      }
    };
  }, [imageBase64, roomAnalysis, config, autopilotRunning, onAutoFix, addLog, learningStore]);
};

