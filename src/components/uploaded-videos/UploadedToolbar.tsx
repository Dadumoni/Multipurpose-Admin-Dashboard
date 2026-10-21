import React from 'react';
import { Search, Grid2x2, List, RotateCw } from 'lucide-react';

interface UploadedToolbarProps {
  search: string;
  setSearch: (s: string) => void;
  sortOrder: 'date_desc' | 'date_asc' | 'title_asc';
  setSortOrder: (s: 'date_desc' | 'date_asc' | 'title_asc') => void;
  viewMode: 'grid' | 'list';
  setViewMode: (v: 'grid' | 'list') => void;
  onRefresh: () => void;
  refreshing: boolean;
}

export default function UploadedToolbar({
  search,
  setSearch,
  sortOrder,
  setSortOrder,
  viewMode,
  setViewMode,
  onRefresh,
  refreshing,
}: UploadedToolbarProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      {/* Search Input */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
        <input
          type="text"
          placeholder="Search by title, filename or ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
        />
      </div>

      {/* Sort, View Toggle, Refresh */}
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value as any)}
          className="h-8 px-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none cursor-pointer"
        >
          <option value="date_desc">Newest First</option>
          <option value="date_asc">Oldest First</option>
          <option value="title_asc">Title (A-Z)</option>
        </select>

        {/* View Toggle */}
        <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5 bg-zinc-50 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded ${viewMode === 'grid' ? 'bg-white dark:bg-black shadow-xs text-black dark:text-white' : 'text-zinc-400 hover:text-black dark:hover:text-white'} transition-colors cursor-pointer`}
            title="Grid View"
          >
            <Grid2x2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-1 rounded ${viewMode === 'list' ? 'bg-white dark:bg-black shadow-xs text-black dark:text-white' : 'text-zinc-400 hover:text-black dark:hover:text-white'} transition-colors cursor-pointer`}
            title="List View"
          >
            <List className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={onRefresh}
          className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-zinc-500 hover:text-black dark:hover:text-white grid place-items-center cursor-pointer transition-colors"
          title="Refresh videos"
        >
          <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
}
