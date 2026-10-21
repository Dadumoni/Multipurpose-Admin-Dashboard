import React, { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';

// Modular Site Scraper Subcomponents & Types
import { ScraperSiteInfo, EngineStatus, DEFAULT_SITES } from '@/src/components/site-scraper/types';
import ScraperHeader from '@/src/components/site-scraper/ScraperHeader';
import ScraperStatsCards from '@/src/components/site-scraper/ScraperStatsCards';
import ScraperSiteList from '@/src/components/site-scraper/ScraperSiteList';

export default function SiteScraper() {
  const [sites, setSites] = useState<ScraperSiteInfo[]>(DEFAULT_SITES);
  const [totalPostScraped, setTotalPostScraped] = useState<number | null>(null);
  const [failedExtractions, setFailedExtractions] = useState<number | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>({
    online: false,
    configured: false,
    is_running: false,
    active_scrapes: 0,
    app_url: '',
    last_checked: '',
  });

  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [masterToggling, setMasterToggling] = useState(false);

  // Fetch telemetry
  const fetchSites = async () => {
    try {
      const res = await fetch('/api/scrapers');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.sites)) {
          setSites((prev) => {
            const apiMap = new Map<string, any>(data.sites.map((s: any) => [s.id, s]));
            return prev.map((local) => {
              const remote = apiMap.get(local.id);
              if (!remote) return local;
              return {
                ...local,
                enabled: typeof remote.enabled === 'boolean' ? remote.enabled : local.enabled,
                status: remote.status || local.status,
                total_scraped: typeof remote.total_scraped === 'number' ? remote.total_scraped : local.total_scraped,
                failed_count: typeof remote.failed_count === 'number' ? remote.failed_count : local.failed_count,
                last_new_posts: typeof remote.last_new_posts === 'number' ? remote.last_new_posts : local.last_new_posts,
                last_run_at: remote.last_run_at || local.last_run_at,
                last_run_type: remote.last_run_type || local.last_run_type,
                next_run_at: remote.next_run_at || local.next_run_at,
                last_error: remote.last_error !== undefined ? remote.last_error : local.last_error,
              };
            });
          });
        }
      }
    } catch {
      // Keep instant UI
    }
  };

  const fetchEngineStatus = async () => {
    try {
      const res = await fetch('/api/scrapers/engine/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.engine) {
          setEngineStatus(data.engine);
        }
      }
    } catch {
      setEngineStatus(prev => ({ ...prev, online: false }));
    }
  };

  const fetchDashboardStats = async () => {
    try {
      const res = await fetch('/api/stats/dashboard');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.stats) {
          if (typeof data.stats.total_post_scraped === 'number') {
            setTotalPostScraped(data.stats.total_post_scraped);
          }
          if (typeof data.stats.failed_extractions === 'number') {
            setFailedExtractions(data.stats.failed_extractions);
          }
        }
      }
    } catch {
      // silent fallback
    }
  };

  useEffect(() => {
    fetchSites();
    fetchEngineStatus();
    fetchDashboardStats();

    const interval = setInterval(() => {
      fetchSites();
      fetchEngineStatus();
      fetchDashboardStats();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleMaster = async () => {
    if (masterToggling) return;
    setMasterToggling(true);
    const action = engineStatus.is_running ? 'stop' : 'start';
    try {
      const res = await fetch(`/api/scrapers/engine/${action}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(action === 'stop' ? 'Paused scraper engine loop' : 'Resumed scraper engine loop');
        fetchEngineStatus();
        fetchSites();
      } else {
        toast.error(data.error || 'Failed to toggle master scraper');
      }
    } catch (err: any) {
      toast.error('Network error toggling engine: ' + err.message);
    } finally {
      setMasterToggling(false);
    }
  };

  const handleRunNow = async (siteId: string, siteName: string) => {
    setActionInProgress(siteId);
    setSites(prev => prev.map(s => s.id === siteId ? { ...s, status: 'running' } : s));
    try {
      const res = await fetch(`/api/scrapers/${siteId}/run`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Incremental Scan started for "${siteName}". Next scheduled scan remains unchanged.`);
        fetchSites();
        fetchEngineStatus();
      } else {
        toast.error(data.error || 'Failed to trigger scan');
      }
    } catch (err: any) {
      toast.error('Network error triggering scan: ' + err.message);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleFullScan = async (siteId: string, siteName: string) => {
    setActionInProgress(siteId);
    setSites(prev => prev.map(s => s.id === siteId ? { ...s, status: 'full_scanning' } : s));

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
      {/* Reusable Page Header with Engine Status & Master Controls */}
      <ScraperHeader
        engineStatus={engineStatus}
        handleToggleMaster={handleToggleMaster}
        masterToggling={masterToggling}
        onRefresh={() => {
          fetchSites();
          fetchEngineStatus();
          fetchDashboardStats();
        }}
      />

      {/* Reusable Stats Cards */}
      <ScraperStatsCards
        totalConfiguredSites={uniqueSites.length}
        activeCount={activeCount}
        displayTotalScraped={displayTotalScraped}
        displayTotalFailed={displayTotalFailed}
      />

      {/* Reusable Target Sites List */}
      <ScraperSiteList
        sites={uniqueSites}
        actionInProgress={actionInProgress}
        onRunNow={handleRunNow}
        onFullScan={handleFullScan}
        onStop={handleStop}
        onRestart={handleRestart}
      />
    </div>
  );
}
