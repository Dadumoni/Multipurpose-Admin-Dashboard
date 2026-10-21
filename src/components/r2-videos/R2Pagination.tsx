import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface R2PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}

export default function R2Pagination({
  currentPage,
  totalPages,
  totalCount,
  onPageChange,
}: R2PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4">
      <div className="text-xs text-zinc-500">
        Showing page {currentPage} of {totalPages} ({totalCount} total)
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs px-2 text-black dark:text-white font-medium">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
