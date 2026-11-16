import React from 'react';
import {
  Activity,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XOctagon,
  Clock,
  Layers,
} from 'lucide-react';
import { HttpMetrics, SitemapQualityMetrics } from '@/types';

interface MetricCardsProps {
  httpMetrics: HttpMetrics;
  sitemapMetrics: SitemapQualityMetrics;
  durationMs?: number;
  sitemapsCount: number;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  httpMetrics,
  sitemapMetrics,
  durationMs,
  sitemapsCount,
}) => {
  const getQualityBadge = (score: number) => {
    if (score >= 90)
      return {
        label: 'Excellent',
        bg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
      };
    if (score >= 75)
      return {
        label: 'Good',
        bg: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
      };
    if (score >= 50)
      return {
        label: 'Needs Attention',
        bg: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      };
    return {
      label: 'Critical Issues',
      bg: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    };
  };

  const qualityBadge = getQualityBadge(sitemapMetrics.qualityScore);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* 1. HTTP Health Score */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">HTTP Health</span>
          <Activity className="w-4 h-4 text-teal-600 dark:text-teal-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {httpMetrics.healthScore}%
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            verified 2xx
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Based on{' '}
          <strong className="text-slate-700 dark:text-slate-300">
            {httpMetrics.totalVerified}
          </strong>{' '}
          verified URLs of {httpMetrics.totalDiscovered} discovered.
        </p>
      </div>

      {/* 2. Sitemap Quality Score */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Sitemap Quality</span>
          <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
            {sitemapMetrics.qualityScore}
          </span>
          <span className="text-xs text-slate-400">/ 100</span>
          <span
            className={`ml-auto px-2 py-0.5 rounded-full text-xs font-semibold ${qualityBadge.bg}`}
          >
            {qualityBadge.label}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {sitemapMetrics.issues.length} technical issue(s) identified.
        </p>
      </div>

      {/* 3. HTTP Status Breakdown */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">
            Status Distribution
          </span>
          <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400" />
        </div>
        <div className="grid grid-cols-4 gap-1 text-center mt-1">
          <div className="p-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40">
            <div className="flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
            </div>
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {httpMetrics.count2xx}
            </div>
            <div className="text-[10px] text-emerald-600/80">2xx</div>
          </div>
          <div className="p-1 rounded-lg bg-sky-50 dark:bg-sky-950/40">
            <div className="flex items-center justify-center text-sky-600 dark:text-sky-400">
              <AlertTriangle className="w-3 h-3" />
            </div>
            <div className="text-sm font-bold text-sky-700 dark:text-sky-300">
              {httpMetrics.count3xx}
            </div>
            <div className="text-[10px] text-sky-600/80">3xx</div>
          </div>
          <div className="p-1 rounded-lg bg-rose-50 dark:bg-rose-950/40">
            <div className="flex items-center justify-center text-rose-600 dark:text-rose-400">
              <XOctagon className="w-3 h-3" />
            </div>
            <div className="text-sm font-bold text-rose-700 dark:text-rose-300">
              {httpMetrics.count4xx}
            </div>
            <div className="text-[10px] text-rose-600/80">4xx</div>
          </div>
          <div className="p-1 rounded-lg bg-red-50 dark:bg-red-950/40">
            <div className="flex items-center justify-center text-red-600 dark:text-red-400">
              <XOctagon className="w-3 h-3" />
            </div>
            <div className="text-sm font-bold text-red-700 dark:text-red-300">
              {httpMetrics.count5xx}
            </div>
            <div className="text-[10px] text-red-600/80">5xx</div>
          </div>
        </div>
      </div>

      {/* 4. Audit Metadata */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider">Audit Metadata</span>
          <Clock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {durationMs ? `${(durationMs / 1000).toFixed(1)}s` : '--'}
          </span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {sitemapsCount} sitemap(s)
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Unverified/CORS:{' '}
          <strong className="text-slate-700 dark:text-slate-300">
            {httpMetrics.totalUnverified}
          </strong>
        </p>
      </div>
    </div>
  );
};
