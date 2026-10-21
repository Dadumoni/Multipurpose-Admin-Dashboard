import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Video } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/src/lib/supabase';

// Modular R2 Videos Subcomponents & Types
import { R2Video } from '@/src/components/r2-videos/types';
import R2StatsCards from '@/src/components/r2-videos/R2StatsCards';
import R2Toolbar from '@/src/components/r2-videos/R2Toolbar';
import R2VideoCard from '@/src/components/r2-videos/R2VideoCard';
import R2VideoTable from '@/src/components/r2-videos/R2VideoTable';
import R2PreviewDrawer from '@/src/components/r2-videos/R2PreviewDrawer';
import R2RenameModal from '@/src/components/r2-videos/R2RenameModal';
import R2DeleteDialog from '@/src/components/r2-videos/R2DeleteDialog';
import R2Pagination from '@/src/components/r2-videos/R2Pagination';

export default function R2Videos() {
  const [videos, setVideos] = useState<R2Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalViews, setTotalViews] = useState(0);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'date_desc' | 'date_asc' | 'views_desc' | 'title_asc'>('date_desc');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);

  // Right Preview Drawer
  const [previewVideo, setPreviewVideo] = useState<R2Video | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Delete Confirmation Dialog
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<R2Video | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Rename Dialog (standalone)
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [videoToRename, setVideoToRename] = useState<R2Video | null>(null);
  const [newTitleInput, setNewTitleInput] = useState('');

  // R2 Base Public URL
  const r2PublicUrl = useMemo(() => {
    return (import.meta.env.VITE_R2_PUBLIC_URL || 'https://pub-97accfb7284047969abd231a24beceba.r2.dev').replace(/\/$/, '');
  }, []);

  const getFullThumbnailUrl = useCallback((path: string | null | undefined): string => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;
    return `${r2PublicUrl}/${cleanPath}`;
  }, [r2PublicUrl]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch videos
  const fetchVideos = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setRefreshing(true);

    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        sort: sortOrder,
        ...(debouncedSearch ? { search: debouncedSearch } : {})
      });

      const res = await fetch(`/api/r2-videos?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.videos)) {
          setVideos(data.videos);
          setTotalCount(data.total || 0);
          setTotalViews(data.totalViews || 0);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      }

      // Direct fallback to Supabase all_videos_db
      let query = supabase
        .from('all_videos_db')
        .select('id, slug, title, thumbnail, video_link, zerostorage, abyss, anonmp4, views, created_at', { count: 'exact' });

      if (debouncedSearch) {
        query = query.or(`title.ilike.%${debouncedSearch}%,slug.ilike.%${debouncedSearch}%`);
      }

      if (sortOrder === 'date_desc') query = query.order('created_at', { ascending: false });
      else if (sortOrder === 'date_asc') query = query.order('created_at', { ascending: true });
      else if (sortOrder === 'views_desc') query = query.order('views', { ascending: false });
      else if (sortOrder === 'title_asc') query = query.order('title', { ascending: true });

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, count, error } = await query.range(from, to);

      if (error) throw error;
      setVideos((data as R2Video[]) || []);
      setTotalCount(count || 0);
    } catch {
      toast.error('Failed to load R2 video files');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, pageSize, sortOrder, debouncedSearch]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handleOpenPreview = (video: R2Video) => {
    setPreviewVideo(video);
    setEditTitle(video.title || '');
    setIsEditingTitle(false);
  };

  const handleSaveTitle = async () => {
    if (!previewVideo || !editTitle.trim()) return;
    setIsSavingTitle(true);
    try {
      const res = await fetch(`/api/r2-videos/${previewVideo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Title updated successfully!');
        setVideos(prev => prev.map(v => v.id === previewVideo.id ? { ...v, title: editTitle.trim() } : v));
        setPreviewVideo(prev => prev ? { ...prev, title: editTitle.trim() } : null);
        setIsEditingTitle(false);
      } else {
        toast.error(data.error || 'Failed to update title');
      }
    } catch {
      toast.error('Network error saving title');
    } finally {
      setIsSavingTitle(false);
    }
  };

  const handleOpenRenameModal = (video: R2Video) => {
    setVideoToRename(video);
    setNewTitleInput(video.title || '');
    setRenameModalOpen(true);
  };

  const handleSaveRenameModal = async () => {
    if (!videoToRename || !newTitleInput.trim()) return;
    try {
      const res = await fetch(`/api/r2-videos/${videoToRename.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitleInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Video renamed successfully');
        setVideos(prev => prev.map(v => v.id === videoToRename.id ? { ...v, title: newTitleInput.trim() } : v));
        setRenameModalOpen(false);
        setVideoToRename(null);
      } else {
        toast.error(data.error || 'Failed to rename video');
      }
    } catch {
      toast.error('Network error renaming video');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!videoToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/r2-videos/${videoToDelete.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Video deleted permanently');
        setVideos(prev => prev.filter(v => v.id !== videoToDelete.id));
        setTotalCount(prev => Math.max(0, prev - 1));
        if (previewVideo && previewVideo.id === videoToDelete.id) {
          setPreviewVideo(null);
        }
        setDeleteConfirmOpen(false);
        setVideoToDelete(null);
      } else {
        toast.error(data.error || 'Failed to delete video');
      }
    } catch {
      toast.error('Network error deleting video');
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard!`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black dark:text-white flex items-center gap-2.5">
          <Video className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          <span>Cloudflare R2 Videos</span>
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Catalog of video streams hosted on Cloudflare R2 and synced to Supabase.
        </p>
      </div>

      {/* Reusable Stats Cards */}
      <R2StatsCards totalCount={totalCount} totalViews={totalViews} />

      {/* Main Content Area */}
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-4">
        {/* Reusable Toolbar */}
        <R2Toolbar
          search={search}
          setSearch={setSearch}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          pageSize={pageSize}
          setPageSize={setPageSize}
          viewMode={viewMode}
          setViewMode={setViewMode}
          onRefresh={() => fetchVideos(true)}
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
            <Video className="mx-auto h-10 w-10 text-zinc-300 dark:text-zinc-700" />
            <h3 className="mt-2 text-sm font-semibold text-black dark:text-white">No R2 Videos Found</h3>
            <p className="mt-1 text-xs text-zinc-500">
              {debouncedSearch ? 'No videos matching your search criteria.' : 'Videos registered in all_videos_db will appear here.'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {videos.map((video) => (
              <R2VideoCard
                key={video.id}
                video={video}
                thumbUrl={getFullThumbnailUrl(video.thumbnail)}
                onPreview={handleOpenPreview}
                onRename={handleOpenRenameModal}
                onDelete={(v) => {
                  setVideoToDelete(v);
                  setDeleteConfirmOpen(true);
                }}
              />
            ))}
          </div>
        ) : (
          <R2VideoTable
            videos={videos}
            getFullThumbnailUrl={getFullThumbnailUrl}
            onPreview={handleOpenPreview}
            onRename={handleOpenRenameModal}
            onDelete={(v) => {
              setVideoToDelete(v);
              setDeleteConfirmOpen(true);
            }}
          />
        )}

        {/* Reusable Pagination */}
        <R2Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Reusable Preview Drawer */}
      <R2PreviewDrawer
        previewVideo={previewVideo}
        onClose={() => setPreviewVideo(null)}
        getFullThumbnailUrl={getFullThumbnailUrl}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
        onSaveTitle={handleSaveTitle}
        isSavingTitle={isSavingTitle}
        onCopyText={copyToClipboard}
      />

      {/* Reusable Rename Modal */}
      <R2RenameModal
        open={renameModalOpen}
        onOpenChange={setRenameModalOpen}
        videoToRename={videoToRename}
        newTitleInput={newTitleInput}
        setNewTitleInput={setNewTitleInput}
        onSave={handleSaveRenameModal}
      />

      {/* Reusable Delete Dialog */}
      <R2DeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        videoToDelete={videoToDelete}
        onConfirm={handleDeleteConfirm}
        isDeleting={isDeleting}
      />
    </div>
  );
}
