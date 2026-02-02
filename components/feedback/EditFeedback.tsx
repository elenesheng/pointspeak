import React, { useState, useEffect } from 'react';
import {
  ThumbsUp,
  ThumbsDown,
  Check,
  Sparkles,
  Ghost,
  Palette,
  ImageOff,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';

export type FeedbackReason =
  | 'hallucination' // AI invented/changed things it shouldn't
  | 'quality' // Output quality is poor (blurry, artifacts)
  | 'style_mismatch' // Doesn't match desired style
  | 'wrong_target' // Changed wrong object
  | 'incomplete' // Didn't fully complete the task
  | 'other';

interface EditFeedbackProps {
  isVisible: boolean;
  editDescription: string;
  onLike: () => void;
  onDislike: (reason: FeedbackReason, details?: string) => void;
  onDismiss: () => void;
}

const FEEDBACK_REASONS: { id: FeedbackReason; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: 'hallucination',
    label: 'AI Hallucinated',
    icon: <Ghost className="w-4 h-4" />,
    description: 'AI invented new objects or changed things I didn\'t ask for',
  },
  {
    id: 'quality',
    label: 'Poor Quality',
    icon: <ImageOff className="w-4 h-4" />,
    description: 'Blurry, artifacts, or degraded image quality',
  },
  {
    id: 'style_mismatch',
    label: 'Wrong Style',
    icon: <Palette className="w-4 h-4" />,
    description: 'Doesn\'t match my style preferences',
  },
  {
    id: 'wrong_target',
    label: 'Wrong Object',
    icon: <HelpCircle className="w-4 h-4" />,
    description: 'Changed the wrong object or area',
  },
  {
    id: 'incomplete',
    label: 'Incomplete',
    icon: <ChevronRight className="w-4 h-4" />,
    description: 'Task wasn\'t fully completed',
  },
];

export const EditFeedback: React.FC<EditFeedbackProps> = ({
  isVisible,
  editDescription,
  onLike,
  onDislike,
  onDismiss,
}) => {
  const [stage, setStage] = useState<'initial' | 'reason' | 'done'>('initial');
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setStage('initial');
      setFeedback(null);
      setIsClosing(false);
    }
  }, [isVisible, editDescription]);

  const handleLike = () => {
    setFeedback('like');
    setStage('done');
    onLike();
    setTimeout(() => {
      setIsClosing(true);
      setTimeout(onDismiss, 300);
    }, 1500);
  };

  const handleDislikeClick = () => {
    setFeedback('dislike');
    setStage('reason');
  };

  const handleReasonSelect = (reason: FeedbackReason) => {
    onDislike(reason);
    setStage('done');
    setTimeout(() => {
      setIsClosing(true);
      setTimeout(onDismiss, 300);
    }, 1500);
  };

  const handleSkip = () => {
    setIsClosing(true);
    setTimeout(onDismiss, 300);
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed bottom-24 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isClosing ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'
      }`}
    >
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4">
        {/* Initial Question */}
        {stage === 'initial' && (
          <div className="p-4 flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Did this edit work well?</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleLike}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 hover:border-emerald-500/50 rounded-lg text-emerald-400 text-sm font-medium transition-all"
              >
                <ThumbsUp className="w-4 h-4" />
                Yes
              </button>
              <button
                onClick={handleDislikeClick}
                className="flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 hover:border-orange-500/50 rounded-lg text-orange-400 text-sm font-medium transition-all"
              >
                <ThumbsDown className="w-4 h-4" />
                No
              </button>
              <button
                onClick={handleSkip}
                className="px-3 py-2 text-slate-500 hover:text-slate-300 text-sm transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        )}

        {/* Reason Selection */}
        {stage === 'reason' && (
          <div className="p-4">
            <div className="text-sm text-slate-300 mb-3">What went wrong?</div>
            <div className="grid grid-cols-1 gap-2 max-w-md">
              {FEEDBACK_REASONS.map((reason) => (
                <button
                  key={reason.id}
                  onClick={() => handleReasonSelect(reason.id)}
                  className="flex items-center gap-3 px-3 py-2.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-orange-500/30 rounded-lg text-left transition-all group"
                >
                  <div className="p-1.5 bg-slate-700 group-hover:bg-orange-500/20 rounded-lg text-slate-400 group-hover:text-orange-400 transition-colors">
                    {reason.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200">{reason.label}</div>
                    <div className="text-xs text-slate-500 truncate">{reason.description}</div>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={handleSkip}
              className="mt-3 w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Skip feedback
            </button>
          </div>
        )}

        {/* Done State */}
        {stage === 'done' && (
          <div className="p-4">
            {feedback === 'like' ? (
              <div className="flex items-center gap-2 text-emerald-400">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Great! AI will prioritize similar edits.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-orange-400">
                <Check className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Noted! AI will learn from this mistake.
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
