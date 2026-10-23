import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Film } from 'lucide-react';
import { toast } from 'sonner';
import { getClientCache, setClientCache, invalidateClientCache } from '@/src/lib/clientCache';

// Modular Uploaded Videos Subcomponents & Types
import { TelegramUploadedVideo } from '@/src/components/uploaded-videos/types';
import UploadedStatsCards from '@/src/components/uploaded-videos/UploadedStatsCards';
import UploadedToolbar from '@/src/components/uploaded-videos/UploadedToolbar';
import UploadedVideoCard from '@/src/components/uploaded-videos/UploadedVideoCard';
import UploadedVideoTable from '@/src/components/uploaded-videos/UploadedVideoTable';
import UploadedVideoDrawer from '@/src/components/uploaded-videos/UploadedVideoDrawer';
import DeleteUploadedVideoDialog from '@/src/components/uploaded-videos/DeleteUploadedVideoDialog';
import UploadedPagination from '@/src/components/uploaded-videos/UploadedPagination';

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
  const pageSize = 12;

  // Preview Drawer
  const [previewVideo, setPreviewVideo] = useState<TelegramUploadedVideo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Delete Confirmation Modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<TelegramUploadedVideo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard!`);
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim().toLowerCase());
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Load videos from backend with Server-Side Pagination & FIFO queue
  const loadVideos = useCallback(async (forceRefresh = false) => {
    const cacheKey = `telegram_uploaded:p${currentPage}:l${pageSize}:s${debouncedSearch}:o${sortOrder}`;
    if (!forceRefresh) {
      const cached = getClientCache<{ items: TelegramUploadedVideo[]; totalCount: number; zeroStorageCount: number }>(cacheKey, 30000);
      if (cached && Array.isArray(cached.items)) {
        setVideos(cached.items);
        setTotalCount(cached.totalCount);
        setZeroStorageCount(cached.zeroStorageCount);
        setLoading(false);
        return;
      }
    } else {
      invalidateClientCache(cacheKey);
    }

    setRefreshing(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        search: debouncedSearch,
        sort: sortOrder,
      });
      if (forceRefresh) params.append('refresh', 'true');

      const res = await fetch(`/api/telegram-uploaded?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.videos)) {
          setVideos(data.videos);
          setTotalCount(data.totalCount || data.total || 0);
          setZeroStorageCount(data.zeroStorageCount || 0);

          setClientCache(cacheKey, {
            items: data.videos,
            totalCount: data.totalCount || data.total || 0,
            zeroStorageCount: data.zeroStorageCount || 0,
          });
        }
      }
    } catch {
      toast.error('Failed to load uploaded videos list');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, pageSize, debouncedSearch, sortOrder]);

  // Fetch storage statistics
  const loadStorageStats = useCallback(async () => {
    try {
      const res = await fetch('/api/storage/stats');
      if (res.ok) {
        const data = await res.json();
        if (data.formattedSize) {
          setStorageSizeStr(data.formattedSize);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useEffect(() => {
    loadStorageStats();
  }, [loadStorageStats]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handleOpenPreview = (video: TelegramUploadedVideo) => {
    setPreviewVideo(video);
    setEditTitle(video.title || video.file_name);
  };

  const handleSaveTitle = async () => {
    if (!previewVideo || !editTitle.trim()) return;
    setIsSavingTitle(true);
    try {
      const res = await fetch(`/api/telegram-bot/uploaded/${previewVideo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Title updated successfully!');
        setVideos(prev => prev.map(v => v.id === previewVideo.id ? { ...v, title: editTitle.trim() } : v));
        setPreviewVideo(prev => prev ? { ...prev, title: editTitle.trim() } : null);
        invalidateClientCache('telegram_uploaded:list');
      } else {
        toast.error(data.error || 'Failed to update title');
      }
    } catch {
      toast.error('Network error saving title');
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleDeleteVideo = async () => {
    if (!videoToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/telegram-bot/uploaded/${videoToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Video record deleted permanently');
        setVideos(prev => prev.filter(v => v.id !== videoToDelete.id));
        setTotalCount(prev => Math.max(0, prev - 1));
        if (previewVideo && previewVideo.id === videoToDelete.id) {
          setPreviewVideo(null);
        }
        setDeleteConfirmOpen(false);
        setVideoToDelete(null);
        invalidateClientCache('telegram_uploaded:list');
      } else {
        toast.error(data.error || 'Failed to delete video');
      }
    } catch {
      toast.error('Network error deleting video');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black dark:text-white flex items-center gap-2.5">
          <Film className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          <span>Telegram Uploaded Videos</span>
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Catalog of videos uploaded to Telegram and mirrored to ZeroStorage CDN.
        </p>
      </div>

      {/* Reusable Stats Cards */}
      <UploadedStatsCards
        totalCount={totalCount}
        zeroStorageCount={zeroStorageCount}
        storageSizeStr={storageSizeStr}
      />

      {/* Main Content Area */}
      <div id="my-files-card" className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        {/* Reusable Toolbar */}
        <UploadedToolbar
          search={search}
          setSearch={setSearch}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onRefresh={() => loadVideos(true)}
          refreshing={refreshing}
        />

        {/* Content View */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black overflow-hidden animate-pulse">
                <div className="aspect-video bg-zinc-200 dark:bg-zinc-800" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded w-3/4" />
                  <div className="h-3 bg-zinc-100 dark:bg-zinc-900 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : videos.length === 0 ? (
          <div className="py-16 text-center">
            <Film className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-700" />
            <h3 className="mt-2 text-sm font-semibold text-black dark:text-white">No Uploaded Videos Found</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {debouncedSearch ? 'No videos matching your search criteria.' : 'Videos uploaded to Telegram bot will appear here.'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {videos.map((video) => (
              <UploadedVideoCard
                key={video.id}
                video={video}
                onOpenPreview={handleOpenPreview}
                onCopyLink={copyToClipboard}
                onDelete={(v) => {
                  setVideoToDelete(v);
                  setDeleteConfirmOpen(true);
                }}
              />
            ))}
          </div>
        ) : (
          <UploadedVideoTable
            videos={videos}
            onOpenPreview={handleOpenPreview}
            onCopyLink={copyToClipboard}
            onDelete={(v) => {
              setVideoToDelete(v);
              setDeleteConfirmOpen(true);
            }}
          />
        )}

        {/* Reusable Pagination Controls */}
        <UploadedPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Reusable Video Drawer */}
      <UploadedVideoDrawer
        previewVideo={previewVideo}
        onClose={() => setPreviewVideo(null)}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        onSaveTitle={handleSaveTitle}
        isSavingTitle={isSavingTitle}
        onCopyText={copyToClipboard}
        onDelete={(v) => {
          setVideoToDelete(v);
          setDeleteConfirmOpen(true);
        }}
      />

      {/* Reusable Delete Confirmation Dialog */}
      <DeleteUploadedVideoDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        videoToDelete={videoToDelete}
        onConfirm={handleDeleteVideo}
        isDeleting={isDeleting}
      />
    </div>
  );
}
