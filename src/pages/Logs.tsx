import React, { useEffect, useRef, useState } from 'react';
import {
  Terminal as TerminalIcon,
  Trash2,
  Pause,
  Play,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Info,
  RotateCcw,
  Search,
  ArrowDownCircle,
  Copy,
} from 'lucide-react';
import { toast } from 'sonner';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  source: string;
  message: string;
}

interface MigrationProgress {
  inProgress: boolean;
  totalDocs: number;
  processedDocs: number;
  successCount: number;
  errorCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
}

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [migration, setMigration] = useState<MigrationProgress>({
    inProgress: false,
    totalDocs: 0,
    processedDocs: 0,
    successCount: 0,
    errorCount: 0,
    startedAt: null,
    finishedAt: null,
    lastError: null,
  });
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [filterLevel, setFilterLevel] = useState<'all' | 'success' | 'error' | 'warn' | 'info'>('all');
  const [filterSource, setFilterSource] = useState<'all' | 'telegram-bot' | 'scraper' | 'db-sync'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [triggeringSync, setTriggeringSync] = useState(false);

  const terminalBodyRef = useRef<HTMLDivElement | null>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
        if (data.migration) {
          setMigration(data.migration);
        }
      }
    } catch {
      // silent retry on next poll
    }
  };

  useEffect(() => {
    fetchLogs();
    if (paused) return;
    const interval = setInterval(fetchLogs, 1200);
    return () => clearInterval(interval);
  }, [paused]);

  useEffect(() => {
    if (autoScroll && terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [logs, autoScroll, filterLevel, filterSource, searchQuery]);

  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/logs/clear', { method: 'POST' });
      if (res.ok) {
        fetchLogs();
        toast.success('Terminal logs cleared');
      }
    } catch {
      toast.error('Failed to clear logs');
    }
  };

  const handleTriggerSync = async () => {
    if (triggeringSync) return;
    setTriggeringSync(true);
    try {
      const res = await fetch('/api/sync/migrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('DB Sync started in background');
        fetchLogs();
      } else {
        toast.error(data.error || 'Failed to start DB Sync');
      }
    } catch {
      toast.error('Failed to trigger DB Sync');
    } finally {
      setTimeout(() => setTriggeringSync(false), 1000);
    }
  };

  const filteredLogs = logs.filter((entry) => {
    if (filterLevel !== 'all' && entry.level !== filterLevel) return false;
    if (filterSource !== 'all' && entry.source !== filterSource) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        entry.message.toLowerCase().includes(q) ||
        entry.source.toLowerCase().includes(q) ||
        entry.level.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '--:--:--';
    }
  };

  const formatLogsForClipboard = (entries: LogEntry[]) =>
    entries
      .map((entry) => `[${formatTime(entry.timestamp)}] [${entry.level.toUpperCase()}] ${entry.message}`)
      .join('\n');

  const handleCopyRecent20 = async () => {
    if (filteredLogs.length === 0) {
      toast.info('No logs available to copy');
      return;
    }
    const recent20 = filteredLogs.slice(-20);
    try {
      await navigator.clipboard.writeText(formatLogsForClipboard(recent20));
      toast.success(`Copied recent ${recent20.length} logs to clipboard`);
    } catch {
      toast.error('Failed to copy logs');
    }
  };

  const handleCopyAll = async () => {
    if (filteredLogs.length === 0) {
      toast.info('No logs available to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(formatLogsForClipboard(filteredLogs));
      toast.success(`Copied all ${filteredLogs.length} logs to clipboard`);
    } catch {
      toast.error('Failed to copy logs');
    }
  };

  const progressPercent =
    migration.totalDocs > 0
      ? Math.min(100, Math.round((migration.processedDocs / migration.totalDocs) * 100))
      : 0;

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-black dark:text-white flex items-center gap-2">
            <TerminalIcon className="h-5 w-5" />
            <span>System & DB Sync Terminal</span>
          </h1>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Real-time console output for MongoDB → Supabase (<code className="font-mono">viralhub_db</code>) synchronization and server events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTriggerSync}
            disabled={triggeringSync || migration.inProgress}
            className="h-8 px-3 rounded-lg bg-black text-white dark:bg-white dark:text-black text-xs font-medium inline-flex items-center gap-1.5 shadow-sm hover:opacity-90 disabled:opacity-50 cursor-pointer transition-all"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${migration.inProgress || triggeringSync ? 'animate-spin' : ''}`} />
            <span>{migration.inProgress ? 'Copying in Progress...' : 'Run DB Sync'}</span>
          </button>
        </div>
      </div>

      {/* Live Migration Status Banner */}
      {(migration.inProgress || migration.processedDocs > 0 || migration.lastError) && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  migration.inProgress
                    ? 'bg-emerald-500 animate-pulse'
                    : migration.lastError && migration.successCount === 0
                    ? 'bg-red-500'
                    : 'bg-zinc-400'
                }`}
              />
              <span className="font-semibold text-black dark:text-white">
                {migration.inProgress
                  ? 'Copying MongoDB (videos_db.posts) → Supabase (viralhub_db)...'
                  : 'Last DB Sync Summary'}
              </span>
            </div>

            <div className="flex items-center gap-4 font-mono text-xs">
              <span className="text-zinc-600 dark:text-zinc-400">
                Processed: <strong className="text-black dark:text-white">{migration.processedDocs}</strong> / {migration.totalDocs}
              </span>
              <span className="text-emerald-600 dark:text-emerald-400">
                Success: <strong>{migration.successCount}</strong>
              </span>
              <span className="text-red-600 dark:text-red-400">
                Errors: <strong>{migration.errorCount}</strong>
              </span>
            </div>
          </div>

          {migration.totalDocs > 0 && (
            <div className="w-full h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Terminal Window */}
      <div className="rounded-2xl border border-zinc-800 bg-[#0c0c0e] text-zinc-100 shadow-2xl overflow-hidden flex flex-col h-[calc(100vh-220px)] min-h-[460px]">
        {/* Terminal Top Bar */}
        <div className="px-4 py-2.5 bg-[#141418] border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
          {/* Left traffic lights + title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-500/80 inline-block" />
              <span className="h-3 w-3 rounded-full bg-amber-500/80 inline-block" />
              <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <span>bash — db-sync-terminal</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  paused
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-emerald-500/20 text-emerald-400'
                }`}
              >
                {paused ? 'PAUSED' : 'LIVE'}
              </span>
            </div>
          </div>

          {/* Filter & Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search inside logs */}
            <div className="relative">
              <Search className="h-3 w-3 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter output..."
                className="h-7 pl-7 pr-2.5 rounded-md bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-700 w-36 sm:w-44 font-mono"
              />
            </div>

            {/* Level Filter Pills */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-0.5 text-[11px] font-mono">
              {(['all', 'success', 'error', 'warn', 'info'] as const).map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  onClick={() => setFilterLevel(lvl)}
                  className={`px-2 py-0.5 rounded capitalize transition-colors cursor-pointer ${
                    filterLevel === lvl
                      ? 'bg-zinc-700 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {lvl}
                </button>
              ))}
            </div>

            {/* Source Filter Pills */}
            <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-md p-0.5 text-[11px] font-mono">
              {(['all', 'telegram-bot', 'scraper', 'db-sync'] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setFilterSource(src)}
                  className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                    filterSource === src
                      ? 'bg-zinc-700 text-white font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {src === 'all' ? 'All' : src === 'telegram-bot' ? 'Bot' : src === 'scraper' ? 'Scraper' : 'Sync'}
                </button>
              ))}
            </div>

            {/* Copy Recent 20 Logs button */}
            <button
              type="button"
              onClick={handleCopyRecent20}
              title="Copy recent 20 logs"
              className="h-7 px-2 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Copy className="h-3 w-3 text-zinc-400" />
              <span>Copy</span>
            </button>

            {/* Copy All Logs button */}
            <button
              type="button"
              onClick={handleCopyAll}
              title="Copy all logs"
              className="h-7 px-2 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Copy className="h-3 w-3 text-zinc-400" />
              <span>Copy All</span>
            </button>

            {/* Auto-scroll toggle */}
            <button
              type="button"
              onClick={() => setAutoScroll(!autoScroll)}
              title="Toggle Auto-Scroll"
              className={`h-7 px-2 rounded-md border text-xs font-mono inline-flex items-center gap-1 cursor-pointer transition-colors ${
                autoScroll
                  ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ArrowDownCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Auto-scroll</span>
            </button>

            {/* Pause / Resume button */}
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              title={paused ? 'Resume live stream' : 'Pause live stream'}
              className="h-7 px-2 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              {paused ? <Play className="h-3 w-3 text-emerald-400" /> : <Pause className="h-3 w-3 text-amber-400" />}
              <span>{paused ? 'Resume' : 'Pause'}</span>
            </button>

            {/* Clear terminal button */}
            <button
              type="button"
              onClick={handleClearLogs}
              title="Clear terminal output"
              className="h-7 px-2 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-red-950/50 hover:border-red-800/60 text-zinc-300 hover:text-red-300 text-xs font-mono inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Trash2 className="h-3 w-3" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        {/* Terminal Output Body */}
        <div
          ref={terminalBodyRef}
          className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-1.5 selection:bg-zinc-700 selection:text-white"
        >
          {filteredLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2">
              <TerminalIcon className="h-8 w-8 stroke-[1.5] opacity-40" />
              <p>No terminal logs matching current filter.</p>
            </div>
          ) : (
            filteredLogs.map((entry) => {
              let badgeClass = 'text-sky-400 bg-sky-500/10 border-sky-500/20';
              let textClass = 'text-zinc-200';
              let IconComponent = Info;

              if (entry.level === 'success') {
                badgeClass = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                textClass = 'text-emerald-300';
                IconComponent = CheckCircle2;
              } else if (entry.level === 'error') {
                badgeClass = 'text-red-400 bg-red-500/10 border-red-500/20';
                textClass = 'text-red-300';
                IconComponent = XCircle;
              } else if (entry.level === 'warn') {
                badgeClass = 'text-amber-400 bg-amber-500/10 border-amber-500/20';
                textClass = 'text-amber-200';
                IconComponent = AlertTriangle;
              }

              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-2.5 leading-relaxed hover:bg-white/[0.03] px-2 py-1 rounded transition-colors break-all"
                >
                  <span className="text-zinc-500 shrink-0 select-none">
                    [{formatTime(entry.timestamp)}]
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded border text-[10px] uppercase font-semibold inline-flex items-center gap-1 shrink-0 select-none ${badgeClass}`}
                  >
                    <IconComponent className="h-2.5 w-2.5" />
                    {entry.level}
                  </span>
                  {entry.source === 'telegram-bot' && (
                    <span className="px-1.5 py-0.2 rounded border text-[10px] font-semibold uppercase bg-purple-500/10 border-purple-500/30 text-purple-300 shrink-0 select-none">
                      BOT
                    </span>
                  )}
                  {entry.source === 'scraper' && (
                    <span className="px-1.5 py-0.2 rounded border text-[10px] font-semibold uppercase bg-cyan-500/10 border-cyan-500/30 text-cyan-300 shrink-0 select-none">
                      SCRAPER
                    </span>
                  )}
                  {entry.source === 'db-sync' && (
                    <span className="px-1.5 py-0.2 rounded border text-[10px] font-semibold uppercase bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shrink-0 select-none">
                      SYNC
                    </span>
                  )}
                  <span className={`flex-1 whitespace-pre-wrap ${textClass}`}>
                    {entry.message}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {/* Terminal Footer Prompt */}
        <div className="px-4 py-2 bg-[#141418] border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400">➜</span>
            <span className="text-zinc-300">videos_db.posts → supabase.viralhub_db</span>
            {migration.inProgress && (
              <span className="text-emerald-400 animate-pulse ml-2">
                ● Copying records ({migration.processedDocs}/{migration.totalDocs})...
              </span>
            )}
          </div>
          <div>
            Showing {filteredLogs.length} of {logs.length} lines
          </div>
        </div>
      </div>
    </div>
  );
}
