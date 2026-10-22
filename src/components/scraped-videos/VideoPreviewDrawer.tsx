import React from 'react';
import { 
  X, 
  Pencil, 
  Film, 
  FileVideo, 
  Eye, 
  Calendar, 
  Globe, 
  Clock, 
  RotateCw, 
  Trash2, 
  Square, 
  Copy, 
  Check 
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { ScrapedVideo, PlyrSourceOption } from './types';
import { PlyrPlayer, LazyThumbnail } from './PlyrPlayer';

interface VideoPreviewDrawerProps {
  previewVideo: ScrapedVideo | null;
  setPreviewVideo: (video: ScrapedVideo | null) => void;
  editTitle: string;
  setEditTitle: (title: string) => void;
  isEditingTitle: boolean;
  setIsEditingTitle: (editing: boolean) => void;
  editStreamUrl: string;
  setEditStreamUrl: (url: string) => void;
  activeStreamUrl: string;
  setActiveStreamUrl: (url: string) => void;
  editThumbnailUrl: string;
  setEditThumbnailUrl: (url: string) => void;
  isEditingThumbUrl: boolean;
  setIsEditingThumbUrl: (editing: boolean) => void;
  handleSaveChanges: () => Promise<void>;
  isSaving: boolean;
  handleRegenerateThumbnail?: () => Promise<void>;
  isRegeneratingThumb?: boolean;
  handleCancelThumbnailRegeneration?: () => void;
  handleCopyUrl: (url: string, label: string) => void;
  setVideoToDelete: (id: number | string | null) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
}

export function VideoPreviewDrawer({
  previewVideo,
  setPreviewVideo,
  editTitle,
  setEditTitle,
  isEditingTitle,
  setIsEditingTitle,
  editStreamUrl,
  setEditStreamUrl,
  activeStreamUrl,
  setActiveStreamUrl,
  editThumbnailUrl,
  setEditThumbnailUrl,
  isEditingThumbUrl,
  setIsEditingThumbUrl,
  handleSaveChanges,
  isSaving,
  handleRegenerateThumbnail,
  isRegeneratingThumb,
  handleCancelThumbnailRegeneration,
  handleCopyUrl,
  setVideoToDelete,
  setDeleteConfirmOpen,
}: VideoPreviewDrawerProps) {
  if (!previewVideo) return null;

  const targetId = previewVideo._id || previewVideo.id;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-[1px] transition-opacity"
        onClick={() => setPreviewVideo(null)}
      />

      <div className="absolute right-0 top-0 bottom-0 w-full sm:w-[380px] bg-white dark:bg-black border-l border-zinc-200 dark:border-zinc-800 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-14 border-b border-zinc-200 dark:border-zinc-800 px-4 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-1.5 min-w-0 pr-2">
            <span className="text-sm font-semibold text-black dark:text-white shrink-0">Preview</span>
            {targetId && (
              <span 
                className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate"
                title={String(targetId)}
              >
                - {String(targetId)}
              </span>
            )}
          </div>
          <button 
            type="button"
            onClick={() => setPreviewVideo(null)}
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
            {(() => {
              const plyrSources: PlyrSourceOption[] = [];
              const usedSizes = new Set<number>();

              const addSource = (url: string | null | undefined, preferredSize: number) => {
                if (!url || typeof url !== 'string' || !url.trim()) return;
                const cleanUrl = url.trim();
                if (usedSizes.has(preferredSize)) return;
                usedSizes.add(preferredSize);
                plyrSources.push({ src: cleanUrl, size: preferredSize });
              };

              const link720 = previewVideo['720p_link'] || previewVideo.video_url2 || null;
              const link480 = previewVideo['480p_link'] || previewVideo.video_url1 || null;
              const fallbackUrl = editStreamUrl || activeStreamUrl || previewVideo.video_url || '';

              if (link720) addSource(link720, 720);
              if (link480) addSource(link480, 480);

              if (Array.isArray(previewVideo.all_links)) {
                previewVideo.all_links.forEach((l) => {
                  if (!l || typeof l !== 'string') return;
                  if (l.includes('1080')) addSource(l, 1080);
                  else if (l.includes('720')) addSource(l, 720);
                  else if (l.includes('480')) addSource(l, 480);
                  else if (l.includes('360')) addSource(l, 360);
                });
              }

              if (previewVideo.video_url && !plyrSources.some((s) => s.src === previewVideo.video_url.trim())) {
                if (!usedSizes.has(720)) addSource(previewVideo.video_url, 720);
                else if (!usedSizes.has(480)) addSource(previewVideo.video_url, 480);
                else if (!usedSizes.has(1080)) addSource(previewVideo.video_url, 1080);
              }

              if (plyrSources.length === 0 && fallbackUrl) {
                addSource(fallbackUrl, 720);
              }

              return (
                <PlyrPlayer
                  src={editStreamUrl || activeStreamUrl}
                  poster={editThumbnailUrl || previewVideo.thumbnail_url}
                  sources={plyrSources}
                  onQualityChange={(newUrl, size) => {
                    setActiveStreamUrl(newUrl);
                    setEditStreamUrl(newUrl);
                    toast.success(`Switched video quality to ${size}p`);
                  }}
                />
              );
            })()}
          </div>

          {/* Title with Inline Edit & Copy Option */}
          <div className="relative w-full shrink-0 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Video Title</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const titleText = editTitle || previewVideo.title || '';
                    if (titleText) {
                      navigator.clipboard.writeText(titleText);
                      toast.success('Video title copied to clipboard');
                    }
                  }}
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
                    if (e.key === 'Enter') setIsEditingTitle(false);
                  }}
                />
              </div>
            ) : (
              <h2 
                className="text-base font-semibold text-black dark:text-white break-words leading-snug cursor-pointer hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                onClick={() => setIsEditingTitle(true)}
                title="Click to edit inline"
              >
                {editTitle || previewVideo.title}
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
              {(editThumbnailUrl || previewVideo.thumbnail_url) && (
                <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">Preview</span>
              )}
            </div>
            <div className="aspect-video bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden flex items-center justify-center">
              <LazyThumbnail
                src={editThumbnailUrl || previewVideo.thumbnail_url}
                alt="Thumbnail Preview"
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

          {/* Metadata Cards: Views, Date Added, Domain, Duration */}
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

            {/* Domain */}
            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <Globe className="h-3.5 w-3.5" />
                <span>Domain</span>
              </div>
              <div className="mt-1 font-medium text-black dark:text-white truncate font-mono" title={previewVideo.domain || (previewVideo.post_url ? 'Extracted' : '—')}>
                {previewVideo.domain || (previewVideo.post_url ? (() => { try { return new URL(previewVideo.post_url).hostname.replace(/^www\./, ''); } catch { return '—'; } })() : '—')}
              </div>
            </div>

            {/* Duration */}
            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-3">
              <div className="flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400">
                <Clock className="h-3.5 w-3.5" />
                <span>Duration</span>
              </div>
              <div className="mt-1 font-medium text-black dark:text-white font-mono">
                {previewVideo.duration ? (previewVideo.duration.includes(':') ? previewVideo.duration : `${previewVideo.duration}s`) : '—'}
              </div>
            </div>
          </div>



          {/* Post URL Section */}
          {previewVideo.post_url && (
            <div className="relative w-full shrink-0 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Post URL</span>
                <div className="flex items-center gap-1">
                  <a
                    href={previewVideo.post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer inline-flex items-center"
                    title="Open Post URL in new tab"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => handleCopyUrl(previewVideo.post_url!, 'Post URL')}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    title="Copy Post URL to clipboard"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-black dark:text-white rounded-lg p-2.5 text-xs font-mono break-all leading-normal">
                <span>{previewVideo.post_url}</span>
              </div>
            </div>
          )}

          {/* Streaming Links Section */}
          <div className="relative w-full shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                Streaming Links
              </span>
            </div>

            <div className="space-y-2">
              {/* 720p Link Card */}
              {Boolean(previewVideo['720p_link'] || previewVideo.video_url2) && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-1.5 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400 font-mono">720p HD</span>
                    <div className="flex items-center gap-1">
                      <a
                        href={(previewVideo['720p_link'] || previewVideo.video_url2)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                        title="Open 720p link in new tab"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl((previewVideo['720p_link'] || previewVideo.video_url2)!, '720p Streaming Link')}
                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                        title="Copy 720p link to clipboard"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs font-mono break-all text-zinc-700 dark:text-zinc-300">
                    {previewVideo['720p_link'] || previewVideo.video_url2}
                  </div>
                </div>
              )}

              {/* 480p Link Card */}
              {Boolean(previewVideo['480p_link'] || previewVideo.video_url1) && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-1.5 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-zinc-400 font-mono">480p SD</span>
                    <div className="flex items-center gap-1">
                      <a
                        href={(previewVideo['480p_link'] || previewVideo.video_url1)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                        title="Open 480p link in new tab"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl((previewVideo['480p_link'] || previewVideo.video_url1)!, '480p Streaming Link')}
                        className="p-1.5 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                        title="Copy 480p link to clipboard"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs font-mono break-all text-zinc-700 dark:text-zinc-300">
                    {previewVideo['480p_link'] || previewVideo.video_url1}
                  </div>
                </div>
              )}

              {/* Fallback Single Stream URL Card */}
              {!previewVideo['720p_link'] && !previewVideo.video_url2 && !previewVideo['480p_link'] && !previewVideo.video_url1 && (previewVideo.video_url || editStreamUrl) && (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-black dark:text-white">Direct Stream URL</span>
                    <div className="flex items-center gap-1">
                      <a
                        href={editStreamUrl || previewVideo.video_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded text-zinc-400 hover:text-black dark:hover:text-white"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopyUrl(editStreamUrl || previewVideo.video_url, 'Stream URL')}
                        className="p-1 rounded text-zinc-400 hover:text-black dark:hover:text-white"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs font-mono break-all text-zinc-700 dark:text-zinc-300">
                    {editStreamUrl || previewVideo.video_url}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Thumbnail URL with inline Edit option */}
          <div className="relative w-full shrink-0 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Thumbnail URL</span>
              <div className="flex items-center gap-1">
                {(editThumbnailUrl || previewVideo.thumbnail_url) ? (
                  <a
                    href={editThumbnailUrl || previewVideo.thumbnail_url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer inline-flex items-center"
                    title="Open Thumbnail URL in new tab"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => toast.info('No thumbnail URL configured to open')}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                    title="No Thumbnail URL"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCopyUrl(editThumbnailUrl || previewVideo.thumbnail_url || '', 'Thumbnail URL')}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                  title="Copy Thumbnail URL to clipboard"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingThumbUrl(!isEditingThumbUrl)}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors cursor-pointer"
                  title={isEditingThumbUrl ? "Done" : "Edit Thumbnail URL inline"}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {isEditingThumbUrl ? (
              <input
                type="text"
                value={editThumbnailUrl}
                onChange={(e) => setEditThumbnailUrl(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white bg-white dark:bg-black text-black dark:text-white break-all shadow-sm"
                placeholder="https://... (or empty)"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setIsEditingThumbUrl(false);
                }}
              />
            ) : (
              <div 
                className="bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 text-xs font-mono break-all leading-normal cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
                onClick={() => setIsEditingThumbUrl(true)}
                title="Click to edit inline"
              >
                <span>{editThumbnailUrl || previewVideo.thumbnail_url || 'No thumbnail URL configured'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPreviewVideo(null)}
            className="flex-1 h-9 px-2 sm:px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 shadow-sm transition-colors cursor-pointer whitespace-nowrap text-center"
          >
            Close
          </button>
          <button 
            type="button"
            onClick={() => {
              setVideoToDelete(targetId);
              setDeleteConfirmOpen(true);
            }}
            className="flex-1 h-9 px-2 sm:px-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-black hover:bg-red-50 dark:hover:bg-red-950/40 text-xs sm:text-sm font-medium flex items-center justify-center gap-1 text-red-600 dark:text-red-400 shadow-sm cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" />
            <span>Delete</span>
          </button>
          <button
            type="button"
            onClick={handleSaveChanges}
            disabled={isSaving}
            className="flex-[1.4] h-9 px-3 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-900 dark:hover:bg-zinc-100 disabled:opacity-50 text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap"
          >
            {isSaving ? (
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
