import React, { useState, useEffect, useRef } from 'react';
import { 
  FileVideo, 
  X, 
  CheckCircle2, 
  AlertCircle, 
  UploadCloud, 
  Film, 
  ExternalLink,
  ChevronRight,
  Sparkles,
  Image as ImageIcon,
  Link2,
  Clock,
  RotateCw,
  Check,
  FileText
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/src/components/ui/dialog';
import { toast } from 'sonner';
import { getClientCache, setClientCache, invalidateClientCache, clearAllVideoCaches } from '@/src/lib/clientCache';
import axios from 'axios';

interface UploadQueueItem {
  id: string;
  name: string;
  extension: string;
  progress: number;
  status: 'uploading' | 'completed' | 'error' | 'cancelled';
  errorMessage?: string;
  abortController?: AbortController;
  videoUrl?: string;
  fileSizeStr?: string;
  uploadSpeed?: string;
  startTime?: number;
}

function FileFormatIcon({ extension }: { extension: string }) {
  const ext = (extension || 'MP4').toUpperCase().slice(0, 4);

  let badgeBg = 'bg-zinc-800 text-white';
  if (['MP4', 'MOV', 'WEBM'].includes(ext)) {
    badgeBg = 'bg-rose-500 text-white';
  } else if (['AVI', 'MKV'].includes(ext)) {
    badgeBg = 'bg-red-500 text-white';
  } else if (['JPG', 'JPEG', 'PNG'].includes(ext)) {
    badgeBg = 'bg-blue-500 text-white';
  } else if (['PDF'].includes(ext)) {
    badgeBg = 'bg-red-600 text-white';
  } else if (['EPS', 'SVG'].includes(ext)) {
    badgeBg = 'bg-amber-600 text-white';
  }

  return (
    <div className="relative w-8.5 h-10 shrink-0 bg-white dark:bg-zinc-800 rounded-xs border border-zinc-200 dark:border-zinc-700 shadow-2xs flex flex-col justify-between overflow-hidden">
      {/* Corner fold */}
      <div className="absolute top-0 right-0 w-2 h-2 bg-zinc-100 dark:bg-zinc-700 border-b border-l border-zinc-200 dark:border-zinc-600" />

      {/* Center file lines or video glyph */}
      <div className="flex-1 flex items-center justify-center pt-1.5">
        <FileVideo className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500" />
      </div>

      {/* Format label at bottom */}
      <div className={`h-3 w-full ${badgeBg} text-[7.5px] font-bold tracking-wider flex items-center justify-center leading-none uppercase`}>
        {ext}
      </div>
    </div>
  );
}

export default function UploadedVideos() {
  // Navigation Tabs: 'standard' (auto-generates FFmpeg thumbnail) vs 'manual' (without auto thumbnail)
  const [activeTab, setActiveTab] = useState<'standard' | 'manual'>('standard');

  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tab 2 (Manual Thumbnail Upload) States
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualDuration, setManualDuration] = useState('03:15');
  const [isDetectingDuration, setIsDetectingDuration] = useState(false);

  // Thumbnail Section States in Modal (2 sub-tabs: 'device' or 'url')
  const [thumbMode, setThumbMode] = useState<'device' | 'url'>('device');
  const [deviceImageFile, setDeviceImageFile] = useState<File | null>(null);
  const [deviceImagePreview, setDeviceImagePreview] = useState<string>('');
  const [pastedThumbUrl, setPastedThumbUrl] = useState('');
  const [isUploadingManual, setIsUploadingManual] = useState(false);
  const [manualUploadProgress, setManualUploadProgress] = useState(0);
  const [manualUploadSpeed, setManualUploadSpeed] = useState('');
  const [manualUploadStage, setManualUploadStage] = useState<string>('');

  const manualFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const manualAbortRef = useRef<AbortController | null>(null);

  // Load existing uploaded videos from MongoDB on initial mount with client cache
  const loadExistingVideos = async (forceRefresh = false) => {
    const cacheKey = 'uploaded_videos:list';
    if (!forceRefresh) {
      const cached = getClientCache<UploadQueueItem[]>(cacheKey);
      if (cached && Array.isArray(cached)) {
        setUploadQueue(cached);
        return;
      }
    } else {
      invalidateClientCache(cacheKey);
    }

    try {
      const res = await fetch('/api/uploaded-videos');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.data)) {
        const existingItems: UploadQueueItem[] = data.data.map((v: any) => {
          const ext = v.video_url?.split('.').pop()?.split('?')[0]?.toUpperCase() || 'MP4';
          const cleanTitle = v.title || 'video';
          const name = cleanTitle.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
            ? cleanTitle
            : `${cleanTitle}.${ext.toLowerCase()}`;
          return {
            id: v.id || v._id,
            name,
            extension: ext,
            progress: 100,
            status: 'completed',
            videoUrl: v.video_url,
            fileSizeStr: v.file_size || 'Video File',
          };
        });
        setUploadQueue(existingItems);
        setClientCache(cacheKey, existingItems);
      }
    } catch {
      // silent fallback
    }
  };

  useEffect(() => {
    loadExistingVideos();
  }, []);

  // Helper: auto-extract duration using browser HTML5 <video> element
  const extractVideoDuration = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      const objUrl = URL.createObjectURL(file);
      video.src = objUrl;

      const cleanUp = () => {
        try { URL.revokeObjectURL(objUrl); } catch {}
      };

      video.onloadedmetadata = () => {
        cleanUp();
        const sec = Math.floor(video.duration);
        if (isNaN(sec) || sec <= 0) {
          resolve('03:15');
          return;
        }
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const formatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        resolve(formatted);
      };

      video.onerror = () => {
        cleanUp();
        resolve('03:15');
      };

      setTimeout(() => {
        cleanUp();
        resolve('03:15');
      }, 4000);
    });
  };

  // =========================================================================
  // TAB 1: STANDARD UPLOAD (Auto-generates FFmpeg grid thumbnail on server)
  // =========================================================================
  const startUpload = async (file: File) => {
    const ext = file.name.split('.').pop()?.toUpperCase() || 'MP4';
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const title = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    const abortController = new AbortController();
    const fileSizeStr = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
    const startTime = Date.now();

    // Check file size (500 MB limit)
    if (file.size > 500 * 1024 * 1024) {
      const errorItem: UploadQueueItem = {
        id,
        name: file.name,
        extension: ext,
        progress: 0,
        status: 'error',
        errorMessage: 'File size exceeds 500 MB limit',
        fileSizeStr,
      };
      setUploadQueue((prev) => [errorItem, ...prev]);
      toast.error(`"${file.name}" exceeds 500 MB limit`);
      return;
    }

    const newItem: UploadQueueItem = {
      id,
      name: file.name,
      extension: ext,
      progress: 0,
      status: 'uploading',
      abortController,
      fileSizeStr,
      uploadSpeed: 'Starting...',
      startTime,
    };

    setUploadQueue((prev) => [newItem, ...prev]);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title);

      const uploadResponse = await axios.post('/api/upload', formData, {
        signal: abortController.signal,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.min(99, Math.round((progressEvent.loaded * 100) / progressEvent.total));
            const now = Date.now();
            const elapsedSec = Math.max(0.5, (now - startTime) / 1000);
            const speedMbps = ((progressEvent.loaded * 8) / (elapsedSec * 1000 * 1000)).toFixed(2);
            const speedStr = `${speedMbps} Mbps`;
            setUploadQueue((prev) =>
              prev.map((item) =>
                item.id === id
                  ? { ...item, progress: percent, uploadSpeed: speedStr }
                  : item
              )
            );
          }
        },
      });

      const uploadResult = uploadResponse.data;
      const directDownloadUrl = uploadResult.downloadUrl;
      const embedUrl = uploadResult.embedUrl;
      const fileId = uploadResult.fileId;
      const thumbnailUrl = uploadResult.thumbnailUrl || null;

      const res = await fetch('/api/uploaded-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description: 'Uploaded via Admin Dashboard',
          video_url: directDownloadUrl,
          thumbnail_url: thumbnailUrl,
          upload_type: 'upload',
          source: 'dashboard',
          file_size: fileSizeStr,
          duration: '03:15',
          file_id: fileId,
          metadata: {
            embed_url: embedUrl,
            file_id: fileId,
            file_hash: uploadResult.fileHash,
            thumbnail_url: thumbnailUrl,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save to database');
      }

      setUploadQueue((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, progress: 100, status: 'completed', videoUrl: directDownloadUrl, uploadSpeed: 'Completed' }
            : item
        )
      );

      clearAllVideoCaches();
      toast.success(`"${file.name}" uploaded successfully`);
    } catch (error: any) {
      if (
        abortController.signal.aborted ||
        error.name === 'CanceledError' ||
        error.message === 'canceled'
      ) {
        setUploadQueue((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: 'cancelled' } : item))
        );
        toast.info(`Upload of "${file.name}" cancelled`);
      } else {
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === id
              ? { ...item, status: 'error', errorMessage: error.message || 'Upload failed' }
              : item
          )
        );
        toast.error(error.message || `Failed to upload "${file.name}"`);
      }
    }
  };

  // =========================================================================
  // TAB 2: MANUAL THUMBNAIL UPLOAD (Modal, custom title, device/URL thumbnail)
  // =========================================================================
  const handleSelectManualVideo = async (file: File) => {
    if (file.size > 500 * 1024 * 1024) {
      toast.error(`"${file.name}" exceeds 500 MB limit`);
      return;
    }

    const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    setManualFile(file);
    setManualTitle(cleanTitle);
    setManualDuration('03:15');
    setDeviceImageFile(null);
    setDeviceImagePreview('');
    setPastedThumbUrl('');
    setThumbMode('device');
    setManualUploadProgress(0);
    setManualUploadSpeed('');
    setManualUploadStage('');
    setIsUploadingManual(false);
    setManualModalOpen(true);

    // Auto extract duration in browser
    setIsDetectingDuration(true);
    try {
      const dur = await extractVideoDuration(file);
      setManualDuration(dur);
    } catch {
      // fallback
    } finally {
      setIsDetectingDuration(false);
    }
  };

  const handleDeviceImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const imgFile = e.target.files[0];
      if (imgFile.size > 20 * 1024 * 1024) {
        toast.error('Thumbnail image size must be under 20 MB');
        return;
      }
      setDeviceImageFile(imgFile);
      const url = URL.createObjectURL(imgFile);
      setDeviceImagePreview(url);
    }
  };

  const handleManualUploadSubmit = async () => {
    if (!manualFile) {
      toast.error('No video file selected');
      return;
    }
    if (!manualTitle.trim()) {
      toast.error('Please enter a video title');
      return;
    }

    const abortController = new AbortController();
    manualAbortRef.current = abortController;
    setIsUploadingManual(true);
    setManualUploadProgress(0);
    const startTime = Date.now();
    const ext = manualFile.name.split('.').pop()?.toUpperCase() || 'MP4';
    const queueId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const fileSizeStr = `${(manualFile.size / (1024 * 1024)).toFixed(1)} MB`;

    const queueItem: UploadQueueItem = {
      id: queueId,
      name: manualFile.name,
      extension: ext,
      progress: 0,
      status: 'uploading',
      abortController,
      fileSizeStr,
      uploadSpeed: 'Starting...',
      startTime,
    };
    setUploadQueue((prev) => [queueItem, ...prev]);

    try {
      let finalThumbnailUrl: string | null = null;

      // 1. Upload thumbnail to Cloudflare R2 if selected from device
      if (thumbMode === 'device' && deviceImageFile) {
        setManualUploadStage('Uploading thumbnail to Cloudflare R2...');
        const thumbFormData = new FormData();
        thumbFormData.append('file', deviceImageFile);

        const imgRes = await axios.post('/api/upload/image', thumbFormData, {
          signal: abortController.signal,
        });
        if (imgRes.data?.url) {
          finalThumbnailUrl = imgRes.data.url;
        }
      } else if (thumbMode === 'url' && pastedThumbUrl.trim()) {
        // Direct external link to save in database
        finalThumbnailUrl = pastedThumbUrl.trim();
      }

      // 2. Upload video file to ZeroStorage via /api/upload
      setManualUploadStage('Uploading video to ZeroStorage...');
      const videoFormData = new FormData();
      videoFormData.append('file', manualFile);
      videoFormData.append('title', manualTitle.trim());
      videoFormData.append('skipThumbnail', 'true');
      if (finalThumbnailUrl) {
        videoFormData.append('thumbnailUrl', finalThumbnailUrl);
      }

      const uploadResponse = await axios.post('/api/upload', videoFormData, {
        signal: abortController.signal,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.min(99, Math.round((progressEvent.loaded * 100) / progressEvent.total));
            const now = Date.now();
            const elapsedSec = Math.max(0.5, (now - startTime) / 1000);
            const speedMbps = ((progressEvent.loaded * 8) / (elapsedSec * 1000 * 1000)).toFixed(2);
            const speedStr = `${speedMbps} Mbps`;
            setManualUploadProgress(percent);
            setManualUploadSpeed(speedStr);
            setUploadQueue((prev) =>
              prev.map((item) =>
                item.id === queueId
                  ? { ...item, progress: percent, uploadSpeed: speedStr }
                  : item
              )
            );
          }
        },
      });

      const uploadResult = uploadResponse.data;
      const directDownloadUrl = uploadResult.downloadUrl;
      const embedUrl = uploadResult.embedUrl;
      const fileId = uploadResult.fileId;
      const thumbToSave = finalThumbnailUrl || uploadResult.thumbnailUrl || null;

      // 3. Save to MongoDB database (/api/uploaded-videos)
      setManualUploadStage('Saving record to database...');
      const res = await fetch('/api/uploaded-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: manualTitle.trim(),
          description: 'Uploaded via Admin Dashboard (Custom Thumbnail)',
          video_url: directDownloadUrl,
          thumbnail_url: thumbToSave,
          upload_type: 'upload',
          source: 'dashboard',
          file_size: fileSizeStr,
          duration: manualDuration || '03:15',
          file_id: fileId,
          metadata: {
            embed_url: embedUrl,
            file_id: fileId,
            file_hash: uploadResult.fileHash,
            thumbnail_url: thumbToSave,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save to database');
      }

      setUploadQueue((prev) =>
        prev.map((item) =>
          item.id === queueId
            ? { ...item, progress: 100, status: 'completed', videoUrl: directDownloadUrl, uploadSpeed: 'Completed' }
            : item
        )
      );

      clearAllVideoCaches();
      toast.success(`"${manualTitle.trim()}" uploaded successfully!`);
      setManualModalOpen(false);
      setManualFile(null);
    } catch (error: any) {
      if (
        abortController.signal.aborted ||
        error.name === 'CanceledError' ||
        error.message === 'canceled'
      ) {
        setUploadQueue((prev) =>
          prev.map((item) => (item.id === queueId ? { ...item, status: 'cancelled' } : item))
        );
        toast.info('Upload cancelled');
      } else {
        setUploadQueue((prev) =>
          prev.map((item) =>
            item.id === queueId
              ? { ...item, status: 'error', errorMessage: error.message || 'Upload failed' }
              : item
          )
        );
        toast.error(error.message || 'Failed to upload video');
      }
    } finally {
      setIsUploadingManual(false);
      manualAbortRef.current = null;
    }
  };

  const handleFiles = (files: FileList | File[]) => {
    if (activeTab === 'manual') {
      if (files.length > 0) {
        handleSelectManualVideo(files[0]);
      }
    } else {
      Array.from(files).forEach((file) => {
        startUpload(file);
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  const cancelUpload = (id: string) => {
    const item = uploadQueue.find((q) => q.id === id);
    if (item?.abortController) {
      item.abortController.abort();
    }
    setUploadQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, status: 'cancelled' } : q))
    );
  };

  const removeUpload = (id: string) => {
    setUploadQueue((prev) => prev.filter((q) => q.id !== id));
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* 2 MAIN TABS HEADER */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 gap-2 pb-0">
        <button
          type="button"
          onClick={() => setActiveTab('standard')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all cursor-pointer border-b-2 -mb-px ${
            activeTab === 'standard'
              ? 'border-black dark:border-white text-black dark:text-white bg-zinc-50 dark:bg-zinc-900/60 shadow-2xs'
              : 'border-transparent text-zinc-500 hover:text-black dark:hover:text-white'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span>Standard Upload (Auto Thumbnail)</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl transition-all cursor-pointer border-b-2 -mb-px ${
            activeTab === 'manual'
              ? 'border-black dark:border-white text-black dark:text-white bg-zinc-50 dark:bg-zinc-900/60 shadow-2xs'
              : 'border-transparent text-zinc-500 hover:text-black dark:hover:text-white'
          }`}
        >
          <ImageIcon className="h-4 w-4" />
          <span>Upload Without Auto Thumbnail</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* TAB 1: STANDARD UPLOAD (Auto-generates FFmpeg multi-grid thumbnail) */}
        {activeTab === 'standard' && (
          <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm transition-colors">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black dark:text-white flex items-center gap-2">
                  <span>Upload Files</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    Auto Thumbnail
                  </span>
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  Upload video files directly to ZeroStorage (Automatically generates FFmpeg multi-frame grid thumbnail)
                </p>
              </div>
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 sm:p-12 flex flex-col items-center justify-center text-center min-h-[260px] cursor-pointer transition-all ${
                dragOver
                  ? 'border-black dark:border-white bg-zinc-50 dark:bg-zinc-900/50 scale-[0.99]'
                  : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50/40 dark:bg-zinc-950/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/30'
              }`}
            >
              <div className="text-zinc-400 dark:text-zinc-500 mb-2">
                <svg className="w-16 h-12" viewBox="0 0 64 48" fill="currentColor">
                  <path d="M48 20c-0.3 0-0.6 0-0.9 0.1C45.3 12.8 39.2 8 32 8c-8.8 0-16 7.2-16 16 0 0.7 0.1 1.4 0.2 2-6.8 0.6-12.2 6.3-12.2 13.3 0 7.4 6 13.4 13.4 13.4H48c6.6 0 12-5.4 12-12s-5.4-12-12-12z" />
                  <path d="M32 20l-8 8h5v11h6V28h5l-8-8z" className="text-white dark:text-black fill-current" />
                </svg>
              </div>

              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mt-1">
                Drag and drop your video files here
              </p>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 my-2 font-medium">
                - OR -
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="mt-1 bg-black hover:bg-zinc-900 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black font-medium px-6 py-2.5 rounded-lg text-sm transition-colors shadow-sm cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <UploadCloud className="h-4 w-4" />
                <span>Browse Files</span>
              </button>

              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-3">
                Supports MP4, MOV, WEBM, MKV, AVI (Max 500 MB per file)
              </span>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="video/*"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>
          </div>
        )}

        {/* TAB 2: UPLOAD WITHOUT AUTO THUMBNAIL (Custom Title & Manual Thumbnail) */}
        {activeTab === 'manual' && (
          <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm transition-colors">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black dark:text-white flex items-center gap-2">
                  <span>Upload Video Without Auto Thumbnail</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Custom Title & Thumbnail
                  </span>
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                  Upload video to ZeroStorage with a custom editable title and your own thumbnail image (Device upload to R2 or direct Link)
                </p>
              </div>
            </div>

            {/* Drag & Drop Area for Manual Upload */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => manualFileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 sm:p-12 flex flex-col items-center justify-center text-center min-h-[260px] cursor-pointer transition-all ${
                dragOver
                  ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-950/20 scale-[0.99]'
                  : 'border-zinc-300 dark:border-zinc-700 bg-zinc-50/40 dark:bg-zinc-950/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/30'
              }`}
            >
              <div className="text-emerald-600 dark:text-emerald-400 mb-2">
                <ImageIcon className="w-14 h-14 stroke-[1.5]" />
              </div>

              <p className="text-sm font-semibold text-black dark:text-white mt-1">
                Select or drop video file to configure title & thumbnail
              </p>
              <span className="text-xs text-zinc-400 dark:text-zinc-500 my-2 font-medium">
                - OR -
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  manualFileInputRef.current?.click();
                }}
                className="mt-1 bg-black hover:bg-zinc-900 text-white dark:bg-white dark:hover:bg-zinc-100 dark:text-black font-medium px-6 py-2.5 rounded-lg text-sm transition-colors shadow-sm cursor-pointer inline-flex items-center justify-center gap-2"
              >
                <UploadCloud className="h-4 w-4" />
                <span>Select Video File</span>
              </button>

              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-3">
                Selecting video will open configuration modal with duration and thumbnail options
              </span>

              <input
                ref={manualFileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleSelectManualVideo(e.target.files[0]);
                    e.target.value = '';
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* CARD B: Uploaded Files (Directly BELOW the Upload Files card) */}
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 shadow-sm transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-black dark:text-white">
                Uploaded Files
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Manage your active uploads and uploaded library
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300">
              {uploadQueue.length} files
            </span>
          </div>

          {uploadQueue.length === 0 ? (
            <div className="border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl p-10 text-center text-xs text-zinc-400 dark:text-zinc-500 flex flex-col items-center justify-center min-h-[180px]">
              <FileVideo className="w-10 h-10 text-zinc-300 dark:text-zinc-600 mb-2.5 stroke-1" />
              <span className="font-medium text-zinc-600 dark:text-zinc-400">No files uploaded yet</span>
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                Drop video files above or select files to begin uploading
              </span>
            </div>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {uploadQueue.map((item) => (
                <div
                  key={item.id}
                  className="border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black rounded-xl p-4 shadow-2xs hover:border-zinc-300 dark:hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <FileFormatIcon extension={item.extension} />

                    <div className="flex-1 min-w-0">
                      {/* File Name & Status / Cancel button */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-xs sm:text-sm font-semibold">
                          {item.status === 'error' ? (
                            <span className="text-red-500 font-medium">
                              {item.errorMessage || 'File size exceeds limit'}
                            </span>
                          ) : (
                            <span className="text-black dark:text-white truncate">
                              {item.name}
                            </span>
                          )}
                        </div>

                        {/* Status / Cross (X) icon to cancel active uploads */}
                        <div className="shrink-0 flex items-center gap-2">
                          {item.status === 'uploading' && (
                            <button
                              type="button"
                              onClick={() => cancelUpload(item.id)}
                              className="h-7 w-7 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/60 transition-colors grid place-items-center cursor-pointer"
                              title="Cancel upload"
                              aria-label="Cancel upload"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}

                          {item.status === 'completed' && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Completed</span>
                            </span>
                          )}

                          {item.status === 'cancelled' && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                Cancelled
                              </span>
                              <button
                                type="button"
                                onClick={() => removeUpload(item.id)}
                                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          )}

                          {item.status === 'error' && (
                            <button
                              type="button"
                              onClick={() => removeUpload(item.id)}
                              className="text-xs text-red-500 hover:text-red-600 font-medium cursor-pointer"
                            >
                              Dismiss
                            </button>
                          )}
                        </div>
                      </div>

                      {/* File Details: Size, Speed, Percentage */}
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {item.fileSizeStr && (
                          <span>{item.fileSizeStr}</span>
                        )}
                        {item.status === 'uploading' && item.uploadSpeed && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-zinc-700 dark:text-zinc-300">{item.uploadSpeed}</span>
                          </>
                        )}
                        <span>•</span>
                        <span className="font-mono font-medium text-black dark:text-white">
                          {item.progress}%
                        </span>
                      </div>

                      {/* Progress Bar with Clear Dynamic Feedback */}
                      <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-2.5">
                        {item.status === 'error' ? (
                          <div className="h-full bg-red-500 rounded-full w-4" />
                        ) : (
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              item.status === 'completed'
                                ? 'bg-emerald-500'
                                : 'bg-black dark:bg-white'
                            }`}
                            style={{ width: `${item.progress}%` }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL: Upload Video Without Auto Thumbnail (Custom Title & Thumbnail)     */}
      {/* ========================================================================= */}
      <Dialog 
        open={manualModalOpen} 
        onOpenChange={(open) => {
          if (!isUploadingManual) {
            setManualModalOpen(open);
            if (!open) setManualFile(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[560px] max-h-[92vh] overflow-y-auto bg-white dark:bg-black text-black dark:text-white rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-black dark:text-white flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-emerald-600" />
              <span>Upload Video (Custom Thumbnail)</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Configure video title and thumbnail before uploading to ZeroStorage.
            </DialogDescription>
          </DialogHeader>

          {manualFile && (
            <div className="space-y-4.5 mt-2">
              {/* Selected Video Info Card */}
              <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="h-9 w-9 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 grid place-items-center shrink-0">
                    <FileVideo className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-black dark:text-white truncate" title={manualFile.name}>
                      {manualFile.name}
                    </div>
                    <div className="text-[11px] text-zinc-500 flex items-center gap-2 mt-0.5">
                      <span>{(manualFile.size / (1024 * 1024)).toFixed(1)} MB</span>
                      <span>•</span>
                      <span className="font-mono uppercase">{manualFile.name.split('.').pop()}</span>
                    </div>
                  </div>
                </div>

                {/* Auto Extracted Duration Badge */}
                <div className="shrink-0 flex items-center gap-1.5 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 rounded-lg">
                  <Clock className="h-3.5 w-3.5 text-zinc-400" />
                  <span className="font-mono text-xs font-semibold text-black dark:text-white">
                    {isDetectingDuration ? 'Detecting...' : manualDuration}
                  </span>
                </div>
              </div>

              {/* Video Title Input (Pre-filled and Editable) */}
              <div>
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 block mb-1">
                  Video Title (Editable)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    disabled={isUploadingManual}
                    placeholder="Enter video title..."
                    className="w-full h-9.5 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white text-xs font-medium focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white shadow-xs"
                  />
                </div>
                <p className="text-[10px] text-zinc-400 mt-1">
                  This title will be saved in MongoDB and displayed across all views.
                </p>
              </div>

              {/* Thumbnail Upload Section (2 Tabs: Device or Link) */}
              <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 bg-zinc-50/50 dark:bg-zinc-950/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Video Thumbnail Image
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    {thumbMode === 'device' ? 'Uploads to Cloudflare R2' : 'Direct Image Link'}
                  </span>
                </div>

                {/* Thumbnail Sub-Tabs */}
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-900 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setThumbMode('device')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      thumbMode === 'device'
                        ? 'bg-white dark:bg-black text-black dark:text-white shadow-2xs font-semibold'
                        : 'text-zinc-500 hover:text-black dark:hover:text-white'
                    }`}
                  >
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>Upload from Device</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setThumbMode('url')}
                    className={`py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      thumbMode === 'url'
                        ? 'bg-white dark:bg-black text-black dark:text-white shadow-2xs font-semibold'
                        : 'text-zinc-500 hover:text-black dark:hover:text-white'
                    }`}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span>Paste Link</span>
                  </button>
                </div>

                {/* SUB-TAB A: Upload From Device */}
                {thumbMode === 'device' && (
                  <div className="space-y-2.5">
                    {deviceImagePreview ? (
                      <div className="relative aspect-video rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
                        <img 
                          src={deviceImagePreview} 
                          alt="Thumbnail Preview" 
                          className="w-full h-full object-cover" 
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setDeviceImageFile(null);
                            setDeviceImagePreview('');
                          }}
                          className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/75 hover:bg-black text-white grid place-items-center cursor-pointer transition-colors"
                          title="Remove thumbnail"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
                          {deviceImageFile?.name} ({(Number(deviceImageFile?.size) / (1024 * 1024)).toFixed(2)} MB)
                        </div>
                      </div>
                    ) : (
                      <div
                        onClick={() => imageFileInputRef.current?.click()}
                        className="border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-600 rounded-lg p-5 text-center cursor-pointer bg-white dark:bg-black transition-colors"
                      >
                        <ImageIcon className="h-8 w-8 text-zinc-400 mx-auto mb-1.5 stroke-[1.5]" />
                        <span className="text-xs font-medium text-black dark:text-white block">
                          Click to select thumbnail image from computer
                        </span>
                        <span className="text-[10px] text-zinc-400 mt-0.5 block">
                          Supports JPG, PNG, WEBP (Uploaded directly to Cloudflare R2)
                        </span>
                      </div>
                    )}

                    <input
                      ref={imageFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleDeviceImageChange}
                    />
                  </div>
                )}

                {/* SUB-TAB B: Paste Link */}
                {thumbMode === 'url' && (
                  <div className="space-y-2.5">
                    <input
                      type="url"
                      value={pastedThumbUrl}
                      onChange={(e) => setPastedThumbUrl(e.target.value)}
                      placeholder="https://example.com/images/thumbnail.jpg"
                      disabled={isUploadingManual}
                      className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white shadow-xs"
                    />

                    {pastedThumbUrl.trim() && (
                      <div className="relative aspect-video rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
                        <img 
                          src={pastedThumbUrl.trim()} 
                          alt="Pasted Thumbnail Preview" 
                          className="w-full h-full object-cover" 
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
                          External Image URL
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Live Upload Progress Feedback inside Modal */}
              {isUploadingManual && (
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-black dark:text-white flex items-center gap-1.5">
                      <RotateCw className="h-3.5 w-3.5 animate-spin text-emerald-600" />
                      <span>{manualUploadStage || 'Uploading video to ZeroStorage...'}</span>
                    </span>
                    <span className="font-mono text-zinc-500">
                      {manualUploadSpeed || `${manualUploadProgress}%`}
                    </span>
                  </div>

                  <div className="h-2 w-full bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-600 rounded-full transition-all duration-300" 
                      style={{ width: `${Math.max(5, manualUploadProgress)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-900">
            <button
              type="button"
              disabled={isUploadingManual}
              onClick={() => {
                setManualModalOpen(false);
                setManualFile(null);
              }}
              className="h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 shadow-xs cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isUploadingManual || !manualTitle.trim()}
              onClick={handleManualUploadSubmit}
              className="h-9 px-5 rounded-lg bg-black dark:bg-white text-white dark:text-black text-xs font-semibold hover:opacity-90 transition-opacity shadow-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isUploadingManual ? (
                <>
                  <RotateCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Uploading ({manualUploadProgress}%)...</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" />
                  <span>Upload to ZeroStorage</span>
                </>
              )}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
