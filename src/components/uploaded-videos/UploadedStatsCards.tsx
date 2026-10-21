import React from 'react';
import { Film, Cloud, HardDrive } from 'lucide-react';

interface UploadedStatsCardsProps {
  totalCount: number;
  zeroStorageCount: number;
  storageSizeStr: string;
}

export default function UploadedStatsCards({
  totalCount,
  zeroStorageCount,
  storageSizeStr,
}: UploadedStatsCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Stat 1: Total Uploaded */}
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
          <span>Total Uploaded Videos</span>
          <Film className="h-4 w-4 text-zinc-400" />
        </div>
        <div className="text-2xl font-bold font-mono text-black dark:text-white mt-2">
          {totalCount.toLocaleString()}
        </div>
        <div className="text-[11px] text-zinc-400 mt-1">
          Telegram forwarded & direct uploads
        </div>
      </div>

      {/* Stat 2: ZeroStorage Cached */}
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
          <span>ZeroStorage Cached</span>
          <Cloud className="h-4 w-4 text-emerald-500" />
        </div>
        <div className="text-2xl font-bold font-mono text-black dark:text-white mt-2">
          {zeroStorageCount.toLocaleString()}
        </div>
        <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
          Fast CDN stream ready
        </div>
      </div>

      {/* Stat 3: Storage Used */}
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-xs">
        <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
          <span>Storage Used</span>
          <HardDrive className="h-4 w-4 text-zinc-400" />
        </div>
        <div className="text-2xl font-bold font-mono text-black dark:text-white mt-2">
          {storageSizeStr}
        </div>
        <div className="text-[11px] text-zinc-400 mt-1">
          ZeroStorage infinite limit &bull; &infin;
        </div>
      </div>
    </div>
  );
}
