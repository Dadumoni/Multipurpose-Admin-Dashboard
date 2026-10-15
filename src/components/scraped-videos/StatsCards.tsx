import React from 'react';
import { Film, Eye, Folder, Link2Off } from 'lucide-react';
import { toast } from 'sonner';

interface StatsCardsProps {
  totalPosts: number;
  activeTable: string;
  totalViews: number;
  availableSources: string[];
  sourceFilter: string;
  setSourceFilter: (source: string) => void;
  isViewingExpired: boolean;
  setIsViewingExpired: React.Dispatch<React.SetStateAction<boolean>>;
  setIsViewingDuplicates: (viewing: boolean) => void;
  setCurrentPage: (page: number) => void;
  setSelectedIds: (ids: Set<string | number>) => void;
  setSortDropdownOpen: (open: boolean) => void;
  expiredCount: number;
}

export function StatsCards({
  totalPosts,
  activeTable,
  totalViews,
  availableSources,
  sourceFilter,
  setSourceFilter,
  isViewingExpired,
  setIsViewingExpired,
  setIsViewingDuplicates,
  setCurrentPage,
  setSelectedIds,
  setSortDropdownOpen,
  expiredCount,
}: StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Posts Card */}
      <div 
        onClick={() => {
          if (isViewingExpired) {
            setIsViewingExpired(false);
            setIsViewingDuplicates(false);
            setCurrentPage(1);
            setSelectedIds(new Set());
          }
        }}
        className={`bg-white dark:bg-black border rounded-xl p-5 shadow-sm flex flex-col justify-between transition-all ${
          isViewingExpired ? 'cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-700' : 'border-zinc-200 dark:border-zinc-800'
        }`}
        title={isViewingExpired ? "Click to view All Videos" : "Total posts in collection"}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Total Posts</span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
            <Film className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
            {totalPosts.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>In public.{activeTable}</span>
            {!isViewingExpired && (
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Active View</span>
            )}
          </div>
        </div>
      </div>

      {/* Total Views Card */}
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Total Views</span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
            <Eye className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
            {totalViews.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Across scraped posts</div>
        </div>
      </div>

      {/* Video Sources Card */}
      <div 
        onClick={() => {
          if (sourceFilter !== 'all') {
            setSourceFilter('all');
            setCurrentPage(1);
            toast.info('Showing all domains');
          } else {
            setSortDropdownOpen(true);
          }
        }}
        className={`bg-white dark:bg-black border rounded-xl p-5 shadow-sm flex flex-col justify-between cursor-pointer transition-all hover:shadow-md ${
          sourceFilter !== 'all'
            ? 'border-black dark:border-white ring-2 ring-black/10 dark:ring-white/10'
            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
        }`}
        title={sourceFilter !== 'all' ? `Filtered by ${sourceFilter}. Click to view all domains` : "Total active domains in collection. Click to filter"}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Video Sources</span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
            <Folder className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
            {availableSources.length}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span className="truncate">{sourceFilter === 'all' ? 'Total domains' : `Active: ${sourceFilter}`}</span>
            {sourceFilter !== 'all' ? (
              <span className="text-[10px] font-semibold text-black dark:text-white bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded">Filtered</span>
            ) : (
              <span className="text-[11px] text-zinc-500">Click to filter</span>
            )}
          </div>
        </div>
      </div>

      {/* Expired Links Card */}
      <div 
        onClick={() => {
          setIsViewingExpired(prev => !prev);
          setCurrentPage(1);
          setSelectedIds(new Set());
        }}
        className={`bg-white dark:bg-black border rounded-xl p-5 shadow-sm flex flex-col justify-between cursor-pointer transition-all hover:shadow-md ${
          isViewingExpired 
            ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/20 dark:bg-amber-950/20 shadow-sm' 
            : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
        }`}
        title="Click to view and manage expired video links"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Expired Links</span>
          <div className={`rounded-md p-1.5 ${isViewingExpired ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'}`}>
            <Link2Off className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
            {expiredCount}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 flex items-center justify-between">
            <span>{isViewingExpired ? 'Viewing in My Files' : 'Click to view in My Files'}</span>
            {isViewingExpired && (
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-100/70 dark:bg-amber-950/60 px-1.5 py-0.2 rounded">Active</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
