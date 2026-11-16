import React from 'react';
import { Play, Pause, XCircle, RotateCcw, Loader2 } from 'lucide-react';
import { AuditState } from '@/types';

interface AuditControlsProps {
  state: AuditState;
  checkedCount: number;
  totalCount: number;
  currentMessage?: string;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onReset: () => void;
}

export const AuditControls: React.FC<AuditControlsProps> = ({
  state,
  checkedCount,
  totalCount,
  currentMessage,
  onPause,
  onResume,
  onCancel,
  onReset,
}) => {
  const percent = totalCount > 0 ? Math.min(100, Math.round((checkedCount / totalCount) * 100)) : 0;
  const isRunning = state === 'discovering' || state === 'auditing';
  const isPaused = state === 'paused';
  const isFinished = state === 'completed' || state === 'cancelled' || state === 'error';

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm mb-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-slate-900 dark:text-white">Audit Progress</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${
                state === 'completed'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : state === 'paused'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : state === 'cancelled'
                      ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
              }`}
            >
              {state}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate max-w-xl">
            {currentMessage || 'Processing URLs...'}
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {isRunning && (
            <button
              onClick={onPause}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}

          {isPaused && (
            <button
              onClick={onResume}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium transition-colors"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
          )}

          {(isRunning || isPaused) && (
            <button
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800/80 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-xs font-medium transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>Cancel</span>
            </button>
          )}

          {isFinished && (
            <button
              onClick={onReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>New Audit</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
          <span>
            {checkedCount} of {totalCount} URLs checked
          </span>
          <span>{percent}%</span>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-2.5 rounded-full transition-all duration-300 ${
              state === 'completed'
                ? 'bg-emerald-500'
                : state === 'paused'
                  ? 'bg-amber-500'
                  : 'bg-teal-600'
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {isRunning && (
        <div className="flex items-center gap-2 mt-3 text-xs text-teal-600 dark:text-teal-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Audit in progress. Concurrency throttled to 3 browser threads.</span>
        </div>
      )}
    </div>
  );
};
