import React from 'react';
import { Globe, Pause, Play, RotateCw } from 'lucide-react';
import { EngineStatus } from './types';

interface ScraperHeaderProps {
  engineStatus: EngineStatus;
  handleToggleMaster: () => void;
  masterToggling: boolean;
  onRefresh: () => void;
}

export default function ScraperHeader({
  engineStatus,
  handleToggleMaster,
  masterToggling,
  onRefresh,
}: ScraperHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black dark:text-white flex items-center gap-2.5">
          <Globe className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          <span>Site Scraper</span>
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Automated scheduled crawlers for video domains with custom HTML parsing modules.
        </p>
      </div>

      {/* Engine Health Indicator & Animated Master Stop/Resume */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Indicator 1: Engine Status */}
        {engineStatus.online ? (
          engineStatus.is_running ? (
            <div 
              className="h-9 px-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-medium inline-flex items-center gap-2 shadow-xs"
              title={engineStatus.app_url ? `Connected to ${engineStatus.app_url}` : 'Scraper Engine is Online'}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Engine Running</span>
            </div>
          ) : (
            <div 
              className="h-9 px-3 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 text-xs font-medium inline-flex items-center gap-2 shadow-xs"
              title="Scraper process is currently paused by master switch"
            >
              <span className="h-2 w-2 rounded-full bg-amber-500"></span>
              <span>Scrapers Paused</span>
            </div>
          )
        ) : (
          <div 
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 text-xs font-medium inline-flex items-center gap-2 shadow-xs"
            title={engineStatus.configured ? 'External Koyeb scraper service is unreachable or asleep' : 'SCRAPER_APP_URL is not configured'}
          >
            <span className="h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-600"></span>
            <span>Engine {engineStatus.configured ? 'Sleeping/Offline' : 'Not Configured'}</span>
          </div>
        )}

        {/* Indicator 2: Master Stop/Resume Button */}
        {engineStatus.online && (
          engineStatus.is_running ? (
            <button
              type="button"
              onClick={handleToggleMaster}
              disabled={masterToggling}
              className="h-9 px-3.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer group disabled:opacity-50"
              title="Pause all site scrapers (service remains alive, stops scraping loop)"
            >
              <Pause className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 transition-transform group-hover:scale-110" />
              <span>Pause Scrapers</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleToggleMaster}
              disabled={masterToggling}
              className="h-9 px-3.5 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-all cursor-pointer group disabled:opacity-50 animate-pulse"
              title="Resume scraping across all enabled sites"
            >
              <Play className="h-3.5 w-3.5 fill-current transition-transform group-hover:scale-110" />
              <span>Resume Scrapers</span>
            </button>
          )
        )}

        {/* Refresh Action */}
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 w-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 inline-flex items-center justify-center shadow-xs transition-colors cursor-pointer"
          title="Refresh status and telemetry"
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
