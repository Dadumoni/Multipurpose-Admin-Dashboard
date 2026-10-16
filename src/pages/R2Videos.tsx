import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  Search, 
  Grid2x2, 
  List, 
  RotateCw, 
  Film, 
  Eye, 
  Calendar, 
  Trash2, 
  Pencil, 
  Copy, 
  Check, 
  ExternalLink, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Video,
  Play,
  Layers,
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/src/lib/supabase';

export interface R2Video {
  id: number;
  slug: string;
  title: string;
  thumbnail: string | null;
  video_link: string | null;
  zerostorage: string | null;
  abyss: string | null;
  anonmp4: string | null;
  views: number;
  created_at: string;
}

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
      // First try backend API route
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(pageSize),
        sort: sortOrder,
        ...(debouncedSearch ? { search: debouncedSearch } : {})
      });

      const res = await fetch(`/api/r2-videos?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setVideos(data.videos || []);
          setTotalCount(data.totalCount || 0);
          setTotalViews(data.totalViews || 0);
          return;
        }
      }

      // Fallback: Direct Supabase client query
      let query = supabase.from('all_videos_db').select('*', { count: 'exact' });

      if (debouncedSearch) {
        query = query.or(`title.ilike.%${debouncedSearch}%,slug.ilike.%${debouncedSearch}%`);
      }

      if (sortOrder === 'date_asc') {
        query = query.order('id', { ascending: true });
      } else if (sortOrder === 'views_desc') {
        query = query.order('views', { ascending: false });
      } else if (sortOrder === 'title_asc') {
        query = query.order('title', { ascending: true });
      } else {
        query = query.order('id', { ascending: false });
      }

      const offset = (currentPage - 1) * pageSize;
      query = query.range(offset, offset + pageSize - 1);

      const { data: rows, count, error } = await query;
      if (error) throw error;

      setVideos((rows as R2Video[]) || []);
      setTotalCount(count || 0);

      // Views sum query
      const { data: viewsData } = await supabase.from('all_videos_db').select('views');
      if (viewsData && Array.isArray(viewsData)) {
        const sum = viewsData.reduce((acc, r: any) => acc + (Number(r.views) || 0), 0);
        setTotalViews(sum);
      }
    } catch (err: any) {
      console.error('Failed to fetch R2 videos:', err);
      toast.error('Failed to load videos from Supabase');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, pageSize, sortOrder, debouncedSearch]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Sync edit title when previewVideo changes
  useEffect(() => {
    if (previewVideo) {
      setEditTitle(previewVideo.title || '');
      setIsEditingTitle(false);
    }
  }, [previewVideo]);

  // Handle Save Rename (from preview drawer)
  const handleSaveTitle = async () => {
    if (!previewVideo || !editTitle.trim()) return;
    setIsSavingTitle(true);
    const updatedTitle = editTitle.trim();

    try {
      // Call API
      const res = await fetch(`/api/r2-videos/${previewVideo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: updatedTitle })
      });

      if (!res.ok) {
        // Direct fallback
        const { error } = await supabase
          .from('all_videos_db')
          .update({ title: updatedTitle })
          .eq('id', previewVideo.id);
        if (error) throw error;
      }

      setVideos(prev => prev.map(v => v.id === previewVideo.id ? { ...v, title: updatedTitle } : v));
      setPreviewVideo(prev => prev ? { ...prev, title: updatedTitle } : null);
      setIsEditingTitle(false);
      toast.success('Video renamed successfully');
    } catch (err: any) {
      toast.error(`Rename failed: ${err.message}`);
    } finally {
      setIsSavingTitle(false);
    }
  };

  // Handle Standalone Rename Modal
  const handleOpenRenameModal = (video: R2Video) => {
    setVideoToRename(video);
    setNewTitleInput(video.title || '');
    setRenameModalOpen(true);
  };

  const handleConfirmRename = async () => {
    if (!videoToRename || !newTitleInput.trim()) return;
    const updatedTitle = newTitleInput.trim();

    try {
      const res = await fetch(`/api/r2-videos/${videoToRename.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: updatedTitle })
      });

      if (!res.ok) {
        const { error } = await supabase
          .from('all_videos_db')
          .update({ title: updatedTitle })
          .eq('id', videoToRename.id);
        if (error) throw error;
      }

      setVideos(prev => prev.map(v => v.id === videoToRename.id ? { ...v, title: updatedTitle } : v));
      if (previewVideo && previewVideo.id === videoToRename.id) {
        setPreviewVideo(prev => prev ? { ...prev, title: updatedTitle } : null);
      }
      toast.success('Video renamed successfully');
      setRenameModalOpen(false);
      setVideoToRename(null);
    } catch (err: any) {
      toast.error(`Rename failed: ${err.message}`);
    }
  };

  // Handle Delete Video
  const handleConfirmDelete = async () => {
    if (!videoToDelete) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/r2-videos/${videoToDelete.id}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        const { error } = await supabase
          .from('all_videos_db')
          .delete()
          .eq('id', videoToDelete.id);
        if (error) throw error;
      }

      setVideos(prev => prev.filter(v => v.id !== videoToDelete.id));
      setTotalCount(prev => Math.max(0, prev - 1));
      if (previewVideo && previewVideo.id === videoToDelete.id) {
        setPreviewVideo(null);
      }
      toast.success(`Video #${videoToDelete.slug} deleted successfully`);
      setDeleteConfirmOpen(false);
      setVideoToDelete(null);
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied ${label} to clipboard`);
  };

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white flex items-center gap-2.5">
            <Video className="h-6 w-6 text-black dark:text-white" />
            R2 Videos
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Independent database viewer for videos stored in Supabase <code className="text-xs bg-zinc-100 dark:bg-zinc-900 px-1.5 py-0.5 rounded text-zinc-700 dark:text-zinc-300">all_videos_db</code>
          </p>
        </div>

        <button
          onClick={() => fetchVideos(false)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-sm font-medium text-black dark:text-white hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors cursor-pointer self-start sm:self-auto shrink-0 shadow-sm"
        >
          <RotateCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Metric Cards (Total Videos, Total Views) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Total Videos Card */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 grid place-items-center text-black dark:text-white shrink-0">
            <Film className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Total Videos
            </div>
            <div className="text-2xl font-bold text-black dark:text-white mt-0.5">
              {loading ? '...' : totalCount.toLocaleString()}
            </div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Synced from all_videos_db
            </div>
          </div>
        </div>

        {/* Total Views Card */}
        <div className="p-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 grid place-items-center text-black dark:text-white shrink-0">
            <Eye className="h-6 w-6" />
          </div>
          <div>
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Total Views
            </div>
            <div className="text-2xl font-bold text-black dark:text-white mt-0.5">
              {loading ? '...' : totalViews.toLocaleString()}
            </div>
            <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
              Combined audience count
            </div>
          </div>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-sm flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or slug..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 text-black dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Sort & View Mode */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          {/* Sort Dropdown */}
          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as any)}
            className="px-3 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white focus:outline-none cursor-pointer"
          >
            <option value="date_desc">Newest First</option>
            <option value="date_asc">Oldest First</option>
            <option value="views_desc">Most Views</option>
            <option value="title_asc">Title A-Z</option>
          </select>

          {/* Grid/List Toggle */}
          <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded-lg p-0.5 bg-zinc-50 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-white dark:bg-black text-black dark:text-white shadow-sm' 
                  : 'text-zinc-500 hover:text-black dark:hover:text-white'
              }`}
              title="Grid View"
            >
              <Grid2x2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-md transition-colors ${
                viewMode === 'list' 
                  ? 'bg-white dark:bg-black text-black dark:text-white shadow-sm' 
                  : 'text-zinc-500 hover:text-black dark:hover:text-white'
              }`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Video Content */}
      {loading ? (
        <div className="h-72 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-black grid place-items-center">
          <div className="flex flex-col items-center gap-2.5">
            <RotateCw className="h-6 w-6 animate-spin text-zinc-500" />
            <span className="text-sm text-zinc-500">Loading videos from all_videos_db...</span>
          </div>
        </div>
      ) : videos.length === 0 ? (
        <div className="h-72 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-white dark:bg-black grid place-items-center p-6 text-center">
          <div className="flex flex-col items-center max-w-sm">
            <div className="h-12 w-12 rounded-xl bg-zinc-100 dark:bg-zinc-900 grid place-items-center text-zinc-400 mb-3">
              <Film className="h-6 w-6" />
            </div>
            <h3 className="font-semibold text-base text-black dark:text-white">No Videos Found</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {debouncedSearch 
                ? `No results matching "${debouncedSearch}". Try clearing the search.`
                : 'No video records are present in all_videos_db yet.'}
            </p>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {videos.map((video) => {
            const thumbUrl = getFullThumbnailUrl(video.thumbnail);
            return (
              <div
                key={video.id}
                className="group rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-sm hover:border-zinc-400 dark:hover:border-zinc-700 transition-all flex flex-col overflow-hidden"
              >
                {/* Thumbnail Header */}
                <div 
                  className="relative aspect-video bg-zinc-100 dark:bg-zinc-900 cursor-pointer overflow-hidden border-b border-zinc-100 dark:border-zinc-900"
                  onClick={() => setPreviewVideo(video)}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={video.title}
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : null}

                  {/* Fallback Icon */}
                  <div className="absolute inset-0 grid place-items-center text-zinc-400 -z-10">
                    <Video className="h-8 w-8" />
                  </div>

                  {/* Badges Overlay */}
                  <div className="absolute top-2 left-2 flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-white">
                      {video.slug}
                    </span>
                  </div>

                  <div className="absolute top-2 right-2">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm text-white flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {(video.views || 0).toLocaleString()}
                    </span>
                  </div>

                  {/* Hover Play Button */}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity grid place-items-center">
                    <div className="h-10 w-10 rounded-full bg-white/90 dark:bg-black/90 text-black dark:text-white grid place-items-center shadow-lg">
                      <Play className="h-5 w-5 ml-0.5 fill-current" />
                    </div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <h3 
                      className="text-sm font-semibold text-black dark:text-white line-clamp-2 hover:underline cursor-pointer"
                      title={video.title}
                      onClick={() => setPreviewVideo(video)}
                    >
                      {video.title || 'Untitled Video'}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 mt-1.5">
                      <Calendar className="h-3 w-3" />
                      <span>
                        {video.created_at ? format(new Date(video.created_at), 'MMM dd, yyyy') : 'Recently'}
                      </span>
                    </div>
                  </div>

                  {/* Host Indicators */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-900">
                    {video.video_link && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 font-medium">
                        Direct
                      </span>
                    )}
                    {video.zerostorage && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-medium">
                        ZeroStorage
                      </span>
                    )}
                    {video.abyss && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 font-medium">
                        Abyss
                      </span>
                    )}
                    {video.anonmp4 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-medium">
                        AnonMP4
                      </span>
                    )}
                  </div>

                  {/* Card Actions */}
                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setPreviewVideo(video)}
                      className="text-xs font-medium text-black dark:text-white hover:underline cursor-pointer"
                    >
                      Preview & Details
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenRenameModal(video)}
                        className="p-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                        title="Rename Video"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoToDelete(video);
                          setDeleteConfirmOpen(true);
                        }}
                        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/50 text-zinc-500 hover:text-red-600 transition-colors cursor-pointer"
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
        /* List View */
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <th className="py-3 px-4">Video</th>
                  <th className="py-3 px-4">Slug</th>
                  <th className="py-3 px-4">Views</th>
                  <th className="py-3 px-4">Hosts</th>
                  <th className="py-3 px-4">Created</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {videos.map((video) => {
                  const thumbUrl = getFullThumbnailUrl(video.thumbnail);
                  return (
                    <tr 
                      key={video.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors group"
                    >
                      {/* Video Thumbnail + Title */}
                      <td className="py-3 px-4 min-w-[280px]">
                        <div className="flex items-center gap-3">
                          <div 
                            className="h-12 w-20 rounded-lg bg-zinc-100 dark:bg-zinc-900 shrink-0 overflow-hidden relative cursor-pointer border border-zinc-200 dark:border-zinc-800"
                            onClick={() => setPreviewVideo(video)}
                          >
                            {thumbUrl ? (
                              <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full grid place-items-center text-zinc-400">
                                <Video className="h-4 w-4" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div 
                              className="font-medium text-black dark:text-white truncate cursor-pointer hover:underline"
                              onClick={() => setPreviewVideo(video)}
                              title={video.title}
                            >
                              {video.title || 'Untitled Video'}
                            </div>
                            <div className="text-xs font-mono text-zinc-400 mt-0.5">
                              ID: #{video.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Slug */}
                      <td className="py-3 px-4 font-mono text-xs text-zinc-600 dark:text-zinc-300">
                        {video.slug}
                      </td>

                      {/* Views */}
                      <td className="py-3 px-4 text-zinc-700 dark:text-zinc-300 font-medium">
                        {(video.views || 0).toLocaleString()}
                      </td>

                      {/* Hosts */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {video.video_link && <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300">Direct</span>}
                          {video.zerostorage && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">ZS</span>}
                          {video.abyss && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300">Abyss</span>}
                          {video.anonmp4 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">Anon</span>}
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
                            onClick={() => setPreviewVideo(video)}
                            className="px-2.5 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-xs font-medium text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenRenameModal(video)}
                            className="p-1 rounded-md text-zinc-500 hover:text-black dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer"
                            title="Rename"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setVideoToDelete(video);
                              setDeleteConfirmOpen(true);
                            }}
                            className="p-1 rounded-md text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 cursor-pointer"
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
        </div>
      )}

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 pt-4">
          <div className="text-xs text-zinc-500">
            Showing page {currentPage} of {totalPages} ({totalCount} total)
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs px-2 text-black dark:text-white font-medium">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-100 dark:hover:bg-zinc-900"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* RIGHT SIDEBAR PREVIEW DRAWER (Independent for R2 Videos)      */}
      {/* ============================================================ */}
      {previewVideo && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px] transition-opacity"
            onClick={() => setPreviewVideo(null)}
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
                onClick={() => setPreviewVideo(null)}
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
                        className="text-xs text-zinc-400 hover:text-zinc-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleSaveTitle}
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

              {/* Host Links Section (Strictly all_videos_db fields) */}
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
                          onClick={() => copyToClipboard(previewVideo.video_link!, 'Video Link')}
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
                          onClick={() => copyToClipboard(previewVideo.zerostorage!, 'ZeroStorage Embed')}
                          className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                          title="Copy Embed URL"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={previewVideo.zerostorage}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                          title="Open Embed"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                    <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate">
                      {previewVideo.zerostorage}
                    </div>
                  </div>
                )}

                {/* Abyss */}
                {previewVideo.abyss && (
                  <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Abyss Iframe</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(previewVideo.abyss!, 'Abyss URL')}
                          className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                          title="Copy URL"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={previewVideo.abyss}
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
                      {previewVideo.abyss}
                    </div>
                  </div>
                )}

                {/* AnonMP4 */}
                {previewVideo.anonmp4 && (
                  <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">AnonMP4</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(previewVideo.anonmp4!, 'AnonMP4 URL')}
                          className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                          title="Copy URL"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={previewVideo.anonmp4}
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
                      {previewVideo.anonmp4}
                    </div>
                  </div>
                )}

                {/* Thumbnail Path */}
                {previewVideo.thumbnail && (
                  <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Thumbnail Path</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(previewVideo.thumbnail!, 'Thumbnail Path')}
                          className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                          title="Copy Path"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <a
                          href={getFullThumbnailUrl(previewVideo.thumbnail)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
                          title="View Full Thumbnail Image"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                    <div className="text-xs font-mono text-zinc-500 dark:text-zinc-400 truncate">
                      {previewVideo.thumbnail}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setVideoToDelete(previewVideo);
                  setDeleteConfirmOpen(true);
                }}
                className="px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 border border-transparent hover:border-red-200 dark:hover:border-red-900/50 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Video
              </button>

              <button
                type="button"
                onClick={() => setPreviewVideo(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-black dark:bg-white text-white dark:text-black hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* STANDALONE RENAME MODAL                                       */}
      {/* ============================================================ */}
      {renameModalOpen && videoToRename && (
        <div className="fixed inset-0 z-50 overflow-hidden grid place-items-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => setRenameModalOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-black rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl z-10 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-black dark:text-white">Rename Video</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Update the title stored in <code className="font-mono">all_videos_db</code>
              </p>
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1.5">
                New Video Title
              </label>
              <input
                type="text"
                value={newTitleInput}
                onChange={(e) => setNewTitleInput(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white"
                placeholder="Enter title..."
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenameModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRename}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-90"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* DELETE CONFIRMATION MODAL                                    */}
      {/* ============================================================ */}
      {deleteConfirmOpen && videoToDelete && (
        <div className="fixed inset-0 z-50 overflow-hidden grid place-items-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px]"
            onClick={() => !isDeleting && setDeleteConfirmOpen(false)}
          />
          <div className="relative w-full max-w-md bg-white dark:bg-black rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 shadow-2xl z-10 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 grid place-items-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-black dark:text-white">Delete Video Record?</h3>
                <p className="text-xs text-zinc-500 mt-1">
                  Are you sure you want to delete <strong className="text-black dark:text-white font-mono">{videoToDelete.slug}</strong> ({videoToDelete.title})? This will permanently remove it from Supabase <code className="font-mono">all_videos_db</code>.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmOpen(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 shadow-sm"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
