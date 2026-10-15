import React from 'react';
import { Play, Check, Link2Off, Files, FileVideo, Eye, Trash2 } from 'lucide-react';
import { ScrapedVideo, getDomain } from './types';
import { LazyThumbnail } from './PlyrPlayer';

interface VideoGridCardProps {
  video: ScrapedVideo;
  isSelected: boolean;
  toggleSelect: (id: string | number) => void;
  openPreview: (video: ScrapedVideo) => void;
  setContextMenu: (menu: { x: number; y: number; video: ScrapedVideo }) => void;
  duplicateReasonMap: Map<string | number, string[]>;
  priority?: boolean;
}

export function VideoGridCard({
  video,
  isSelected,
  toggleSelect,
  openPreview,
  setContextMenu,
  duplicateReasonMap,
  priority = false,
}: VideoGridCardProps) {
  const videoId = video.id || video._id || '';
  const reasons = duplicateReasonMap.get(video.id) || (video._id ? duplicateReasonMap.get(video._id) : undefined);
  const shortReason = reasons && reasons.length > 0 ? reasons[0].replace('Duplicate ', '') : null;

  return (
    <div
      onClick={() => openPreview(video)}
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, video });
      }}
      className={`bg-white dark:bg-black border rounded-xl p-0 overflow-hidden group hover:shadow-sm transition-all cursor-pointer ${
        isSelected
          ? 'border-black dark:border-white ring-1 ring-black dark:ring-white'
          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
      }`}
    >
      <div className="aspect-video bg-zinc-100 dark:bg-zinc-900 relative overflow-hidden flex items-center justify-center border-b border-zinc-200 dark:border-zinc-800">
        <LazyThumbnail
          src={video.thumbnail_url}
          alt={video.title}
          priority={priority}
          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-200"
          fallbackIcon={<FileVideo className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />}
        />

        {/* Checkbox top-left */}
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleSelect(video.id);
          }}
          className={`absolute top-2.5 left-2.5 z-20 h-6 w-6 rounded flex items-center justify-center transition-all cursor-pointer ${
            isSelected 
              ? 'opacity-100 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white ring-2 ring-white/80 dark:ring-black/80 shadow-md' 
              : 'opacity-0 group-hover:opacity-100 bg-white/95 dark:bg-black/95 hover:bg-white dark:hover:bg-black border border-zinc-300 dark:border-zinc-700 text-black dark:text-white shadow-sm'
          }`}
          title={isSelected ? "Deselect video" : "Select video"}
          aria-label={isSelected ? "Deselect video" : "Select video"}
        >
          {isSelected ? (
            <Check className="h-3.5 w-3.5 stroke-[3] text-white dark:text-black" />
          ) : (
            <span className="sr-only">Select</span>
          )}
        </button>

        {/* Play button center on hover */}
        <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="h-10 w-10 rounded-full bg-white text-zinc-900 shadow-md grid place-items-center pl-0.5">
            <Play className="h-5 w-5 fill-zinc-900" />
          </div>
        </div>

        {/* Top-right expired badge */}
        {video.is_expired && (
          <span className="absolute top-2.5 right-2.5 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/90 text-black shadow-sm pointer-events-none flex items-center gap-1 z-10">
            <Link2Off className="h-3 w-3" />
            <span>Expired</span>
          </span>
        )}

        {/* Duplicate badge */}
        {shortReason && (
          <span 
            className={`absolute ${video.is_expired ? 'top-8' : 'top-2.5'} right-2.5 text-[10px] font-semibold px-2 py-0.5 rounded bg-purple-600/90 text-white shadow-sm pointer-events-none flex items-center gap-1 z-10`}
            title={reasons?.join(', ')}
          >
            <Files className="h-2.5 w-2.5" />
            <span>{shortReason}</span>
          </span>
        )}

        {/* Bottom-right info: views */}
        <span className="absolute bottom-2 right-2 text-[10px] font-medium font-mono px-1.5 py-0.5 rounded bg-black/75 text-white pointer-events-none">
          {(Number(video.views) || 0).toLocaleString()} views
        </span>
      </div>

      <div className="p-3">
        <div className="font-medium text-sm text-black dark:text-white truncate" title={video.title}>
          {video.title}
        </div>
      </div>
    </div>
  );
}

interface VideoListRowProps {
  video: ScrapedVideo;
  isSelected: boolean;
  toggleSelect: (id: string | number) => void;
  openPreview: (video: ScrapedVideo) => void;
  setVideoToDelete: (id: string | number | null) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
  duplicateReasonMap: Map<string | number, string[]>;
  priority?: boolean;
}

export function VideoListRow({
  video,
  isSelected,
  toggleSelect,
  openPreview,
  setVideoToDelete,
  setDeleteConfirmOpen,
  duplicateReasonMap,
  priority = false,
}: VideoListRowProps) {
  const reasons = duplicateReasonMap.get(video.id) || (video._id ? duplicateReasonMap.get(video._id) : undefined);

  return (
    <tr
      onClick={() => openPreview(video)}
      className={`h-14 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 cursor-pointer transition-colors ${
        isSelected ? 'bg-zinc-50 dark:bg-zinc-900/40' : ''
      }`}
    >
      <td className="px-4" onClick={(e) => e.stopPropagation()}>
        <input 
          type="checkbox"
          checked={isSelected}
          onChange={() => toggleSelect(video.id)}
          className="rounded border-zinc-300 dark:border-zinc-700"
        />
      </td>
      <td className="pr-1">
        <div className="h-8 w-12 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 overflow-hidden grid place-items-center">
          <LazyThumbnail
            src={video.thumbnail_url}
            alt=""
            priority={priority}
            className="h-full w-full object-cover"
            fallbackIcon={<FileVideo className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />}
          />
        </div>
      </td>
      <td className="px-4 font-medium text-black dark:text-white max-w-[460px] truncate">
        <div className="flex items-center gap-2">
          <span className="truncate">{video.title}</span>
          {video.is_expired && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 flex items-center gap-0.5">
              <Link2Off className="h-2.5 w-2.5" />
              <span>Expired</span>
            </span>
          )}
          {reasons && reasons.length > 0 && (
            <span 
              className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-400 border border-purple-300 dark:border-purple-800 flex items-center gap-0.5"
              title={reasons.join(', ')}
            >
              <Files className="h-2.5 w-2.5" />
              <span>{reasons[0]}</span>
            </span>
          )}
        </div>
      </td>
      <td className="px-4 text-xs text-zinc-700 dark:text-zinc-300 font-mono tabular-nums whitespace-nowrap">
        {(Number(video.views) || 0).toLocaleString()}
      </td>
      <td className="px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
        <div className="inline-flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => openPreview(video)}
            className="h-7 px-2.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
            title="Preview video"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Preview</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setVideoToDelete(video._id || video.id);
              setDeleteConfirmOpen(true);
            }}
            className="h-7 px-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
            title="Delete video"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </button>
        </div>
      </td>
    </tr>
  );
}
