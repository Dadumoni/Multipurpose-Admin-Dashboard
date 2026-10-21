import React from 'react';
import { 
  FileVideo, 
  Play, 
  Cloud, 
  Trash2, 
  Copy, 
  Calendar 
} from 'lucide-react';
import { format } from 'date-fns';
import { TelegramUploadedVideo, FileFormatBadge } from './types';

interface UploadedVideoCardProps {
  video: TelegramUploadedVideo;
  onOpenPreview: (video: TelegramUploadedVideo) => void;
  onCopyLink: (url: string, label: string) => void;
  onDelete: (video: TelegramUploadedVideo) => void;
}

export default function UploadedVideoCard({
  video,
  onOpenPreview,
  onCopyLink,
  onDelete,
}: UploadedVideoCardProps) {
  const targetUrl = video.zerostorage_download_url || video.zerostorage_embed_url || video.video_url;

  return (
    <div className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black overflow-hidden hover:border-zinc-300 dark:hover:border-zinc-700 transition-all flex flex-col shadow-xs">
      {/* Thumbnail Aspect Container */}
      <div 
        onClick={() => onOpenPreview(video)}
        className="aspect-video bg-zinc-100 dark:bg-zinc-900 relative overflow-hidden cursor-pointer"
      >
        {video.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-400 gap-1.5">
            <FileVideo className="h-8 w-8 text-zinc-300 dark:text-zinc-700" />
            <span className="text-[10px] font-mono">No Preview</span>
          </div>
        )}

        {/* Hover play icon overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-9 h-9 rounded-full bg-white text-black grid place-items-center shadow-lg transform group-hover:scale-110 transition-transform">
            <Play className="h-4 w-4 fill-current ml-0.5" />
          </div>
        </div>

        {/* Top-left file format badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          <FileFormatBadge name={video.file_name} />
          {video.zerostorage_file_id && (
            <span className="px-1.5 py-0.5 text-[9px] font-semibold rounded bg-emerald-500/90 text-white flex items-center gap-0.5 shadow-xs backdrop-blur-xs">
              <Cloud className="h-2.5 w-2.5" />
              <span>ZeroStorage</span>
            </span>
          )}
        </div>

        {/* Bottom size pill */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-white backdrop-blur-xs">
          {String(video.file_size || 'Video')}
        </div>
      </div>

      {/* Card Info Footer */}
      <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
        <div>
          <h3 
            onClick={() => onOpenPreview(video)}
            className="text-xs font-semibold text-black dark:text-white line-clamp-2 hover:underline cursor-pointer"
            title={video.title}
          >
            {video.title}
          </h3>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-1">
            <Calendar className="h-3 w-3" />
            <span>{video.created_at ? format(new Date(video.created_at), 'MMM dd, yyyy') : 'Recent'}</span>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-850 text-xs">
          <div className="flex items-center gap-1">
            {targetUrl && (
              <button
                type="button"
                onClick={() => onCopyLink(targetUrl, 'Video Link')}
                className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                title="Copy direct video link"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onDelete(video)}
              className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-600 transition-colors cursor-pointer"
              title="Delete video record"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
