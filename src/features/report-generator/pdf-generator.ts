import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { HttpMetrics, SitemapQualityMetrics, UrlAuditResult } from '@/types';
import { DiscoverySummary } from '../sitemap-discovery/discovery-orchestrator';
import { generateRecommendations } from './recommendations';

export interface PdfReportOptions {
  domain: string;
  targetUrl: string;
  auditState: string;
  durationMs?: number;
}

/**
 * Helper to call autoTable across both named and default ES module imports
 */
function applyAutoTable(doc: jsPDF, options: Parameters<typeof autoTable>[1]) {
  const runner =
    typeof autoTable === 'function'
      ? autoTable
      : (autoTable as unknown as { default: typeof autoTable }).default;
  runner(doc, options);
}

/**
 * Generates and downloads a professional, multi-page Technical SEO PDF Report
 * 100% inside browser memory without server-side processing.
 */
export async function generatePdfReport(
  discovery: DiscoverySummary,
  httpMetrics: HttpMetrics,
  sitemapMetrics: SitemapQualityMetrics,
  results: UrlAuditResult[],
  options: PdfReportOptions,
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const contentWidth = pageWidth - margin * 2;

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const timeStr = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  // 1. Header & Branding Banner
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 90, 'F');

  doc.setFillColor(13, 148, 136); // teal-600
  doc.rect(0, 86, pageWidth, 4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('SITEMAP INSPECTOR', margin, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(153, 246, 228); // teal-200
  doc.text('Technical SEO Sitemap Audit Report', margin, 58);

  // Metadata right-aligned in header
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(`Domain: ${options.domain}`, pageWidth - margin, 38, { align: 'right' });
  doc.text(`Date: ${dateStr} ${timeStr}`, pageWidth - margin, 52, { align: 'right' });
  doc.text(`Status: ${options.auditState.toUpperCase()}`, pageWidth - margin, 66, {
    align: 'right',
  });

  let cursorY = 115;

  // 2. Executive Summary Cards
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Executive Summary', margin, cursorY);
  cursorY += 15;

  const cardWidth = (contentWidth - 15) / 2;
  const cardHeight = 65;

  // Card 1: HTTP Health Score
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(margin, cursorY, cardWidth, cardHeight, 6, 6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('HTTP HEALTH SCORE', margin + 12, cursorY + 18);

  doc.setFontSize(22);
  doc.setTextColor(13, 148, 136); // teal-600
  doc.text(`${httpMetrics.healthScore}%`, margin + 12, cursorY + 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Based on ${httpMetrics.totalVerified} verified URLs of ${httpMetrics.totalDiscovered} discovered`,
    margin + 12,
    cursorY + 56,
  );

  // Card 2: Sitemap Quality Score
  const card2X = margin + cardWidth + 15;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(card2X, cursorY, cardWidth, cardHeight, 6, 6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('SITEMAP QUALITY SCORE', card2X + 12, cursorY + 18);

  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text(`${sitemapMetrics.qualityScore} / 100`, card2X + 12, cursorY + 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `${sitemapMetrics.issues.length} technical issue(s) identified in sitemaps`,
    card2X + 12,
    cursorY + 56,
  );

  cursorY += cardHeight + 25;

  // 3. Status Breakdown & Discovery Summary Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Audit Breakdown & Crawl Discovery', margin, cursorY);
  cursorY += 10;

  applyAutoTable(doc, {
    startY: cursorY,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      2: { fontStyle: 'bold' },
    },
    head: [['HTTP Status Breakdown', 'Count', 'Sitemap Discovery', 'Status / Count']],
    body: [
      [
        '2xx Successful URLs',
        `${httpMetrics.count2xx}`,
        'robots.txt Found',
        discovery.robotsTxtFound ? 'Yes' : 'No',
      ],
      [
        '3xx Redirected URLs',
        `${httpMetrics.count3xx}`,
        'Sitemap in robots.txt',
        discovery.sitemapInRobotsTxt ? 'Yes' : 'No',
      ],
      [
        '4xx Client Errors (Broken)',
        `${httpMetrics.count4xx}`,
        'Discovered Sitemaps',
        `${discovery.discoveredSitemaps.length}`,
      ],
      [
        '5xx Server Errors',
        `${httpMetrics.count5xx}`,
        'Duplicate Declarations',
        `${discovery.duplicateUrlCount}`,
      ],
      [
        'Unverified / Blocked',
        `${httpMetrics.totalUnverified}`,
        'Audit Duration',
        options.durationMs ? `${(options.durationMs / 1000).toFixed(1)}s` : '--',
      ],
    ],
    margin: { left: margin, right: margin },
  });

  cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 25;

  // 4. Deterministic Recommendations Section
  const recommendations = generateRecommendations(discovery, httpMetrics, sitemapMetrics, results);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Key Actionable Recommendations', margin, cursorY);
  cursorY += 10;

  if (recommendations.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(13, 148, 136);
    doc.text(
      '✓ No critical or high-priority sitemap hygiene issues were detected.',
      margin,
      cursorY + 12,
    );
    cursorY += 25;
  } else {
    const recRows = recommendations.map((r) => [
      r.priority.toUpperCase(),
      r.title,
      `${r.description}\nAction: ${r.action}`,
    ]);

    applyAutoTable(doc, {
      startY: cursorY,
      theme: 'striped',
      headStyles: { fillColor: [13, 148, 136], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { fontStyle: 'bold' },
      },
      head: [['Priority', 'Finding', 'Details & Recommended Action']],
      body: recRows,
      margin: { left: margin, right: margin },
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 25;
  }

  // 5. Critical Findings Table (Broken URLs or Redirects)
  const criticalItems = results.filter(
    (r) =>
      r.category === 'client_error' || r.category === 'server_error' || r.category === 'redirect',
  );
  if (criticalItems.length > 0) {
    if (cursorY > pageHeight - 160) {
      doc.addPage();
      cursorY = margin;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(`Critical Issues & Redirects (${criticalItems.length})`, margin, cursorY);
    cursorY += 10;

    const criticalRows = criticalItems
      .slice(0, 50)
      .map((item) => [
        item.url.length > 60 ? item.url.substring(0, 57) + '...' : item.url,
        item.statusCode ? String(item.statusCode) : 'ERR',
        item.category.toUpperCase(),
        item.finalUrl && item.finalUrl !== item.url
          ? item.finalUrl.length > 50
            ? item.finalUrl.substring(0, 47) + '...'
            : item.finalUrl
          : item.errorMessage || '--',
      ]);

    applyAutoTable(doc, {
      startY: cursorY,
      theme: 'grid',
      headStyles: { fillColor: [225, 29, 72], textColor: 255, fontSize: 8, fontStyle: 'bold' },
      bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
      columnStyles: {
        1: { halign: 'center' },
      },
      head: [['URL', 'Status', 'Issue Type', 'Redirect Target / Error Details']],
      body: criticalRows,
      margin: { left: margin, right: margin },
    });

    cursorY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 25;
  }

  // 6. Detailed URL Appendix (Bounded to max 500 URLs to protect client memory)
  if (cursorY > pageHeight - 150) {
    doc.addPage();
    cursorY = margin;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Audited URLs Appendix', margin, cursorY);
  cursorY += 10;

  const MAX_APPENDIX_ROWS = 500;
  const appendixRows = results
    .slice(0, MAX_APPENDIX_ROWS)
    .map((item) => [
      item.url.length > 65 ? item.url.substring(0, 62) + '...' : item.url,
      item.statusCode ? String(item.statusCode) : '--',
      item.category,
      item.responseTimeMs ? `${item.responseTimeMs} ms` : '--',
    ]);

  applyAutoTable(doc, {
    startY: cursorY,
    theme: 'plain',
    headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 8, fontStyle: 'bold' },
    bodyStyles: { fontSize: 7, textColor: [51, 65, 85] },
    columnStyles: {
      1: { halign: 'center' },
      3: { halign: 'right' },
    },
    head: [['Audited URL', 'Status', 'Category', 'Response Time']],
    body: appendixRows,
    margin: { left: margin, right: margin },
  });

  // 7. Footer Page Numbers on every page
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400

    doc.text(
      'Sitemap Inspector — Stateless, Free-Tier Technical SEO Auditor (Client-Generated Report)',
      margin,
      pageHeight - 20,
    );
    doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 20, {
      align: 'right',
    });
  }

  // Save to browser
  const cleanDomain = options.domain.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileDate = new Date().toISOString().split('T')[0];
  const filename = `sitemap-inspector-${cleanDomain}-${fileDate}.pdf`;
  doc.save(filename);
}
