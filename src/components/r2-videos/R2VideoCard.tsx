import React from 'react';
import { 
  Play, 
  Eye, 
  Check, 
  FileVideo 
} from 'lucide-react';
import { R2Video } from './types';
import { LazyThumbnail } from '@/src/components/scraped-videos/PlyrPlayer';

interface R2VideoCardProps {
  video: R2Video;
  thumbUrl: string;
  isSelected: boolean;
  toggleSelect: (id: number) => void;
  onPreview: (video: R2Video) => void;
}

export default function R2VideoCard({
  video,
  thumbUrl,
  isSelected,
  toggleSelect,
  onPreview,
}: R2VideoCardProps) {
  return (
    <div 
      onClick={() => onPreview(video)}
      className={`bg-white dark:bg-black border rounded-xl overflow-hidden group hover:shadow-sm transition-all cursor-pointer flex flex-col ${
        isSelected
          ? 'border-black dark:border-white ring-1 ring-black dark:ring-white'
          : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
      }`}
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

        {/* Checkbox Top-Left (Select / Deselect) */}
        <button 
          type="button"
          onClick={(e) => {
            e.stopPropagation();
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

        {/* Play Icon Center Overlay on Hover */}
        <div className="absolute inset-0 bg-black/25 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="h-10 w-10 rounded-full bg-white text-zinc-900 shadow-md grid place-items-center pl-0.5">
            <Play className="h-5 w-5 fill-zinc-900" />
          </div>
        </div>

        {/* Top-right views badge */}
        <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/75 text-[10px] font-mono text-white backdrop-blur-xs flex items-center gap-1 z-10 pointer-events-none">
          <Eye className="h-2.5 w-2.5" />
          <span>{(Number(video.views) || 0).toLocaleString()}</span>
        </div>
      </div>

      {/* Clean Card Body - Only Video Title */}
      <div className="p-3 flex-1 flex flex-col justify-center">
        <h3 
          className="text-xs font-semibold text-black dark:text-white line-clamp-2 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          title={video.title}
        >
          {video.title || 'Untitled Video'}
        </h3>
      </div>
    </div>
  );
}
