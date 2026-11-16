import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { StatusBadge } from '@/components/results/StatusBadge';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { AuditControls } from '@/components/dashboard/AuditControls';
import { ResultsTable } from '@/components/results/ResultsTable';
import { HttpMetrics, SitemapQualityMetrics, UrlAuditResult } from '@/types';

describe('Dashboard & Results UI Components', () => {
  describe('StatusBadge', () => {
    it('renders 200 OK badge for success', () => {
      render(<StatusBadge statusCode={200} category="success" />);
      expect(screen.getByText('200 OK')).toBeInTheDocument();
    });

    it('renders 404 Client Error badge for client_error', () => {
      render(<StatusBadge statusCode={404} category="client_error" />);
      expect(screen.getByText('404 Client Error')).toBeInTheDocument();
    });

    it('renders CORS Blocked badge for cors_blocked', () => {
      render(<StatusBadge category="cors_blocked" />);
      expect(screen.getByText('CORS Blocked')).toBeInTheDocument();
    });
  });

  describe('MetricCards', () => {
    const mockHttp: HttpMetrics = {
      totalDiscovered: 100,
      totalChecked: 100,
      totalVerified: 90,
      totalUnverified: 10,
      count2xx: 85,
      count3xx: 3,
      count4xx: 2,
      count5xx: 0,
      countNetworkErrors: 0,
      countTimeouts: 0,
      healthScore: 94.4,
    };

    const mockQuality: SitemapQualityMetrics = {
      qualityScore: 92,
      robotsTxtFound: true,
      sitemapInRobotsTxt: true,
      xmlStructureValid: true,
      duplicateUrlCount: 0,
      malformedUrlCount: 0,
      redirectUrlCount: 3,
      brokenUrlCount: 2,
      missingLastmodCount: 0,
      invalidLastmodCount: 0,
      issues: [],
    };

    it('displays HTTP health score with explicit verified sample size', () => {
      render(
        <MetricCards
          httpMetrics={mockHttp}
          sitemapMetrics={mockQuality}
          durationMs={4200}
          sitemapsCount={2}
        />,
      );

      expect(screen.getByText('94.4%')).toBeInTheDocument();
      expect(screen.getByText('90')).toBeInTheDocument();
      expect(screen.getByText(/verified URLs of 100 discovered/i)).toBeInTheDocument();
      expect(screen.getByText('92')).toBeInTheDocument();
      expect(screen.getByText('Excellent')).toBeInTheDocument();
      expect(screen.getByText('4.2s')).toBeInTheDocument();
    });
  });

  describe('AuditControls', () => {
    it('triggers pause and cancel callbacks when clicked', () => {
      const onPause = vi.fn();
      const onCancel = vi.fn();

      render(
        <AuditControls
          state="auditing"
          checkedCount={45}
          totalCount={100}
          currentMessage="Processing..."
          onPause={onPause}
          onResume={() => {}}
          onCancel={onCancel}
          onReset={() => {}}
        />,
      );

      expect(screen.getByText('45 of 100 URLs checked')).toBeInTheDocument();
      expect(screen.getByText('45%')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /pause/i }));
      expect(onPause).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('ResultsTable', () => {
    const mockResults: UrlAuditResult[] = [
      {
        url: 'https://example.com/alpha',
        finalUrl: 'https://example.com/alpha',
        statusCode: 200,
        category: 'success',
        redirectChain: [],
        responseTimeMs: 120,
        attempts: 1,
        checkedAt: '',
      },
      {
        url: 'https://example.com/beta-redirect',
        finalUrl: 'https://example.com/beta-target',
        statusCode: 301,
        category: 'redirect',
        redirectChain: ['https://example.com/beta-redirect'],
        responseTimeMs: 250,
        attempts: 2,
        checkedAt: '',
      },
      {
        url: 'https://example.com/gamma-broken',
        statusCode: 404,
        category: 'client_error',
        redirectChain: [],
        responseTimeMs: 90,
        attempts: 1,
        checkedAt: '',
      },
    ];

    it('renders all rows and filters by category', () => {
      render(<ResultsTable results={mockResults} />);

      expect(screen.getByText('https://example.com/alpha')).toBeInTheDocument();
      expect(screen.getByText('https://example.com/beta-redirect')).toBeInTheDocument();
      expect(screen.getByText('https://example.com/gamma-broken')).toBeInTheDocument();

      // Click 2xx Success filter tab
      fireEvent.click(screen.getByRole('button', { name: /2xx success/i }));
      expect(screen.getByText('https://example.com/alpha')).toBeInTheDocument();
      expect(screen.queryByText('https://example.com/gamma-broken')).not.toBeInTheDocument();
    });

    it('filters results by search term', () => {
      render(<ResultsTable results={mockResults} />);

      const searchInput = screen.getByPlaceholderText(/search audited urls/i);
      fireEvent.change(searchInput, { target: { value: 'gamma' } });

      expect(screen.getByText('https://example.com/gamma-broken')).toBeInTheDocument();
      expect(screen.queryByText('https://example.com/alpha')).not.toBeInTheDocument();
    });
  });
});
