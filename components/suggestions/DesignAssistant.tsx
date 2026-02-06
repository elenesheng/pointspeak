import React, { useRef, useState } from 'react';
import {
  Sparkles,
  X,
  ArrowRight,
  Palette,
  Move,
  Trash2,
  Lightbulb,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  Wand2,
  ChevronRight,
  Check,
  Star,
  Brain,
} from 'lucide-react';
import { DesignSuggestion } from '../../types/ai.types';
import { FloorPlanStyle } from '../../services/gemini/suggestionService';
import { IdentifiedObject } from '../../types/spatial.types';
import { useClickOutside } from '../../hooks/useClickOutside';
import { LearningSummary } from '../feedback/LearningSummary';
import { useLearningStore } from '../../store/learningStore';

interface DesignAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  suggestions: DesignSuggestion[];
  isGenerating: boolean;
  onApply: (suggestion: DesignSuggestion) => void;
  onDismiss: (id: string) => void;
  onEditPreview: (suggestion: DesignSuggestion) => void;
  onDislike?: (suggestion: DesignSuggestion) => void;
  onLike?: (suggestion: DesignSuggestion) => void;
  is2DPlan?: boolean;
  styleCards?: FloorPlanStyle[];
  onApplyStyle?: (style: FloorPlanStyle, selectedRoom?: IdentifiedObject) => void;
  hasAppliedStyle?: boolean;
  availableRooms?: IdentifiedObject[];
}

export const DesignAssistant: React.FC<DesignAssistantProps> = ({
  isOpen,
  onClose,
  suggestions,
  isGenerating,
  onApply,
  onDismiss,
  onEditPreview,
  onDislike,
  onLike,
  is2DPlan = false,
  styleCards = [],
  onApplyStyle,
  hasAppliedStyle = false,
  availableRooms = [],
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [dislikedIds, setDislikedIds] = useState<Set<string>>(new Set());
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const [selectedRoomForStyle, setSelectedRoomForStyle] = useState<IdentifiedObject | null>(null);
  const [showLearning, setShowLearning] = useState(false);
  const { patterns } = useLearningStore();

  const hasLearningData = patterns.totalLikes > 0 || patterns.likedStyles.length > 0;

  useClickOutside(panelRef, () => {
    if (isOpen) onClose();
  });

  if (!isOpen) return null;

  const getIcon = (hint: string) => {
    switch (hint) {
      case 'remove':
        return <Trash2 className="w-4 h-4 text-rose-400" />;
      case 'layout':
        return <Move className="w-4 h-4 text-sky-400" />;
      case 'color':
        return <Palette className="w-4 h-4 text-purple-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  };

  const handleLike = (suggestion: DesignSuggestion) => {
    setLikedIds((prev) => new Set(prev).add(suggestion.id));
    setDislikedIds((prev) => {
      const next = new Set(prev);
      next.delete(suggestion.id);
      return next;
    });
    onLike?.(suggestion);
  };

  const handleDislike = (suggestion: DesignSuggestion) => {
    setDislikedIds((prev) => new Set(prev).add(suggestion.id));
    setLikedIds((prev) => {
      const next = new Set(prev);
      next.delete(suggestion.id);
      return next;
    });
    onDislike?.(suggestion);
  };

  const showStyleCards = is2DPlan && !hasAppliedStyle && styleCards.length > 0;

  return (
    <div
      ref={panelRef}
      className="absolute right-0 top-16 bottom-0 w-80 bg-slate-900/95 border-l border-slate-800 shadow-2xl z-40 transform transition-transform animate-in slide-in-from-right duration-300 flex flex-col backdrop-blur-md"
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${showStyleCards ? 'bg-violet-600' : 'bg-indigo-600'}`}>
            {showStyleCards ? (
              <Wand2 className="w-4 h-4 text-white" />
            ) : (
              <Lightbulb className="w-4 h-4 text-white" />
            )}
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-sm">
              {showStyleCards ? 'Style Studio' : 'Design Assistant'}
            </h3>
            {showStyleCards && (
              <p className="text-[10px] text-slate-400">Choose a style for your floor plan</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {hasLearningData && (
            <button
              onClick={() => setShowLearning(!showLearning)}
              className={`p-1.5 rounded-lg transition-colors ${
                showLearning
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-slate-800 text-slate-400 hover:text-white'
              }`}
              title="View AI Learning"
            >
              <Brain className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Learning Summary Panel */}
      {showLearning && hasLearningData && (
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 animate-in slide-in-from-top-2">
          <LearningSummary showTitle={false} />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-48 text-center space-y-3">
            <Sparkles className="w-8 h-8 text-indigo-400 animate-spin" />
            <p className="text-sm text-slate-400 font-medium">
              {showStyleCards ? 'Analyzing floor plan geometry...' : 'Generating creative ideas...'}
            </p>
          </div>
        ) : showStyleCards ? (
          <>
            {/* Style Cards for 2D Floor Plans */}
            <div className="bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-500/20 rounded-xl p-3 mb-4">
              <p className="text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-violet-400">AI Recommendation:</span> Based on your
                floor plan's geometry, here are the best-matched interior styles.
              </p>
            </div>

            {styleCards.map((style, index) => (
              <div
                key={style.id}
                className={`border rounded-xl p-4 transition-all cursor-pointer group ${
                  selectedStyleId === style.id
                    ? 'bg-violet-500/20 border-violet-500/50'
                    : 'bg-slate-800/50 border-slate-700 hover:border-violet-500/30'
                }`}
                onClick={() => setSelectedStyleId(style.id === selectedStyleId ? null : style.id)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {index === 0 && (
                      <div className="p-1 bg-amber-500/20 rounded">
                        <Star className="w-3 h-3 text-amber-400" />
                      </div>
                    )}
                    <h4 className="text-sm font-bold text-white">{style.name}</h4>
                  </div>
                  <div className="flex items-center gap-1">
                    <div
                      className="h-1.5 w-12 bg-slate-700 rounded-full overflow-hidden"
                      title={`${Math.round(style.confidence * 100)}% match`}
                    >
                      <div
                        className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
                        style={{ width: `${style.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {Math.round(style.confidence * 100)}%
                    </span>
                  </div>
                </div>

                <p className="text-xs text-slate-400 mb-2">{style.description}</p>

                {selectedStyleId === style.id && (
                  <div className="mt-3 pt-3 border-t border-slate-700 animate-in slide-in-from-top-2">
                    <p className="text-xs text-violet-300 mb-3 italic">"{style.why_fits}"</p>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {style.characteristics.map((char, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] text-slate-300"
                        >
                          {char}
                        </span>
                      ))}
                    </div>

                    {/* Room Selection for Multi-Room Plans */}
                    {availableRooms.length > 1 && (
                      <div className="mb-3">
                        <label className="text-xs text-slate-400 mb-2 block">Select Room:</label>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRoomForStyle(null);
                            }}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                              selectedRoomForStyle === null
                                ? 'bg-violet-600 text-white'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                            }`}
                          >
                            All Rooms
                          </button>
                          {availableRooms.map((room) => (
                            <button
                              key={room.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedRoomForStyle(room);
                              }}
                              className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                                selectedRoomForStyle?.id === room.id
                                  ? 'bg-violet-600 text-white'
                                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
                              }`}
                            >
                              {room.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onApplyStyle?.(style, selectedRoomForStyle || undefined);
                      }}
                      className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-violet-900/30 active:scale-95"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Apply {style.name} Style{selectedRoomForStyle ? ` to ${selectedRoomForStyle.name}` : ''}
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </>
        ) : suggestions.length === 0 ? (
          <div className="text-center text-slate-500 py-8 text-sm">
            No suggestions yet. Start editing to get creative ideas!
          </div>
        ) : (
          suggestions.map((suggestion) => {
            const isLiked = likedIds.has(suggestion.id);
            const isDisliked = dislikedIds.has(suggestion.id);

            return (
              <div
                key={suggestion.id}
                className={`border rounded-xl p-4 transition-all group relative ${
                  isLiked
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : isDisliked
                      ? 'bg-slate-800/30 border-slate-700/50 opacity-60'
                      : 'bg-slate-800/50 border-slate-700 hover:border-indigo-500/50'
                }`}
              >
                {/* Card Actions */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditPreview(suggestion);
                    }}
                    className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-700"
                    title="Edit text before sending"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDismiss(suggestion.id);
                    }}
                    className="p-1.5 bg-slate-800 hover:bg-rose-900/50 rounded-lg text-slate-400 hover:text-rose-400 transition-colors border border-slate-700 hover:border-rose-800"
                    title="Dismiss suggestion"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div className="flex items-start justify-between mb-2">
                  <div className="p-2 bg-slate-800 rounded-lg border border-slate-700 group-hover:bg-slate-700 transition-colors">
                    {getIcon(suggestion.icon_hint)}
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider px-2 py-1 bg-slate-800 rounded-lg mr-12">
                    {suggestion.action_type}
                  </span>
                </div>

                <h4 className="text-sm font-bold text-slate-200 mb-1">{suggestion.title}</h4>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">{suggestion.description}</p>

                {/* Feedback Buttons */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] text-slate-500">Helpful?</span>
                  <button
                    onClick={() => handleLike(suggestion)}
                    className={`p-1.5 rounded-lg transition-all ${
                      isLiked
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-slate-800 text-slate-400 hover:text-emerald-400 border border-slate-700 hover:border-emerald-500/30'
                    }`}
                    title="This suggestion is helpful"
                  >
                    {isLiked ? <Check className="w-3 h-3" /> : <ThumbsUp className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => handleDislike(suggestion)}
                    className={`p-1.5 rounded-lg transition-all ${
                      isDisliked
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                        : 'bg-slate-800 text-slate-400 hover:text-orange-400 border border-slate-700 hover:border-orange-500/30'
                    }`}
                    title="Not helpful - helps AI learn"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                  {isLiked && (
                    <span className="text-[10px] text-emerald-400 ml-1">AI will remember this!</span>
                  )}
                </div>

                <button
                  onClick={() => onApply(suggestion)}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/20 active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Visualize This
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 border-t border-slate-800 bg-slate-900/50 text-[10px] text-slate-500 text-center">
        {showStyleCards
          ? 'Styles recommended based on floor plan geometry'
          : 'AI learns from your feedback to improve suggestions'}
      </div>
    </div>
  );
};
