import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ScrapedVideosPaginationProps {
  currentPage: number;
  totalPages: number;
  totalFilteredCount: number;
  pageSize: number;
  setPageSize: (size: number) => void;
  setCurrentPage: (page: React.SetStateAction<number>) => void;
}

export default function ScrapedVideosPagination({
  currentPage,
  totalPages,
  totalFilteredCount,
  pageSize,
  setPageSize,
  setCurrentPage,
}: ScrapedVideosPaginationProps) {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 px-2 text-xs text-zinc-500 dark:text-zinc-400">
      <div className="flex flex-wrap items-center gap-3">
        <span>Showing Page {currentPage} of {totalPages} ({totalFilteredCount.toLocaleString()} total posts)</span>
        <div className="flex items-center gap-1 border-l border-zinc-200 dark:border-zinc-800 pl-3">
          <span className="text-[11px] text-zinc-400">Per page:</span>
          {[12, 24, 36, 48].map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => {
                setPageSize(size);
                setCurrentPage(1);
              }}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                pageSize === size
                  ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 grid place-items-center disabled:opacity-50 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 grid place-items-center disabled:opacity-50 cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
