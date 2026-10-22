import React from 'react';
import { 
  X, 
  Pencil, 
  Film, 
  FileVideo, 
  Eye, 
  Calendar, 
  Clock, 
  HardDrive, 
  RotateCw, 
  Trash2, 
  Copy, 
  Check,
  ExternalLink
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { R2Video, formatFileSize, formatDuration } from './types';
import { PlyrPlayer, LazyThumbnail } from '@/src/components/scraped-videos/PlyrPlayer';

interface R2PreviewDrawerProps {
  previewVideo: R2Video | null;
  onClose: () => void;
  getFullThumbnailUrl: (path: string | null | undefined) => string;
  editTitle: string;
  setEditTitle: (val: string) => void;
  isEditingTitle: boolean;
  setIsEditingTitle: (val: boolean) => void;
  onSaveTitle: () => Promise<void> | void;
  isSavingTitle: boolean;
  onDeleteVideo: (video: R2Video) => void;
  onCopyText?: (text: string, label: string) => void;
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
  onDeleteVideo,
  onCopyText,
}: R2PreviewDrawerProps) {
  if (!previewVideo) return null;

  const handleCopy = (text: string | null | undefined, label: string) => {
    if (!text) {
      toast.info(`No ${label} available to copy`);
      return;
    }
    if (onCopyText) {
      onCopyText(text, label);
    } else {
      navigator.clipboard.writeText(text);
      toast.success(`Copied ${label} to clipboard!`);
    }
  };

  const fullThumbnailUrl = getFullThumbnailUrl(previewVideo.thumbnail);
  const formattedSize = formatFileSize(previewVideo.file_size ?? previewVideo.size);
  const formattedDur = formatDuration(previewVideo.duration);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      {/* Right Drawer Window */}
      <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[380px] bg-white dark:bg-black border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header with DB ID */}
        <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 px-4 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <span className="text-sm font-semibold text-black dark:text-white shrink-0">Preview</span>
            <span 
              className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate"
              title={`ID: #${previewVideo.id}`}
            >
              - #{previewVideo.id}
            </span>
            {previewVideo.slug && (
              <span 
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 truncate max-w-[110px]"
                title={previewVideo.slug}
              >
                {previewVideo.slug}
              </span>
            )}
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 grid place-items-center text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer shrink-0"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="relative flex-1 overflow-y-auto p-5 flex flex-col gap-5 bg-white dark:bg-black">
          {/* Plyr Video Player */}
          <div className="relative w-full shrink-0">
            {previewVideo.video_link ? (
              <PlyrPlayer
                src={previewVideo.video_link}
                poster={fullThumbnailUrl}
              />
            ) : previewVideo.zerostorage ? (
              <div className="aspect-video rounded-xl bg-black overflow-hidden relative border border-zinc-200 dark:border-zinc-800 shadow-sm">
                <iframe
                  src={previewVideo.zerostorage}
                  className="w-full h-full border-0"
                  allowFullScreen
                  title="ZeroStorage Video"
                />
              </div>
            ) : (
              <div className="aspect-video bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden flex flex-col items-center justify-center text-zinc-400 gap-1.5">
                <FileVideo className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
                <span className="text-xs">No video stream available</span>
              </div>
            )}
          </div>

          {/* Title with Inline Edit & Copy Option */}
          <div className="relative w-full shrink-0 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Video Title
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleCopy(editTitle || previewVideo.title, 'Video Title')}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                  title="Copy video title"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingTitle(!isEditingTitle)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                  title={isEditingTitle ? "Done" : "Edit title inline"}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {isEditingTitle ? (
              <div className="relative">
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-semibold text-black dark:text-white rounded-lg border border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white dark:bg-black shadow-sm"
                  placeholder="Video title..."
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onSaveTitle();
                    }
                  }}
                />
              </div>
            ) : (
              <h2 
                className="text-base font-semibold text-black dark:text-white break-words leading-snug cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                onClick={() => setIsEditingTitle(true)}
                title="Click to edit inline"
              >
                {editTitle || previewVideo.title || 'Untitled Video'}
              </h2>
            )}
          </div>

          {/* Video Thumbnail */}
          <div className="relative w-full shrink-0 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-black dark:text-white">
              <span className="flex items-center gap-1.5">
                <Film className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
                <span>Video Thumbnail</span>
              </span>
              {fullThumbnailUrl && (
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">Preview</span>
              )}
            </div>
            <div className="aspect-video bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden flex items-center justify-center">
              <LazyThumbnail
                src={fullThumbnailUrl}
                alt={previewVideo.title}
                className="h-full w-full object-cover"
                fallbackIcon={
                  <div className="flex flex-col items-center gap-1 text-zinc-400 dark:text-zinc-500 text-xs">
                    <FileVideo className="h-6 w-6" />
                    <span>No thumbnail image</span>
                  </div>
                }
              />
            </div>
          </div>

          {/* Metadata Cards: Views, Date Added, Size (replacing Domain), Duration */}
          <div className="relative w-full shrink-0 grid grid-cols-2 gap-2.5 text-xs">
            {/* Views */}
            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <Eye className="h-3.5 w-3.5" />
                <span>Views</span>
              </div>
              <div className="mt-1 font-medium text-black dark:text-white font-mono">
                {(Number(previewVideo.views) || 0).toLocaleString()}
              </div>
            </div>

            {/* Date Added */}
            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <Calendar className="h-3.5 w-3.5" />
                <span>Date Added</span>
              </div>
              <div className="mt-1 font-medium text-black dark:text-white truncate">
                {previewVideo.created_at ? format(new Date(previewVideo.created_at), 'MMM dd, yyyy') : '—'}
              </div>
            </div>

            {/* Size (replacing Domain) */}
            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <HardDrive className="h-3.5 w-3.5" />
                <span>Size</span>
              </div>
              <div className="mt-1 font-medium text-black dark:text-white truncate font-mono">
                {formattedSize}
              </div>
            </div>

            {/* Duration */}
            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <Clock className="h-3.5 w-3.5" />
                <span>Duration</span>
              </div>
              <div className="mt-1 font-medium text-black dark:text-white font-mono">
                {formattedDur}
              </div>
            </div>
          </div>

          {/* Platform Streaming Links: Abyss, AnonMp4, ZeroStorage (replacing Post URL) */}
          <div className="relative w-full shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Platform Streaming Links
              </span>
            </div>

            <div className="space-y-2">
              {/* Abyss Link */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-1.5 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 font-mono">Abyss Stream</span>
                  <div className="flex items-center gap-1">
                    {previewVideo.abyss ? (
                      <a
                        href={previewVideo.abyss}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                        title="Open Abyss stream in new tab"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="p-1.5 text-zinc-300 dark:text-zinc-700">
                        <Eye className="h-3.5 w-3.5 opacity-40" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(previewVideo.abyss, 'Abyss Link')}
                      className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                      title="Copy Abyss link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs font-mono break-all text-zinc-700 dark:text-zinc-300">
                  {previewVideo.abyss || 'Not available'}
                </div>
              </div>

              {/* AnonMp4 Link */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-1.5 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 font-mono">AnonMp4 Stream</span>
                  <div className="flex items-center gap-1">
                    {previewVideo.anonmp4 ? (
                      <a
                        href={previewVideo.anonmp4}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                        title="Open AnonMp4 stream in new tab"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="p-1.5 text-zinc-300 dark:text-zinc-700">
                        <Eye className="h-3.5 w-3.5 opacity-40" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(previewVideo.anonmp4, 'AnonMp4 Link')}
                      className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                      title="Copy AnonMp4 link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs font-mono break-all text-zinc-700 dark:text-zinc-300">
                  {previewVideo.anonmp4 || 'Not available'}
                </div>
              </div>

              {/* ZeroStorage Link */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-1.5 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400 font-mono">ZeroStorage Stream</span>
                  <div className="flex items-center gap-1">
                    {previewVideo.zerostorage ? (
                      <a
                        href={previewVideo.zerostorage}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                        title="Open ZeroStorage stream in new tab"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="p-1.5 text-zinc-300 dark:text-zinc-700">
                        <Eye className="h-3.5 w-3.5 opacity-40" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopy(previewVideo.zerostorage, 'ZeroStorage Link')}
                      className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                      title="Copy ZeroStorage link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs font-mono break-all text-zinc-700 dark:text-zinc-300">
                  {previewVideo.zerostorage || 'Not available'}
                </div>
              </div>
            </div>
          </div>

          {/* Direct Video URL & Thumbnail URL Section */}
          <div className="relative w-full shrink-0 space-y-4">
            {/* Video URL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Video URL
                </span>
                <div className="flex items-center gap-1">
                  {previewVideo.video_link ? (
                    <a
                      href={previewVideo.video_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer inline-flex items-center"
                      title="Open Video URL in new tab"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleCopy(previewVideo.video_link, 'Video URL')}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    title="Copy Video URL to clipboard"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg p-2.5 text-xs font-mono break-all leading-normal">
                {previewVideo.video_link || 'Not available'}
              </div>
            </div>

            {/* Thumbnail URL */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Thumbnail URL
                </span>
                <div className="flex items-center gap-1">
                  {fullThumbnailUrl ? (
                    <a
                      href={fullThumbnailUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer inline-flex items-center"
                      title="Open Thumbnail URL in new tab"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleCopy(fullThumbnailUrl, 'Thumbnail URL')}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    title="Copy Thumbnail URL to clipboard"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-lg p-2.5 text-xs font-mono break-all leading-normal">
                {fullThumbnailUrl || 'Not available'}
              </div>
            </div>
          </div>
        </div>

        {/* Drawer Footer: Close, Delete, Save Changes */}
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
            onClick={() => onDeleteVideo(previewVideo)}
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
