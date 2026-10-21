import React from 'react';
import { Layers } from 'lucide-react';
import ScraperSiteCard from './ScraperSiteCard';
import { ScraperSiteInfo } from './types';

interface ScraperSiteListProps {
  sites: ScraperSiteInfo[];
  actionInProgress: string | null;
  onRunNow: (siteId: string, siteName: string) => void;
  onFullScan: (siteId: string, siteName: string) => void;
  onStop: (siteId: string, siteName: string) => void;
  onRestart: (siteId: string, siteName: string) => void;
}

export default function ScraperSiteList({
  sites,
  actionInProgress,
  onRunNow,
  onFullScan,
  onStop,
  onRestart,
}: ScraperSiteListProps) {
  return (
    <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 sm:p-5 shadow-xs space-y-3">
      <div className="border-b border-zinc-100 dark:border-zinc-850 pb-2.5">
        <h2 className="text-sm font-bold text-black dark:text-white flex items-center gap-2">
          <Layers className="h-4 w-4" />
          <span>Target Site Scrapers</span>
        </h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
          Each website runs its dedicated background scraper on Koyeb (dual sync to MongoDB & Supabase).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {sites.map((site) => (
          <ScraperSiteCard
            key={site.id}
            site={site}
            busy={actionInProgress === site.id}
            onRunNow={onRunNow}
            onFullScan={onFullScan}
            onStop={onStop}
            onRestart={onRestart}
          />
        ))}
      </div>
    </div>
  );
}
