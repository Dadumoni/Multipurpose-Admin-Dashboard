import React from 'react';
import { Pencil, Trash2, FileVideo } from 'lucide-react';
import { format } from 'date-fns';
import { R2Video, formatFileSize, formatDuration } from './types';
import { LazyThumbnail } from '@/src/components/scraped-videos/PlyrPlayer';

interface R2VideoTableProps {
  videos: R2Video[];
  getFullThumbnailUrl: (path: string | null | undefined) => string;
  onPreview: (video: R2Video) => void;
  onRename: (video: R2Video) => void;
  onDelete: (video: R2Video) => void;
}

export default function R2VideoTable({
  videos,
  getFullThumbnailUrl,
  onPreview,
  onRename,
  onDelete,
}: R2VideoTableProps) {
  return (
    <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-zinc-500 font-medium">
            <th className="py-2.5 px-4">Video</th>
            <th className="py-2.5 px-4">Duration</th>
            <th className="py-2.5 px-4">Size</th>
            <th className="py-2.5 px-4">Views</th>
            <th className="py-2.5 px-4">Platforms</th>
            <th className="py-2.5 px-4">Created</th>
            <th className="py-2.5 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {videos.map((video) => {
            const thumbUrl = getFullThumbnailUrl(video.thumbnail);
            const formattedSize = formatFileSize(video.file_size ?? video.size);
            const formattedDur = formatDuration(video.duration);

            return (
              <tr key={video.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors">
                {/* Title + Thumbnail */}
                <td className="py-3 px-4 max-w-sm">
                  <div className="flex items-center gap-3">
                    <div 
                      onClick={() => onPreview(video)}
                      className="w-16 h-10 rounded bg-zinc-100 dark:bg-zinc-900 overflow-hidden shrink-0 border border-zinc-200 dark:border-zinc-800 cursor-pointer relative"
                    >
                      <LazyThumbnail
                        src={thumbUrl}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        fallbackIcon={
                          <div className="w-full h-full grid place-items-center text-zinc-400">
                            <FileVideo className="h-4 w-4" />
                          </div>
                        }
                      />
                    </div>
                    <div className="min-w-0">
                      <div 
                        className="font-medium text-black dark:text-white truncate cursor-pointer hover:underline"
                        onClick={() => onPreview(video)}
                        title={video.title}
                      >
                        {video.title || 'Untitled Video'}
                      </div>
                      <div className="text-xs font-mono text-zinc-400 mt-0.5 flex items-center gap-2">
                        <span>ID: #{video.id}</span>
                        {video.slug && <span className="truncate max-w-[150px]">{video.slug}</span>}
                      </div>
                    </div>
                  </div>
                </td>

                {/* Duration */}
                <td className="py-3 px-4 font-mono text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                  {formattedDur}
                </td>

                {/* Size */}
                <td className="py-3 px-4 font-mono text-xs text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                  {formattedSize}
                </td>

                {/* Views */}
                <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300 font-medium font-mono whitespace-nowrap">
                  {(video.views || 0).toLocaleString()}
                </td>

                {/* Platforms */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {video.video_link && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-mono">Direct</span>}
                    {video.abyss && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-mono">Abyss</span>}
                    {video.anonmp4 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-mono">Anon</span>}
                    {video.zerostorage && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-mono">ZeroStorage</span>}
                  </div>
                </td>

                {/* Created */}
                <td className="py-3 px-4 text-xs text-zinc-500 whitespace-nowrap">
                  {video.created_at ? format(new Date(video.created_at), 'yyyy-MM-dd') : '—'}
                </td>

                {/* Actions */}
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onPreview(video)}
                      className="px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => onRename(video)}
                      className="p-1 rounded-md text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-colors"
                      title="Rename"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(video)}
                      className="p-1 rounded-md text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
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
