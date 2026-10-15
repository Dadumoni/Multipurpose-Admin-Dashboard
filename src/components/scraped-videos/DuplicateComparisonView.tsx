import React from 'react';
import { Files, Check, Play, Eye, Trash2, FileVideo } from 'lucide-react';
import { format } from 'date-fns';
import { ScrapedVideo, DuplicatePair } from './types';
import { LazyThumbnail } from './PlyrPlayer';

interface DuplicateComparisonViewProps {
  duplicatePairs: DuplicatePair[];
  paginatedDupPairs: DuplicatePair[];
  dupCurrentPage: number;
  setDupCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalDupPages: number;
  DUP_PAGE_SIZE: number;
  selectedIds: Set<string | number>;
  toggleSelect: (id: string | number) => void;
  openPreview: (video: ScrapedVideo) => void;
  setVideoToDelete: (id: string | number | null) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
  setIsViewingDuplicates: (viewing: boolean) => void;
  setCurrentPage: (page: number) => void;
}

export function DuplicateComparisonView({
  duplicatePairs,
  paginatedDupPairs,
  dupCurrentPage,
  setDupCurrentPage,
  totalDupPages,
  DUP_PAGE_SIZE,
  selectedIds,
  toggleSelect,
  openPreview,
  setVideoToDelete,
  setDeleteConfirmOpen,
  setIsViewingDuplicates,
  setCurrentPage,
}: DuplicateComparisonViewProps) {
  if (paginatedDupPairs.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-zinc-100 dark:bg-zinc-900 grid place-items-center mb-3 text-zinc-400">
          <Files className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="text-sm font-semibold text-black dark:text-white">All duplicate videos resolved!</div>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
          No remaining duplicate video pairs found in current database.
        </p>
        <button
          type="button"
          onClick={() => {
            setIsViewingDuplicates(false);
            setCurrentPage(1);
          }}
          className="mt-3 px-3 py-1.5 text-xs font-medium rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-90 cursor-pointer"
        >
          Return to All Videos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {paginatedDupPairs.map((pair, index) => {
          const orig = pair.original;
          const dup = pair.duplicate;
          const origId = orig.id || orig._id;
          const dupId = dup.id || dup._id;
          const isOrigSelected = origId ? selectedIds.has(origId) : false;
          const isDupSelected = dupId ? selectedIds.has(dupId) : false;

          return (
            <div
              key={pair.id || index}
              className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-4 shadow-sm"
            >
              {/* Pair Match Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-3 border-b border-zinc-100 dark:border-zinc-850 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-zinc-400 dark:text-zinc-500">
                    #{(dupCurrentPage - 1) * DUP_PAGE_SIZE + index + 1}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 inline-flex items-center gap-1">
                    <Files className="h-3 w-3" />
                    <span>{pair.reason}</span>
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400">
                  Side-by-Side Comparison
                </div>
              </div>

              {/* 2 COLUMNS: SIDE BY SIDE */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* LEFT: ORIGINAL */}
                <div className={`rounded-xl border bg-emerald-50/20 dark:bg-emerald-950/20 p-3.5 flex flex-col justify-between transition-all ${
                  isOrigSelected 
                    ? 'border-emerald-500 ring-2 ring-emerald-500/40 shadow-sm bg-emerald-50/40 dark:bg-emerald-950/40' 
                    : 'border-emerald-200 dark:border-emerald-900/60'
                }`}>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        {origId && (
                          <input
                            type="checkbox"
                            checked={isOrigSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelect(origId);
                            }}
                            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            title={isOrigSelected ? "Deselect original video" : "Select original video"}
                          />
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1">
                          <Check className="h-3 w-3 stroke-[2.5]" />
                          <span>Original (Matched With)</span>
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400 font-mono">
                        ID: {String(origId || '—').slice(-8)}
                      </span>
                    </div>

                    <div 
                      onClick={() => openPreview(orig)}
                      className="aspect-video rounded-lg overflow-hidden relative bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-pointer group mb-2.5"
                    >
                      {origId && (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            toggleSelect(origId);
                          }}
                          className={`absolute top-2.5 left-2.5 z-20 h-6 w-6 rounded flex items-center justify-center transition-all cursor-pointer ${
                            isOrigSelected 
                              ? 'opacity-100 bg-emerald-600 text-white border border-emerald-600 ring-2 ring-white/80 dark:ring-black/80 shadow-md' 
                              : 'opacity-85 hover:opacity-100 bg-white/95 dark:bg-black/95 hover:bg-white dark:hover:bg-black border border-zinc-300 dark:border-zinc-700 text-black dark:text-white shadow-sm'
                          }`}
                          title={isOrigSelected ? "Deselect original video" : "Select original video"}
                        >
                          {isOrigSelected ? (
                            <Check className="h-3.5 w-3.5 stroke-[3] text-white" />
                          ) : (
                            <span className="sr-only">Select</span>
                          )}
                        </button>
                      )}

                      <LazyThumbnail
                        src={orig.thumbnail_url}
                        alt={orig.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        fallbackIcon={<FileVideo className="h-8 w-8 text-zinc-400" />}
                        priority={index === 0}
                      />
                      <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                        <div className="h-9 w-9 rounded-full bg-white text-zinc-900 grid place-items-center shadow-md pl-0.5">
                          <Play className="h-4 w-4 fill-zinc-900" />
                        </div>
                      </div>
                      <span className="absolute bottom-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/75 text-white">
                        {(Number(orig.views) || 0).toLocaleString()} views
                      </span>
                    </div>

                    <h4 className="text-xs font-semibold text-black dark:text-white line-clamp-2" title={orig.title}>
                      {orig.title}
                    </h4>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-emerald-200/50 dark:border-emerald-900/40 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Added: {orig.created_at ? format(new Date(orig.created_at), 'dd MMM yyyy') : '—'}</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openPreview(orig)}
                        className="h-7 px-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoToDelete(origId || null);
                          setDeleteConfirmOpen(true);
                        }}
                        className="h-7 px-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold inline-flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                        title="Delete this original video"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* RIGHT: DUPLICATE VIDEO */}
                <div className={`rounded-xl border bg-red-50/20 dark:bg-red-950/20 p-3.5 flex flex-col justify-between transition-all ${
                  isDupSelected 
                    ? 'border-red-500 ring-2 ring-red-500/40 shadow-sm bg-red-50/40 dark:bg-red-950/40' 
                    : 'border-red-200 dark:border-red-900/60'
                }`}>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        {dupId && (
                          <input
                            type="checkbox"
                            checked={isDupSelected}
                            onChange={(e) => {
                              e.stopPropagation();
                              toggleSelect(dupId);
                            }}
                            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-red-600 focus:ring-red-500 cursor-pointer"
                            title={isDupSelected ? "Deselect duplicate video" : "Select duplicate video"}
                          />
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-800 inline-flex items-center gap-1">
                          <Trash2 className="h-3 w-3" />
                          <span>Duplicate Video</span>
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-400 font-mono">
                        ID: {String(dupId || '—').slice(-8)}
                      </span>
                    </div>

                    <div 
                      onClick={() => openPreview(dup)}
                      className="aspect-video rounded-lg overflow-hidden relative bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 cursor-pointer group mb-2.5"
                    >
                      {dupId && (
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            toggleSelect(dupId);
                          }}
                          className={`absolute top-2.5 left-2.5 z-20 h-6 w-6 rounded flex items-center justify-center transition-all cursor-pointer ${
                            isDupSelected 
                              ? 'opacity-100 bg-red-600 text-white border border-red-600 ring-2 ring-white/80 dark:ring-black/80 shadow-md' 
                              : 'opacity-85 hover:opacity-100 bg-white/95 dark:bg-black/95 hover:bg-white dark:hover:bg-black border border-zinc-300 dark:border-zinc-700 text-black dark:text-white shadow-sm'
                          }`}
                          title={isDupSelected ? "Deselect duplicate video" : "Select duplicate video"}
                        >
                          {isDupSelected ? (
                            <Check className="h-3.5 w-3.5 stroke-[3] text-white" />
                          ) : (
                            <span className="sr-only">Select</span>
                          )}
                        </button>
                      )}

                      <LazyThumbnail
                        src={dup.thumbnail_url}
                        alt={dup.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        fallbackIcon={<FileVideo className="h-8 w-8 text-zinc-400" />}
                        priority={index === 0}
                      />
                      <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                        <div className="h-9 w-9 rounded-full bg-white text-zinc-900 grid place-items-center shadow-md pl-0.5">
                          <Play className="h-4 w-4 fill-zinc-900" />
                        </div>
                      </div>
                      <span className="absolute bottom-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/75 text-white">
                        {(Number(dup.views) || 0).toLocaleString()} views
                      </span>
                    </div>

                    <h4 className="text-xs font-semibold text-black dark:text-white line-clamp-2" title={dup.title}>
                      {dup.title}
                    </h4>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-red-200/50 dark:border-red-900/40 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Added: {dup.created_at ? format(new Date(dup.created_at), 'dd MMM yyyy') : '—'}</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openPreview(dup)}
                        className="h-7 px-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye className="h-3 w-3" />
                        <span>Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoToDelete(dupId || null);
                          setDeleteConfirmOpen(true);
                        }}
                        className="h-7 px-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold inline-flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                        title="Delete this duplicate video"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Duplicate Pagination Controls */}
      {totalDupPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4 text-xs">
          <span className="text-zinc-500 dark:text-zinc-400">
            Showing {(dupCurrentPage - 1) * DUP_PAGE_SIZE + 1} - {Math.min(dupCurrentPage * DUP_PAGE_SIZE, duplicatePairs.length)} of {duplicatePairs.length} duplicate pairs
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDupCurrentPage(p => Math.max(1, p - 1))}
              disabled={dupCurrentPage === 1}
              className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40 cursor-pointer font-medium"
            >
              Previous
            </button>
            <span className="font-mono font-medium px-2">Page {dupCurrentPage} of {totalDupPages}</span>
            <button
              type="button"
              onClick={() => setDupCurrentPage(p => Math.min(totalDupPages, p + 1))}
              disabled={dupCurrentPage === totalDupPages}
              className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 disabled:opacity-40 cursor-pointer font-medium"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
