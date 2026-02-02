import React from 'react';
import { Brain, Heart, Ban, TrendingUp, Sparkles, Lightbulb, Ghost, ImageOff, Palette } from 'lucide-react';
import { useLearningStore } from '../../store/learningStore';

interface LearningSummaryProps {
  compact?: boolean;
  showTitle?: boolean;
  className?: string;
}

export const LearningSummary: React.FC<LearningSummaryProps> = ({
  compact = false,
  showTitle = true,
  className = '',
}) => {
  const { patterns, getStylePreferences, getFailureStats } = useLearningStore();

  const likedStyles = getStylePreferences().slice(0, 6);
  const dislikedStyles = patterns.dislikedStyles.slice(0, 4);
  const totalFeedback = patterns.totalLikes + patterns.totalDislikes;
  const successRate =
    totalFeedback > 0 ? Math.round((patterns.totalLikes / totalFeedback) * 100) : 0;

  // Get recent successful patterns
  const recentSuccesses = patterns.successfulPatterns.slice(-3);
  
  // Get failure stats
  const failureStats = getFailureStats();

  if (totalFeedback === 0 && likedStyles.length === 0) {
    return (
      <div className={`bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 ${className}`}>
        <div className="flex items-center gap-2 text-slate-400">
          <Brain className="w-4 h-4" />
          <span className="text-sm">No preferences learned yet. Like/dislike edits to train AI.</span>
        </div>
      </div>
    );
  }

  if (compact) {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {likedStyles.slice(0, 4).map((style) => (
          <span
            key={style}
            className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 flex items-center gap-1"
          >
            <Heart className="w-3 h-3" />
            {style}
          </span>
        ))}
        {dislikedStyles.slice(0, 2).map((style) => (
          <span
            key={style}
            className="px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg text-xs text-orange-300 flex items-center gap-1"
          >
            <Ban className="w-3 h-3" />
            {style}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-br from-indigo-500/5 to-violet-500/5 border border-indigo-500/20 rounded-xl overflow-hidden ${className}`}>
      {showTitle && (
        <div className="px-4 py-3 border-b border-indigo-500/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-indigo-400" />
            <span className="text-sm font-bold text-white">AI Learning</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <TrendingUp className="w-3 h-3" />
            <span>{totalFeedback} edits analyzed</span>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4">
        {/* Success Rate */}
        {totalFeedback >= 3 && (
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400">Success Rate</span>
                <span className="text-xs font-bold text-emerald-400">{successRate}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                  style={{ width: `${successRate}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Liked Styles */}
        {likedStyles.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Heart className="w-3 h-3 text-emerald-400" />
              <span className="text-xs font-medium text-slate-300">You prefer</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {likedStyles.map((style) => (
                <span
                  key={style}
                  className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300 capitalize"
                >
                  {style}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Disliked Styles */}
        {dislikedStyles.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Ban className="w-3 h-3 text-orange-400" />
              <span className="text-xs font-medium text-slate-300">AI avoids</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {dislikedStyles.map((style) => (
                <span
                  key={style}
                  className="px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg text-xs text-orange-300 capitalize"
                >
                  {style}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Failure Pattern Awareness */}
        {failureStats.total > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Ban className="w-3 h-3 text-orange-400" />
              <span className="text-xs font-medium text-slate-300">AI is avoiding</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {failureStats.hallucinations > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-rose-500/10 border border-rose-500/20 rounded-lg text-xs text-rose-300">
                  <Ghost className="w-3 h-3" />
                  <span>Hallucinations ({failureStats.hallucinations})</span>
                </div>
              )}
              {failureStats.quality > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
                  <ImageOff className="w-3 h-3" />
                  <span>Quality issues ({failureStats.quality})</span>
                </div>
              )}
              {failureStats.style > 0 && (
                <div className="flex items-center gap-1 px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg text-xs text-violet-300">
                  <Palette className="w-3 h-3" />
                  <span>Style mismatches ({failureStats.style})</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Successes */}
        {recentSuccesses.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              <span className="text-xs font-medium text-slate-300">Recent wins</span>
            </div>
            <div className="space-y-1">
              {recentSuccesses.map((pattern, i) => (
                <div
                  key={i}
                  className="text-xs text-slate-400 truncate pl-2 border-l-2 border-indigo-500/30"
                >
                  {pattern.length > 50 ? pattern.slice(0, 50) + '...' : pattern}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tip */}
        <div className="pt-2 border-t border-slate-800/50">
          <div className="flex items-start gap-2 text-[10px] text-slate-500">
            <Lightbulb className="w-3 h-3 mt-0.5 text-amber-500/50" />
            <span>
              {failureStats.hallucinations > 2
                ? 'AI is now extra careful to avoid hallucinations based on your feedback.'
                : 'Rate edits to help AI learn your preferences and avoid mistakes.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

