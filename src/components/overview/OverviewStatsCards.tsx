import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Video, 
  Users, 
  Database, 
  Upload, 
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
  mongoTotalVideos?: number;
  supabaseTotal?: number;
  totalViews: number;
  totalScraped: number;
  totalUploaded: number;
  videoTrend?: TrendInfo;
  viewsTrend?: TrendInfo;
}

interface OverviewStatsCardsProps {
  stats: OverviewStatsData;
}

export default function OverviewStatsCards({ stats }: OverviewStatsCardsProps) {
  const mongoCount = stats.mongoTotalVideos || stats.totalVideos || stats.totalScraped;
  const supabaseCount = stats.supabaseTotal || stats.totalScraped || 34369;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Card 1: Total Videos [MongoDB] */}
      <Link 
        to="/scraped"
        className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-5 shadow-sm flex flex-col justify-between transition-all group"
        title="Click to view All Videos"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
            Total Videos [MongoDB]
          </span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">
            <Video className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono group-hover:underline">
            {mongoCount.toLocaleString()}
          </div>
          
          {/* Dynamic Trend Indicator for TOTAL VIDEOS */}
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
              <span>{stats.videoTrend?.label || 'In MongoDB collection'}</span>
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
            {stats.totalViews.toLocaleString()}
          </div>

          {/* Dynamic Trend Indicator for TOTAL VIEWS */}
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
              <span>{stats.viewsTrend?.label || '0% from last month'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Card 3: Supabase Videos */}
      <Link
        to="/scraped"
        className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-5 shadow-sm flex flex-col justify-between transition-all group"
        title="Click to view all Supabase Videos"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase font-medium text-zinc-500 dark:text-zinc-400 tracking-wide">
            Supabase Videos
          </span>
          <div className="bg-zinc-100 dark:bg-zinc-900 rounded-md p-1.5 text-zinc-600 dark:text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-colors">
            <Database className="h-4 w-4" />
          </div>
        </div>
        <div className="mt-3">
          <div className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono group-hover:underline">
            {supabaseCount.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            In public.viralhub_db
          </div>
        </div>
      </Link>

      {/* Card 4: Telegram Upload */}
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
            {stats.totalUploaded.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Telegram bot uploads</div>
        </div>
      </Link>
    </div>
  );
}
