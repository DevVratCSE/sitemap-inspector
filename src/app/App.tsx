import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AuditHero } from '@/components/dashboard/AuditHero';
import { AuditControls } from '@/components/dashboard/AuditControls';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { QualityIssuesCard } from '@/components/dashboard/QualityIssuesCard';
import { ResultsTable } from '@/components/results/ResultsTable';
import { AuditConfig, AuditState, UrlAuditResult } from '@/types';
import {
  discoverSitemaps,
  DiscoverySummary,
} from '@/features/sitemap-discovery/discovery-orchestrator';
import { startUrlAudit, AuditorController } from '@/features/url-checker/url-auditor';
import {
  calculateHttpMetrics,
  calculateSitemapQuality,
} from '@/features/health-scoring/health-calculator';

export const App: React.FC = () => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return (
        window.matchMedia('(prefers-color-scheme: dark)').matches ||
        document.documentElement.classList.contains('dark')
      );
    }
    return false;
  });

  // Ephemeral in-memory audit state
  const [auditState, setAuditState] = useState<AuditState>('idle');
  const [discoverySummary, setDiscoverySummary] = useState<DiscoverySummary | null>(null);
  const [auditResults, setAuditResults] = useState<UrlAuditResult[]>([]);
  const [checkedCount, setCheckedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [currentMessage, setCurrentMessage] = useState<string>('');
  const [startTime, setStartTime] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const auditorRef = useRef<AuditorController | null>(null);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  // Live Metric Calculations
  const httpMetrics = useMemo(() => calculateHttpMetrics(auditResults), [auditResults]);

  const sitemapMetrics = useMemo(() => {
    if (!discoverySummary) {
      return {
        qualityScore: 100,
        robotsTxtFound: false,
        sitemapInRobotsTxt: false,
        xmlStructureValid: true,
        duplicateUrlCount: 0,
        malformedUrlCount: 0,
        redirectUrlCount: 0,
        brokenUrlCount: 0,
        missingLastmodCount: 0,
        invalidLastmodCount: 0,
        issues: [],
      };
    }
    return calculateSitemapQuality(discoverySummary, auditResults);
  }, [discoverySummary, auditResults]);

  const handleStartAudit = async (targetUrl: string, config: AuditConfig) => {
    setAuditState('discovering');
    setDiscoverySummary(null);
    setAuditResults([]);
    setCheckedCount(0);
    setTotalCount(0);
    setErrorMessage(null);
    const start = Date.now();
    setStartTime(start);
    setDurationMs(undefined);

    try {
      // Step 1: Discover Sitemaps & Extract URLs
      const discovery = await discoverSitemaps(targetUrl, config, (p) => {
        setCurrentMessage(p.message);
      });

      setDiscoverySummary(discovery);

      if (discovery.urls.length === 0) {
        setAuditState('error');
        setErrorMessage(
          'No valid sitemaps or URLs could be discovered for this domain. Please verify the URL or enter a direct sitemap link.',
        );
        return;
      }

      setTotalCount(discovery.urls.length);
      setAuditState('auditing');
      setCurrentMessage(`Auditing ${discovery.urls.length} discovered URLs...`);

      // Step 2: Start Concurrency URL Auditor
      const auditor = startUrlAudit(discovery.urls, config, (progress) => {
        setCheckedCount(progress.checkedCount);
        setAuditResults((prev) => [...prev, progress.latestResult]);
        setCurrentMessage(
          `Checked ${progress.checkedCount} of ${progress.totalCount}: ${progress.currentUrl}`,
        );
      });

      auditorRef.current = auditor;

      await auditor.promise;

      setAuditState('completed');
      setDurationMs(Date.now() - start);
      setCurrentMessage('Audit completed successfully.');
    } catch (err: unknown) {
      setAuditState('error');
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setCurrentMessage(`Audit terminated with error: ${msg}`);
    }
  };

  const handlePause = () => {
    if (auditorRef.current && auditState === 'auditing') {
      auditorRef.current.pause();
      setAuditState('paused');
      setCurrentMessage('Audit paused by user.');
    }
  };

  const handleResume = () => {
    if (auditorRef.current && auditState === 'paused') {
      auditorRef.current.resume();
      setAuditState('auditing');
      setCurrentMessage('Audit resumed.');
    }
  };

  const handleCancel = () => {
    if (auditorRef.current) {
      auditorRef.current.cancel();
      setAuditState('cancelled');
      if (startTime) {
        setDurationMs(Date.now() - startTime);
      }
      setCurrentMessage('Audit cancelled by user.');
    }
  };

  const handleReset = () => {
    if (auditorRef.current) {
      auditorRef.current.cancel();
    }
    setAuditState('idle');
    setDiscoverySummary(null);
    setAuditResults([]);
    setCheckedCount(0);
    setTotalCount(0);
    setCurrentMessage('');
    setStartTime(null);
    setDurationMs(undefined);
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Header isDark={isDark} onToggleTheme={toggleTheme} />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {auditState === 'idle' ? (
          <AuditHero onStartAudit={handleStartAudit} isLoading={false} />
        ) : (
          <div>
            <AuditControls
              state={auditState}
              checkedCount={checkedCount}
              totalCount={totalCount}
              currentMessage={errorMessage || currentMessage}
              onPause={handlePause}
              onResume={handleResume}
              onCancel={handleCancel}
              onReset={handleReset}
            />

            {errorMessage && (
              <div className="p-4 mb-6 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-sm">
                <strong>Audit Error:</strong> {errorMessage}
              </div>
            )}

            <MetricCards
              httpMetrics={httpMetrics}
              sitemapMetrics={sitemapMetrics}
              durationMs={durationMs}
              sitemapsCount={discoverySummary?.discoveredSitemaps.length || 0}
            />

            <QualityIssuesCard metrics={sitemapMetrics} />

            <ResultsTable results={auditResults} />
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default App;
