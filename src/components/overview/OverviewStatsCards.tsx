import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Video, 
  Users, 
  Cloud, 
  Upload, 
  ImageOff,
  TrendingUp, 
  TrendingDown, 
  ArrowLeftRight 
} from 'lucide-react';

export interface TrendInfo {
  change: number;
  percent?: number;
  direction: 'increase' | 'decrease' | 'neutral';
  label: string;
}

export interface OverviewStatsData {
  totalVideos: number;
  totalViews: number;
  totalUploaded: number;
  totalR2Videos: number;
  missingThumbnail: number;
  videoSource?: number;
  videoTrend?: TrendInfo;
  viewsTrend?: TrendInfo;
}

interface OverviewStatsCardsProps {
  stats: OverviewStatsData;
}

export default function OverviewStatsCards({ stats }: OverviewStatsCardsProps) {
  const totalVideos = stats.totalVideos || 0;
  const totalViews = stats.totalViews || 0;
  const totalR2 = stats.totalR2Videos || 0;
  const totalTg = stats.totalUploaded || 0;
  const missingThumb = stats.missingThumbnail || 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {/* Card 1: Total Videos */}
      <Link 
        to="/scraped"
        className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-5 shadow-sm flex flex-col justify-between transition-all group"
        title="Click to view All Videos"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
            Total Videos
          </span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">
            <Video className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono group-hover:underline">
            {totalVideos.toLocaleString()}
          </div>
          
          {stats.videoTrend?.direction === 'increase' && (
            <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              <span>{stats.videoTrend.label}</span>
            </div>
          )}
          {stats.videoTrend?.direction === 'decrease' && (
            <div className="mt-1 flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
              <TrendingDown className="h-3.5 w-3.5 shrink-0" />
              <span>{stats.videoTrend.label}</span>
            </div>
          )}
          {(!stats.videoTrend || stats.videoTrend?.direction === 'neutral') && (
            <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>{stats.videoTrend?.label || 'In public.viralhub_db'}</span>
            </div>
          )}
        </div>
      </Link>

      {/* Card 2: Total Views */}
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Total Views</span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400">
            <Users className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
            {totalViews.toLocaleString()}
          </div>

          {stats.viewsTrend?.direction === 'increase' && (
            <div className="mt-1 flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" />
              <span>{stats.viewsTrend.label}</span>
            </div>
          )}
          {stats.viewsTrend?.direction === 'decrease' && (
            <div className="mt-1 flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
              <TrendingDown className="h-3.5 w-3.5 shrink-0" />
              <span>{stats.viewsTrend.label}</span>
            </div>
          )}
          {(!stats.viewsTrend || stats.viewsTrend?.direction === 'neutral') && (
            <div className="mt-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <ArrowLeftRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span>{stats.viewsTrend?.label || 'Total visitor views'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Cloudflare R2 Videos */}
      <Link
        to="/r2-videos"
        className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-5 shadow-sm flex flex-col justify-between transition-all group"
        title="Click to view Cloudflare R2 Videos"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
            Cloudflare R2
          </span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">
            <Cloud className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono group-hover:underline">
            {totalR2.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            In all_videos_db
          </div>
        </div>
      </Link>

      {/* Card 4: Telegram Uploaded */}
      <Link
        to="/uploaded"
        className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-5 shadow-sm flex flex-col justify-between transition-all group"
        title="Click to view Telegram Uploads"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Telegram Upload</span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">
            <Upload className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono group-hover:underline">
            {totalTg.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">In telegram_uploaded</div>
        </div>
      </Link>

      {/* Card 5: Missing Thumbnails */}
      <Link
        to="/scraped"
        className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-5 shadow-sm flex flex-col justify-between transition-all group"
        title="Click to view videos missing thumbnails"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">Missing Thumbnails</span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">
            <ImageOff className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-amber-600 dark:text-amber-400 font-mono group-hover:underline">
            {missingThumb.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Needs thumbnail generation</div>
        </div>
      </Link>
    </div>
  );
}
