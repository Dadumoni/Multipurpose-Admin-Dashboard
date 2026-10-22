import React from 'react';
import { 
  Play, 
  Eye, 
  Calendar, 
  Pencil, 
  Trash2, 
  FileVideo,
  Clock,
  HardDrive
} from 'lucide-react';
import { format } from 'date-fns';
import { R2Video, formatFileSize, formatDuration } from './types';
import { LazyThumbnail } from '@/src/components/scraped-videos/PlyrPlayer';

interface R2VideoCardProps {
  video: R2Video;
  thumbUrl: string;
  onPreview: (video: R2Video) => void;
  onRename: (video: R2Video) => void;
  onDelete: (video: R2Video) => void;
}

export default function R2VideoCard({
  video,
  thumbUrl,
  onPreview,
  onRename,
  onDelete,
}: R2VideoCardProps) {
  const formattedSize = formatFileSize(video.file_size ?? video.size);
  const formattedDur = formatDuration(video.duration);

  return (
    <div 
      onClick={() => onPreview(video)}
      className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl overflow-hidden group hover:shadow-sm transition-all cursor-pointer flex flex-col"
    >
      {/* Thumbnail Aspect Container */}
      <div className="aspect-video bg-zinc-100 dark:bg-zinc-900 relative overflow-hidden flex items-center justify-center border-b border-zinc-200 dark:border-zinc-800">
        <LazyThumbnail
          src={thumbUrl}
          alt={video.title || 'Video thumbnail'}
          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          fallbackIcon={
            <div className="flex flex-col items-center gap-1 text-zinc-400 dark:text-zinc-500 text-xs">
              <FileVideo className="h-8 w-8" />
              <span className="text-[10px] font-mono">No Thumbnail</span>
            </div>
          }
        />

        {/* Play Icon Center Overlay on Hover */}
        <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="h-10 w-10 rounded-full bg-white text-zinc-900 shadow-md grid place-items-center pl-0.5">
            <Play className="h-5 w-5 fill-zinc-900" />
          </div>
        </div>

        {/* Top-right views badge */}
        <div className="absolute top-2.5 right-2.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-white backdrop-blur-xs flex items-center gap-1 z-10">
          <Eye className="h-2.5 w-2.5" />
          <span>{(video.views || 0).toLocaleString()}</span>
        </div>

        {/* Top-left ID badge */}
        <div className="absolute top-2.5 left-2.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-zinc-300 backdrop-blur-xs z-10">
          #{video.id}
        </div>

        {/* Bottom badges: Duration & Size */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] font-mono text-white pointer-events-none z-10">
          {formattedDur !== '—' && (
            <span className="px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" />
              <span>{formattedDur}</span>
            </span>
          )}
          {formattedSize !== '—' && (
            <span className="px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs flex items-center gap-1 ml-auto">
              <HardDrive className="h-2.5 w-2.5" />
              <span>{formattedSize}</span>
            </span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
        <div>
          <h3 
            className="text-xs font-semibold text-black dark:text-white line-clamp-2 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            title={video.title}
          >
            {video.title || 'Untitled Video'}
          </h3>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-1">
            <Calendar className="h-3 w-3" />
            <span>{video.created_at ? format(new Date(video.created_at), 'MMM dd, yyyy') : 'Recent'}</span>
          </div>
        </div>

        {/* Action Row */}
        <div 
          className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-850 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => onPreview(video)}
            className="px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
          >
            Preview
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onRename(video)}
              className="p-1 rounded-md text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(video)}
              className="p-1 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer transition-colors"
              title="Delete video"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
