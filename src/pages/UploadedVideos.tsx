import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Film, 
  Search, 
  Grid2x2, 
  List, 
  RotateCw, 
  Trash2, 
  Copy, 
  Check, 
  ExternalLink, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  HardDrive, 
  Send, 
  CheckCircle2, 
  FileVideo,
  Eye,
  Calendar,
  Cloud,
  Layers,
  Sparkles
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { getClientCache, setClientCache, invalidateClientCache } from '@/src/lib/clientCache';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/src/components/ui/dialog';

export interface TelegramUploadedVideo {
  id: string;
  title: string;
  file_name: string;
  file_size?: string | number | null;
  mime_type?: string | null;
  source?: string;
  telegram_file_id?: string | null;
  telegram_file_unique_id?: string | null;
  zerostorage_file_id?: string | null;
  zerostorage_download_url?: string | null;
  zerostorage_embed_url?: string | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  created_at: string;
}

function FileFormatBadge({ name }: { name: string }) {
  const ext = (name.split('.').pop() || 'MP4').toUpperCase().slice(0, 4);
  return (
    <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
      {ext}
    </span>
  );
}

export default function UploadedVideos() {
  const [videos, setVideos] = useState<TelegramUploadedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [zeroStorageCount, setZeroStorageCount] = useState(0);
  const [storageSizeStr, setStorageSizeStr] = useState('0.0 MB');

  // Search & Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'date_asc' | 'title_asc'>('date_desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  // Preview Drawer
  const [previewVideo, setPreviewVideo] = useState<TelegramUploadedVideo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Delete Confirmation Modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<TelegramUploadedVideo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Copied state indicator
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(label);
    toast.success(`Copied ${label} to clipboard!`);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Load videos from backend
  const loadVideos = useCallback(async (forceRefresh = false) => {
    const cacheKey = 'telegram_uploaded:list';
    if (!forceRefresh) {
      const cached = getClientCache<{ items: TelegramUploadedVideo[]; totalCount: number; zeroStorageCount: number }>(cacheKey, 60000);
      if (cached && Array.isArray(cached.items)) {
        setVideos(cached.items);
        setTotalCount(cached.totalCount);
        setZeroStorageCount(cached.zeroStorageCount);
        setLoading(false);
        return;
      }
    } else {
      invalidateClientCache(cacheKey);
      setRefreshing(true);
    }

    try {
      const [res, statsRes] = await Promise.all([
        fetch('/api/telegram-uploaded'),
        fetch('/api/storage/stats').catch(() => null),
      ]);

      if (res.ok) {
        const data = await res.json();
        const items: TelegramUploadedVideo[] = Array.isArray(data.data) ? data.data : [];
        setVideos(items);
        setTotalCount(data.totalCount || items.length);
        setZeroStorageCount(data.zeroStorageCount || items.filter(i => Boolean(i.zerostorage_download_url || i.zerostorage_file_id)).length);

        setClientCache(cacheKey, {
          items,
          totalCount: data.totalCount || items.length,
          zeroStorageCount: data.zeroStorageCount || 0,
        });
      }

      if (statsRes && statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.formattedSize) {
          setStorageSizeStr(statsData.formattedSize);
        }
      }
    } catch (err: any) {
      console.warn('Failed to load telegram uploaded videos:', err);
      toast.error('Failed to load videos from MongoDB');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Filter & Sort
  const filteredVideos = useMemo(() => {
    let result = [...videos];

    if (debouncedSearch) {
      result = result.filter(v => 
        (v.title && v.title.toLowerCase().includes(debouncedSearch)) ||
        (v.file_name && v.file_name.toLowerCase().includes(debouncedSearch)) ||
        (v.telegram_file_id && v.telegram_file_id.toLowerCase().includes(debouncedSearch)) ||
        (v.zerostorage_file_id && v.zerostorage_file_id.toLowerCase().includes(debouncedSearch))
      );
    }

    result.sort((a, b) => {
      if (sortOrder === 'date_desc') {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
      if (sortOrder === 'date_asc') {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      }
      if (sortOrder === 'title_asc') {
        return (a.title || '').localeCompare(b.title || '');
      }
      return 0;
    });

    return result;
  }, [videos, debouncedSearch, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredVideos.length / pageSize));
  const paginatedVideos = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredVideos.slice(start, start + pageSize);
  }, [filteredVideos, currentPage, pageSize]);

  // Handle open preview
  const handleOpenPreview = (video: TelegramUploadedVideo) => {
    setPreviewVideo(video);
    setEditTitle(video.title || video.file_name || '');
  };

  // Save edited title
  const handleSaveTitle = async () => {
    if (!previewVideo) return;
    if (!editTitle.trim()) {
      toast.error('Video title cannot be empty');
      return;
    }

    setIsSavingTitle(true);
    try {
      const res = await fetch(`/api/telegram-uploaded/${previewVideo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update video');
      }

      setVideos(prev => prev.map(v => v.id === previewVideo.id ? { ...v, title: editTitle.trim() } : v));
      setPreviewVideo(prev => prev ? { ...prev, title: editTitle.trim() } : null);
      invalidateClientCache('telegram_uploaded:list');
      toast.success('Video title updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save changes');
    } finally {
      setIsSavingTitle(false);
    }
  };

  // Delete Video
  const handleDeleteVideo = async () => {
    if (!videoToDelete) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/telegram-uploaded/${videoToDelete.id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete video');
      }

      setVideos(prev => prev.filter(v => v.id !== videoToDelete.id));
      setTotalCount(prev => Math.max(0, prev - 1));
      if (videoToDelete.zerostorage_download_url || videoToDelete.zerostorage_file_id) {
        setZeroStorageCount(prev => Math.max(0, prev - 1));
      }

      if (previewVideo?.id === videoToDelete.id) {
        setPreviewVideo(null);
      }

      invalidateClientCache('telegram_uploaded:list');
      toast.success('Video deleted from MongoDB');
      setDeleteConfirmOpen(false);
      setVideoToDelete(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete video');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-zinc-200 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 grid place-items-center">
              <Send className="h-4 w-4 text-black dark:text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-black dark:text-white">
              Telegram Uploaded
            </h1>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Database viewer for videos uploaded from Telegram to ZeroStorage (MongoDB)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadVideos(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-colors shadow-2xs cursor-pointer"
            title="Refresh from MongoDB"
          >
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Total Telegram Videos */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
              Total Telegram Uploads
            </span>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
              <Send className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
              {totalCount.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              In MongoDB tracked_files & uploaded_videos
            </div>
          </div>
        </div>

        {/* Card 2: ZeroStorage Uploads */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
              ZeroStorage Uploads
            </span>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
              <Cloud className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
              {zeroStorageCount.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Active on ZeroStorage</span>
            </div>
          </div>
        </div>

        {/* Card 3: Storage Used */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
              Storage Used
            </span>
            <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
              <HardDrive className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
              {storageSizeStr}
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              ZeroStorage Infinite Cloud Tier
            </div>
          </div>
        </div>
      </div>

      {/* Main "My Files" Card */}
      <div id="my-files-card" className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm transition-colors">
        {/* Toolbar */}
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-zinc-50/50 dark:bg-zinc-900/30">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by title, file name, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white placeholder:text-zinc-400 focus:outline-none focus:border-black dark:focus:border-white transition-colors"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black dark:hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Right Toolbar Controls */}
          <div className="flex items-center gap-2 self-end md:self-auto">
            {/* Sort Order */}
            <select
              value={sortOrder}
              onChange={(e: any) => setSortOrder(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-xs font-medium text-zinc-700 dark:text-zinc-300 focus:outline-none cursor-pointer"
            >
              <option value="date_desc">Newest First</option>
              <option value="date_asc">Oldest First</option>
              <option value="title_asc">Title (A-Z)</option>
            </select>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-2xs'
                    : 'text-zinc-500 hover:text-black dark:hover:text-white'
                }`}
                title="Grid View"
              >
                <Grid2x2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-zinc-800 text-black dark:text-white shadow-2xs'
                    : 'text-zinc-500 hover:text-black dark:hover:text-white'
                }`}
                title="List View"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Video count */}
            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono ml-1">
              {filteredVideos.length} {filteredVideos.length === 1 ? 'video' : 'videos'}
            </span>
          </div>
        </div>

        {/* Card Content: Videos Grid or List */}
        <div className="p-4">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden animate-pulse">
                  <div className="aspect-video bg-zinc-200 dark:bg-zinc-800" />
                  <div className="p-3 space-y-2">
                    <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
                    <div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredVideos.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-900 grid place-items-center mb-3">
                <Send className="h-5 w-5 text-zinc-400" />
              </div>
              <p className="text-sm font-semibold text-black dark:text-white">
                No Telegram Uploaded Videos Found
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                {search ? 'Try clearing your search term.' : 'Videos uploaded from Telegram to ZeroStorage will appear here directly from MongoDB.'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid View */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedVideos.map((video) => {
                const targetUrl = video.zerostorage_download_url || video.zerostorage_embed_url || video.video_url;
                return (
                  <div
                    key={video.id}
                    className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-sm hover:border-zinc-400 dark:hover:border-zinc-700 transition-all flex flex-col overflow-hidden"
                  >
                    {/* Thumbnail / Video Box */}
                    <div
                      onClick={() => handleOpenPreview(video)}
                      className="relative aspect-video bg-zinc-100 dark:bg-zinc-900 cursor-pointer overflow-hidden border-b border-zinc-100 dark:border-zinc-800"
                    >
                      {video.thumbnail_url ? (
                        <img
                          src={video.thumbnail_url}
                          alt={video.title}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors">
                          <FileVideo className="h-7 w-7" />
                          <span className="text-[10px] font-mono">No Thumbnail</span>
                        </div>
                      )}

                      {/* ZeroStorage badge */}
                      {Boolean(video.zerostorage_download_url || video.zerostorage_file_id) && (
                        <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-xs text-white px-1.5 py-0.5 rounded text-[9px] font-medium flex items-center gap-1 border border-white/10">
                          <Cloud className="h-2.5 w-2.5 text-emerald-400" />
                          <span>ZeroStorage</span>
                        </div>
                      )}

                      {/* File size badge */}
                      {video.file_size && (
                        <div className="absolute bottom-2 right-2 bg-black/80 backdrop-blur-xs text-white px-1.5 py-0.5 rounded text-[9.5px] font-mono">
                          {String(video.file_size)}
                        </div>
                      )}
                    </div>

                    {/* Card Content */}
                    <div className="p-3 flex-1 flex flex-col justify-between space-y-2">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <FileFormatBadge name={video.file_name || video.title} />
                          <span className="text-[10.5px] text-zinc-400 truncate">
                            {video.created_at ? format(new Date(video.created_at), 'MMM dd, yyyy') : 'Recent'}
                          </span>
                        </div>

                        <h3
                          onClick={() => handleOpenPreview(video)}
                          className="text-xs font-semibold text-black dark:text-white line-clamp-2 cursor-pointer hover:underline"
                          title={video.title}
                        >
                          {video.title}
                        </h3>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
                        <button
                          type="button"
                          onClick={() => handleOpenPreview(video)}
                          className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Preview</span>
                        </button>

                        <div className="flex items-center gap-1">
                          {targetUrl && (
                            <button
                              type="button"
                              onClick={() => copyToClipboard(targetUrl, 'Video URL')}
                              className="p-1 rounded text-zinc-400 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
                              title="Copy Video Link"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setVideoToDelete(video);
                              setDeleteConfirmOpen(true);
                            }}
                            className="p-1 rounded text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                            title="Delete Video"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List / Table View */
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Video</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {paginatedVideos.map((video) => {
                    const targetUrl = video.zerostorage_download_url || video.zerostorage_embed_url || video.video_url;
                    return (
                      <tr 
                        key={video.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                      >
                        {/* Title & Thumbnail */}
                        <td className="py-3 px-4 min-w-[280px]">
                          <div className="flex items-center gap-3">
                            <div 
                              onClick={() => handleOpenPreview(video)}
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
                                onClick={() => handleOpenPreview(video)}
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
                              onClick={() => handleOpenPreview(video)}
                              className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                              title="Preview Video"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            {targetUrl && (
                              <button
                                type="button"
                                onClick={() => copyToClipboard(targetUrl, 'Video Link')}
                                className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                                title="Copy Video Link"
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setVideoToDelete(video);
                                setDeleteConfirmOpen(true);
                              }}
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
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4">
              <span className="text-xs text-zinc-500 font-mono">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:pointer-events-none hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:pointer-events-none hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* RIGHT PREVIEW DRAWER (Pure DB Viewer, NO Actions Section)     */}
      {/* Footer layout: [ Close ] [ Delete ] [ Save Changes ]         */}
      {/* ============================================================ */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setPreviewVideo(null)}
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
                onClick={() => setPreviewVideo(null)}
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
                        copyToClipboard(editTitle.trim(), 'Video Title');
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
                        onClick={() => copyToClipboard(previewVideo.zerostorage_download_url!, 'ZeroStorage URL')}
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
                      onClick={() => copyToClipboard(previewVideo.zerostorage_embed_url!, 'Embed URL')}
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
                          onClick={() => copyToClipboard(previewVideo.telegram_file_id!, 'Telegram File ID')}
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
                onClick={() => setPreviewVideo(null)}
                className="flex-1 h-9 px-2 sm:px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300 shadow-sm transition-colors cursor-pointer whitespace-nowrap text-center"
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => {
                  setVideoToDelete(previewVideo);
                  setDeleteConfirmOpen(true);
                }}
                className="flex-1 h-9 px-2 sm:px-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-white dark:bg-black hover:bg-red-50 dark:hover:bg-red-950/40 text-xs sm:text-sm font-medium flex items-center justify-center gap-1 text-red-600 dark:text-red-400 shadow-sm cursor-pointer whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5 shrink-0" />
                <span>Delete</span>
              </button>

              <button
                type="button"
                onClick={handleSaveTitle}
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
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmOpen && videoToDelete && (
        <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <DialogContent className="sm:max-w-md bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-base text-black dark:text-white">Delete Video</DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                Are you sure you want to delete <span className="font-semibold text-black dark:text-white">"{videoToDelete.title}"</span>? This will permanently remove the record from MongoDB.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteVideo}
                disabled={isDeleting}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeleting && <RotateCw className="h-3.5 w-3.5 animate-spin" />}
                <span>Delete Permanently</span>
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
