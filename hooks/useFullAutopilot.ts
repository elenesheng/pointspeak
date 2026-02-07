import { useRef } from 'react';
import { IdentifiedObject } from '../types/spatial.types';
import { DetailedRoomAnalysis } from '../types/spatial.types';
import { useAutopilotStore } from '../store/autopilotStore';

import { QualityAnalysis } from '../services/gemini/qualityAnalysisService';
import { useLearningStore } from '../store/learningStore';

interface UseFullAutopilotProps {
  scannedObjects: IdentifiedObject[];
  roomAnalysis: DetailedRoomAnalysis | null;
  addLog: (message: string, type: string) => void;
  executeCommand: (
    text: string,
    obj?: IdentifiedObject | null,
    options?: { skipUserPrompt?: boolean }
  ) => Promise<string | undefined>;
  analyzeQuality: (
    imageBase64: string,
    is2DPlan: boolean,
    learningContext: any
  ) => Promise<QualityAnalysis>;
  getActiveBase64: () => string | null;
  isProcessing: boolean; // To wait for image generation
  getCurrentRoomAnalysis: () => DetailedRoomAnalysis | null; // Get latest room analysis from store
}

/**
 * AUTOPILOT: Full autonomous portfolio generation
 * Orchestrates multi-room, multi-pass design generation
 */
export const useFullAutopilot = ({
  scannedObjects,
  roomAnalysis,
  addLog,
  executeCommand,
  analyzeQuality,
  getActiveBase64,
  isProcessing,
  getCurrentRoomAnalysis,
}: UseFullAutopilotProps) => {
  const { isRunning, config, progress, startAutopilot, stopAutopilot, updateProgress } =
    useAutopilotStore();
  const learningStore = useLearningStore();
  const cancelRef = useRef(false);

  const runFullAutopilot = async (styleOverride?: string) => {
    if (isRunning) {
      addLog('⚠️ Autopilot is already running', 'warning');
      return;
    }

    startAutopilot();
    cancelRef.current = false;

    const is2DPlan = roomAnalysis?.is_2d_plan || false;
    const targetStyle = styleOverride || config.style || 'modern minimalist';

    addLog('🤖 AUTOPILOT MODE ENGAGED', 'action');
    
    if (is2DPlan) {
      addLog(`Mode: 2D Floor Plan - Will apply style and auto-fix`, 'thought');
      addLog(`Target Style: ${targetStyle}`, 'thought');
    } else {
      addLog(`Mode: 3D Room Photo - Will auto-fix quality issues only`, 'thought');
    }
    
    if (config.enabled) {
      addLog(`Quality Auto-Fix: Enabled (Threshold: ${(config.autoFixThreshold * 100).toFixed(0)}%)`, 'thought');
    } else {
      addLog(`Quality Auto-Fix: Disabled`, 'thought');
    }

    try {
      // For 2D plans: identify rooms, for 3D: process entire space
      let rooms: IdentifiedObject[] = [];
      let totalRooms = 1;
      
      if (is2DPlan) {
        // Identify all rooms from scanned objects - be more flexible with detection
        rooms = scannedObjects.filter(
          (obj) => {
            const name = obj.name.toLowerCase();
            // Check if it's a room by category or name pattern
            const isRoomByCategory = obj.category === 'Structure';
            const isRoomByName = /room|bedroom|kitchen|living|bathroom|dining|office|study|bed|master|guest|family|den|library|loft|attic|basement|garage|hall|corridor|entry|foyer|pantry|closet|laundry|utility/i.test(name);
            return isRoomByCategory && isRoomByName;
          }
        );

        // Also check for any Structure objects that might be rooms
        if (rooms.length === 0) {
          const allStructures = scannedObjects.filter(obj => obj.category === 'Structure');
          if (allStructures.length > 0) {
            addLog(`⚠️ Found ${allStructures.length} structure(s) but no clear room labels. Using first structure.`, 'warning');
            rooms = [allStructures[0]];
          }
        }

        if (rooms.length === 0) {
          addLog('⚠️ No rooms detected. Applying style to entire space.', 'warning');
          totalRooms = 1;
        } else {
          totalRooms = config.generateAllRooms ? rooms.length : 1;
          addLog(`🏠 Found ${rooms.length} room(s). Processing ${totalRooms}...`, 'action');
        }
      } else {
        // For 3D photos, just process the entire space
        addLog('📸 Processing 3D room photo...', 'action');
        totalRooms = 1;
      }

      // Process each room
      for (let i = 0; i < totalRooms && !cancelRef.current; i++) {
        const room = rooms[i] || null;
        // Always use "entire space" for global style application
        // Only use room name if we're processing a specific room AND it's explicitly selected
        const roomName = 'entire space';

        updateProgress({
          currentRoom: roomName,
          currentPass: 1,
          totalPasses: 3,
          roomsCompleted: i,
          totalRooms,
          status: `Designing ${roomName}...`,
        });

        addLog(`\n🎨 Autopilot: Processing ${roomName}...`, 'action');

        // For 2D plans: Apply style first
        if (is2DPlan) {
          if (cancelRef.current) break;
          
          updateProgress({
            currentPass: 1,
            totalPasses: config.enabled ? 2 : 1,
            status: `${roomName}: Applying ${targetStyle} style...`,
          });
          addLog(`  Step 1: Applying ${targetStyle} style...`, 'thought');
          
          try {
            addLog(`  🎨 Executing style transformation...`, 'thought');
            const editResult = await executeCommand(
              `Transform ${roomName} to ${targetStyle} style`,
              room,
              { skipUserPrompt: true }
            );
            
            if (!editResult) {
              // Check if autopilot is still running (might have been cancelled)
              const currentState = useAutopilotStore.getState();
              if (!currentState.isRunning) {
                addLog('⚠️ Style transformation skipped - autopilot was cancelled', 'warning');
                break; // Exit if autopilot was cancelled
              }
              throw new Error('Style transformation returned no result - edit may have failed');
            }
            
            // Wait for image generation to complete
            addLog(`  ⏳ Waiting for image generation to complete...`, 'thought');
            let waitCount = 0;
            while (isProcessing && waitCount < 60 && !cancelRef.current) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              waitCount++;
              if (waitCount % 5 === 0) {
                addLog(`  ⏳ Still waiting... (${waitCount}s)`, 'thought');
              }
            }
            
            if (cancelRef.current) {
              addLog('⚠️ Autopilot cancelled during wait', 'warning');
              break;
            }
            
            if (isProcessing) {
              addLog(`  ⚠️ Style transformation timed out after ${waitCount}s`, 'warning');
            } else {
              addLog(`  ✓ Style transformation complete - image updated`, 'success');
            }
            
            // Small delay to ensure store is updated
            await new Promise(resolve => setTimeout(resolve, 2000));
          } catch (error) {
            if (cancelRef.current) {
              addLog('⚠️ Autopilot cancelled during execution', 'warning');
              break;
            }
            addLog(`  ❌ Style transformation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            throw error;
          }
        } else {
          // For 3D photos, skip style application (only do quality fixes)
          addLog(`  ℹ️ 3D photo detected - skipping style application, will only apply quality fixes`, 'thought');
        }

        // Quality auto-fix (only if enabled)
        if (config.enabled && !cancelRef.current) {
          updateProgress({
            currentPass: is2DPlan ? 2 : 1,
            totalPasses: is2DPlan ? 2 : 1,
            status: `${roomName}: Analyzing quality issues...`,
          });
          addLog(`  ${is2DPlan ? 'Step 2' : 'Step 1'}: Analyzing quality issues (will save and fix all)...`, 'thought');
          
          // Wait a bit for image to be ready
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Wait for any ongoing processing to complete
          let waitCount = 0;
          while (isProcessing && waitCount < 30 && !cancelRef.current) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            waitCount++;
          }
          
          if (cancelRef.current) break;
          
          try {
            // CRITICAL: Wait for room analysis to update after style transformation (if 2D plan)
            if (is2DPlan) {
              addLog(`  ⏳ Waiting for room analysis to update after style transformation...`, 'thought');
              let analysisWaitCount = 0;
              let currentAnalysis = getCurrentRoomAnalysis();
              while (analysisWaitCount < 15 && !cancelRef.current) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                analysisWaitCount++;
                const newAnalysis = getCurrentRoomAnalysis();
                if (newAnalysis && newAnalysis !== currentAnalysis) {
                  addLog(`  ✓ Room analysis updated`, 'thought');
                  break;
                }
              }
            }
            
            const activeBase64 = getActiveBase64();
            if (!activeBase64) {
              addLog(`  ⚠️ No active image available for quality analysis`, 'warning');
            } else if (!cancelRef.current) {
              addLog(`  🔍 Analyzing image quality...`, 'thought');
              const learningContext = learningStore.getLearningContext();
              
              // Get latest room analysis for quality analysis
              const latestRoomAnalysis = getCurrentRoomAnalysis();
              if (!latestRoomAnalysis) {
                addLog(`  ⚠️ Room analysis not available yet, waiting...`, 'warning');
                // Wait a bit more for analysis
                await new Promise(resolve => setTimeout(resolve, 3000));
              }
              
              const qualityResult = await analyzeQuality(
                activeBase64,
                is2DPlan,
                learningContext
              );

              addLog(`  📊 Quality score: ${qualityResult.overall_score.toFixed(0)}% (threshold: ${(config.autoFixThreshold * 100).toFixed(0)}%)`, 'thought');

              // Check if quality is below threshold
              // Fix ALL auto-fixable issues, not just critical/warning
              if (qualityResult.overall_score < config.autoFixThreshold * 100) {
                const autoFixableIssues = qualityResult.issues.filter(
                  (issue) => issue.auto_fixable
                );

                if (autoFixableIssues.length > 0 && !cancelRef.current) {
                  // CRITICAL: Save all issues once - we'll use this list for all fixes
                  // NO RE-ANALYSIS after each fix - just fix from the saved list
                  addLog(
                    `  💾 Saved ${autoFixableIssues.length} quality issues. Will fix them one by one from saved list...`,
                    'action'
                  );
                  
                  updateProgress({
                    status: `${roomName}: Auto-fixing ${autoFixableIssues.length} quality issues...`,
                  });

                  // Apply fixes sequentially - fix ALL auto-fixable issues from saved list
                  // NO RE-ANALYSIS after each fix - use the saved issues
                  for (let fixIndex = 0; fixIndex < autoFixableIssues.length; fixIndex++) {
                    if (cancelRef.current) break;
                    const issue = autoFixableIssues[fixIndex];
                    try {
                      addLog(`  🔧 Fixing issue ${fixIndex + 1}/${autoFixableIssues.length}: ${issue.title}`, 'thought');
                      addLog(`  📝 Executing fix: ${issue.fix_prompt.substring(0, 100)}...`, 'thought');
                      
                      // Execute the command and wait for it to complete
                      // executeCommand returns the edited image base64, or undefined if it failed
                      const editResult = await executeCommand(issue.fix_prompt, null, { skipUserPrompt: true });
                      
                      if (!editResult) {
                        // Check if autopilot is still running (might have been cancelled)
                        const currentState = useAutopilotStore.getState();
                        if (!currentState.isRunning) {
                          addLog(`  ⚠️ Fix ${fixIndex + 1} skipped - autopilot was cancelled`, 'warning');
                          break; // Exit loop if autopilot was cancelled
                        }
                        throw new Error('Command returned no result - edit may have failed');
                      }
                      
                      // Wait for processing to complete (executeCommand sets isProcessing)
                      addLog(`  ⏳ Waiting for image generation to complete...`, 'thought');
                      let fixWaitCount = 0;
                      while (isProcessing && fixWaitCount < 60 && !cancelRef.current) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        fixWaitCount++;
                        if (fixWaitCount % 5 === 0) {
                          addLog(`  ⏳ Still processing... (${fixWaitCount}s)`, 'thought');
                        }
                      }
                      
                      if (cancelRef.current) {
                        addLog('⚠️ Autopilot cancelled during fix', 'warning');
                        break;
                      }
                      
                      if (isProcessing) {
                        addLog(`  ⚠️ Fix ${fixIndex + 1} timed out after ${fixWaitCount}s`, 'warning');
                      } else {
                        addLog(`  ✓ Fix ${fixIndex + 1} complete - image updated`, 'success');
                      }
                      
                      // Small delay between fixes to ensure store is updated
                      // NO RE-ANALYSIS - we're using the saved issues list
                      await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (error) {
                      if (cancelRef.current) break;
                      console.error('[Autopilot] Fix failed:', error);
                      addLog(`  ❌ Fix ${fixIndex + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
                      // Continue with next fix even if this one failed
                    }
                  }
                  
                  if (!cancelRef.current) {
                    addLog(`  ✓ Applied ${autoFixableIssues.length} quality fixes from saved analysis`, 'success');
                  }
                } else {
                  addLog(`  ✓ Quality check passed (${qualityResult.overall_score.toFixed(0)}%)`, 'success');
                }
              } else {
                addLog(`  ✓ Quality check passed (${qualityResult.overall_score.toFixed(0)}%)`, 'success');
              }
            }
          } catch (error) {
            console.warn('[Autopilot] Quality analysis failed:', error);
            addLog(`  ⚠️ Quality analysis skipped`, 'warning');
          }
        } else if (!config.enabled) {
          addLog(`  ⏭️ Quality auto-fix is disabled`, 'thought');
        }

        if (cancelRef.current) break;

        updateProgress({
          roomsCompleted: i + 1,
        });
        addLog(`✓ ${roomName} complete`, 'success');
      }

      if (!cancelRef.current) {
        if (is2DPlan) {
          addLog('\n🎉 AUTOPILOT COMPLETE: Style applied and auto-fixed!', 'success');
          addLog(`Processed ${totalRooms} room(s) autonomously`, 'success');
        } else {
          addLog('\n🎉 AUTOPILOT COMPLETE: Quality issues auto-fixed!', 'success');
        }
        
        // Record success for learning
        learningStore.recordSuccess(
          `Autopilot: ${is2DPlan ? `${totalRooms} rooms styled and fixed` : 'quality fixes applied'}`,
          roomAnalysis?.room_type || 'unknown'
        );
      } else {
        addLog('⚠️ Autopilot cancelled by user', 'warning');
      }
    } catch (error) {
      addLog(
        `❌ Autopilot error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );
      learningStore.recordFailure(
        'Full autopilot execution',
        'other',
        roomAnalysis?.room_type || 'unknown'
      );
    } finally {
      stopAutopilot();
      cancelRef.current = false;
    }
  };

  const cancelAutopilot = () => {
    if (!isRunning) return;
    
    cancelRef.current = true;
    stopAutopilot();
    updateProgress(null);
    addLog('🛑 Autopilot: STOPPING...', 'warning');
    addLog('⚠️ Autopilot cancelled by user. Current operation will finish, then stop.', 'warning');
  };

  return {
    isRunning,
    progress,
    runFullAutopilot,
    cancelAutopilot,
  };
};

