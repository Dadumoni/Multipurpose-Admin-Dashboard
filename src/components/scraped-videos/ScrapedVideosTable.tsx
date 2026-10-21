import React from 'react';
import { VideoListRow } from './VideoCard';
import { ScrapedVideo } from './types';

interface ScrapedVideosTableProps {
  displayedVideos: ScrapedVideo[];
  selectedIds: Set<number | string>;
  selectAllFiltered: () => void;
  toggleSelect: (id: number | string) => void;
  openPreview: (video: ScrapedVideo) => void;
  setVideoToDelete: (id: number | string | null) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
  duplicateReasonMap: Map<number | string, string[]>;
  totalVideosCount: number;
}

export default function ScrapedVideosTable({
  displayedVideos,
  selectedIds,
  selectAllFiltered,
  toggleSelect,
  openPreview,
  setVideoToDelete,
  setDeleteConfirmOpen,
  duplicateReasonMap,
  totalVideosCount,
}: ScrapedVideosTableProps) {
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          <tr>
            <th className="w-10 px-4 py-3">
              <input 
                type="checkbox" 
                checked={selectedIds.size === totalVideosCount && totalVideosCount > 0}
                onChange={selectAllFiltered}
                className="rounded border-zinc-300 dark:border-zinc-700 cursor-pointer"
              />
            </th>
            <th className="w-16 px-1 py-3">Thumb</th>
            <th className="px-4 py-3">Video Title</th>
            <th className="px-4 py-3">Views</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {displayedVideos.map((video: ScrapedVideo, idx: number) => (
            <VideoListRow
              key={video.id}
              video={video}
              isSelected={selectedIds.has(video.id)}
              toggleSelect={toggleSelect}
              openPreview={openPreview}
              setVideoToDelete={setVideoToDelete}
              setDeleteConfirmOpen={setDeleteConfirmOpen}
              duplicateReasonMap={duplicateReasonMap}
              priority={idx < 4}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
