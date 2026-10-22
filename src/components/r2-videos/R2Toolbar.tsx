import React from 'react';
import { 
  Folder, 
  ChevronRight, 
  Search, 
  Grid2x2, 
  List, 
  RotateCw, 
  X 
} from 'lucide-react';

interface R2ToolbarProps {
  totalCount: number;
  search: string;
  setSearch: (s: string) => void;
  sortOrder: 'date_desc' | 'date_asc' | 'views_desc' | 'title_asc';
  setSortOrder: (s: 'date_desc' | 'date_asc' | 'views_desc' | 'title_asc') => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  viewMode: 'grid' | 'list';
  setViewMode: (v: 'grid' | 'list') => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export default function R2Toolbar({
  totalCount,
  search,
  setSearch,
  sortOrder,
  setSortOrder,
  pageSize,
  setPageSize,
  viewMode,
  setViewMode,
  onRefresh,
  refreshing,
}: R2ToolbarProps) {
  return (
    <>
      {/* Top Toolbar matching ScrapedVideos FileManagerToolbar */}
      <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 px-4 flex items-center justify-between bg-white dark:bg-black">
        {/* Left: Breadcrumbs */}
        <div className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <div className="flex items-center gap-1.5 font-medium text-black dark:text-white">
            <Folder className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
            <span>My Files</span>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-400 dark:text-zinc-600" />
          <span className="text-zinc-500 dark:text-zinc-400 font-medium">All Videos</span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-1">
            ({totalCount.toLocaleString()} videos)
          </span>
        </div>

        {/* Right: Quick Actions */}
        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            title="Refresh videos"
          >
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* View Toggle */}
          <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5 bg-zinc-50 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white dark:bg-black shadow-xs text-black dark:text-white' : 'text-zinc-400 hover:text-black dark:hover:text-white'} transition-colors cursor-pointer`}
              title="Grid View"
              aria-label="Grid view"
            >
              <Grid2x2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white dark:bg-black shadow-xs text-black dark:text-white' : 'text-zinc-400 hover:text-black dark:hover:text-white'} transition-colors cursor-pointer`}
              title="List View"
              aria-label="List view"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Sub-Bar */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-950/40">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by title, slug, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors shadow-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black dark:hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Sort & Page Size Controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="hidden sm:inline">Sort:</span>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as any)}
              className="h-8 px-2.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none cursor-pointer shadow-xs"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="views_desc">Most Views</option>
              <option value="title_asc">Title (A-Z)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="hidden sm:inline">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="h-8 px-2.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none cursor-pointer shadow-xs"
            >
              <option value={12}>12 / page</option>
              <option value={24}>24 / page</option>
              <option value={48}>48 / page</option>
              <option value={96}>96 / page</option>
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
