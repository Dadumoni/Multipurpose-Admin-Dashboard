import React, { useState, useEffect } from 'react';
import { 
  Globe, 
  RotateCw, 
  Play, 
  Square, 
  Clock, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle2, 
  Terminal, 
  Layers,
  ArrowUpRight,
  ShieldCheck,
  Pause
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ScraperSiteInfo {
  id: string;
  name: string;
  domain: string;
  base_url: string;
  cron_schedule: string;
  enabled: boolean;
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped';
  total_scraped: number;
  failed_count: number;
  last_run_at: string | null;
  next_run_at: string | null;
  last_error: string | null;
}

export default function SiteScraper() {
  const [sites, setSites] = useState<ScraperSiteInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/scrapers');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.sites)) {
          setSites(data.sites);
        }
      }
    } catch (err: any) {
      console.warn('Failed to fetch scraper sites:', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSites();
    const interval = setInterval(fetchSites, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleRunNow = async (siteId: string, siteName: string) => {
    setActionInProgress(siteId);
    try {
      const res = await fetch(`/api/scrapers/${siteId}/run`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Scraper started for "${siteName}". Check logs for progress.`);
        fetchSites();
      } else {
        toast.error(data.error || 'Failed to trigger scraper run');
      }
    } catch (err: any) {
      toast.error('Network error triggering scraper: ' + err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStop = async (siteId: string, siteName: string) => {
    setActionInProgress(siteId);
    try {
      const res = await fetch(`/api/scrapers/${siteId}/stop`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.info(`Scraper paused and stopped for "${siteName}"`);
        fetchSites();
      } else {
        toast.error(data.error || 'Failed to stop scraper');
      }
    } catch (err: any) {
      toast.error('Network error stopping scraper: ' + err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRestart = async (siteId: string, siteName: string) => {
    setActionInProgress(siteId);
    try {
      const res = await fetch(`/api/scrapers/${siteId}/start`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Scraper enabled and restarted for "${siteName}"`);
        fetchSites();
      } else {
        toast.error(data.error || 'Failed to restart scraper');
      }
    } catch (err: any) {
      toast.error('Network error restarting scraper: ' + err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  const totalScrapedAll = sites.reduce((acc, curr) => acc + (curr.total_scraped || 0), 0);
  const totalFailedAll = sites.reduce((acc, curr) => acc + (curr.failed_count || 0), 0);
  const activeCount = sites.filter((s) => s.enabled).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
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

        <div className="flex items-center gap-2">
          <Link
            to="/logs"
            className="h-9 px-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Terminal className="h-4 w-4" />
            <span>Terminal Logs</span>
          </Link>
          <button
            type="button"
            onClick={fetchSites}
            className="h-9 px-3.5 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs transition-opacity cursor-pointer"
          >
            <RotateCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <span>Configured Sites</span>
            <Globe className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-black dark:text-white">
            {sites.length}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {activeCount} active • {sites.length - activeCount} paused
          </div>
        </div>

        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <span>Total Posts Scraped</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-black dark:text-white">
            {totalScrapedAll.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Saved to MongoDB collection <code>posts</code>
          </div>
        </div>

        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <span>Failed Extractions</span>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </div>
          <div className={`mt-2 text-2xl font-bold font-mono ${totalFailedAll > 0 ? 'text-red-600 dark:text-red-400' : 'text-black dark:text-white'}`}>
            {totalFailedAll.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Reported stream parse errors
          </div>
        </div>
      </div>

      {/* Main Scrapers List */}
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-850 pb-3">
          <div>
            <h2 className="text-base font-bold text-black dark:text-white flex items-center gap-2">
              <Layers className="h-4.5 w-4.5" />
              <span>Target Site Scrapers</span>
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Each website runs its dedicated parser module in <code>src/server/scrapers/</code>.
            </p>
          </div>
          <span className="text-xs font-mono font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded">
            Scheduled Nightly (00:00)
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-400 animate-pulse">
            Loading scraper modules...
          </div>
        ) : sites.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            No scrapers configured.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {sites.map((site) => {
              const isRunning = site.status === 'running';
              const isStopped = !site.enabled || site.status === 'stopped';
              const busy = actionInProgress === site.id;

              return (
                <div
                  key={site.id}
                  className={`rounded-xl border p-4 sm:p-5 transition-all ${
                    isRunning
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/10 dark:bg-emerald-950/10'
                      : isStopped
                      ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-950/40 opacity-80'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black'
                  }`}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Site Details */}
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-base font-bold text-black dark:text-white flex items-center gap-1.5">
                          <Globe className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
                          <span>{site.name}</span>
                        </span>

                        <a
                          href={site.base_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-zinc-400 hover:text-black dark:hover:text-white inline-flex items-center gap-0.5 font-mono"
                          title="Open target website"
                        >
                          <span>{site.domain}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>

                        {/* Status Badge */}
                        {isRunning ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1 animate-pulse">
                            <RotateCw className="h-3 w-3 animate-spin" />
                            <span>Running Scan</span>
                          </span>
                        ) : isStopped ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800 inline-flex items-center gap-1">
                            <Pause className="h-3 w-3" />
                            <span>Stopped</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800 inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>Active (00:00)</span>
                          </span>
                        )}
                      </div>

                      {/* Schedule and Last Run */}
                      <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3.5 w-3.5 text-zinc-400" />
                          <span>Schedule: <strong>{site.cron_schedule}</strong></span>
                        </span>
                        <span>•</span>
                        <span>
                          Last Run: {site.last_run_at ? format(new Date(site.last_run_at), 'dd MMM yyyy, HH:mm') : 'Never'}
                        </span>
                        {site.next_run_at && (
                          <>
                            <span>•</span>
                            <span>
                              Next: {format(new Date(site.next_run_at), 'dd MMM, 00:00')}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Stats Counter Badges */}
                    <div className="flex items-center gap-4 shrink-0 bg-zinc-50 dark:bg-zinc-950 p-3 rounded-xl border border-zinc-200 dark:border-zinc-850">
                      <div className="text-center px-2">
                        <div className="text-[10px] uppercase font-semibold text-zinc-400">Scraped</div>
                        <div className="text-base font-bold font-mono text-black dark:text-white">
                          {(site.total_scraped || 0).toLocaleString()}
                        </div>
                      </div>

                      <div className="h-6 w-px bg-zinc-200 dark:border-zinc-800" />

                      <div className="text-center px-2">
                        <div className="text-[10px] uppercase font-semibold text-zinc-400">Failed</div>
                        <div className={`text-base font-bold font-mono ${site.failed_count > 0 ? 'text-red-600 dark:text-red-400' : 'text-zinc-400'}`}>
                          {(site.failed_count || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Control Actions (Stop / Restart / Run Now) - No remove button */}
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Stop or Restart Button */}
                      {isStopped ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRestart(site.id, site.name)}
                          className="h-8.5 px-3 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          title="Restart and enable scheduled scraping for this site"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>Restart</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleStop(site.id, site.name)}
                          className="h-8.5 px-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          title="Stop and pause scraping for this site"
                        >
                          <Square className="h-3 w-3 fill-current" />
                          <span>Stop</span>
                        </button>
                      )}

                      {/* Run Now Trigger */}
                      <button
                        type="button"
                        disabled={busy || isRunning}
                        onClick={() => handleRunNow(site.id, site.name)}
                        className="h-8.5 px-3.5 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-semibold inline-flex items-center gap-1.5 transition-opacity cursor-pointer disabled:opacity-50"
                        title="Execute incremental latest scan now"
                      >
                        <RotateCw className={`h-3.5 w-3.5 ${isRunning || busy ? 'animate-spin' : ''}`} />
                        <span>{isRunning ? 'Scanning...' : 'Run Now'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Last error notice if present */}
                  {site.last_error && (
                    <div className="mt-3 p-2.5 rounded-lg border border-red-200 dark:border-red-950 bg-red-50/50 dark:bg-red-950/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">Error during last run: {site.last_error}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
