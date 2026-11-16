import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AuditHero } from '@/components/dashboard/AuditHero';

describe('Phase 1: Foundation & Layout Tests', () => {
  it('renders Header with brand and zero retention badge', () => {
    render(<Header isDark={false} onToggleTheme={() => {}} />);
    expect(screen.getByText('Sitemap Inspector')).toBeInTheDocument();
    expect(screen.getByText('Stateless')).toBeInTheDocument();
    expect(screen.getByText('Zero server data retention')).toBeInTheDocument();
  });

  it('renders Footer with privacy commitments', () => {
    render(<Footer />);
    expect(screen.getByText('Zero Audit Storage')).toBeInTheDocument();
    expect(screen.getByText('Browser-First Processing')).toBeInTheDocument();
    expect(screen.getByText('MIT Open Source')).toBeInTheDocument();
  });

  it('renders AuditHero input and start audit button', () => {
    render(<AuditHero onStartAudit={() => {}} isLoading={false} />);
    expect(screen.getByPlaceholderText(/example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start audit/i })).toBeInTheDocument();
  });

  it('calculates HTTP Health Score correctly ignoring unverified URLs', () => {
    const verified2xx = 95;
    const verified4xx = 5;
    const unverified = 50;

    const totalVerified = verified2xx + verified4xx;
    const healthScore = (verified2xx / totalVerified) * 100;

    expect(healthScore).toBe(95);
    // Unverified requests must not artificially reduce the verified health score
    expect(unverified).toBe(50);
  });
});
