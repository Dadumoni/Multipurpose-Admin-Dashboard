import React from 'react';
import { 
  Folder, 
  ChevronRight, 
  Link2Off, 
  Files, 
  Globe, 
  Trash2, 
  RotateCw, 
  Square, 
  Check 
} from 'lucide-react';
import { toast } from 'sonner';
import { DuplicatePair } from './types';

interface FileManagerToolbarProps {
  isViewingExpired: boolean;
  setIsViewingExpired: (val: boolean) => void;
  isViewingDuplicates: boolean;
  setIsViewingDuplicates: (val: boolean) => void;
  sourceFilter: string;
  setSourceFilter: (domain: string) => void;
  totalFilteredCount: number;
  selectedIds: Set<string | number>;
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string | number>>>;
  selectAllFiltered: () => void;
  setVideoToDelete: (id: string | number | null) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
  handleCheckDuplicates: () => void;
  isCheckingDuplicates: boolean;
  duplicatePairs: DuplicatePair[];
  handleCheckExpired: () => void;
  handleCancelCheckExpired: () => void;
  isCheckingExpired: boolean;
  checkProgress: {
    total: number;
    checked: number;
    expiredCount: number;
    recoveredCount?: number;
    newlyExpiredCount?: number;
    status: string;
    message?: string;
  };
  setCurrentPage: (page: number) => void;
  clearDomainFilter: () => void;
}

export function FileManagerToolbar({
  isViewingExpired,
  setIsViewingExpired,
  isViewingDuplicates,
  setIsViewingDuplicates,
  sourceFilter,
  setSourceFilter,
  totalFilteredCount,
  selectedIds,
  setSelectedIds,
  selectAllFiltered,
  setVideoToDelete,
  setDeleteConfirmOpen,
  handleCheckDuplicates,
  isCheckingDuplicates,
  duplicatePairs,
  handleCheckExpired,
  handleCancelCheckExpired,
  isCheckingExpired,
  checkProgress,
  setCurrentPage,
  clearDomainFilter,
}: FileManagerToolbarProps) {
  return (
    <>
      {/* Top Toolbar */}
      <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 px-4 flex items-center justify-between bg-white dark:bg-black">
        {/* Left: Breadcrumbs */}
        <div className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
          <button
            type="button"
            onClick={() => {
              setIsViewingExpired(false);
              setIsViewingDuplicates(false);
              setSourceFilter('all');
              setCurrentPage(1);
              setSelectedIds(new Set());
              clearDomainFilter();
            }}
            className="flex items-center gap-1.5 font-medium text-black dark:text-white hover:underline cursor-pointer"
          >
            <Folder className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
            <span>My Files</span>
          </button>
          <ChevronRight className="h-4 w-4 text-zinc-400 dark:text-zinc-600" />

          {isViewingExpired ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsViewingExpired(false);
                  setCurrentPage(1);
                  setSelectedIds(new Set());
                }}
                className="text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white font-medium hover:underline cursor-pointer"
              >
                All Videos
              </button>
              <ChevronRight className="h-4 w-4 text-zinc-400 dark:text-zinc-600" />
              <span className="font-semibold text-amber-700 dark:text-amber-400 bg-amber-100/80 dark:bg-amber-950/60 px-2 py-0.5 rounded text-xs inline-flex items-center gap-1">
                <Link2Off className="h-3 w-3" />
                <span>Expired Links</span>
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-1">({totalFilteredCount} posts)</span>
              <button
                type="button"
                onClick={() => {
                  setIsViewingExpired(false);
                  setCurrentPage(1);
                  setSelectedIds(new Set());
                }}
                className="ml-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white underline cursor-pointer"
              >
                View All
              </button>
            </>
          ) : isViewingDuplicates ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setIsViewingDuplicates(false);
                  setCurrentPage(1);
                  setSelectedIds(new Set());
                }}
                className="text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white font-medium hover:underline cursor-pointer"
              >
                All Videos
              </button>
              <ChevronRight className="h-4 w-4 text-zinc-400 dark:text-zinc-600" />
              <span className="font-semibold text-purple-700 dark:text-purple-400 bg-purple-100/80 dark:bg-purple-950/60 px-2 py-0.5 rounded text-xs inline-flex items-center gap-1">
                <Files className="h-3 w-3" />
                <span>Duplicate Videos</span>
              </span>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-1">({duplicatePairs.length} pairs side by side)</span>
              <button
                type="button"
                onClick={() => {
                  setIsViewingDuplicates(false);
                  setCurrentPage(1);
                  setSelectedIds(new Set());
                }}
                className="ml-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white underline cursor-pointer"
              >
                View All
              </button>
            </>
          ) : (
            <>
              <span className="text-zinc-500 dark:text-zinc-400 font-medium">All Videos</span>
              {sourceFilter !== 'all' && (
                <>
                  <ChevronRight className="h-4 w-4 text-zinc-400 dark:text-zinc-600" />
                  <span className="font-semibold text-sky-700 dark:text-sky-300 bg-sky-100/80 dark:bg-sky-950/60 px-2 py-0.5 rounded text-xs inline-flex items-center gap-1">
                    <Globe className="h-3 w-3" />
                    <span>{sourceFilter}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceFilter('all');
                      setCurrentPage(1);
                      clearDomainFilter();
                      toast.info('Showing all domains');
                    }}
                    className="ml-1 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white underline cursor-pointer"
                    title="Clear domain filter"
                  >
                    View All
                  </button>
                </>
              )}
              <span className="text-xs text-zinc-400 dark:text-zinc-500 ml-1">({totalFilteredCount} posts)</span>
            </>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 text-xs">
              {selectedIds.size < totalFilteredCount && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white underline mr-1 cursor-pointer"
                >
                  Select All ({totalFilteredCount})
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                title="Click to unselect all"
                className="h-8 px-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>{selectedIds.size} selected</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setVideoToDelete(null);
                  setDeleteConfirmOpen(true);
                }}
                className="h-8 px-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Selected</span>
              </button>
            </div>
          )}

          {/* Check Duplicate button */}
          <button
            type="button"
            onClick={handleCheckDuplicates}
            disabled={isCheckingDuplicates}
            className={`h-9 px-3 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer ${
              isViewingDuplicates
                ? 'border-purple-500 bg-purple-50/80 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 ring-2 ring-purple-500/20'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300'
            }`}
            title="Compare duplicates side by side (left: original video, right: duplicate video)"
          >
            <Files className={`h-3.5 w-3.5 ${isCheckingDuplicates ? 'animate-spin text-purple-600 dark:text-purple-400' : ''}`} />
            <span>
              {isCheckingDuplicates
                ? 'Checking...'
                : duplicatePairs.length > 0
                  ? `Check Duplicate (${duplicatePairs.length})`
                  : 'Check Duplicate'}
            </span>
          </button>

          {/* Check Exp button */}
          <button
            type="button"
            onClick={handleCheckExpired}
            disabled={isCheckingExpired}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 shadow-sm disabled:opacity-75 transition-colors cursor-pointer"
            title="Check every video URL in MongoDB to detect whether video still exists"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isCheckingExpired ? 'animate-spin text-amber-600 dark:text-amber-400' : ''}`} />
            <span>
              {isCheckingExpired 
                ? checkProgress.total > 0 
                  ? `Checking (${checkProgress.checked}/${checkProgress.total})...` 
                  : 'Checking...' 
                : 'Check Exp'}
            </span>
          </button>

          {isCheckingExpired && (
            <button
              type="button"
              onClick={handleCancelCheckExpired}
              className="h-9 px-3 rounded-lg border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-xs font-semibold text-red-600 dark:text-red-400 inline-flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              title="Cancel active background URL scan immediately"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Cancel</span>
            </button>
          )}
        </div>
      </div>

      {/* Duplicate Videos Active Banner */}
      {isViewingDuplicates && (
        <div className="m-4 mb-0 p-3.5 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/70 dark:bg-purple-950/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start sm:items-center gap-2.5 text-xs font-medium text-purple-900 dark:text-purple-200">
            <Files className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <span>
                Showing <strong>{duplicatePairs.length} duplicate pairs</strong> side by side.
              </span>
              <div className="text-[11px] text-purple-700 dark:text-purple-300 mt-0.5">
                <strong>Left Side:</strong> Original Video (Matched Source) • <strong>Right Side:</strong> Duplicate Video. Both sides can be selected or deleted.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => {
                const dupOnlyIds = new Set<string | number>();
                duplicatePairs.forEach(p => {
                  const dId = p.duplicate.id || p.duplicate._id;
                  if (dId) dupOnlyIds.add(dId);
                });
                setSelectedIds(dupOnlyIds);
                toast.success(`Selected ${dupOnlyIds.size} duplicate videos`);
              }}
              className="h-7 px-2.5 text-xs font-semibold rounded-lg border border-purple-300 dark:border-purple-800 bg-white dark:bg-black hover:bg-purple-100/50 dark:hover:bg-purple-900/30 text-purple-800 dark:text-purple-300 inline-flex items-center gap-1 transition-colors cursor-pointer"
              title="Select all right-hand duplicate videos for deletion"
            >
              <Check className="h-3 w-3 stroke-[2.5]" />
              <span>Select All Duplicates ({duplicatePairs.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsViewingDuplicates(false);
                setCurrentPage(1);
                setSelectedIds(new Set());
              }}
              className="h-7 px-3 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white inline-flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Exit Duplicates</span>
            </button>
          </div>
        </div>
      )}

      {/* Persistent Background Job Live Progress Banner */}
      {isCheckingExpired && checkProgress.total > 0 && (
        <div className="m-4 mb-0 p-3.5 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 flex flex-col gap-2 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-2">
              <RotateCw className="h-3.5 w-3.5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-semibold">Persistent Background Scan Running:</span>
              <span>
                {checkProgress.checked} of {checkProgress.total} links verified ({Math.min(100, Math.round((checkProgress.checked / Math.max(1, checkProgress.total)) * 100))}%)
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[11px] text-amber-700 dark:text-amber-300">
                {checkProgress.expiredCount} expired • {checkProgress.recoveredCount || 0} restored active
              </span>
              <button
                type="button"
                onClick={handleCancelCheckExpired}
                className="h-6 px-2 text-[11px] font-semibold rounded bg-red-600 hover:bg-red-700 text-white inline-flex items-center gap-1 shadow-sm transition-colors cursor-pointer"
              >
                <Square className="h-2.5 w-2.5 fill-current" />
                <span>Stop Scan</span>
              </button>
            </div>
          </div>
          <div className="w-full bg-amber-200/80 dark:bg-amber-900/50 rounded-full h-2 overflow-hidden">
            <div
              className="bg-amber-500 dark:bg-amber-400 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${Math.min(100, Math.round((checkProgress.checked / Math.max(1, checkProgress.total)) * 100))}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
