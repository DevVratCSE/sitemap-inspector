import React, { useState } from 'react';
import { FileText, Download, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import { HttpMetrics, SitemapQualityMetrics, UrlAuditResult } from '@/types';
import { DiscoverySummary } from '@/features/sitemap-discovery/discovery-orchestrator';
import { downloadCsvReport } from '@/features/report-generator/csv-generator';
import { generatePdfReport } from '@/features/report-generator/pdf-generator';

interface ReportExportBarProps {
  domain: string;
  targetUrl: string;
  auditState: string;
  durationMs?: number;
  discovery: DiscoverySummary | null;
  httpMetrics: HttpMetrics;
  sitemapMetrics: SitemapQualityMetrics;
  results: UrlAuditResult[];
}

export const ReportExportBar: React.FC<ReportExportBarProps> = ({
  domain,
  targetUrl,
  auditState,
  durationMs,
  discovery,
  httpMetrics,
  sitemapMetrics,
  results,
}) => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleDownloadPdf = async () => {
    if (!discovery) return;
    setIsGeneratingPdf(true);
    setPdfError(null);

    try {
      await generatePdfReport(discovery, httpMetrics, sitemapMetrics, results, {
        domain,
        targetUrl,
        auditState,
        durationMs,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPdfError(`PDF generation failed: ${msg}. You can still download the CSV report.`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportCsv = (isFiltered = false) => {
    downloadCsvReport(results, { domain, isFiltered });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm mb-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Download className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>Export Audit Reports</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Generated locally in your browser. No audit datasets or reports are transmitted to any
            server.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf || results.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-teal-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isGeneratingPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating PDF...</span>
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5" />
                <span>Download PDF Report</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleExportCsv(false)}
            disabled={results.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {pdfError && (
        <div className="mt-3 flex items-center gap-2 text-xs text-rose-600 dark:text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{pdfError}</span>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3 h-3 text-teal-600 dark:text-teal-400" />
        <span>
          Your audit results are processed in your browser. Sitemap Inspector does not maintain
          server-side audit history or store your generated reports.
        </span>
      </div>
    </div>
  );
};
