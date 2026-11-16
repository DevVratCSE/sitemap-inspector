import React, { useState, useMemo } from 'react';
import {
  Search,
  ExternalLink,
  Copy,
  Check,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
} from 'lucide-react';
import { UrlAuditResult, AuditCategory } from '@/types';
import { StatusBadge } from './StatusBadge';

interface ResultsTableProps {
  results: UrlAuditResult[];
}

type SortField = 'url' | 'statusCode' | 'responseTimeMs' | 'category';
type SortDirection = 'asc' | 'desc';

export const ResultsTable: React.FC<ResultsTableProps> = ({ results }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | AuditCategory>('all');
  const [sortField, setSortField] = useState<SortField>('statusCode');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 1500);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: results.length,
      success: 0,
      redirect: 0,
      client_error: 0,
      server_error: 0,
      unverified: 0,
    };

    for (const r of results) {
      if (r.category === 'success') counts.success++;
      else if (r.category === 'redirect') counts.redirect++;
      else if (r.category === 'client_error' || r.category === 'blocked') counts.client_error++;
      else if (r.category === 'server_error') counts.server_error++;
      else counts.unverified++;
    }
    return counts;
  }, [results]);

  // Filtered and Sorted results
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'client_error') {
          if (item.category !== 'client_error' && item.category !== 'blocked') return false;
        } else if (selectedCategory === 'unknown') {
          if (
            ['success', 'redirect', 'client_error', 'blocked', 'server_error'].includes(
              item.category,
            )
          )
            return false;
        } else if (item.category !== selectedCategory) {
          return false;
        }
      }

      // Search term filter
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesUrl = item.url.toLowerCase().includes(query);
        const matchesFinal = item.finalUrl?.toLowerCase().includes(query) || false;
        return matchesUrl || matchesFinal;
      }

      return true;
    });
  }, [results, selectedCategory, searchTerm]);

  const sortedResults = useMemo(() => {
    return [...filteredResults].sort((a, b) => {
      let valA: string | number = a[sortField] ?? 0;
      let valB: string | number = b[sortField] ?? 0;

      if (sortField === 'url') {
        valA = a.url;
        valB = b.url;
      }

      if (valA < valB) return sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredResults, sortField, sortDir]);

  // Paginated slice
  const totalPages = Math.max(1, Math.ceil(sortedResults.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedResults = sortedResults.slice(startIndex, startIndex + pageSize);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden mb-12">
      {/* Header controls: Search & Category tabs */}
      <div className="p-4 sm:p-6 border-b border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="Search audited URLs..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex items-center gap-2 self-end text-xs text-slate-500 dark:text-slate-400">
            <span>Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            onClick={() => {
              setSelectedCategory('all');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            All ({categoryCounts.all})
          </button>
          <button
            onClick={() => {
              setSelectedCategory('success');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === 'success'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 hover:bg-emerald-100'
            }`}
          >
            2xx Success ({categoryCounts.success})
          </button>
          <button
            onClick={() => {
              setSelectedCategory('redirect');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === 'redirect'
                ? 'bg-sky-600 text-white'
                : 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 hover:bg-sky-100'
            }`}
          >
            3xx Redirects ({categoryCounts.redirect})
          </button>
          <button
            onClick={() => {
              setSelectedCategory('client_error');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === 'client_error'
                ? 'bg-rose-600 text-white'
                : 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100'
            }`}
          >
            4xx Errors ({categoryCounts.client_error})
          </button>
          <button
            onClick={() => {
              setSelectedCategory('server_error');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === 'server_error'
                ? 'bg-red-600 text-white'
                : 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300 hover:bg-red-100'
            }`}
          >
            5xx Errors ({categoryCounts.server_error})
          </button>
          <button
            onClick={() => {
              setSelectedCategory('unknown');
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedCategory === 'unknown'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Unverified ({categoryCounts.unverified})
          </button>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 select-none">
            <tr>
              <th
                onClick={() => handleSort('url')}
                className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-900 dark:hover:text-white"
              >
                <div className="flex items-center gap-1.5">
                  <span>URL</span>
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('statusCode')}
                className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-900 dark:hover:text-white w-32"
              >
                <div className="flex items-center gap-1.5">
                  <span>Status</span>
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th
                onClick={() => handleSort('responseTimeMs')}
                className="py-3 px-4 font-semibold cursor-pointer hover:text-slate-900 dark:hover:text-white w-28"
              >
                <div className="flex items-center gap-1.5">
                  <span>Time</span>
                  <ArrowUpDown className="w-3.5 h-3.5" />
                </div>
              </th>
              <th className="py-3 px-4 font-semibold w-24 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {paginatedResults.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-slate-500 dark:text-slate-400">
                  No matching URLs found.
                </td>
              </tr>
            ) : (
              paginatedResults.map((item, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <td className="py-3 px-4 max-w-xs md:max-w-md truncate">
                    <div className="font-medium text-slate-900 dark:text-white truncate">
                      {item.url}
                    </div>
                    {item.finalUrl && item.finalUrl !== item.url && (
                      <div className="flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400 mt-0.5 truncate">
                        <CornerDownRight className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">Redirects to: {item.finalUrl}</span>
                      </div>
                    )}
                    {item.errorMessage && (
                      <div className="text-[11px] text-rose-500 dark:text-rose-400 mt-0.5 truncate">
                        {item.errorMessage}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusBadge statusCode={item.statusCode} category={item.category} />
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 text-xs">
                    {item.responseTimeMs ? `${item.responseTimeMs} ms` : '--'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleCopy(item.url)}
                        title="Copy URL"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      >
                        {copiedUrl === item.url ? (
                          <Check className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open in new tab"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <div>
          Showing {sortedResults.length > 0 ? startIndex + 1 : 0} to{' '}
          {Math.min(startIndex + pageSize, sortedResults.length)} of {sortedResults.length} URLs
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
