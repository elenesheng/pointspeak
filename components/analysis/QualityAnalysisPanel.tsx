import React, { useState, useRef } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Lightbulb,
  Sun,
  Ruler,
  Palette,
  Sparkles,
  Box,
  Layers,
  Layout,
  ChevronDown,
  ChevronUp,
  Zap,
  Target,
  Brain,
} from 'lucide-react';
import { QualityAnalysis, QualityIssue } from '../../services/gemini/qualityAnalysisService';
import { useClickOutside } from '../../hooks/useClickOutside';
import { LearningSummary } from '../feedback/LearningSummary';
import { useLearningStore } from '../../store/learningStore';

interface QualityAnalysisPanelProps {
  analysis: QualityAnalysis | null;
  isVisible: boolean;
  onClose: () => void;
  onApplyFix: (fixPrompt: string) => void;
  isLoading: boolean;
}

export const QualityAnalysisPanel: React.FC<QualityAnalysisPanelProps> = ({
  analysis,
  isVisible,
  onClose,
  onApplyFix,
  isLoading,
}) => {
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [showLearning, setShowLearning] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const { patterns } = useLearningStore();

  const hasLearningData = patterns.totalLikes > 0 || patterns.likedStyles.length > 0;

  useClickOutside(panelRef, () => {
    if (isVisible) onClose();
  });

  if (!isVisible) return null;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'lighting':
        return <Sun className="w-4 h-4" />;
      case 'alignment':
        return <Ruler className="w-4 h-4" />;
      case 'color':
        return <Palette className="w-4 h-4" />;
      case 'style':
        return <Sparkles className="w-4 h-4" />;
      case 'proportion':
        return <Box className="w-4 h-4" />;
      case 'texture':
        return <Layers className="w-4 h-4" />;
      case 'composition':
        return <Layout className="w-4 h-4" />;
      default:
        return <Lightbulb className="w-4 h-4" />;
    }
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/30',
          text: 'text-rose-400',
          badge: 'bg-rose-500/20 text-rose-300',
        };
      case 'warning':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
          badge: 'bg-amber-500/20 text-amber-300',
        };
      default:
        return {
          bg: 'bg-sky-500/10',
          border: 'border-sky-500/30',
          text: 'text-sky-400',
          badge: 'bg-sky-500/20 text-sky-300',
        };
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-400';
    if (score >= 60) return 'text-amber-400';
    return 'text-rose-400';
  };

  const criticalCount = analysis?.issues.filter((i) => i.severity === 'critical').length || 0;
  const warningCount = analysis?.issues.filter((i) => i.severity === 'warning').length || 0;
  const suggestionCount = analysis?.issues.filter((i) => i.severity === 'suggestion').length || 0;

  return (
    <div className="fixed inset-x-0 bottom-0 pointer-events-none z-50 flex flex-col items-center justify-end pb-6">
      <div
        ref={panelRef}
        className="bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden pointer-events-auto transition-all animate-in slide-in-from-bottom-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10">
              <Target className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Quality Analysis</h3>
              <p className="text-xs text-slate-400">
                {isLoading ? 'Analyzing...' : 'Issues & improvements detected'}
              </p>
            </div>
          </div>

          {/* Score Badge */}
          {analysis && !isLoading && (
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className={`text-2xl font-black ${getScoreColor(analysis.overall_score)}`}>
                  {analysis.overall_score}
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">Score</div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-1">
            {hasLearningData && (
              <button
                onClick={() => setShowLearning(!showLearning)}
                className={`p-2 rounded-full transition-colors ${
                  showLearning
                    ? 'bg-indigo-600 text-white'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-white'
                }`}
                title="View your style preferences"
              >
                <Brain className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Learning Summary - Collapsible */}
        {showLearning && hasLearningData && (
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/30 animate-in slide-in-from-top-2">
            <LearningSummary compact={false} showTitle={false} />
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="p-8 flex flex-col items-center justify-center">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-indigo-500/20 animate-ping absolute" />
              <Target className="w-12 h-12 text-indigo-400 animate-pulse relative" />
            </div>
            <p className="mt-4 text-sm text-slate-400">Scanning for quality issues...</p>
          </div>
        )}

        {/* Content */}
        {analysis && !isLoading && (
          <div className="max-h-[400px] overflow-y-auto">
            {/* Issue Summary */}
            <div className="px-6 py-3 bg-slate-950/50 border-b border-slate-800 flex items-center gap-4">
              {criticalCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-rose-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="font-bold">{criticalCount}</span> Critical
                </div>
              )}
              {warningCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="font-bold">{warningCount}</span> Warnings
                </div>
              )}
              {suggestionCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-sky-400">
                  <Lightbulb className="w-3.5 h-3.5" />
                  <span className="font-bold">{suggestionCount}</span> Suggestions
                </div>
              )}
              {analysis.issues.length === 0 && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  No issues detected!
                </div>
              )}

              <div className="ml-auto text-xs text-slate-500">
                Style: <span className="text-slate-300">{analysis.style_detected}</span>
              </div>
            </div>

            {/* Strengths */}
            {analysis.strengths.length > 0 && (
              <div className="px-6 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    What's Working
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {analysis.strengths.map((s, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-300"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Issues List */}
            <div className="p-4 space-y-3">
              {analysis.issues.map((issue, index) => {
                const styles = getSeverityStyles(issue.severity);
                const isExpanded = expandedIssue === index;

                return (
                  <div
                    key={index}
                    className={`${styles.bg} border ${styles.border} rounded-xl overflow-hidden transition-all`}
                  >
                    <button
                      onClick={() => setExpandedIssue(isExpanded ? null : index)}
                      className="w-full px-4 py-3 flex items-center gap-3 text-left"
                    >
                      <div className={`p-1.5 rounded-lg ${styles.bg} ${styles.text}`}>
                        {getCategoryIcon(issue.category)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${styles.badge}`}
                          >
                            {issue.severity}
                          </span>
                          <span className="text-[10px] text-slate-500 uppercase">{issue.category}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-white truncate">{issue.title}</h4>
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 border-t border-slate-800/50">
                        <p className="text-xs text-slate-300 leading-relaxed mb-3 mt-3">
                          {issue.description}
                        </p>

                        {issue.location && (
                          <p className="text-xs text-slate-500 mb-3">
                            <span className="text-slate-400">Location:</span> {issue.location}
                          </p>
                        )}

                        <button
                          onClick={() => onApplyFix(issue.fix_prompt)}
                          className={`w-full py-2.5 ${
                            issue.auto_fixable
                              ? 'bg-indigo-600 hover:bg-indigo-500'
                              : 'bg-slate-700 hover:bg-slate-600'
                          } text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all`}
                        >
                          <Zap className="w-3.5 h-3.5" />
                          {issue.auto_fixable ? 'Auto-Fix This Issue' : 'Apply Suggested Fix'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-950/50 border-t border-slate-800 text-[10px] text-slate-500 text-center">
          AI-powered quality analysis • Click issues to expand and apply fixes
        </div>
      </div>
    </div>
  );
};

