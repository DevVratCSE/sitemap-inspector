import React, { useState } from 'react';
import { Globe, Sliders, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { AuditConfig } from '@/types';

interface AuditHeroProps {
  onStartAudit: (url: string, config: AuditConfig) => void;
  isLoading: boolean;
}

export const AuditHero: React.FC<AuditHeroProps> = ({ onStartAudit, isLoading }) => {
  const [url, setUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [maxUrls, setMaxUrls] = useState(500);
  const [concurrency, setConcurrency] = useState(3);
  const [timeoutSec, setTimeoutSec] = useState(10);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    let cleanUrl = url.trim();
    if (!cleanUrl) {
      setValidationError('Please enter a website URL');
      return;
    }

    // Strip leading slashes if someone entered /example.com
    cleanUrl = cleanUrl.replace(/^\/+/, '');

    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    try {
      const parsed = new URL(cleanUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setValidationError('Only HTTP and HTTPS protocols are supported');
        return;
      }
      if (parsed.hostname.toLowerCase() === 'localhost' || parsed.hostname.endsWith('.local')) {
        setValidationError('Localhost and private network inspection is forbidden');
        return;
      }
      if (!parsed.hostname.includes('.')) {
        setValidationError('Please enter a valid domain name (e.g. example.com)');
        return;
      }
    } catch {
      setValidationError(
        'Please enter a valid URL (e.g. example.com or https://example.com/sitemap.xml)',
      );
      return;
    }

    const config: AuditConfig = {
      targetUrl: cleanUrl,
      maxUrls: Math.min(Math.max(maxUrls, 10), 1000),
      concurrency: Math.min(Math.max(concurrency, 1), 5),
      timeoutMs: timeoutSec * 1000,
      maxRedirectHops: 3,
      maxRetries: 0,
      sitemapRecursionDepth: 5,
    };

    onStartAudit(cleanUrl, config);
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6">
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-5xl">
          Inspect sitemaps, verify status codes, and audit technical health.
        </h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
          Completely client-side. Zero server storage. Automatically discovers{' '}
          <code className="text-sm font-mono text-teal-600 dark:text-teal-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            robots.txt
          </code>
          , traverses sitemap indexes, catches broken links, and generates instant reports.
        </p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-none border border-slate-200 dark:border-slate-800 p-6 md:p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
                <Globe className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com or example.com/sitemap.xml"
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent text-base"
                disabled={isLoading}
              />
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center justify-center px-6 py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl transition-all shadow-md shadow-teal-600/20 disabled:opacity-50 disabled:cursor-not-allowed text-base gap-2"
            >
              {isLoading ? (
                <span>Auditing...</span>
              ) : (
                <>
                  <span>Start Audit</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          {validationError && (
            <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 text-sm mt-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="inline-flex items-center gap-1.5 hover:text-slate-800 dark:hover:text-slate-200 font-medium"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>{showAdvanced ? 'Hide Advanced Settings' : 'Advanced Audit Settings'}</span>
            </button>
            <span>Max budget: 500 URLs (Free-tier safe)</span>
          </div>

          {showAdvanced && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  URL Audit Cap (10–1000)
                </label>
                <input
                  type="number"
                  min={10}
                  max={1000}
                  value={maxUrls}
                  onChange={(e) => setMaxUrls(parseInt(e.target.value) || 500)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Browser Concurrency (1–5)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={concurrency}
                  onChange={(e) => setConcurrency(parseInt(e.target.value) || 3)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Request Timeout (sec)
                </label>
                <input
                  type="number"
                  min={5}
                  max={15}
                  value={timeoutSec}
                  onChange={(e) => setTimeoutSec(parseInt(e.target.value) || 10)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-sm"
                />
              </div>
            </div>
          )}
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white">
            <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Automatic Sitemap Discovery
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Checks robots.txt, standard XML paths, nested sitemap indexes, and gzip (.gz) files.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white">
            <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Transparent Verification
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Classifies 2xx, 3xx redirects, 4xx broken links, and clearly isolates unverified CORS
            results.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-900 dark:text-white">
            <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            100% In-Browser Reports
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Download professional PDF reports and sanitized CSVs without sending any audit data to a
            server.
          </p>
        </div>
      </div>
    </div>
  );
};
