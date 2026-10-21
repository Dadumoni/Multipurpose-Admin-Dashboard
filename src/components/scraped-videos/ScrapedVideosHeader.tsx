import React from 'react';
import { Search, Grid2x2, List, Check } from 'lucide-react';
import { toast } from 'sonner';

interface ScrapedVideosHeaderProps {
  search: string;
  setSearch: (s: string) => void;
  sortOrder: 'desc' | 'asc';
  setSortOrder: (s: 'desc' | 'asc') => void;
  sortDropdownOpen: boolean;
  setSortDropdownOpen: (open: boolean) => void;
  sourceFilter: string;
  setSourceFilter: (domain: string) => void;
  availableSources: string[];
  domainCounts: Record<string, number>;
  totalPostsCount: number;
  viewMode: 'grid' | 'list';
  setViewMode: (m: 'grid' | 'list') => void;
  handleSelectDomain: (domain: string) => void;
}

export default function ScrapedVideosHeader({
  search,
  setSearch,
  sortOrder,
  setSortOrder,
  sortDropdownOpen,
  setSortDropdownOpen,
  sourceFilter,
  availableSources,
  domainCounts,
  totalPostsCount,
  viewMode,
  setViewMode,
  handleSelectDomain,
}: ScrapedVideosHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">All Videos</h1>
        </div>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Manage and preview videos stored in MongoDB primary collection (backed up to Supabase).
        </p>
      </div>

      {/* Right side of header: Search box + Sorting Dropdown + View Toggle */}
      <div className="flex items-center gap-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
          <input 
            type="text"
            placeholder="Search all videos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56 sm:w-64 h-9 pl-9 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white shadow-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-colors"
          />
        </div>

        {/* Sorting Dropdown / Button with Dynamic Domains */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
            className={`h-9 px-2.5 rounded-lg border bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium grid place-items-center shadow-sm transition-colors cursor-pointer ${
              sourceFilter !== 'all'
                ? 'border-black dark:border-white text-black dark:text-white'
                : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
            }`}
            title="Sort order & Domain filter"
            aria-label="Sort and filter videos"
          >
            <div className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-up-down preview-icon shrink-0">
                <path d="m21 16-4 4-4-4"/>
                <path d="M17 20V4"/>
                <path d="m3 8 4-4 4 4"/>
                <path d="M7 4v16"/>
              </svg>
              {sourceFilter !== 'all' && (
                <span className="max-w-[80px] truncate text-[11px] font-semibold">{sourceFilter}</span>
              )}
            </div>
          </button>

          {sortDropdownOpen && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setSortDropdownOpen(false)} 
              />
              <div className="absolute right-0 mt-1.5 w-60 max-h-[380px] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xl z-50 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-100">
                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Sort Order
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('desc');
                    setSortDropdownOpen(false);
                    toast.success('Sorted: New to Old');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                    sortOrder === 'desc'
                      ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-black dark:text-white'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  <span>New to Old</span>
                  {sortOrder === 'desc' && <Check className="h-3.5 w-3.5 text-black dark:text-white" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSortOrder('asc');
                    setSortDropdownOpen(false);
                    toast.success('Sorted: Old to New');
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                    sortOrder === 'asc'
                      ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-black dark:text-white'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  <span>Old to New</span>
                  {sortOrder === 'asc' && <Check className="h-3.5 w-3.5 text-black dark:text-white" />}
                </button>

                <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />

                <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Filter By Domain</span>
                  <span className="font-mono text-[9px] text-zinc-500">({availableSources.length})</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectDomain('all')}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                    sourceFilter === 'all'
                      ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-black dark:text-white'
                      : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                  }`}
                >
                  <span>All Domains (Default)</span>
                  <span className="font-mono text-[11px] text-zinc-500">{totalPostsCount}</span>
                </button>

                {availableSources.map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    onClick={() => handleSelectDomain(domain)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                      sourceFilter === domain
                        ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-black dark:text-white'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <span className="truncate max-w-[140px]" title={domain}>{domain}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono text-[11px] text-zinc-500">
                        {domainCounts[domain] || 0}
                      </span>
                      {sourceFilter === domain && <Check className="h-3.5 w-3.5 text-black dark:text-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* View Toggle */}
        <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`h-8 w-8 rounded-md grid place-items-center transition-colors cursor-pointer ${
              viewMode === 'grid' 
                ? 'bg-black dark:bg-white text-white dark:text-black' 
                : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
            }`}
            title="Grid View"
          >
            <Grid2x2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`h-8 w-8 rounded-md grid place-items-center transition-colors cursor-pointer ${
              viewMode === 'list' 
                ? 'bg-black dark:bg-white text-white dark:text-black' 
                : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
            }`}
            title="List View"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
