import React from 'react';
import { Film, Eye } from 'lucide-react';

interface R2StatsCardsProps {
  totalCount: number;
  totalViews: number;
}

export default function R2StatsCards({ totalCount, totalViews }: R2StatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xs">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500 uppercase tracking-wider">
          <span>Total R2 Videos</span>
          <Film className="h-4 w-4 text-zinc-400" />
        </div>
        <div className="mt-2 text-2xl font-bold font-mono text-black dark:text-white">
          {totalCount.toLocaleString()}
        </div>
        <div className="mt-1 text-xs text-zinc-400">
          Source: Supabase <code>all_videos_db</code>
        </div>
      </div>

      <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-xs">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500 uppercase tracking-wider">
          <span>Total Views</span>
          <Eye className="h-4 w-4 text-zinc-400" />
        </div>
        <div className="mt-2 text-2xl font-bold font-mono text-black dark:text-white">
          {totalViews.toLocaleString()}
        </div>
        <div className="mt-1 text-xs text-zinc-400">
          Aggregated across public video streams
        </div>
      </div>
    </div>
  );
}
