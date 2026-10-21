import React from 'react';
import { 
  Film, 
  X, 
  FileVideo, 
  Copy, 
  Cloud, 
  ExternalLink, 
  Trash2, 
  RotateCw, 
  Check 
} from 'lucide-react';
import { format } from 'date-fns';
import { TelegramUploadedVideo } from './types';

interface UploadedVideoDrawerProps {
  previewVideo: TelegramUploadedVideo | null;
  onClose: () => void;
  editTitle: string;
  setEditTitle: (val: string) => void;
  onSaveTitle: () => void;
  isSavingTitle: boolean;
  onCopyText: (text: string, label: string) => void;
  onDelete: (video: TelegramUploadedVideo) => void;
}

export default function UploadedVideoDrawer({
  previewVideo,
  onClose,
  editTitle,
  setEditTitle,
  onSaveTitle,
  isSavingTitle,
  onCopyText,
  onDelete,
}: UploadedVideoDrawerProps) {
  if (!previewVideo) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Drawer container */}
      <div className="relative w-full max-w-xl bg-white dark:bg-black border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col h-full z-10">
        {/* Drawer Header */}
        <div className="h-14 px-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-white dark:bg-black">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="p-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
              <Film className="h-3.5 w-3.5 text-black dark:text-white" />
            </div>
            <span className="text-xs font-semibold text-black dark:text-white truncate">
              {previewVideo.title}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Video Player */}
          <div className="aspect-video rounded-xl bg-black overflow-hidden relative border border-zinc-200 dark:border-zinc-800 shadow-sm">
            {previewVideo.zerostorage_download_url || previewVideo.video_url ? (
              <video
                src={previewVideo.zerostorage_download_url || previewVideo.video_url || undefined}
                poster={previewVideo.thumbnail_url || undefined}
                controls
                className="w-full h-full object-contain"
              />
            ) : previewVideo.thumbnail_url ? (
              <img
                src={previewVideo.thumbnail_url}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-500 gap-2">
                <FileVideo className="h-8 w-8" />
                <span className="text-xs">No Direct Stream Available</span>
              </div>
            )}
          </div>

          {/* Editable Video Title */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Video Title
              </label>
              <button
                type="button"
                onClick={() => {
                  if (editTitle.trim()) {
                    onCopyText(editTitle.trim(), 'Video Title');
                  }
                }}
                className="p-1 rounded text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer inline-flex items-center gap-1 text-[11px]"
                title="Copy video title"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </button>
            </div>
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-black dark:text-white focus:outline-none focus:border-black dark:focus:border-white transition-colors"
            />
          </div>

          {/* ZeroStorage Download Link */}
          {previewVideo.zerostorage_download_url && (
            <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <Cloud className="h-3.5 w-3.5 text-emerald-500" />
                  ZeroStorage Download URL
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onCopyText(previewVideo.zerostorage_download_url!, 'ZeroStorage URL')}
                    className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                    title="Copy URL"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={previewVideo.zerostorage_download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                    title="Open in new tab"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
              <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400 break-all bg-white dark:bg-black p-2 rounded border border-zinc-200 dark:border-zinc-800">
                {previewVideo.zerostorage_download_url}
              </div>
            </div>
          )}

          {/* ZeroStorage Embed Link */}
          {previewVideo.zerostorage_embed_url && (
            <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5 text-blue-500" />
                  ZeroStorage Embed URL
                </span>
                <button
                  type="button"
                  onClick={() => onCopyText(previewVideo.zerostorage_embed_url!, 'Embed URL')}
                  className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                  title="Copy URL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400 break-all bg-white dark:bg-black p-2 rounded border border-zinc-200 dark:border-zinc-800">
                {previewVideo.zerostorage_embed_url}
              </div>
            </div>
          )}

          {/* Video Metadata Breakdown */}
          <div className="space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              File Details
            </span>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30">
                <div className="text-zinc-400 text-[10px]">File Size</div>
                <div className="font-mono font-medium text-black dark:text-white mt-0.5">
                  {String(previewVideo.file_size || 'Video File')}
                </div>
              </div>

              <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30">
                <div className="text-zinc-400 text-[10px]">Source</div>
                <div className="font-medium text-black dark:text-white mt-0.5">
                  Telegram &rarr; ZeroStorage
                </div>
              </div>

              {previewVideo.telegram_file_id && (
                <div className="col-span-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-400 text-[10px]">Telegram File ID</span>
                    <button
                      type="button"
                      onClick={() => onCopyText(previewVideo.telegram_file_id!, 'Telegram File ID')}
                      className="text-zinc-400 hover:text-black dark:hover:text-white"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="font-mono text-zinc-600 dark:text-zinc-300 truncate mt-0.5">
                    {previewVideo.telegram_file_id}
                  </div>
                </div>
              )}

              <div className="col-span-2 p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30">
                <div className="text-zinc-400 text-[10px]">Added On</div>
                <div className="text-zinc-600 dark:text-zinc-300 mt-0.5">
                  {previewVideo.created_at ? format(new Date(previewVideo.created_at), 'MMMM dd, yyyy - HH:mm') : 'Recent'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer with [ Close ] [ Delete ] [ Save Changes ] */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-9 px-2 sm:px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 shadow-sm transition-colors cursor-pointer whitespace-nowrap text-center"
          >
            Close
          </button>

          <button
            type="button"
            onClick={() => onDelete(previewVideo)}
            className="flex-1 h-9 px-2 sm:px-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-black hover:bg-red-50 dark:hover:bg-red-950/40 text-xs sm:text-sm font-medium flex items-center justify-center gap-1 text-red-600 dark:text-red-400 shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span>Delete</span>
          </button>

          <button
            type="button"
            onClick={onSaveTitle}
            disabled={isSavingTitle}
            className="flex-[1.4] h-9 px-3 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-900 dark:hover:bg-zinc-100 disabled:opacity-50 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            {isSavingTitle ? (
              <RotateCw className="h-3.5 w-3.5 animate-spin shrink-0" />
            ) : (
              <Check className="h-3.5 w-3.5 text-white dark:text-black shrink-0" />
            )}
            <span className="whitespace-nowrap">Save Changes</span>
          </button>
        </div>
      </div>
    </div>
  );
}
