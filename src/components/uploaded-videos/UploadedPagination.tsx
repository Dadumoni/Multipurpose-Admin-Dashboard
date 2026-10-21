import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface UploadedPaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export default function UploadedPagination({
  currentPage,
  totalPages,
  onPageChange,
}: UploadedPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="mt-5 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4">
      <span className="text-xs text-zinc-500 font-mono">
        Page {currentPage} of {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:pointer-events-none hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:pointer-events-none hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
