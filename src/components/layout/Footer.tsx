import React from 'react';
import { Shield, Cpu, Lock } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 py-8 px-4 text-xs text-slate-500 dark:text-slate-400">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center justify-center gap-6">
          <span className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Zero Audit Storage
          </span>
          <span className="flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Browser-First Processing
          </span>
          <span className="flex items-center gap-1.5">
            <Lock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            MIT Open Source
          </span>
        </div>

        <div className="text-center md:text-right">
          <p>
            Your audit results are processed in your browser. Sitemap Inspector does not maintain
            server-side audit history or store your generated reports.
          </p>
          <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
            Deployed on Cloudflare Workers Free Tier.
          </p>
        </div>
      </div>
    </footer>
  );
};
