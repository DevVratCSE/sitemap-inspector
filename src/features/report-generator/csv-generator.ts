import { UrlAuditResult } from '@/types';

/**
 * Escapes a cell against spreadsheet formula injection (CSV injection).
 * Prevents Excel/Calc execution of formulas beginning with '=', '+', '-', '@', '\t', '\r'.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  let str = String(value);

  // If the string starts with a formula trigger character, prepend a single quote
  const formulaTriggers = ['=', '+', '-', '@', '\t', '\r'];
  if (str.length > 0 && formulaTriggers.includes(str[0])) {
    str = `'${str}`;
  }

  // RFC 4180 escaping: if value contains quote, comma, or newline, wrap in quotes and escape quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export interface CsvExportOptions {
  domain: string;
  auditDate?: string;
  isFiltered?: boolean;
}

/**
 * Generates an RFC 4180 compliant CSV string from audit results with formula injection defense
 */
export function generateCsvContent(results: UrlAuditResult[], options: CsvExportOptions): string {
  const auditTimestamp = options.auditDate || new Date().toISOString();

  const headers = [
    'Target Domain',
    'Audit Timestamp',
    'URL',
    'HTTP Status',
    'Category',
    'Final URL',
    'Redirect Chain',
    'Response Time (ms)',
    'Source Sitemap',
    'Error Description',
  ];

  const rows: string[] = [headers.map(sanitizeCsvCell).join(',')];

  for (const item of results) {
    const row = [
      options.domain,
      auditTimestamp,
      item.url,
      item.statusCode && item.statusCode > 0 ? String(item.statusCode) : '',
      item.category,
      item.finalUrl || item.url,
      item.redirectChain && item.redirectChain.length > 0 ? item.redirectChain.join(' -> ') : '',
      item.responseTimeMs !== undefined ? String(item.responseTimeMs) : '',
      item.sourceSitemap || '',
      item.errorMessage || '',
    ];

    rows.push(row.map(sanitizeCsvCell).join(','));
  }

  // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility
  return '\uFEFF' + rows.join('\r\n');
}

/**
 * Triggers a browser download of the generated CSV file
 */
export function downloadCsvReport(results: UrlAuditResult[], options: CsvExportOptions): void {
  const csvContent = generateCsvContent(results, options);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const cleanDomain = options.domain.replace(/[^a-zA-Z0-9.-]/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `sitemap-inspector-${cleanDomain}-${options.isFiltered ? 'filtered-' : ''}${dateStr}.csv`;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
