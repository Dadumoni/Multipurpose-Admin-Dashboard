import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Grid2x2, 
  List, 
  RotateCw, 
  Check, 
  Film, 
  ChevronLeft, 
  ChevronRight, 
  AlertTriangle, 
  Settings, 
  Copy,
  Link2Off,
  Files
} from 'lucide-react';
import { toast } from 'sonner';

import { 
  getSupabaseConfig, 
  updateSupabaseConfig, 
  resetSupabaseConfig 
} from '@/src/lib/supabase';
import { getClientCache, setClientCache, invalidateClientCache } from '@/src/lib/clientCache';
import { generateMultiGridThumbnail } from '@/src/lib/thumbnailGenerator';
import { batchCheckPostVideoLinks, VideoPostToCheck } from '@/src/lib/videoChecker';

// Modular Subcomponents
import { 
  ScrapedVideo, 
  DuplicatePair, 
  POSTS_SQL_SETUP, 
  DEMO_POSTS, 
  getDomain 
} from '@/src/components/scraped-videos/types';
import { StatsCards } from '@/src/components/scraped-videos/StatsCards';
import { VideoGridCard, VideoListRow } from '@/src/components/scraped-videos/VideoCard';
import { VideoPreviewDrawer } from '@/src/components/scraped-videos/VideoPreviewDrawer';
import { DuplicateComparisonView } from '@/src/components/scraped-videos/DuplicateComparisonView';
import { FileManagerToolbar } from '@/src/components/scraped-videos/FileManagerToolbar';
import { ContextMenu } from '@/src/components/scraped-videos/ContextMenu';
import { DeleteConfirmDialog } from '@/src/components/scraped-videos/DeleteConfirmDialog';
import { ProjectSettingsModal } from '@/src/components/scraped-videos/ProjectSettingsModal';

export default function ScrapedVideos() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Core Data States
  const [videos, setVideos] = useState<ScrapedVideo[]>([]);
  const [totalPostsCount, setTotalPostsCount] = useState<number>(0);
  const [totalFilteredCount, setTotalFilteredCount] = useState<number>(0);
  const [totalViewsCount, setTotalViewsCount] = useState<number>(0);
  const [missingThumbnailCount, setMissingThumbnailCount] = useState<number>(0);
  const [domainSources, setDomainSources] = useState<Array<{ domain: string; count: number }>>(() => {
    const cachedStats = getClientCache<any>('dashboard_stats_overview');
    if (cachedStats && Array.isArray(cachedStats.video_sources)) {
      return cachedStats.video_sources.map((s: any) => ({ domain: s.domain, count: s.count }));
    }
    return [];
  });
  const [loading, setLoading] = useState(true);
  const [activeTable, setActiveTable] = useState<'post' | 'posts' | 'videos'>('post');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isViewingMissingThumbs, setIsViewingMissingThumbs] = useState(false);
  const [schemaCacheError, setSchemaCacheError] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // Filters & Query Parameters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>(() => searchParams.get('domain') || 'all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(12);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<number | string>>(new Set());

  // Deletion Modal
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [videoToDelete, setVideoToDelete] = useState<number | string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Right Preview Drawer
  const [previewVideo, setPreviewVideo] = useState<ScrapedVideo | null>(null);
  const [activeStreamUrl, setActiveStreamUrl] = useState<string>('');
  const [editTitle, setEditTitle] = useState('');
  const [editStreamUrl, setEditStreamUrl] = useState('');
  const [editThumbnailUrl, setEditThumbnailUrl] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingStreamUrl, setIsEditingStreamUrl] = useState(false);
  const [isEditingThumbUrl, setIsEditingThumbUrl] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegeneratingThumb, setIsRegeneratingThumb] = useState(false);

  // Context Menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; video: ScrapedVideo } | null>(null);

  // Project Settings Modal
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const currentConfig = useMemo(() => getSupabaseConfig(), [settingsModalOpen, loading]);
  const [customUrl, setCustomUrl] = useState('');
  const [customKey, setCustomKey] = useState('');

  // Expired Links State
  const [expiredCount, setExpiredCount] = useState<number>(0);
  const [isViewingExpired, setIsViewingExpired] = useState<boolean>(false);
  const [isCheckingExpired, setIsCheckingExpired] = useState<boolean>(false);
  const [checkProgress, setCheckProgress] = useState<{
    total: number;
    checked: number;
    expiredCount: number;
    recoveredCount?: number;
    newlyExpiredCount?: number;
    status: string;
    message?: string;
  }>({
    total: 0,
    checked: 0,
    expiredCount: 0,
    recoveredCount: 0,
    newlyExpiredCount: 0,
    status: 'idle',
  });

  // Duplicate Videos State
  const [isViewingDuplicates, setIsViewingDuplicates] = useState<boolean>(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState<boolean>(false);
  const [duplicateIds, setDuplicateIds] = useState<Set<string | number>>(new Set());
  const [duplicateReasonMap, setDuplicateReasonMap] = useState<Map<string | number, string[]>>(new Map());
  const [duplicatePairs, setDuplicatePairs] = useState<DuplicatePair[]>([]);
  const [dupCurrentPage, setDupCurrentPage] = useState<number>(1);
  const DUP_PAGE_SIZE = 10;

  // Refs
  const sseRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<any>(null);
  const thumbnailAbortRef = useRef<AbortController | null>(null);
  const browserCheckAbortRef = useRef<AbortController | null>(null);

  // Handler to select and filter by domain
  const handleSelectDomain = (domain: string) => {
    setSourceFilter(domain);
    setSortDropdownOpen(false);
    setCurrentPage(1);
    setIsViewingExpired(false);
    setIsViewingDuplicates(false);
    setSelectedIds(new Set());
    if (domain === 'all') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('domain');
        return next;
      });
      toast.success('Showing all domains');
    } else {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.set('domain', domain);
        return next;
      });
      toast.success(`Filtered: ${domain}`);
    }
  };

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  // Sync URL searchParams domain filter
  useEffect(() => {
    const domainParam = searchParams.get('domain');
    if (domainParam) {
      setSourceFilter(domainParam);
      setIsViewingExpired(false);
      setIsViewingDuplicates(false);
      setCurrentPage(1);

      const timer = setTimeout(() => {
        const el = document.getElementById('my-files-card');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
      return () => clearTimeout(timer);
    } else {
      setSourceFilter(prev => prev === 'all' ? prev : 'all');
    }
  }, [searchParams]);

  // Global click listener to close context menu
  useEffect(() => {
    const closeContext = () => setContextMenu(null);
    window.addEventListener('click', closeContext);
    return () => window.removeEventListener('click', closeContext);
  }, []);

  // Fetch Stats Overview (Total posts, views, and domain breakdown in <20ms)
  const fetchOverviewStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats/overview');
      if (res.ok) {
        const json = await res.json();
        const data = json.stats || json.data || json || {};
        if (typeof data.total_posts === 'number') {
          setTotalPostsCount(data.total_posts);
        }
        if (typeof data.total_views === 'number') {
          setTotalViewsCount(data.total_views);
        }
        if (typeof data.missing_thumbnails === 'number') {
          setMissingThumbnailCount(data.missing_thumbnails);
        }
        if (Array.isArray(data.video_sources) && data.video_sources.length > 0) {
          setDomainSources(data.video_sources.map((s: any) => ({
            domain: s.domain,
            count: s.count,
          })));
        }
        setClientCache('dashboard_stats_overview', data);
      }
    } catch (e) {
      console.warn('Overview stats fetch notice:', e);
    }
  }, []);

  // Fetch Exact Missing Thumbnails Count from Supabase
  const fetchMissingThumbnailCount = useCallback(async () => {
    try {
      const res = await fetch('/api/posts/missing-thumbnails/count');
      if (res.ok) {
        const data = await res.json();
        if (typeof data.count === 'number') {
          setMissingThumbnailCount(data.count);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch missing thumbnail count notice:', e);
    }
  }, []);

  // Fetch Expired Count
  const fetchExpiredStatus = useCallback(async (force = false) => {
    if (!force) {
      const cachedExp = getClientCache<number>('posts_expired_count');
      if (typeof cachedExp === 'number') {
        setExpiredCount(cachedExp);
        return;
      }
    }
    try {
      const res = await fetch('/api/posts/expired/count');
      if (res.ok) {
        const data = await res.json();
        const cnt = data.count || 0;
        setExpiredCount(cnt);
        setClientCache('posts_expired_count', cnt);
      }
    } catch (e) {
      console.warn('Failed to fetch expired status', e);
    }
  }, []);

  // Fetch paginated videos efficiently from MongoDB (<50ms per page)
  const fetchVideos = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', String(pageSize));
      params.set('sort', sortOrder === 'asc' ? 'date_asc' : 'date_desc');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (sourceFilter && sourceFilter !== 'all') params.set('domain', sourceFilter);
      if (isViewingExpired) params.set('expired_only', 'true');
      if (isViewingMissingThumbs) params.set('missing_thumbnail', 'true');

      const res = await fetch(`/api/posts?${params.toString()}`);
      if (res.ok) {
        const mongoData = await res.json();
        if (mongoData.data && Array.isArray(mongoData.data)) {
          setActiveTable('post');
          setSchemaCacheError(false);
          setIsDemoMode(false);

          const mappedVideos: ScrapedVideo[] = mongoData.data.map((item: any) => {
            const raw720 = item['720p_link'] || item.video_url2 || null;
            const raw480 = item['480p_link'] || item.video_url1 || null;
            const firstLink = Array.isArray(item.all_links) && item.all_links.length > 0 ? item.all_links[0] : null;
            const effectiveVideoUrl = item.video_url || raw720 || raw480 || firstLink || item.post_url || '';
            const effectiveTitle = (item.title || (item.video_id ? `Video #${item.video_id}` : (item.post_url ? 'Untitled Scraped Post' : 'Untitled Video'))).trim();

            return {
              _id: item._id ? String(item._id) : undefined,
              id: item.id !== undefined && item.id !== null ? item.id : (item.video_id || (item._id ? String(item._id) : '—')),
              title: effectiveTitle,
              video_url: effectiveVideoUrl,
              thumbnail_url: item.thumbnail_url || null,
              created_at: item.created_at || (item.scraped_at ? new Date(typeof item.scraped_at === 'number' && item.scraped_at < 1e11 ? item.scraped_at * 1000 : item.scraped_at).toISOString() : new Date().toISOString()),
              views: Number(item.views) || 0,
              video_url1: raw480,
              video_url2: raw720,
              post_url: item.post_url || null,
              video_id: item.video_id || null,
              scraped_at: item.scraped_at || null,
              '480p_link': raw480,
              '720p_link': raw720,
              all_links: Array.isArray(item.all_links) ? item.all_links : (effectiveVideoUrl ? [effectiveVideoUrl] : []),
              domain: item.domain || null,
              duration: item.duration || null,
              is_expired: Boolean(item.is_expired),
              expired_checked_at: item.expired_checked_at || null,
            };
          });

          setVideos(mappedVideos);
          setTotalFilteredCount(mongoData.total ?? mappedVideos.length);
          if (!debouncedSearch && sourceFilter === 'all' && !isViewingExpired && !isViewingMissingThumbs) {
            setTotalPostsCount(mongoData.total ?? mappedVideos.length);
          }
          setLoading(false);
          return;
        }
      }
      throw new Error('Failed to load posts from MongoDB');
    } catch (err: any) {
      console.warn('MongoDB query notice:', err.message);
      if (videos.length === 0) {
        setVideos(DEMO_POSTS);
        setTotalFilteredCount(DEMO_POSTS.length);
        setTotalPostsCount(DEMO_POSTS.length);
        setIsDemoMode(true);
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, sortOrder, debouncedSearch, sourceFilter, isViewingExpired, isViewingMissingThumbs]);

  // Initial load: overview stats + expired count + missing thumbnail count + paginated videos
  useEffect(() => {
    fetchOverviewStats();
    fetchExpiredStatus();
    fetchMissingThumbnailCount();
  }, [fetchOverviewStats, fetchExpiredStatus, fetchMissingThumbnailCount]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Connect to SSE for background link check updates
  const connectExpiredCheckSSE = () => {
    if (sseRef.current) return;
    try {
      const sse = new EventSource('/api/posts/check-expired/events');
      sseRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data) {
            setCheckProgress({
              total: data.total || 0,
              checked: data.checked || 0,
              expiredCount: data.expiredCount || 0,
              recoveredCount: data.recoveredCount || 0,
              newlyExpiredCount: data.newlyExpiredCount || 0,
              status: data.status || 'running',
              message: data.message || '',
            });
            if (typeof data.expiredCount === 'number') {
              setExpiredCount(data.expiredCount);
            }

            if (data.checking) {
              setIsCheckingExpired(true);
            } else {
              setIsCheckingExpired(false);
              if (data.status === 'completed') {
                fetchVideos(true);
                fetchExpiredStatus(true);
              }
            }
          }
        } catch (e) {
          console.warn('Error parsing check-expired SSE data', e);
        }
      };

      sse.onerror = () => {
        sse.close();
        sseRef.current = null;
      };
    } catch (e) {
      console.warn('Failed to connect to SSE', e);
    }
  };

  const fetchCheckStatus = async () => {
    try {
      const res = await fetch('/api/posts/check-expired/status');
      if (res.ok) {
        const data = await res.json();
        if (typeof data.expiredCount === 'number') {
          setExpiredCount(data.expiredCount);
        }
        if (data.checking) {
          setIsCheckingExpired(true);
          setCheckProgress({
            total: data.total || 0,
            checked: data.checked || 0,
            expiredCount: data.expiredCount || 0,
            recoveredCount: data.recoveredCount || 0,
            newlyExpiredCount: data.newlyExpiredCount || 0,
            status: data.status || 'running',
            message: data.message || '',
          });
          connectExpiredCheckSSE();
        } else {
          if (isCheckingExpired) {
            setIsCheckingExpired(false);
            fetchVideos(true);
          }
          setCheckProgress(prev => ({
            ...prev,
            status: data.status || 'idle',
            message: data.message || '',
          }));
        }
      }
    } catch (e) {
      console.warn('Failed to fetch check-expired status', e);
    }
  };

  const handleCheckExpired = async () => {
    if (isCheckingExpired) return;
    try {
      setIsCheckingExpired(true);
      browserCheckAbortRef.current = new AbortController();
      const signal = browserCheckAbortRef.current.signal;

      toast.info('Fetching video stream links for background HTML5 player verification...');
      const listUrl = `/api/posts/check-list${sourceFilter !== 'all' ? `?domain=${encodeURIComponent(sourceFilter)}` : ''}`;
      const listRes = await fetch(listUrl);
      let postsToCheck: VideoPostToCheck[] = [];
      if (listRes.ok) {
        const listData = await listRes.json();
        if (Array.isArray(listData.posts) && listData.posts.length > 0) {
          postsToCheck = listData.posts;
        }
      }

      // Fallback to currently loaded videos if check-list is empty
      if (postsToCheck.length === 0 && videos.length > 0) {
        postsToCheck = videos.map(v => ({
          _id: v._id,
          id: v.id,
          link_720p: v['720p_link'] || v.video_url2,
          link_480p: v['480p_link'] || v.video_url1,
          video_url: v.video_url,
          all_links: v.all_links,
          is_expired: v.is_expired,
          title: v.title,
        }));
      }

      if (postsToCheck.length === 0) {
        setIsCheckingExpired(false);
        toast.info('No videos available to check.');
        return;
      }

      setCheckProgress({
        total: postsToCheck.length,
        checked: 0,
        expiredCount: 0,
        recoveredCount: 0,
        newlyExpiredCount: 0,
        status: 'running',
        message: 'Opening 720p & 480p links in background HTML5 player (no-referrer)...',
      });

      // Run background HTML5 player verification with controlled concurrency
      const result = await batchCheckPostVideoLinks(
        postsToCheck,
        4,
        (progress) => {
          setCheckProgress(prev => ({
            ...prev,
            total: progress.total,
            checked: progress.checked,
            expiredCount: progress.expiredCount,
            recoveredCount: progress.recoveredCount,
            activeCount: progress.activeCount,
            message: `Verified ${progress.checked}/${progress.total} in HTML5 background player (${Math.round((progress.checked / Math.max(1, progress.total)) * 100)}%)`,
          }));
        },
        async (batch) => {
          // Sync batch with database in real time
          await fetch('/api/posts/mark-expired', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(batch),
          });
        },
        signal
      );

      if (!signal.aborted) {
        toast.success(`HTML5 verification complete: ${result.validIds.length} active links, ${result.expiredIds.length} expired (${result.recoveredCount} restored active)`);
        fetchExpiredStatus(true);
        fetchVideos(true);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        toast.error('Background link check notice: ' + (err.message || 'Error'));
      }
    } finally {
      setIsCheckingExpired(false);
      browserCheckAbortRef.current = null;
    }
  };

  const handleCancelCheckExpired = async () => {
    if (browserCheckAbortRef.current) {
      browserCheckAbortRef.current.abort();
      browserCheckAbortRef.current = null;
    }
    try {
      await fetch('/api/posts/check-expired/stop', { method: 'POST' });
    } catch {}
    setIsCheckingExpired(false);
    setCheckProgress(prev => ({ ...prev, status: 'cancelled', message: 'Scan cancelled by user' }));
    toast.info('Link check cancelled');
    fetchVideos(true);
    fetchExpiredStatus(true);
  };

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isCheckingExpired) {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    pollTimerRef.current = setInterval(() => {
      fetchCheckStatus();
    }, 3000);
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [isCheckingExpired]);

  // Check Duplicates Handler (Fast MongoDB aggregation)
  const handleCheckDuplicates = async () => {
    if (isViewingDuplicates) {
      setIsViewingDuplicates(false);
      setCurrentPage(1);
      toast.info('Showing all videos');
      return;
    }

    setIsCheckingDuplicates(true);
    try {
      const res = await fetch('/api/posts/duplicates');
      if (res.ok) {
        const json = await res.json();
        const pairs: DuplicatePair[] = json.pairs || [];
        setDuplicatePairs(pairs);

        const dupIds = new Set<string | number>();
        const reasons = new Map<string | number, string[]>();
        pairs.forEach(p => {
          const origId = p.original.id || p.original._id;
          const dupId = p.duplicate.id || p.duplicate._id;
          if (dupId) {
            dupIds.add(dupId);
            const list = reasons.get(dupId) || [];
            if (!list.includes(p.reason)) list.push(p.reason);
            reasons.set(dupId, list);
          }
          if (origId) {
            const list = reasons.get(origId) || [];
            if (!list.includes(p.reason)) list.push(p.reason);
            reasons.set(origId, list);
          }
        });

        setDuplicateIds(dupIds);
        setDuplicateReasonMap(reasons);
        setIsViewingDuplicates(true);
        setIsViewingExpired(false);
        setDupCurrentPage(1);
        setSelectedIds(new Set());

        if (pairs.length === 0) {
          toast.info('No duplicate videos detected in current collection.');
        } else {
          toast.success(`Found ${pairs.length} duplicate pairs. Showing side-by-side comparison.`);
        }
      } else {
        toast.error('Failed to run duplicate detection query');
      }
    } catch (e: any) {
      toast.error('Duplicate detection error: ' + (e.message || 'Error'));
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  // Delete Handlers
  const handleDelete = async (id: number | string) => {
    setIsDeleting(true);
    try {
      if (isDemoMode) {
        setVideos(prev => prev.filter(v => v.id !== id && (!v._id || v._id !== id)));
        setSelectedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        toast.success(`Demo Post #${id} removed`);
        return;
      }

      const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');

      setVideos(prev => prev.filter(v => v.id !== id && (!v._id || v._id !== id)));
      setDuplicatePairs(prev => prev.filter(p => (
        p.duplicate.id !== id && 
        (!p.duplicate._id || p.duplicate._id !== id) && 
        p.original.id !== id && 
        (!p.original._id || p.original._id !== id)
      )));
      setTotalFilteredCount(prev => Math.max(0, prev - 1));
      setTotalPostsCount(prev => Math.max(0, prev - 1));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });

      toast.success(`Post #${id} deleted from MongoDB & Supabase`);
      fetchOverviewStats();
    } catch (error: any) {
      toast.error('Failed to delete post: ' + (error.message || 'Unknown error'));
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setVideoToDelete(null);
      if (previewVideo && (previewVideo.id === id || previewVideo._id === id)) {
        setPreviewVideo(null);
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    const idsArray = Array.from(selectedIds);
    try {
      if (isDemoMode) {
        setVideos(prev => prev.filter(v => !selectedIds.has(v.id)));
        toast.success(`${selectedIds.size} demo posts removed`);
        setSelectedIds(new Set());
        return;
      }

      const res = await fetch('/api/posts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsArray }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete');

      setVideos(prev => prev.filter(v => !selectedIds.has(v.id) && !(v._id && selectedIds.has(v._id))));
      setDuplicatePairs(prev => prev.filter(p => 
        !selectedIds.has(p.duplicate.id) && 
        !(p.duplicate._id && selectedIds.has(p.duplicate._id)) &&
        !selectedIds.has(p.original.id) && 
        !(p.original._id && selectedIds.has(p.original._id))
      ));
      setTotalFilteredCount(prev => Math.max(0, prev - selectedIds.size));
      setTotalPostsCount(prev => Math.max(0, prev - selectedIds.size));

      toast.success(`${selectedIds.size} posts deleted from MongoDB & Supabase`);
      setSelectedIds(new Set());
      fetchOverviewStats();
      fetchVideos();
    } catch (error: any) {
      toast.error('Failed to delete selected posts: ' + (error.message || 'Unknown error'));
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setPreviewVideo(null);
    }
  };

  // Preview Drawer Handlers
  const openPreview = (video: ScrapedVideo) => {
    const preferredStream = (video['720p_link'] || video.video_url2) || 
                            (video['480p_link'] || video.video_url1) || 
                            video.video_url || 
                            (Array.isArray(video.all_links) && video.all_links[0]) || '';

    setPreviewVideo({ ...video });
    setActiveStreamUrl(preferredStream);
    setEditTitle(video.title);
    setEditStreamUrl(preferredStream);
    setEditThumbnailUrl(video.thumbnail_url || '');
    setIsEditingTitle(false);
    setIsEditingStreamUrl(false);
    setIsEditingThumbUrl(false);

    const targetId = video._id || video.id;
    if (targetId) {
      fetch(`/api/posts/${targetId}`)
        .then(res => res.ok ? res.json() : null)
        .then(resData => {
          if (resData && resData.data) {
            const doc = resData.data;
            const doc720 = doc['720p_link'] || doc.video_url2 || null;
            const doc480 = doc['480p_link'] || doc.video_url1 || null;
            const docFirstLink = Array.isArray(doc.all_links) && doc.all_links.length > 0 ? doc.all_links[0] : null;
            const docStream = doc.video_url || doc720 || doc480 || docFirstLink || '';

            setPreviewVideo(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                domain: doc.domain || prev.domain || (doc.post_url ? new URL(doc.post_url).hostname : null),
                duration: doc.duration || prev.duration || null,
                '720p_link': doc720 || prev['720p_link'],
                '480p_link': doc480 || prev['480p_link'],
                video_url: doc.video_url || docStream || prev.video_url,
                video_url1: doc480 || prev.video_url1,
                video_url2: doc720 || prev.video_url2,
                post_url: doc.post_url || prev.post_url,
                video_id: doc.video_id || prev.video_id,
                all_links: Array.isArray(doc.all_links) ? doc.all_links : prev.all_links,
              };
            });
          }
        })
        .catch(() => {});
    }
  };

  const handleSaveChanges = async () => {
    if (!previewVideo) return;
    setIsSaving(true);
    try {
      const targetId = previewVideo._id ? String(previewVideo._id) : (previewVideo.id ? String(previewVideo.id) : '');
      if (!targetId) throw new Error('Video identifier is missing');

      const res = await fetch(`/api/posts/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim() || previewVideo.title,
          video_url: editStreamUrl.trim() || previewVideo.video_url,
          thumbnail_url: editThumbnailUrl.trim() || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save changes');

      const updatedVideo: ScrapedVideo = {
        ...previewVideo,
        title: editTitle.trim() || previewVideo.title,
        video_url: editStreamUrl.trim() || previewVideo.video_url,
        thumbnail_url: editThumbnailUrl.trim() || null,
      };

      setVideos(prev => prev.map(post => {
        const isMatch = Boolean(
          (post._id && updatedVideo._id && String(post._id) === String(updatedVideo._id)) ||
          (post.id !== undefined && post.id !== null && updatedVideo.id !== undefined && updatedVideo.id !== null && String(post.id) === String(updatedVideo.id))
        );
        return isMatch ? { ...post, title: updatedVideo.title, video_url: updatedVideo.video_url, thumbnail_url: updatedVideo.thumbnail_url } : post;
      }));

      setPreviewVideo(updatedVideo);
      setActiveStreamUrl(updatedVideo.video_url);
      setIsEditingTitle(false);
      setIsEditingStreamUrl(false);
      setIsEditingThumbUrl(false);
      toast.success('Video details saved successfully');
    } catch (err: any) {
      toast.error('Failed to save changes: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateThumbnail = async () => {
    if (!previewVideo || isRegeneratingThumb) return;
    const streamUrl = editStreamUrl || activeStreamUrl || previewVideo.video_url;
    if (!streamUrl) {
      toast.error('No video stream URL available to generate thumbnail');
      return;
    }

    const abortController = new AbortController();
    thumbnailAbortRef.current = abortController;
    setIsRegeneratingThumb(true);
    toast.info('Downloading/processing video stream and analyzing aspect ratio...');

    try {
      const targetId = previewVideo._id ? String(previewVideo._id) : (previewVideo.id ? String(previewVideo.id) : '');
      const result = await generateMultiGridThumbnail(streamUrl, targetId, abortController.signal);

      if (result?.url) {
        setEditThumbnailUrl(result.url);
        const updatedVideo: ScrapedVideo = { ...previewVideo, thumbnail_url: result.url };
        setPreviewVideo(updatedVideo);

        setVideos(prev => prev.map(post => {
          const isMatch = Boolean(
            (post._id && updatedVideo._id && String(post._id) === String(updatedVideo._id)) ||
            (post.id !== undefined && post.id !== null && updatedVideo.id !== undefined && updatedVideo.id !== null && String(post.id) === String(updatedVideo.id))
          );
          return isMatch ? { ...post, thumbnail_url: result.url } : post;
        }));

        try {
          await fetch(`/api/posts/${targetId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thumbnail_url: result.url }),
          });
        } catch {}

        toast.success('16:9 thumbnail generated and uploaded to Cloudflare R2!');
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        toast.error('Failed to regenerate thumbnail: ' + (err.message || 'Stream processing error'));
      }
    } finally {
      setIsRegeneratingThumb(false);
      thumbnailAbortRef.current = null;
    }
  };

  const handleCancelThumbnailRegeneration = () => {
    if (thumbnailAbortRef.current) {
      thumbnailAbortRef.current.abort();
      thumbnailAbortRef.current = null;
    }
    setIsRegeneratingThumb(false);
    toast.info('Thumbnail generation cancelled');
  };

  const handleCopyUrl = (url: string, label: string = 'Video URL') => {
    if (!url) {
      toast.info(`No ${label.toLowerCase()} to copy`);
      return;
    }
    navigator.clipboard.writeText(url);
    toast.success(`${label} copied to clipboard`);
  };

  // Project Connection Settings Handlers
  const handleSaveCustomProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customUrl || !customKey) {
      toast.error('Both Supabase URL and Anon Key are required');
      return;
    }
    updateSupabaseConfig(customUrl, customKey);
    setSettingsModalOpen(false);
    toast.success('Supabase project configuration updated. Re-fetching tables...');
    fetchVideos(true);
  };

  const handleResetProject = () => {
    resetSupabaseConfig();
    setSettingsModalOpen(false);
    toast.success('Reset to default environment Supabase project');
    fetchVideos(true);
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(POSTS_SQL_SETUP);
    setCopiedSql(true);
    toast.success('SQL commands copied to clipboard');
    setTimeout(() => setCopiedSql(false), 2500);
  };

  // Selection toggles
  const toggleSelect = (id: number | string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    if (selectedIds.size === videos.length && videos.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map(v => v.id)));
    }
  };

  // Total pages calculation
  const totalPages = Math.max(1, Math.ceil(totalFilteredCount / pageSize));
  const totalDupPages = Math.max(1, Math.ceil(duplicatePairs.length / DUP_PAGE_SIZE));
  const paginatedDupPairs = useMemo(() => {
    const start = (dupCurrentPage - 1) * DUP_PAGE_SIZE;
    return duplicatePairs.slice(start, start + DUP_PAGE_SIZE);
  }, [duplicatePairs, dupCurrentPage]);

  // Derived available sources
  const availableSources = useMemo(() => {
    return domainSources.map(s => s.domain);
  }, [domainSources]);

  const domainCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    domainSources.forEach(s => {
      counts[s.domain] = s.count;
    });
    return counts;
  }, [domainSources]);

  const displayedVideos = useMemo(() => {
    return videos;
  }, [videos]);

  return (
    <div className="p-6 space-y-6">
      {/* Schema Cache Alert Notice if needed */}
      {schemaCacheError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-semibold text-amber-900">
                  Supabase Schema Sync Required (PGRST205)
                </h4>
                <p className="text-xs text-amber-800 mt-0.5">
                  PostgREST in project <code>{currentConfig.projectRef || 'Supabase'}</code> cannot find <code>public.posts</code>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setCustomUrl(currentConfig.url);
                  setCustomKey(currentConfig.anonKey);
                  setSettingsModalOpen(true);
                }}
                className="h-8 px-3 rounded-lg border border-amber-300 bg-white hover:bg-zinc-50 text-xs font-medium text-amber-900 inline-flex items-center gap-1.5 shadow-sm"
              >
                <Settings className="h-3.5 w-3.5" />
                <span>Switch Project</span>
              </button>
              <button
                type="button"
                onClick={handleCopySql}
                className="h-8 px-3 rounded-lg border border-amber-300 bg-white hover:bg-zinc-50 text-xs font-medium text-amber-900 inline-flex items-center gap-1.5 shadow-sm"
              >
                {copiedSql ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedSql ? 'Copied' : 'Copy SQL'}</span>
              </button>
              <button
                type="button"
                onClick={() => fetchVideos(true)}
                disabled={loading}
                className="h-8 px-3 rounded-lg bg-zinc-900 text-white hover:bg-black text-xs font-medium inline-flex items-center gap-1.5 shadow-sm"
              >
                <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>Retry</span>
              </button>
            </div>
          </div>
          <pre className="rounded-lg bg-zinc-900 text-zinc-100 p-3 font-mono text-[11px] overflow-x-auto">
            {POSTS_SQL_SETUP}
          </pre>
        </div>
      )}

      {/* Main Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">All Videos</h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Manage and preview videos stored in MongoDB primary collection (backed up to Supabase).
          </p>
        </div>

        {/* Right side of header: Search box + Sorting Dropdown + View Toggle */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            <input 
              type="text"
              placeholder="Search all videos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 sm:w-64 h-9 pl-9 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white shadow-sm placeholder:text-zinc-400 dark:placeholder:text-zinc-500 transition-colors"
            />
          </div>

          {/* Sorting Dropdown / Button with Dynamic Domains */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              className={`h-9 px-2.5 rounded-lg border bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium grid place-items-center shadow-sm transition-colors cursor-pointer ${
                sourceFilter !== 'all'
                  ? 'border-black dark:border-white text-black dark:text-white'
                  : 'border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300'
              }`}
              title="Sort order & Domain filter"
              aria-label="Sort and filter videos"
            >
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-arrow-up-down preview-icon shrink-0">
                  <path d="m21 16-4 4-4-4"/>
                  <path d="M17 20V4"/>
                  <path d="m3 8 4-4 4 4"/>
                  <path d="M7 4v16"/>
                </svg>
                {sourceFilter !== 'all' && (
                  <span className="max-w-[80px] truncate text-[11px] font-semibold">{sourceFilter}</span>
                )}
              </div>
            </button>

            {sortDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setSortDropdownOpen(false)} 
                />
                <div className="absolute right-0 mt-1.5 w-60 max-h-[380px] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xl z-50 p-1.5 text-xs animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Sort Order
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder('desc');
                      setSortDropdownOpen(false);
                      toast.success('Sorted: New to Old');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                      sortOrder === 'desc'
                        ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-black dark:text-white'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <span>New to Old</span>
                    {sortOrder === 'desc' && <Check className="h-3.5 w-3.5 text-black dark:text-white" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSortOrder('asc');
                      setSortDropdownOpen(false);
                      toast.success('Sorted: Old to New');
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                      sortOrder === 'asc'
                        ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-black dark:text-white'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <span>Old to New</span>
                    {sortOrder === 'asc' && <Check className="h-3.5 w-3.5 text-black dark:text-white" />}
                  </button>

                  <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />

                  <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Filter By Domain</span>
                    <span className="font-mono text-[9px] text-zinc-500">({availableSources.length})</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectDomain('all')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                      sourceFilter === 'all'
                        ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-black dark:text-white'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                  >
                    <span>All Domains (Default)</span>
                    <span className="font-mono text-[11px] text-zinc-500">{totalPostsCount}</span>
                  </button>

                  {availableSources.map((domain) => (
                    <button
                      key={domain}
                      type="button"
                      onClick={() => handleSelectDomain(domain)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                        sourceFilter === domain
                          ? 'bg-zinc-100 dark:bg-zinc-800 font-semibold text-black dark:text-white'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                      }`}
                    >
                      <span className="truncate max-w-[140px]" title={domain}>{domain}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-mono text-[11px] text-zinc-500">
                          {domainCounts[domain] || 0}
                        </span>
                        {sourceFilter === domain && <Check className="h-3.5 w-3.5 text-black dark:text-white" />}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* View Toggle */}
          <div className="flex items-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`h-8 w-8 rounded-md grid place-items-center transition-colors cursor-pointer ${
                viewMode === 'grid' 
                  ? 'bg-black dark:bg-white text-white dark:text-black' 
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
              title="Grid View"
            >
              <Grid2x2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`h-8 w-8 rounded-md grid place-items-center transition-colors cursor-pointer ${
                viewMode === 'list' 
                  ? 'bg-black dark:bg-white text-white dark:text-black' 
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white'
              }`}
              title="List View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 4 STAT CARDS */}
      <StatsCards
        totalPosts={totalPostsCount}
        activeTable={activeTable}
        totalViews={totalViewsCount}
        missingThumbnailCount={missingThumbnailCount}
        isViewingMissingThumbs={isViewingMissingThumbs}
        setIsViewingMissingThumbs={setIsViewingMissingThumbs}
        availableSources={availableSources}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        isViewingExpired={isViewingExpired}
        setIsViewingExpired={setIsViewingExpired}
        setIsViewingDuplicates={setIsViewingDuplicates}
        setCurrentPage={setCurrentPage}
        setSelectedIds={setSelectedIds}
        setSortDropdownOpen={setSortDropdownOpen}
        expiredCount={expiredCount}
      />

      {/* FILE MANAGER AREA */}
      <div id="my-files-card" className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm transition-colors">
        {/* Modular Toolbar */}
        <FileManagerToolbar
          isViewingExpired={isViewingExpired}
          setIsViewingExpired={setIsViewingExpired}
          isViewingDuplicates={isViewingDuplicates}
          setIsViewingDuplicates={setIsViewingDuplicates}
          sourceFilter={sourceFilter}
          setSourceFilter={setSourceFilter}
          totalFilteredCount={totalFilteredCount}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          selectAllFiltered={selectAllFiltered}
          setVideoToDelete={setVideoToDelete}
          setDeleteConfirmOpen={setDeleteConfirmOpen}
          handleCheckDuplicates={handleCheckDuplicates}
          isCheckingDuplicates={isCheckingDuplicates}
          duplicatePairs={duplicatePairs}
          handleCheckExpired={handleCheckExpired}
          handleCancelCheckExpired={handleCancelCheckExpired}
          isCheckingExpired={isCheckingExpired}
          checkProgress={checkProgress}
          setCurrentPage={setCurrentPage}
          clearDomainFilter={() => {
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('domain');
              return next;
            });
          }}
        />

        {/* Content Area */}
        <div className="p-4 bg-white dark:bg-black">
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
          ) : isViewingDuplicates ? (
            <DuplicateComparisonView
              duplicatePairs={duplicatePairs}
              paginatedDupPairs={paginatedDupPairs}
              dupCurrentPage={dupCurrentPage}
              setDupCurrentPage={setDupCurrentPage}
              totalDupPages={totalDupPages}
              DUP_PAGE_SIZE={DUP_PAGE_SIZE}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              openPreview={openPreview}
              setVideoToDelete={setVideoToDelete}
              setDeleteConfirmOpen={setDeleteConfirmOpen}
              setIsViewingDuplicates={setIsViewingDuplicates}
              setCurrentPage={setCurrentPage}
            />
          ) : videos.length === 0 ? (
            <div className="py-16 text-center">
              <div className="mx-auto h-12 w-12 rounded-xl bg-zinc-100 dark:bg-zinc-900 grid place-items-center mb-3 text-zinc-400 dark:text-zinc-500">
                {isViewingExpired ? <Link2Off className="h-6 w-6 text-amber-600 dark:text-amber-400" /> : <Film className="h-6 w-6" />}
              </div>
              <div className="text-sm font-medium text-black dark:text-white">
                {isViewingExpired ? 'No expired video links found' : 'No scraped posts found'}
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-sm mx-auto">
                {isViewingExpired 
                  ? 'All checked video streams are reachable or no expired links detected yet. Click "Check Exp" above to scan MongoDB URLs.' 
                  : `Posts added to table public.${activeTable} will appear here automatically.`}
              </p>
              {isViewingExpired && (
                <button
                  type="button"
                  onClick={() => {
                    setIsViewingExpired(false);
                    setCurrentPage(1);
                    setSelectedIds(new Set());
                  }}
                  className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-black dark:bg-white text-white dark:text-black hover:bg-zinc-900 dark:hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  Return to All Videos
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            /* GRID VIEW */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {displayedVideos.map((video: ScrapedVideo, idx: number) => (
                <VideoGridCard
                  key={video.id}
                  video={video}
                  isSelected={selectedIds.has(video.id)}
                  toggleSelect={toggleSelect}
                  openPreview={openPreview}
                  setContextMenu={setContextMenu}
                  duplicateReasonMap={duplicateReasonMap}
                  priority={idx < 4}
                />
              ))}
            </div>
          ) : (
            /* LIST VIEW */
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.size === videos.length && videos.length > 0}
                        onChange={selectAllFiltered}
                        className="rounded border-zinc-300 dark:border-zinc-700"
                      />
                    </th>
                    <th className="w-16 px-1 py-3">Thumb</th>
                    <th className="px-4 py-3">Video Title</th>
                    <th className="px-4 py-3">Views</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {displayedVideos.map((video: ScrapedVideo, idx: number) => (
                    <VideoListRow
                      key={video.id}
                      video={video}
                      isSelected={selectedIds.has(video.id)}
                      toggleSelect={toggleSelect}
                      openPreview={openPreview}
                      setVideoToDelete={setVideoToDelete}
                      setDeleteConfirmOpen={setDeleteConfirmOpen}
                      duplicateReasonMap={duplicateReasonMap}
                      priority={idx < 4}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isViewingDuplicates && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 px-2 text-xs text-zinc-500 dark:text-zinc-400">
              <div className="flex flex-wrap items-center gap-3">
                <span>Showing Page {currentPage} of {totalPages} ({totalFilteredCount.toLocaleString()} total posts)</span>
                <div className="flex items-center gap-1 border-l border-zinc-200 dark:border-zinc-800 pl-3">
                  <span className="text-[11px] text-zinc-400">Per page:</span>
                  {[12, 24, 36, 48].map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => {
                        setPageSize(size);
                        setCurrentPage(1);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        pageSize === size
                          ? 'bg-black text-white dark:bg-white dark:text-black font-semibold shadow-xs'
                          : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 grid place-items-center disabled:opacity-50 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="h-8 w-8 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 grid place-items-center disabled:opacity-50 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODULAR RIGHT PREVIEW DRAWER */}
      <VideoPreviewDrawer
        previewVideo={previewVideo}
        setPreviewVideo={setPreviewVideo}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        isEditingTitle={isEditingTitle}
        setIsEditingTitle={setIsEditingTitle}
        editStreamUrl={editStreamUrl}
        setEditStreamUrl={setEditStreamUrl}
        activeStreamUrl={activeStreamUrl}
        setActiveStreamUrl={setActiveStreamUrl}
        editThumbnailUrl={editThumbnailUrl}
        setEditThumbnailUrl={setEditThumbnailUrl}
        isEditingThumbUrl={isEditingThumbUrl}
        setIsEditingThumbUrl={setIsEditingThumbUrl}
        handleSaveChanges={handleSaveChanges}
        isSaving={isSaving}
        handleRegenerateThumbnail={handleRegenerateThumbnail}
        isRegeneratingThumb={isRegeneratingThumb}
        handleCancelThumbnailRegeneration={handleCancelThumbnailRegeneration}
        handleCopyUrl={handleCopyUrl}
        setVideoToDelete={setVideoToDelete}
        setDeleteConfirmOpen={setDeleteConfirmOpen}
      />

      {/* MODULAR CONTEXT MENU */}
      <ContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onPreview={openPreview}
        onCopyUrl={(url) => handleCopyUrl(url, 'Video URL')}
        onDelete={(video) => {
          setVideoToDelete(video._id || video.id);
          setDeleteConfirmOpen(true);
        }}
      />

      {/* MODULAR DELETE CONFIRMATION DIALOG */}
      <DeleteConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        videoToDelete={videoToDelete}
        selectedCount={selectedIds.size}
        activeTable={activeTable}
        isDeleting={isDeleting}
        onConfirm={() => videoToDelete ? handleDelete(videoToDelete) : handleBulkDelete()}
      />

      {/* MODULAR SUPABASE PROJECT SETTINGS MODAL */}
      <ProjectSettingsModal
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        currentConfig={currentConfig}
        activeTable={activeTable}
        customUrl={customUrl}
        setCustomUrl={setCustomUrl}
        customKey={customKey}
        setCustomKey={setCustomKey}
        onSave={handleSaveCustomProject}
        onReset={handleResetProject}
      />
    </div>
  );
}
