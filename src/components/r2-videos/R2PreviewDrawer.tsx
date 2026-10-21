import React from 'react';
import { 
  X, 
  Video, 
  Pencil, 
  Eye, 
  Calendar, 
  Copy, 
  ExternalLink 
} from 'lucide-react';
import { format } from 'date-fns';
import { R2Video } from './types';

interface R2PreviewDrawerProps {
  previewVideo: R2Video | null;
  onClose: () => void;
  getFullThumbnailUrl: (path: string | null | undefined) => string;
  editTitle: string;
  setEditTitle: (val: string) => void;
  isEditingTitle: boolean;
  setIsEditingTitle: (val: boolean) => void;
  onSaveTitle: () => void;
  isSavingTitle: boolean;
  onCopyText: (text: string, label: string) => void;
}

export default function R2PreviewDrawer({
  previewVideo,
  onClose,
  getFullThumbnailUrl,
  editTitle,
  setEditTitle,
  isEditingTitle,
  setIsEditingTitle,
  onSaveTitle,
  isSavingTitle,
  onCopyText,
}: R2PreviewDrawerProps) {
  if (!previewVideo) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Window */}
      <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[420px] bg-white dark:bg-black border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-black dark:text-white">Video Preview</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
              {previewVideo.slug}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 grid place-items-center text-zinc-500 hover:text-black dark:hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Video Player or Large Thumbnail */}
          <div className="aspect-video rounded-xl bg-black overflow-hidden relative border border-zinc-200 dark:border-zinc-800 shadow-sm">
            {previewVideo.video_link ? (
              <video
                src={previewVideo.video_link}
                poster={getFullThumbnailUrl(previewVideo.thumbnail)}
                controls
                className="w-full h-full object-contain"
              />
            ) : previewVideo.zerostorage ? (
              <iframe
                src={previewVideo.zerostorage}
                className="w-full h-full border-0"
                allowFullScreen
              />
            ) : getFullThumbnailUrl(previewVideo.thumbnail) ? (
              <img
                src={getFullThumbnailUrl(previewVideo.thumbnail)}
                alt=""
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full grid place-items-center text-zinc-500">
                <Video className="h-10 w-10" />
              </div>
            )}
          </div>

          {/* Title Section with Inline Edit */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Title
              </span>
              {!isEditingTitle ? (
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(true)}
                  className="text-xs text-zinc-500 hover:text-black dark:hover:text-white flex items-center gap-1 cursor-pointer"
                >
                  <Pencil className="h-3 w-3" />
                  Rename
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTitle(false);
                      setEditTitle(previewVideo.title || '');
                    }}
                    className="text-xs text-zinc-400 hover:text-zinc-600 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onSaveTitle}
                    disabled={isSavingTitle}
                    className="text-xs font-medium text-black dark:text-white bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer"
                  >
                    {isSavingTitle ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            {isEditingTitle ? (
              <textarea
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                rows={2}
                className="w-full p-2.5 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
              />
            ) : (
              <p className="text-sm font-medium text-black dark:text-white break-words">
                {previewVideo.title || 'Untitled'}
              </p>
            )}
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
            <div>
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" /> Views
              </span>
              <p className="text-base font-bold text-black dark:text-white mt-0.5">
                {(previewVideo.views || 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-xs text-zinc-500 flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5" /> Date Added
              </span>
              <p className="text-xs font-medium text-black dark:text-white mt-1">
                {previewVideo.created_at ? format(new Date(previewVideo.created_at), 'PPP') : 'Unknown'}
              </p>
            </div>
          </div>

          {/* Host Links Section */}
          <div className="space-y-3 pt-2">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
              Database Links & Paths
            </span>

            {/* Direct Video Link */}
            {previewVideo.video_link && (
              <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Direct Video Link</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onCopyText(previewVideo.video_link!, 'Video Link')}
                      className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                      title="Copy Link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <a
                      href={previewVideo.video_link}
                      target="_blank"
                      rel="noreferrer"
                      className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                      title="Open Link"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
                <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate">
                  {previewVideo.video_link}
                </div>
              </div>
            )}

            {/* ZeroStorage */}
            {previewVideo.zerostorage && (
              <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">ZeroStorage Embed</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onCopyText(previewVideo.zerostorage!, 'ZeroStorage Embed')}
                      className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                      title="Copy Embed URL"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate">
                  {previewVideo.zerostorage}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
