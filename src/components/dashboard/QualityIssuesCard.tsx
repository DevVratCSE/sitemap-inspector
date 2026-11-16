import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { SitemapQualityMetrics } from '@/types';

interface QualityIssuesCardProps {
  metrics: SitemapQualityMetrics;
}

export const QualityIssuesCard: React.FC<QualityIssuesCardProps> = ({ metrics }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (metrics.issues.length === 0) {
    return (
      <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-semibold text-sm text-emerald-900 dark:text-emerald-200">
              Clean Sitemap Technical Quality
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-400">
              No duplicate URLs, broken links, or syntax issues detected in sitemaps.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const criticalCount = metrics.issues.filter((i) => i.severity === 'critical').length;
  const warningCount = metrics.issues.filter((i) => i.severity === 'warning').length;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm mb-8">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-900 dark:text-white">
              Sitemap Technical Issues ({metrics.issues.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {criticalCount > 0 && `${criticalCount} Critical `}
              {warningCount > 0 && `${warningCount} Warning(s)`}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          aria-label="Toggle issues list"
        >
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {metrics.issues.map((issue, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl border flex items-start gap-3 text-xs ${
                issue.severity === 'critical'
                  ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300'
                  : issue.severity === 'warning'
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300'
                    : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="mt-0.5 flex-shrink-0">
                {issue.severity === 'critical' ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                ) : issue.severity === 'warning' ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Info className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                )}
              </div>
              <div>
                <span className="font-semibold">{issue.message}</span>
                {issue.count !== undefined && (
                  <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/60 dark:bg-black/30">
                    Count: {issue.count}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
