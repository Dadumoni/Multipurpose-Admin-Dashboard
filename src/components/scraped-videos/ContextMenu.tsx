import React from 'react';
import { Eye, Copy, Download, Trash2 } from 'lucide-react';
import { ScrapedVideo } from './types';

interface ContextMenuProps {
  contextMenu: { x: number; y: number; video: ScrapedVideo } | null;
  onClose: () => void;
  onPreview: (video: ScrapedVideo) => void;
  onCopyUrl: (url: string) => void;
  onDelete: (video: ScrapedVideo) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  contextMenu,
  onClose,
  onPreview,
  onCopyUrl,
  onDelete,
}) => {
  if (!contextMenu) return null;

  return (
    <div
      style={{
        left: Math.min(contextMenu.x, window.innerWidth - 180),
        top: Math.min(contextMenu.y, window.innerHeight - 200),
      }}
      className="fixed z-[60] w-44 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xl overflow-hidden text-sm animate-in fade-in zoom-in-95 duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          onPreview(contextMenu.video);
          onClose();
        }}
        className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer"
      >
        <Eye className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
        <span>Preview</span>
      </button>
      <button
        type="button"
        onClick={() => {
          onCopyUrl(contextMenu.video.video_url);
          onClose();
        }}
        className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer"
      >
        <Copy className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
        <span>Copy URL</span>
      </button>
      <a
        href={contextMenu.video.video_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClose}
        className="w-full text-left px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900 flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer"
      >
        <Download className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
        <span>Open Stream</span>
      </a>
      <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-0.5" />
      <button
        type="button"
        onClick={() => {
          onDelete(contextMenu.video);
          onClose();
        }}
        className="w-full text-left px-3 py-2.5 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center gap-2 cursor-pointer"
      >
        <Trash2 className="h-4 w-4" />
        <span>Delete</span>
      </button>
    </div>
  );
};
