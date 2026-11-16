import { describe, it, expect } from 'vitest';
import { sanitizeCsvCell, generateCsvContent } from '@/features/report-generator/csv-generator';
import { UrlAuditResult } from '@/types';

describe('CSV Generator & Security Sanitizer', () => {
  describe('sanitizeCsvCell (Formula Injection Defense)', () => {
    it('prepends a single quote to cells beginning with formula operators', () => {
      // Excel/Calc formula injection attacks
      expect(sanitizeCsvCell('=1+1')).toBe("'=1+1");
      expect(sanitizeCsvCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
      expect(sanitizeCsvCell('-2+5')).toBe("'-2+5");
      expect(sanitizeCsvCell('@SUM(A1:A10)')).toBe("'@SUM(A1:A10)");
      expect(sanitizeCsvCell('\tmalicious')).toBe("'\tmalicious");
      expect(sanitizeCsvCell('\rmalicious')).toBe('"\'\rmalicious"'); // Contains \r so wrapped in RFC 4180 quotes
    });

    it('escapes fields containing commas, double quotes, and newlines per RFC 4180', () => {
      expect(sanitizeCsvCell('Hello, world')).toBe('"Hello, world"');
      expect(sanitizeCsvCell('He said "Hello"')).toBe('"He said ""Hello"""');
      expect(sanitizeCsvCell('Line 1\nLine 2')).toBe('"Line 1\nLine 2"');
    });

    it('handles null and undefined values safely', () => {
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
      expect(sanitizeCsvCell(200)).toBe('200');
    });
  });

  describe('generateCsvContent', () => {
    const mockResults: UrlAuditResult[] = [
      {
        url: 'https://example.com/page-1',
        finalUrl: 'https://example.com/page-1',
        statusCode: 200,
        category: 'success',
        redirectChain: [],
        responseTimeMs: 85,
        sourceSitemap: 'https://example.com/sitemap.xml',
        attempts: 1,
        checkedAt: '2026-11-16T12:00:00Z',
      },
      {
        url: 'https://example.com/danger',
        finalUrl: 'https://example.com/danger',
        statusCode: 404,
        category: 'client_error',
        redirectChain: [],
        responseTimeMs: 120,
        errorMessage: '=cmd|/c calc', // Formula injection attempt in error description
        sourceSitemap: 'https://example.com/sitemap.xml',
        attempts: 1,
        checkedAt: '2026-11-16T12:00:00Z',
      },
    ];

    it('generates CSV with UTF-8 BOM, standard headers, and sanitized values', () => {
      const csv = generateCsvContent(mockResults, {
        domain: 'example.com',
        auditDate: '2026-11-16T12:00:00Z',
      });

      // Starts with UTF-8 BOM
      expect(csv.startsWith('\uFEFF')).toBe(true);

      const lines = csv.substring(1).split('\r\n');
      expect(lines).toHaveLength(3); // Header + 2 data rows

      // Header row
      expect(lines[0]).toBe(
        'Target Domain,Audit Timestamp,URL,HTTP Status,Category,Final URL,Redirect Chain,Response Time (ms),Source Sitemap,Error Description',
      );

      // Row 1 (Normal 200)
      expect(lines[1]).toContain('https://example.com/page-1,200,success');

      // Row 2 (Neutralized formula injection in error message)
      expect(lines[2]).toContain(
        "https://example.com/danger,404,client_error,https://example.com/danger,,120,https://example.com/sitemap.xml,'=cmd|/c calc",
      );
    });
  });
});
