import React, { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { AuditHero } from '@/components/dashboard/AuditHero';
import { AuditConfig } from '@/types';

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

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  const toggleTheme = () => setIsDark((prev) => !prev);

  const handleStartAudit = (url: string, config: AuditConfig) => {
    setIsLoading(true);
    console.log('Initiating audit for:', url, config);
    // Placeholder for Phase 2/3 audit engine
    setTimeout(() => {
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      <Header isDark={isDark} onToggleTheme={toggleTheme} />
      <main className="flex-1 flex flex-col justify-center">
        <AuditHero onStartAudit={handleStartAudit} isLoading={isLoading} />
      </main>
      <Footer />
    </div>
  );
};

export default App;
