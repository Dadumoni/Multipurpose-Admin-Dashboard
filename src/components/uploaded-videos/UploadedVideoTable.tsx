import React from 'react';
import { 
  FileVideo, 
  Cloud, 
  Eye, 
  Copy, 
  Trash2 
} from 'lucide-react';
import { format } from 'date-fns';
import { TelegramUploadedVideo } from './types';

interface UploadedVideoTableProps {
  videos: TelegramUploadedVideo[];
  onOpenPreview: (video: TelegramUploadedVideo) => void;
  onCopyLink: (url: string, label: string) => void;
  onDelete: (video: TelegramUploadedVideo) => void;
}

export default function UploadedVideoTable({
  videos,
  onOpenPreview,
  onCopyLink,
  onDelete,
}: UploadedVideoTableProps) {
  return (
    <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 font-medium">
            <th className="py-2.5 px-4">Video</th>
            <th className="py-2.5 px-4">Size</th>
            <th className="py-2.5 px-4">Cache</th>
            <th className="py-2.5 px-4">Added</th>
            <th className="py-2.5 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {videos.map((video) => {
            const targetUrl = video.zerostorage_download_url || video.zerostorage_embed_url || video.video_url;
            return (
              <tr key={video.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors">
                {/* Title + Thumbnail */}
                <td className="py-3 px-4 max-w-sm">
                  <div className="flex items-center gap-3">
                    <div 
                      onClick={() => onOpenPreview(video)}
                      className="w-14 h-9 rounded bg-zinc-100 dark:bg-zinc-900 overflow-hidden shrink-0 border border-zinc-200 dark:border-zinc-800 cursor-pointer relative"
                    >
                      {video.thumbnail_url ? (
                        <img
                          src={video.thumbnail_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-zinc-400">
                          <FileVideo className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <span 
                        onClick={() => onOpenPreview(video)}
                        className="font-medium text-black dark:text-white hover:underline cursor-pointer line-clamp-1"
                      >
                        {video.title}
                      </span>
                      <div className="text-[11px] text-zinc-400 font-mono truncate">
                        {video.file_name}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Size */}
                <td className="py-3 px-4 font-mono text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                  {String(video.file_size || 'Video File')}
                </td>

                {/* Source / ZeroStorage */}
                <td className="py-3 px-4 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    <Cloud className="h-2.5 w-2.5" />
                    <span>ZeroStorage</span>
                  </span>
                </td>

                {/* Created Date */}
                <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                  {video.created_at ? format(new Date(video.created_at), 'MMM dd, yyyy') : 'Recent'}
                </td>

                {/* Actions */}
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onOpenPreview(video)}
                      className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                      title="Preview Video"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                    {targetUrl && (
                      <button
                        type="button"
                        onClick={() => onCopyLink(targetUrl, 'Video Link')}
                        className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                        title="Copy Video Link"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onDelete(video)}
                      className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-zinc-400 hover:text-red-600 cursor-pointer"
                      title="Delete Video"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
