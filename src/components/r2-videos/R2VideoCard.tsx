import React from 'react';
import { 
  Video, 
  Play, 
  Eye, 
  Calendar, 
  Pencil, 
  Trash2 
} from 'lucide-react';
import { format } from 'date-fns';
import { R2Video } from './types';

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
  return (
    <div className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col shadow-xs">
      {/* Thumbnail Aspect Container */}
      <div 
        onClick={() => onPreview(video)}
        className="aspect-video bg-zinc-100 dark:bg-zinc-900 relative overflow-hidden cursor-pointer"
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 gap-1.5">
            <Video className="h-8 w-8 text-zinc-300 dark:text-zinc-700" />
            <span className="text-[10px] font-mono">No Thumbnail</span>
          </div>
        )}

        {/* Play Icon Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-white text-black grid place-items-center shadow-lg transform group-hover:scale-110 transition-transform">
            <Play className="h-4 w-4 fill-current ml-0.5" />
          </div>
        </div>

        {/* Top-right views badge */}
        <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-white backdrop-blur-xs flex items-center gap-1">
          <Eye className="h-2.5 w-2.5" />
          <span>{(video.views || 0).toLocaleString()}</span>
        </div>

        {/* Bottom slug pill */}
        <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-white backdrop-blur-xs truncate max-w-[80%]">
          {video.slug}
        </div>
      </div>

      {/* Card Info Footer */}
      <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
        <div>
          <h3 
            onClick={() => onPreview(video)}
            className="text-xs font-semibold text-black dark:text-white line-clamp-2 hover:underline cursor-pointer"
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
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-850 text-xs">
          <button
            type="button"
            onClick={() => onPreview(video)}
            className="px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
          >
            Preview
          </button>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onRename(video)}
              className="p-1 rounded-md text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
              title="Rename"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(video)}
              className="p-1 rounded-md text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
