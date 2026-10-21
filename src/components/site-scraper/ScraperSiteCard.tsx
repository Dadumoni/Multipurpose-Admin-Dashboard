import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Globe, 
  ExternalLink, 
  RotateCw, 
  Clock, 
  Pause, 
  Play, 
  Square, 
  ArrowRight, 
  AlertCircle 
} from 'lucide-react';
import { format } from 'date-fns';
import { ScraperSiteInfo } from './types';

interface ScraperSiteCardProps {
  site: ScraperSiteInfo;
  busy: boolean;
  onRunNow: (siteId: string, siteName: string) => void;
  onFullScan: (siteId: string, siteName: string) => void;
  onStop: (siteId: string, siteName: string) => void;
  onRestart: (siteId: string, siteName: string) => void;
}

export default function ScraperSiteCard({
  site,
  busy,
  onRunNow,
  onFullScan,
  onStop,
  onRestart,
}: ScraperSiteCardProps) {
  const navigate = useNavigate();

  const isRunning = site.status === 'running';
  const isFullScanning = site.status === 'full_scanning';
  const isPostponed = site.status === 'postponed';
  const isStopped = !site.enabled || site.status === 'stopped';

  return (
    <div
      className={`rounded-lg border px-3.5 py-2.5 transition-all ${
        isRunning || isFullScanning
          ? 'border-emerald-500 ring-1 ring-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-950/10'
          : isPostponed
          ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/20'
          : isStopped
          ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40 opacity-75'
          : 'border-zinc-200 dark:border-zinc-850 bg-white dark:bg-zinc-950/50 hover:border-zinc-300 dark:hover:border-zinc-800'
      }`}
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Site Details */}
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-black dark:text-white flex items-center gap-1.5">
              <Globe className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{site.name}</span>
            </span>

            <a
              href={site.base_url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-zinc-400 hover:text-black dark:hover:text-white inline-flex items-center gap-0.5 font-mono"
              title="Open target website"
            >
              <span>{site.domain}</span>
              <ExternalLink className="h-2.5 w-2.5" />
            </a>

            {/* Status Badges */}
            {isRunning || isFullScanning ? (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1 animate-pulse">
                <RotateCw className="h-2.5 w-2.5 animate-spin" />
                <span>{isFullScanning ? 'Full Scanning' : 'Running'}</span>
              </span>
            ) : isPostponed ? (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 inline-flex items-center gap-1">
                <Clock className="h-2.5 w-2.5" />
                <span>Postponed</span>
              </span>
            ) : isStopped ? (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 inline-flex items-center gap-1">
                <Pause className="h-2.5 w-2.5" />
                <span>Stopped</span>
              </span>
            ) : null}
          </div>

          {/* Schedule, Last Scan, Next Scan, and New in Last Scan */}
          <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-zinc-400" />
              <span>Schedule: <strong className="font-medium text-zinc-700 dark:text-zinc-300">{site.cron_schedule}</strong></span>
            </span>
            <span className="text-zinc-300 dark:text-zinc-700">•</span>
            <span>
              Last Scan:{' '}
              <strong className="font-medium text-zinc-700 dark:text-zinc-300">
                {site.last_run_type === 'manual'
                  ? (site.last_run_at ? `Manual Run (${format(new Date(site.last_run_at), 'dd MMM, HH:mm')})` : 'Manual Run')
                  : (site.last_run_at ? format(new Date(site.last_run_at), 'dd MMM yyyy, HH:mm') : 'Never')}
              </strong>
            </span>
            {site.next_run_at && (
              <>
                <span className="text-zinc-300 dark:text-zinc-700">•</span>
                <span>
                  Next Scan: <strong className="font-medium text-zinc-700 dark:text-zinc-300">{format(new Date(site.next_run_at), 'dd MMM, HH:mm')}</strong>
                </span>
              </>
            )}
            <span className="text-zinc-300 dark:text-zinc-700">•</span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-mono text-[10px] font-semibold border border-emerald-200 dark:border-emerald-800/60">
              +{site.last_new_posts ?? 0} new
            </span>
          </div>
        </div>

        {/* Right side: Scraped Count & Responsive Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
          {/* Scraped count pill */}
          <button
            type="button"
            onClick={() => navigate(`/scraped?domain=${encodeURIComponent(site.domain)}#my-files-card`)}
            className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 flex items-center gap-1.5 text-xs font-mono shrink-0 cursor-pointer transition-all active:scale-95 group"
            title={`Click to view all ${site.domain} videos in My Files`}
          >
            <span className="text-zinc-400 text-[11px] group-hover:text-zinc-600 dark:group-hover:text-zinc-300">Scraped:</span>
            <span className="font-bold text-black dark:text-white group-hover:underline">
              {(site.total_scraped || 0).toLocaleString()}
            </span>
            <ArrowRight className="h-3 w-3 text-zinc-400 group-hover:text-black dark:group-hover:text-white transition-transform group-hover:translate-x-0.5" />
          </button>

          {/* Responsive Button 1: Stop or Restart */}
          {isStopped ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRestart(site.id, site.name)}
              className="h-8 px-2 sm:px-2.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Restart and enable scheduled scraping for this site"
            >
              <Play className="h-3 w-3 fill-current shrink-0" />
              <span className="hidden sm:inline">Restart</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => onStop(site.id, site.name)}
              className="h-8 px-2 sm:px-2.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Stop and pause scraping for this site"
            >
              <Square className="h-2.5 w-2.5 fill-current shrink-0" />
              <span className="hidden sm:inline">Stop</span>
            </button>
          )}

          {/* Responsive Button 2: Run Now */}
          <button
            type="button"
            disabled={busy || isRunning || isFullScanning}
            onClick={() => onRunNow(site.id, site.name)}
            className="h-8 px-2 sm:px-3 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-opacity cursor-pointer disabled:opacity-50"
            title="Execute incremental latest scan now (preserves next scheduled run)"
          >
            <RotateCw className={`h-3 w-3 shrink-0 ${isRunning || busy ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRunning ? 'Scanning...' : 'Run Now'}</span>
          </button>

          {/* Responsive Button 3: Full Scan */}
          <button
            type="button"
            disabled={busy || isRunning || isFullScanning}
            onClick={() => onFullScan(site.id, site.name)}
            className="h-8 px-2 sm:px-2.5 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Run Full Scan: Rescans entire site across all pages (postpones other scheduled scans by 12 hours until complete)"
          >
            <RotateCw className={`h-3 w-3 shrink-0 ${busy && isFullScanning ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Full Scan</span>
          </button>
        </div>
      </div>

      {/* Last error notice if present */}
      {site.last_error && (
        <div className="mt-2 p-2 rounded-lg border border-red-200 dark:border-red-950 bg-red-50/50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Error during last run: {site.last_error}</span>
        </div>
      )}
    </div>
  );
}
