import React, { useState, useEffect, useMemo } from 'react';
import { 
  Globe, 
  RotateCw, 
  Play, 
  Square, 
  Clock, 
  ExternalLink, 
  AlertCircle, 
  CheckCircle2, 
  Layers,
  Pause,
  ArrowRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface ScraperSiteInfo {
  id: string;
  name: string;
  domain: string;
  base_url: string;
  cron_schedule: string;
  enabled: boolean;
  status: 'idle' | 'running' | 'completed' | 'error' | 'stopped' | 'postponed' | 'full_scanning';
  total_scraped: number;
  failed_count: number;
  last_new_posts?: number;
  last_run_at: string | null;
  last_run_type?: 'manual' | 'scheduled' | 'full_scan';
  next_run_at: string | null;
  last_error: string | null;
}

// 10 Fixed Target Sites: Always render instantly without any loading screen
const DEFAULT_SITES: ScraperSiteInfo[] = [
  {
    id: 'lalamasa',
    name: 'lalamasa.mobi',
    domain: 'lalamasa.mobi',
    base_url: 'https://lalamasa.mobi',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'masahub2',
    name: 'masahub2.com',
    domain: 'masahub2.com',
    base_url: 'https://masahub2.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'mmsvibex',
    name: 'mmsvibex.fit',
    domain: 'mmsvibex.fit',
    base_url: 'https://mmsvibex.fit',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'mydesi13',
    name: 'mydesi13.com',
    domain: 'mydesi13.com',
    base_url: 'https://mydesi13.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'mydesiRest',
    name: 'mydesi.rest',
    domain: 'mydesi.rest',
    base_url: 'https://mydesi.rest',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'mykamababa',
    name: 'mykamababa.vip',
    domain: 'mykamababa.vip',
    base_url: 'https://mykamababa.vip',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'p4455',
    name: '4455.com',
    domain: '4455.com',
    base_url: 'https://4455.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'viralchut',
    name: 'viralchut.com',
    domain: 'viralchut.com',
    base_url: 'https://viralchut.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'viralmms',
    name: 'viralmms.fun',
    domain: 'viralmms.fun',
    base_url: 'https://viralmms.fun',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
  {
    id: 'xxxindianstories',
    name: 'xxxindianstories.com',
    domain: 'xxxindianstories.com',
    base_url: 'https://www.xxxindianstories.com',
    cron_schedule: 'Every 12 Hours',
    enabled: true,
    status: 'idle',
    total_scraped: 0,
    failed_count: 0,
    last_new_posts: 0,
    last_run_at: null,
    last_run_type: 'scheduled',
    next_run_at: null,
    last_error: null,
  },
];

export default function SiteScraper() {
  const navigate = useNavigate();
  // Fixed 10 cards pre-initialized: Zero loading screen flicker
  const [sites, setSites] = useState<ScraperSiteInfo[]>(DEFAULT_SITES);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // External Scraper Engine status (e.g. deployed on Koyeb)
  const [engineStatus, setEngineStatus] = useState<{
    online: boolean;
    configured: boolean;
    is_running: boolean;
    active_site: string | null;
    message: string;
    app_url: string;
  }>({
    online: false,
    configured: false,
    is_running: false,
    active_site: null,
    message: 'Checking engine status...',
    app_url: '',
  });
  const [masterToggling, setMasterToggling] = useState(false);
  const [totalPostScraped, setTotalPostScraped] = useState<number | null>(null);
  const [failedExtractions, setFailedExtractions] = useState<number | null>(null);

  const fetchEngineStatus = async () => {
    try {
      const res = await fetch('/api/scrapers/status');
      if (res.ok) {
        const data = await res.json();
        setEngineStatus(data);
      }
    } catch (err: any) {
      console.warn('Failed to fetch scraper engine status:', err.message);
    }
  };

  const fetchSites = async () => {
    try {
      const res = await fetch('/api/scrapers');
      if (res.ok) {
        const data = await res.json();
        if (data.total_post_scraped !== undefined && data.total_post_scraped !== null) {
          setTotalPostScraped(Number(data.total_post_scraped));
        }
        if (data.failed_extractions !== undefined && data.failed_extractions !== null) {
          setFailedExtractions(Number(data.failed_extractions));
        }
        if (Array.isArray(data.sites) && data.sites.length > 0) {
          setSites(prev => {
            return prev.map(defaultSite => {
              const found = data.sites.find((s: ScraperSiteInfo) => s.id === defaultSite.id || s.domain === defaultSite.domain);
              return found ? { ...defaultSite, ...found } : defaultSite;
            });
          });
        }
      }
    } catch (err: any) {
      console.warn('Failed to fetch scraper sites:', err.message);
    }
  };

  useEffect(() => {
    fetchSites();
    fetchEngineStatus();
    const interval = setInterval(() => {
      fetchSites();
      fetchEngineStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleMaster = async () => {
    const nextAction = engineStatus.is_running ? 'pause' : 'resume';
    setMasterToggling(true);
    try {
      const res = await fetch('/api/scrapers/master', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: nextAction }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(
          nextAction === 'pause'
            ? 'All site scrapers paused. Scraper engine is idling.'
            : 'All active site scrapers resumed successfully!'
        );
        fetchEngineStatus();
        fetchSites();
      } else {
        toast.error(data.error || 'Failed to toggle master scraper');
      }
    } catch (err: any) {
      toast.error('Network error toggling master scraper: ' + err.message);
    } finally {
      setMasterToggling(false);
    }
  };

  const handleRunNow = async (siteId: string, siteName: string) => {
    setActionInProgress(siteId);
    // Optimistic UI update: Mark as manual run immediately, preserving next_run_at schedule!
    setSites(prev => prev.map(s => {
      if (s.id === siteId) {
        return {
          ...s,
          status: 'running',
          last_run_at: new Date().toISOString(),
          last_run_type: 'manual',
        };
      }
      return s;
    }));

    try {
      const res = await fetch(`/api/scrapers/${siteId}/run`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Manual scan started for "${siteName}". Next scheduled scan time preserved.`);
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

  const handleFullScan = async (siteId: string, siteName: string) => {
    setActionInProgress(siteId);
    // Optimistic UI update: Set full scanning and postpone other sites
    setSites(prev => prev.map(s => {
      if (s.id === siteId) {
        return {
          ...s,
          status: 'full_scanning',
          last_run_at: new Date().toISOString(),
          last_run_type: 'full_scan',
        };
      } else {
        return {
          ...s,
          status: 'postponed',
        };
      }
    }));

    try {
      const res = await fetch(`/api/scrapers/${siteId}/full-scan`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Full Scan queued for "${siteName}". All other site scans are postponed by 12 hours until complete.`);
        fetchSites();
        fetchEngineStatus();
      } else {
        toast.error(data.error || data.message || 'Failed to start full scan');
      }
    } catch (err: any) {
      toast.error('Network error starting full scan: ' + err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStop = async (siteId: string, siteName: string) => {
    setActionInProgress(siteId);
    setSites(prev => prev.map(s => s.id === siteId ? { ...s, status: 'stopped', enabled: false } : s));
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
    setSites(prev => prev.map(s => s.id === siteId ? { ...s, status: 'idle', enabled: true } : s));
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

  const uniqueSites = useMemo(() => {
    const seen = new Set<string>();
    return sites.filter((s) => {
      const key = s.domain || s.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sites]);

  const totalScrapedAll = uniqueSites.reduce((acc, curr) => acc + (curr.total_scraped || 0), 0);
  const totalFailedAll = uniqueSites.reduce((acc, curr) => acc + (curr.failed_count || 0), 0);
  const activeCount = uniqueSites.filter((s) => s.enabled).length;

  const displayTotalScraped = totalPostScraped !== null ? totalPostScraped : totalScrapedAll;
  const displayTotalFailed = failedExtractions !== null ? failedExtractions : totalFailedAll;

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

        {/* Engine Health Indicator & Animated Master Stop/Resume */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Indicator 1: Engine Status (Running vs Stopped vs Offline) */}
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
            onClick={() => {
              fetchSites();
              fetchEngineStatus();
            }}
            className="h-9 w-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 inline-flex items-center justify-center shadow-xs transition-colors cursor-pointer"
            title="Refresh status and telemetry"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Top Metrics Cards: 10 fixed sites instantly ready */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <span>Configured Sites</span>
            <Globe className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-black dark:text-white">
            {uniqueSites.length}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            {activeCount} active • {uniqueSites.length - activeCount} paused
          </div>
        </div>

        <div 
          onClick={() => navigate('/scraped#my-files-card')}
          className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 rounded-xl p-4 shadow-xs cursor-pointer transition-all hover:shadow-sm group"
          title="Click to view all scraped videos in My Files"
        >
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <span>Total Posts Scraped</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 text-2xl font-bold font-mono text-black dark:text-white group-hover:underline">
            {displayTotalScraped.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Click to view all in <strong>My Files</strong>
          </div>
        </div>

        <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
            <span>Failed Extractions</span>
            <AlertCircle className="h-4 w-4 text-red-500" />
          </div>
          <div className={`mt-2 text-2xl font-bold font-mono ${displayTotalFailed > 0 ? 'text-red-600 dark:text-red-400' : 'text-black dark:text-white'}`}>
            {displayTotalFailed.toLocaleString()}
          </div>
          <div className="mt-1 text-xs text-zinc-500">
            Reported stream parse errors
          </div>
        </div>
      </div>

      {/* Main Scrapers List: Pure 10 fixed cards instantly rendered without any loading message */}
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
          {uniqueSites.map((site) => {
            const isRunning = site.status === 'running';
            const isFullScanning = site.status === 'full_scanning';
            const isPostponed = site.status === 'postponed';
            const isStopped = !site.enabled || site.status === 'stopped';
            const busy = actionInProgress === site.id;

            return (
              <div
                key={site.id}
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

                    {/* Schedule, Last Scan (with Manual Run support), Next Scan, and New in Last Scan */}
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

                    {/* Responsive Button 1: Stop or Restart (Mobile: icon only, Desktop: icon + text) */}
                    {isStopped ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleRestart(site.id, site.name)}
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
                        onClick={() => handleStop(site.id, site.name)}
                        className="h-8 px-2 sm:px-2.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        title="Stop and pause scraping for this site"
                      >
                        <Square className="h-2.5 w-2.5 fill-current shrink-0" />
                        <span className="hidden sm:inline">Stop</span>
                      </button>
                    )}

                    {/* Responsive Button 2: Run Now (Mobile: icon only, Desktop: icon + text) */}
                    <button
                      type="button"
                      disabled={busy || isRunning || isFullScanning}
                      onClick={() => handleRunNow(site.id, site.name)}
                      className="h-8 px-2 sm:px-3 rounded-lg bg-black dark:bg-white text-white dark:text-black hover:opacity-90 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-opacity cursor-pointer disabled:opacity-50"
                      title="Execute incremental latest scan now (preserves next scheduled run)"
                    >
                      <RotateCw className={`h-3 w-3 shrink-0 ${isRunning || busy ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">{isRunning ? 'Scanning...' : 'Run Now'}</span>
                    </button>

                    {/* Responsive Button 3: Full Scan (Mobile: icon only, Desktop: icon + text) */}
                    <button
                      type="button"
                      disabled={busy || isRunning || isFullScanning}
                      onClick={() => handleFullScan(site.id, site.name)}
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
          })}
        </div>
      </div>
    </div>
  );
}
