import React, { useState, useRef, useEffect } from 'react';
import { Target, Key } from 'lucide-react';
import { AuthButton } from './components/auth/AuthButton';
import { useReasoningLogs } from './hooks/useReasoningLogs';
import { usePinManagement } from './hooks/usePinManagement';
import { useImageUpload } from './hooks/useImageUpload';
import { useGeminiAgent } from './hooks/useGeminiAgent';
import { useSuggestions } from './hooks/useSuggestions';
import { generateMultiAngleRender } from './services/gemini/renderingService';
import { cropBase64Image, generateBinaryMask } from './utils/imageProcessing';
import { Canvas } from './components/canvas/Canvas';
import { ReasoningPanel } from './components/reasoning/ReasoningPanel';
import { InputArea } from './components/input/InputArea';
import { QualityAnalysisPanel } from './components/analysis/QualityAnalysisPanel';
import { DesignAssistant } from './components/suggestions/DesignAssistant';
import { EditFeedback } from './components/feedback/EditFeedback';
import { IdentifiedObject } from './types/spatial.types';
import { DesignSuggestion, IntentTranslation } from './types/ai.types';
import { useLearningStore } from './store/learningStore';
import {
  analyzeImageQuality,
  QualityAnalysis,
} from './services/gemini/qualityAnalysisService';
import { analyzePromptPattern } from './services/gemini/promptPatternService';
import {
  generateFloorPlanStyleCards,
  FloorPlanStyle,
} from './services/gemini/suggestionService';

interface ForceOverrideData {
  forceAction?: IntentTranslation;
  forceObject?: IdentifiedObject;
}

const App: React.FC = () => {
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [isKeyChecking, setIsKeyChecking] = useState<boolean>(true);

  const { logs, addLog, clearLogs } = useReasoningLogs();
  const { pins, addPin, resetPins } = usePinManagement();
  const learningStore = useLearningStore();
  
  const { 
    status, roomAnalysis, selectedObject, generatedImage, isProcessing, activeModel, setActiveModel,
    performInitialScan, identifyObjectAtLocation, executeCommand, analyzeReference, resetAgent, setSelectedObject,
    editHistory, currentEditIndex, undoEdit, redoEdit, resetToOriginal, jumpToEdit, canUndo, canRedo, scannedObjects,
    exportHistory, cancelOperation
  } = useGeminiAgent({ addLog, pins });
  
  // Design Assistant Hook
  const { 
    suggestions, 
    isGenerating: isGeneratingSuggestions, 
    isOpen: isAssistantOpen, 
    setIsOpen: setIsAssistantOpen, 
    generateIdeas, 
    dismissSuggestion,
    removeSuggestion,
    clearSuggestions 
  } = useSuggestions(addLog);

  const { imageUrl, handleFileUpload, clearImage, setImageUrl } = useImageUpload(
    () => resetAll(),
    (base64) => performInitialScan(base64)
  );
  
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [referenceDesc, setReferenceDesc] = useState<string | null>(null);

  const [userInput, setUserInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAnalysis, setShowAnalysis] = useState(false);
  const [qualityAnalysis, setQualityAnalysis] = useState<QualityAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastAnalyzedImageHash, setLastAnalyzedImageHash] = useState<string | null>(null);

  // Style Cards State for 2D Floor Plans
  const [styleCards, setStyleCards] = useState<FloorPlanStyle[]>([]);
  const [hasAppliedStyle, setHasAppliedStyle] = useState(false);
  const [isGeneratingStyleCards, setIsGeneratingStyleCards] = useState(false);

  // Edit Feedback State
  const [showEditFeedback, setShowEditFeedback] = useState(false);
  const [lastEditDescription, setLastEditDescription] = useState('');
  const prevEditHistoryLengthRef = useRef<number>(0); 
  const feedbackShownForRef = useRef<Set<string>>(new Set()); 
  
  // Background generation state
  const backgroundAnalysisRef = useRef<boolean>(false);
  const backgroundAssistantRef = useRef<boolean>(false);
  const lastBackgroundImageHash = useRef<string | null>(null);

  const [isGeneratingRender, setIsGeneratingRender] = useState(false);

  // Multi-View State
  const [visualizationViews, setVisualizationViews] = useState<string[]>([]);
  const [activeViewIndex, setActiveViewIndex] = useState(0);

  useEffect(() => {
    const checkKey = async () => {
      try {
        if (window.aistudio) {
          setApiKeySelected(await window.aistudio.hasSelectedApiKey());
        } else {
          const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
          setApiKeySelected(!!apiKey || true);
        }
      } catch (e) {
        console.error('Error checking API key:', e);
        setApiKeySelected(false);
      } finally {
        setIsKeyChecking(false);
      }
    };
    checkKey();
  }, []);

  useEffect(() => {
    const handleKeyboard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !isProcessing) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault();
          if (canUndo) undoEdit();
        }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
          e.preventDefault();
          if (canRedo) redoEdit();
        }
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [canUndo, canRedo, undoEdit, redoEdit, isProcessing]);

  useEffect(() => {
    if (editHistory.length > prevEditHistoryLengthRef.current && editHistory.length > 1) {
      const latestEdit = editHistory[editHistory.length - 1];
      if (latestEdit && latestEdit.description && latestEdit.operation !== 'Original') {
        const editKey = `${latestEdit.description}_${latestEdit.timestamp || editHistory.length}`;
        if (!feedbackShownForRef.current.has(editKey)) {
          const timeoutId = setTimeout(() => {
            feedbackShownForRef.current.add(editKey);
            setLastEditDescription(latestEdit.description);
            setShowEditFeedback(true);
          }, 500);
          
          setLastAnalyzedImageHash(null);
          lastBackgroundImageHash.current = null;
          backgroundAnalysisRef.current = false;
          backgroundAssistantRef.current = false;
          
          if (hasAppliedStyle) {
            setHasAppliedStyle(false);
            setStyleCards([]);
          }
          
          return () => clearTimeout(timeoutId);
        }
      }
    }
    prevEditHistoryLengthRef.current = editHistory.length;
  }, [editHistory.length, editHistory, hasAppliedStyle]);

  // Background Analysis: Run after initial upload and after every edit
  useEffect(() => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64 || !roomAnalysis) return;
    
    const imageHash = `${activeBase64.slice(0, 100)}_${activeBase64.length}`;
    
    // Skip if already analyzed this image or currently analyzing
    if (lastBackgroundImageHash.current === imageHash || isAnalyzing) return;
    
    if (showAnalysis) return;
    
    const runBackgroundAnalysis = async () => {
      if (backgroundAnalysisRef.current) return;
      backgroundAnalysisRef.current = true;
      
      try {
        const learningContext = learningStore.getLearningContext();
        const analysis = await analyzeImageQuality(
          activeBase64, 
          roomAnalysis.is_2d_plan || false,
          learningContext
        );
        
        setQualityAnalysis(analysis);
        setLastAnalyzedImageHash(imageHash);
        lastBackgroundImageHash.current = imageHash;
      } catch (error) {
        console.warn('[Background Analysis] Failed:', error);
      } finally {
        backgroundAnalysisRef.current = false;
      }
    };
    
    // Use requestIdleCallback for truly non-blocking execution
    // Falls back to setTimeout if not available
    const idleCallback = window.requestIdleCallback 
      ? window.requestIdleCallback(() => runBackgroundAnalysis(), { timeout: 2000 })
      : setTimeout(() => runBackgroundAnalysis(), 2000);
    
    return () => {
      if (window.requestIdleCallback && typeof idleCallback === 'number') {
        window.cancelIdleCallback(idleCallback);
      } else if (typeof idleCallback === 'number') {
        clearTimeout(idleCallback);
      }
    };
  }, [generatedImage, roomAnalysis, showAnalysis, isAnalyzing, learningStore]);

  useEffect(() => {
    // Clear analysis cache when version changes
    setLastAnalyzedImageHash(null);
    lastBackgroundImageHash.current = null;
    backgroundAnalysisRef.current = false;
    backgroundAssistantRef.current = false;
  }, [currentEditIndex]);

  // Background Assistant: Run after initial upload and after every edit
  useEffect(() => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64 || !roomAnalysis || scannedObjects.length === 0) return;
    
    // Skip if user is currently viewing assistant or analysis (don't run in background)
    if (isAssistantOpen || showAnalysis) return;
    
    // Skip if already generating or already running
    if (isGeneratingSuggestions || backgroundAssistantRef.current) return;
    
    // Run assistant generation in background
    const runBackgroundAssistant = async () => {
      if (backgroundAssistantRef.current) return; // Already running
      backgroundAssistantRef.current = true;
      
      try {
        await generateIdeas(activeBase64, roomAnalysis, scannedObjects, 'auto-refresh', false, hasAppliedStyle);
      } catch (error) {
        console.warn('[Background Assistant] Failed:', error);
      } finally {
        backgroundAssistantRef.current = false;
      }
    };
    
    // Use requestIdleCallback for non-blocking execution
    // Falls back to setTimeout if not available
    const idleCallback = window.requestIdleCallback 
      ? window.requestIdleCallback(() => runBackgroundAssistant(), { timeout: 3000 })
      : setTimeout(() => runBackgroundAssistant(), 3000);
    
    return () => {
      if (window.requestIdleCallback && typeof idleCallback === 'number') {
        window.cancelIdleCallback(idleCallback);
      } else if (typeof idleCallback === 'number') {
        clearTimeout(idleCallback);
      }
    };
  }, [generatedImage, roomAnalysis, scannedObjects.length, isAssistantOpen, showAnalysis, isGeneratingSuggestions, generateIdeas]);

  const handleConnectKey = async () => {
    if (window.aistudio) {
      await window.aistudio.openSelectKey();
      setApiKeySelected(true);
    }
  };

  const resetAll = () => {
    resetPins();
    clearLogs();
    clearImage();
    resetAgent();
    clearSuggestions();
    setReferenceImage(null);
    setReferenceDesc(null);
    setUserInput('');
    setShowAnalysis(false);
    setQualityAnalysis(null);
    setStyleCards([]);
    setHasAppliedStyle(false);
    setIsAssistantOpen(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setVisualizationViews([]);
    // Clear session-specific learning data (keeps learned preferences)
    learningStore.clearSessionData();
    // Clear analysis cache
    setLastAnalyzedImageHash(null);
    setQualityAnalysis(null);
    setActiveViewIndex(0);
  };

  const getActiveBase64 = () => {
    if (generatedImage) return generatedImage.split(',')[1];
    if (imageUrl) return imageUrl.split(',')[1];
    return null;
  };

  const handleImageClick = async (e: React.MouseEvent<HTMLDivElement>, rect: DOMRect) => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64) return;

    if (pins.length === 1 && isProcessing) {
       addLog('Wait for source identification before setting target.', 'error');
       return;
    }
    
    if (isProcessing && status !== 'Ready') return;

    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;
    
    addPin({ x, y });

    if (pins.length === 0 || pins.length === 2) {
       if (pins.length === 2) {
           setSelectedObject(null);
           addLog(`Resetting. New source at: [${x.toFixed(0)}, ${y.toFixed(0)}]`, 'action');
       } else {
           addLog(`Source identified: [${x.toFixed(0)}, ${y.toFixed(0)}]`, 'action');
       }
       await identifyObjectAtLocation(activeBase64, x, y);

    } else if (pins.length === 1) {
       addLog(`Target location set: [${x.toFixed(0)}, ${y.toFixed(0)}]. Ready for command.`, 'action');
    }
  };

  const handleObjectSelect = (obj: IdentifiedObject) => {
    setSelectedObject(obj);
    
    if (obj.category === 'Structure' && obj.box_2d) {
        const cx = (obj.box_2d[1] + obj.box_2d[3]) / 2;
        const cy = (obj.box_2d[0] + obj.box_2d[2]) / 2;
        resetPins();
        addPin({ x: cx, y: cy });
        addLog(`Room active: ${obj.name}`, 'action');
    }
  };

  const handleSend = async (overrideData?: ForceOverrideData, textOverride?: string) => {
    const activeBase64 = getActiveBase64();
    const textToSend = (textOverride && textOverride.trim()) || userInput;
    
    if (!activeBase64) {
      console.error('[handleSend] No active base64');
      return;
    }
    
    if (!textToSend?.trim() && !overrideData) {
      console.error('[handleSend] No text to send and no override data', { textOverride, userInput, textToSend });
      return;
    }
    
    // Capture reference before cleanup
    const refBase64 = referenceImage ? referenceImage.split(',')[1] : undefined;
    
    // Clear input immediately 
    setUserInput(''); 
    
    // Cleanup Reference UI immediately so next generation doesn't use it by mistake
    setReferenceImage(null);
    setReferenceDesc(null);
    
    await executeCommand(
        activeBase64, 
        textToSend, 
        !!overrideData, 
        overrideData, 
        referenceDesc || undefined, 
        refBase64
    );
  };
  
  const handleGetIdeas = async (goal: string) => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64) return;
    
    // If suggestions already exist (from background generation), just open
    if (suggestions.length > 0 && goal === 'Improve this room') {
      setIsAssistantOpen(true);
      return;
    }
    
    await generateIdeas(activeBase64, roomAnalysis, scannedObjects, goal, false, hasAppliedStyle);
  };
  
  const handleApplySuggestion = (suggestion: DesignSuggestion) => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64) return;
    
    const prompt = suggestion.suggested_prompt?.trim();
    if (!prompt) {
      addLog(`⚠️ Suggestion prompt is empty.`, 'error');
      return;
    }
    
    learningStore.recordLike(suggestion, roomAnalysis?.room_type || 'unknown');
    
    removeSuggestion(suggestion.id);
    
    setIsAssistantOpen(false);
    
    addLog(`✨ Applying idea: ${suggestion.title}`, 'action');
    
    // Auto-select target if possible
    if (suggestion.target_object_name) {
       const target = scannedObjects.find(o => o.name.toLowerCase() === suggestion.target_object_name.toLowerCase());
       if (target) setSelectedObject(target);
    }
    
    setTimeout(() => {
        handleSend(undefined, prompt);
    }, 100);
  };

  const handleDislikeSuggestion = (suggestion: DesignSuggestion) => {
    learningStore.recordDislike(suggestion);
    removeSuggestion(suggestion.id);
    addLog(`👎 Noted: Will avoid similar suggestions`, 'thought');
  };

  const handleLikeSuggestion = (suggestion: DesignSuggestion) => {
    learningStore.recordLike(suggestion, roomAnalysis?.room_type || 'unknown');
    addLog(`👍 Noted: Will suggest more like this`, 'thought');
  };

  // Quality Analysis Handler
  const handleRunAnalysis = async () => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64) return;

    // Simple hash to detect image changes (first 100 chars + length)
    const imageHash = `${activeBase64.slice(0, 100)}_${activeBase64.length}`;
    
    // If already showing analysis and image hasn't changed, just toggle visibility
    if (showAnalysis) {
      setShowAnalysis(false);
      return;
    }

    setShowAnalysis(true);

    // Use cached analysis if image hasn't changed
    if (qualityAnalysis && lastAnalyzedImageHash === imageHash) {
      addLog('📋 Using cached analysis (no changes detected)', 'thought');
      return;
    }

    setIsAnalyzing(true);
    addLog('🔍 Running quality analysis...', 'analysis');

    try {
      // Get learning context for analysis
      const learningContext = learningStore.getLearningContext();
      const analysis = await analyzeImageQuality(
        activeBase64, 
        roomAnalysis?.is_2d_plan || false,
        learningContext
      );
      setQualityAnalysis(analysis);
      setLastAnalyzedImageHash(imageHash);

      const criticalCount = analysis.issues.filter((i) => i.severity === 'critical').length;
      const warningCount = analysis.issues.filter((i) => i.severity === 'warning').length;

      if (criticalCount > 0) {
        addLog(`⚠️ Found ${criticalCount} critical issues requiring attention`, 'error');
      } else if (warningCount > 0) {
        addLog(`📋 Found ${warningCount} improvements suggested`, 'thought');
      } else {
        addLog(`✓ Quality score: ${analysis.overall_score}/100`, 'success');
      }
    } catch (e) {
      addLog(`Analysis failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApplyFix = (fixPrompt: string) => {
    setShowAnalysis(false);
    setUserInput(fixPrompt);
    addLog(`🔧 Fix loaded: ${fixPrompt.slice(0, 50)}...`, 'action');
  };

  // Edit Feedback Handlers (for direct edits, not assistant)
  // Optimistic: Update UI immediately, analyze in background
  const handleEditLike = () => {
    // Update UI immediately (optimistic)
    learningStore.recordEditApplied(lastEditDescription, roomAnalysis?.room_type || 'unknown');
    learningStore.recordSuccess(lastEditDescription, roomAnalysis?.room_type || 'unknown');
    addLog('👍 AI learned from this successful edit', 'thought');
    
    // Analyze prompt pattern in background (non-blocking)
    const latestEdit = editHistory[editHistory.length - 1];
    if (latestEdit) {
      const operationType = latestEdit.operation || 'EDIT';
      // Run in background without blocking UI
      setTimeout(() => {
        analyzePromptPattern(
          lastEditDescription,
          operationType,
          true // successful
        ).catch(err => {
          console.warn('[Background] Prompt pattern analysis failed:', err);
        });
      }, 0);
    }
  };

  const handleEditDislike = (reason: import('./components/feedback/EditFeedback').FeedbackReason) => {
    // Update UI immediately (optimistic)
    learningStore.recordEditDisliked(
      lastEditDescription,
      reason,
      roomAnalysis?.room_type || 'unknown'
    );

    // Log specific feedback based on reason (immediate)
    const reasonMessages: Record<string, string> = {
      hallucination: '🚫 AI hallucination reported - will be more careful',
      quality: '📉 Quality issue noted - will prioritize output quality',
      style_mismatch: '🎨 Style mismatch recorded - learning your preferences',
      wrong_target: '🎯 Wrong target noted - will improve object selection',
      incomplete: '⚠️ Incomplete edit noted - will try to be more thorough',
      other: '📝 Feedback recorded',
    };

    addLog(reasonMessages[reason] || '📝 Feedback recorded', 'thought');

    // Analyze prompt pattern in background (non-blocking)
    const latestEdit = editHistory[editHistory.length - 1];
    if (latestEdit) {
      const operationType = latestEdit.operation || 'EDIT';
      const failureReason = reason === 'hallucination' ? 'hallucination' :
                           reason === 'quality' ? 'quality' :
                           reason === 'style_mismatch' ? 'style' : 'quality';
      
      // Run in background without blocking UI
      setTimeout(() => {
        analyzePromptPattern(
          lastEditDescription,
          operationType,
          false, // failed
          failureReason
        ).catch(err => {
          console.warn('[Background] Prompt pattern analysis failed:', err);
        });
      }, 0);
    }
  };

  // Style Cards for 2D Floor Plans
  const handleGenerateStyleCards = async () => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64 || !roomAnalysis?.is_2d_plan) return;

    setIsGeneratingStyleCards(true);
    addLog('🎨 Analyzing floor plan for style recommendations...', 'analysis');

    try {
      const cards = await generateFloorPlanStyleCards(activeBase64, roomAnalysis, scannedObjects);
      setStyleCards(cards);
      setIsAssistantOpen(true);
      addLog(`✓ Generated ${cards.length} style recommendations`, 'success');
    } catch (e) {
      addLog(`Style analysis failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setIsGeneratingStyleCards(false);
    }
  };

  const handleApplyStyle = async (style: FloorPlanStyle) => {
    const activeBase64 = getActiveBase64();
    if (!activeBase64) {
      addLog(`⚠️ No active image to apply style to.`, 'error');
      return;
    }

    const prompt = style.preview_prompt?.trim();
    if (!prompt) {
      addLog(`⚠️ Style prompt is empty. Cannot apply style.`, 'error');
      return;
    }

    setHasAppliedStyle(true);
    setIsAssistantOpen(false);
    addLog(`🎨 Applying ${style.name} style...`, 'action');

    // Record learning
    const mockSuggestion: DesignSuggestion = {
      id: style.id,
      title: style.name,
      description: style.description,
      action_type: 'EDIT',
      target_object_name: 'Floor Plan',
      suggested_prompt: prompt,
      icon_hint: 'style',
      confidence: style.confidence,
    };
    learningStore.recordLike(mockSuggestion, 'floor_plan');

    // Execute the style visualization - call handleSend with the prompt
    setTimeout(() => {
      handleSend(undefined, prompt);
    }, 100);
  };

  const handleEditSuggestion = (suggestion: DesignSuggestion) => {
      // Populate input with suggestion prompt for editing
      setUserInput(suggestion.suggested_prompt);
      setIsAssistantOpen(false);
      
      // Auto-select target if possible
      if (suggestion.target_object_name) {
         const target = scannedObjects.find(o => o.name.toLowerCase() === suggestion.target_object_name.toLowerCase());
         if (target) setSelectedObject(target);
      }
      
      // Focus the input field after a brief delay to ensure it's rendered
      setTimeout(() => {
        const inputElement = document.querySelector('textarea[placeholder*="command"], input[placeholder*="command"], textarea[placeholder*="Tell"], input[placeholder*="Tell"]') as HTMLTextAreaElement | HTMLInputElement;
        if (inputElement) {
          inputElement.focus();
          inputElement.setSelectionRange(inputElement.value.length, inputElement.value.length);
        }
      }, 100);
  };

  const handleReferenceUpload = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const result = e.target?.result as string;
      setReferenceImage(result);
      const base64 = result.split(',')[1];
      
      // analyzeReference now handles its own isProcessing state, locking the UI
      const desc = await analyzeReference(base64);
      setReferenceDesc(desc);
      
      // Auto-populate prompt AFTER analysis is complete (if not cancelled)
      if (desc) {
          if (selectedObject) {
             setUserInput(`Change ${selectedObject.name} using this reference`);
          } else {
             setUserInput(`Apply this reference style to the room`);
          }
      }
    };
    reader.readAsDataURL(file);
  };
  
  const handleClearReference = () => {
      // If we are currently analyzing, we must cancel the operation
      if (status === 'Analyzing Reference...') {
          cancelOperation();
      }
      setReferenceImage(null);
      setReferenceDesc(null);
  };

  const handleGenerateFromPlan = async (
      planBase64: string, 
      maskBase64: string, 
      refBase64: string | null, 
      stylePrompt: string,
      existingObjects?: IdentifiedObject[],
      isAlreadyVisualized: boolean = false
  ) => {
    setIsGeneratingRender(true);
    addLog('📐 Initiating Visualization Pipeline...', 'thought');
    addLog('Generating photorealistic projection...', 'analysis');

    if (existingObjects && existingObjects.length > 0) {
        addLog(`Using ${existingObjects.length} ground-truth objects.`, 'thought');
    }
    
    if (isAlreadyVisualized) {
        addLog('Preserving existing structure...', 'thought');
    }

    try {
      const resultImages = await generateMultiAngleRender(planBase64, maskBase64, refBase64, stylePrompt, existingObjects, isAlreadyVisualized);
      
      addLog(`✓ Visualization complete.`, 'success');
      
      setVisualizationViews(resultImages);
      setActiveViewIndex(0);
      
      // Load the first view automatically
      const firstImage = resultImages[0];
      setImageUrl(firstImage);
      
      // Perform initial scan on the first view
      const pureBase64 = firstImage.split(',')[1];
      // IMPORTANT: Add to history instead of resetting, preserving Plan context
      performInitialScan(pureBase64, true);

    } catch (e) {
      addLog(`Render failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setIsGeneratingRender(false);
    }
  };

  const handleVisualizeObject = async (targetObject: IdentifiedObject, prompt: string) => {
      const activeBase64 = getActiveBase64();
      if (!activeBase64 || !targetObject.box_2d) {
         addLog("Could not visualize: Missing image or selection bounds.", 'error');
         return;
      }

      setIsGeneratingRender(true);
      addLog(`🔍 Isolating "${targetObject.name}" for 3D visualization...`, 'thought');

      try {
         // 1. Calculate Padded Crop Box
         const pad = 50; // Padding to include walls/context
         const [ymin, xmin, ymax, xmax] = targetObject.box_2d;
         const paddedBox: [number, number, number, number] = [
            Math.max(0, ymin - pad),
            Math.max(0, xmin - pad),
            Math.min(1000, ymax + pad),
            Math.min(1000, xmax + pad)
         ];

         // 2. Crop Image
         const croppedBase64 = await cropBase64Image(activeBase64, paddedBox);
         const croppedDataUrl = `data:image/png;base64,${croppedBase64}`;
         
         // 3. Generate Mask for Crop
         const maskDataUrl = await generateBinaryMask(croppedDataUrl);
         const maskBase64 = maskDataUrl.split(',')[1];
         
         // 4. Render
         const refBase64 = referenceImage ? referenceImage.split(',')[1] : null;
         
         // Check if this is already a visualized image (not original plan)
         // If generatedImage exists or we have edit history, it's already visualized
         const isAlreadyVisualized = !!generatedImage || editHistory.length > 1;
         
         addLog(`Rendering detailed view...`, 'action');
         // Pass isAlreadyVisualized flag to preserve structure when visualizing from existing render
         await handleGenerateFromPlan(croppedBase64, maskBase64, refBase64, prompt || `Visualize ${targetObject.name} in realistic style`, [targetObject], isAlreadyVisualized);

      } catch (e) {
        addLog(`Visualization failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
        setIsGeneratingRender(false);
      }
  };

  const handleSwitchView = (index: number) => {
    if (index < 0 || index >= visualizationViews.length) return;
    
    // Switch Active View
    const newImage = visualizationViews[index];
    setActiveViewIndex(index);
    setImageUrl(newImage);
    
    // Reset agent state for the new view (new perspective = new objects)
    resetAgent();
    setVisualizationViews(visualizationViews); // Preserve views array after reset
    setActiveViewIndex(index); // Preserve index after reset
    setImageUrl(newImage); // Preserve image after reset

    addLog(`Switched view. Scanning new perspective...`, 'action');
    
    const pureBase64 = newImage.split(',')[1];
    performInitialScan(pureBase64);
  };
  
  const handleCanvasQuickAction = (action: 'remove' | 'style', object: IdentifiedObject) => {
     handleObjectSelect(object);
     
     if (action === 'remove') {
        addLog(`Quick Action: Removing ${object.name}...`, 'action');
        const removeTranslation: IntentTranslation = {
           operation_type: 'REMOVE',
           interpreted_intent: `Quick Remove: ${object.name}`,
           proposed_action: `Remove the ${object.name} completely. Inpaint the background to match surroundings.`,
           spatial_check_required: false,
           imagen_prompt: `Remove ${object.name}`,
           active_subject_name: object.name
        };
        handleSend({ forceAction: removeTranslation, forceObject: object });
     } else if (action === 'style') {
        setUserInput(`Change material of ${object.name} to...`);
     }
  };

  if (isKeyChecking) return <div className="h-screen w-screen bg-slate-950 flex items-center justify-center text-slate-500">Checking permissions...</div>;

  if (!apiKeySelected) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-20 h-20 bg-indigo-600 rounded-2xl flex items-center justify-center mb-6 shadow-2xl shadow-indigo-500/20">
          <Target className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-100 mb-2">SpaceVision Spatial Intelligence</h1>
        <button onClick={handleConnectKey} className="flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg">
          <Key className="w-5 h-5" /> Connect API Key
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Canvas
        imageUrl={imageUrl}
        generatedImage={generatedImage}
        status={isGeneratingRender ? 'Generating Visualization...' : status}
        pins={pins}
        isProcessing={isProcessing || isGeneratingRender}
        onImageClick={handleImageClick}
        onFileUpload={handleFileUpload}
        onReset={resetAll}
        fileInputRef={fileInputRef}
        canUndo={canUndo}
        canRedo={canRedo}
        currentEditIndex={currentEditIndex}
        onUndo={undoEdit}
        onRedo={redoEdit}
        onResetToOriginal={resetToOriginal}
        // Quality Analysis (replaces Insights)
        hasInsights={!!roomAnalysis}
        onToggleInsights={handleRunAnalysis}
        // Design Assistant Trigger - opens style studio for 2D plans
        onOpenAutonomous={() => {
          if (roomAnalysis?.is_2d_plan && !hasAppliedStyle) {
            handleGenerateStyleCards();
          } else {
            setIsAssistantOpen(true);
          }
        }}
        // Detected Objects for Visualization
        detectedObjects={scannedObjects}
        // New Render Prop
        onGenerateFromPlan={handleGenerateFromPlan}
        // Multi-View Props
        visualizationViews={visualizationViews}
        activeViewIndex={activeViewIndex}
        onViewSwitch={handleSwitchView}
        // Quick Actions
        onQuickAction={handleCanvasQuickAction}
      />

      <div className="w-[420px] h-full flex flex-col border-l border-slate-800 bg-slate-900 z-20 shadow-2xl relative">
          {/* Auth Status for Imagen */}
          <div className="px-4 py-2 border-b border-slate-800 flex justify-end">
            <AuthButton />
          </div>
          
          <ReasoningPanel 
            logs={logs}
            status={isGeneratingRender ? 'Generating Visualization...' : status}
            isProcessing={isProcessing || isGeneratingRender}
            onForceExecute={(action, object) => handleSend({ forceAction: action, forceObject: object })}
            onAlternativeClick={(suggestion) => setUserInput(suggestion)}
            activeModel={activeModel}
            onModelChange={setActiveModel}
            editHistory={editHistory}
            currentEditIndex={currentEditIndex}
            onJumpToHistory={jumpToEdit}
            onExportHistory={exportHistory}
            onCancel={cancelOperation}
          />
          
          <InputArea 
            userInput={userInput}
            setUserInput={setUserInput}
            onSend={() => handleSend()}
            disabled={!imageUrl || isProcessing || isGeneratingRender}
            placeholder={pins.length === 2 ? "Type 'Move'..." : selectedObject ? `Modify ${selectedObject.name}...` : "Type to edit entire room..."}
            onReferenceUpload={handleReferenceUpload}
            referenceImagePreview={referenceImage}
            onClearReference={handleClearReference}
            // Pass hierarchy handlers
            selectedObject={selectedObject}
            onObjectUpdate={handleObjectSelect}
            onClearSelection={() => {
              setSelectedObject(null);
              resetPins();
            }}
            // New Visualization Handler
            onVisualize={handleVisualizeObject}
            // Pass detected objects for Room Selection
            detectedObjects={scannedObjects}
            // Trigger Assistant
            onGetIdeas={handleGetIdeas}
            // Is Rendered View Flag
            isRenderedView={visualizationViews.length > 0}
            // 2D Plan Flag
            isPlan={roomAnalysis?.is_2d_plan || false}
          />

          {/* Design Assistant Panel */}
          <DesignAssistant
            isOpen={isAssistantOpen}
            onClose={() => setIsAssistantOpen(false)}
            suggestions={suggestions}
            isGenerating={isGeneratingSuggestions || isGeneratingStyleCards}
            onApply={handleApplySuggestion}
            onDismiss={dismissSuggestion}
            onEditPreview={handleEditSuggestion}
            onDislike={handleDislikeSuggestion}
            onLike={handleLikeSuggestion}
            is2DPlan={roomAnalysis?.is_2d_plan || false}
            styleCards={styleCards}
            onApplyStyle={handleApplyStyle}
            hasAppliedStyle={hasAppliedStyle}
          />
      </div>

      {/* Quality Analysis Panel */}
      <QualityAnalysisPanel
        analysis={qualityAnalysis}
        isVisible={showAnalysis}
        onClose={() => setShowAnalysis(false)}
        onApplyFix={handleApplyFix}
        isLoading={isAnalyzing}
      />

      {/* Edit Feedback Prompt - appears after each direct edit */}
      <EditFeedback
        isVisible={showEditFeedback}
        editDescription={lastEditDescription}
        onLike={handleEditLike}
        onDislike={handleEditDislike}
        onDismiss={() => setShowEditFeedback(false)}
      />
    </div>
  );
};

export default App;
