import React, { useEffect, useState } from 'react';
import { 
  RotateCw, 
  Database, 
  Check, 
  AlertCircle, 
  Layers, 
  X, 
  ExternalLink,
  Sparkles,
  ArrowRight,
  ArrowLeftRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

interface SyncStatusResponse {
  inProgress: boolean;
  lastSync: string | null;
  mongoCount: number;
  supabaseCount: number;
  error: string | null;
  table: string | null;
  isMongoConnected: boolean;
  sync_enabled?: boolean;
}

export default function SyncPill() {
  const [status, setStatus] = useState<SyncStatusResponse>({
    inProgress: false,
    lastSync: null,
    mongoCount: 0,
    supabaseCount: 0,
    error: null,
    table: null,
    isMongoConnected: false,
    sync_enabled: true,
  });
  const [togglingSync, setTogglingSync] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const toggleDbSync = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (togglingSync) return;
    const nextState = !status.sync_enabled;
    setTogglingSync(true);
    try {
      const res = await fetch('/api/sync/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextState }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus(prev => ({ ...prev, sync_enabled: nextState }));
        toast.success(nextState ? 'DB Sync turned ON' : 'DB Sync turned OFF');
      } else {
        toast.error(data.error || 'Failed to toggle DB Sync');
      }
    } catch (err: any) {
      toast.error('Error toggling DB Sync: ' + (err.message || 'Server error'));
    } finally {
      setTogglingSync(false);
    }
  };

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/sync/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Backend status endpoint standby
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, status.inProgress ? 2500 : 15000);
    return () => clearInterval(interval);
  }, [status.inProgress]);

  const triggerSync = async () => {
    setLoading(true);
    toast.info('Starting full database synchronization (bypassing 1000 limit)...');
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Sync complete! ${data.totalFetched?.toLocaleString() || 0} videos synced to MongoDB.`);
        fetchStatus();
      } else {
        toast.error('Sync failed: ' + (data.error || 'Check server logs'));
        fetchStatus();
      }
    } catch (err: any) {
      toast.error('Failed to trigger sync: ' + (err.message || 'Server error'));
    } finally {
      setLoading(false);
    }
  };

  const isSyncing = status.inProgress || loading;

  return (
    <>
      {/* Redesigned DB Sync Pill with Switch Toggle */}
      <div className="flex items-center gap-2 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-full pl-3 pr-1.5 py-1 shadow-sm text-xs transition-colors">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 hover:text-black dark:hover:text-white focus:outline-none cursor-pointer"
          title="Click to view Database Sync Manager"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              status.sync_enabled
                ? (status.isMongoConnected && !status.error ? 'bg-emerald-500' : 'bg-amber-500')
                : 'bg-zinc-400 dark:bg-zinc-600'
            }`}
          />
          <span className="font-semibold text-xs text-black dark:text-white">DB Sync</span>
        </button>

        {/* Interactive ON/OFF Switch */}
        <button
          type="button"
          role="switch"
          aria-checked={status.sync_enabled}
          disabled={togglingSync}
          onClick={(e) => toggleDbSync(e)}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
            status.sync_enabled ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
          } ${togglingSync ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={status.sync_enabled ? 'DB Sync is ON. Click to turn OFF' : 'DB Sync is OFF. Click to turn ON'}
        >
          <span className="sr-only">Toggle DB Sync</span>
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
              status.sync_enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>

        {/* Sync Now Button */}
        <button
          type="button"
          onClick={triggerSync}
          disabled={isSyncing || !status.sync_enabled}
          className="h-6 w-6 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-900 grid place-items-center text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors disabled:opacity-30 cursor-pointer"
          title={status.sync_enabled ? "Run Full Sync Now" : "DB Sync is turned OFF"}
        >
          <ArrowLeftRight className={`h-3 w-3 ${isSyncing ? 'animate-spin text-black dark:text-white' : ''}`} />
        </button>
      </div>

      {/* Database Sync Manager Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[480px] bg-white dark:bg-black text-black dark:text-white rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-black dark:text-white flex items-center gap-2">
              <Database className="h-4 w-4 text-zinc-700 dark:text-zinc-300" />
              <span>Bidirectional Database Sync Engine</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              MongoDB is the primary database. Supabase acts as backup, kept synchronized in both directions.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            {/* Sync Pipeline Flow */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-black text-white dark:bg-white dark:text-black grid place-items-center font-bold text-xs">
                    MG
                  </div>
                  <div>
                    <div className="font-semibold text-black dark:text-white">MongoDB (Primary)</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Collection: posts ({status.mongoCount.toLocaleString()} docs)</div>
                  </div>
                </div>

                <div className="flex flex-col items-center">
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">↔ Sync</span>
                  <ArrowRight className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 text-black dark:text-white grid place-items-center font-bold text-xs">
                    SB
                  </div>
                  <div>
                    <div className="font-semibold text-black dark:text-white">Supabase (Backup)</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Table: public.{status.table || 'post'}</div>
                  </div>
                </div>
              </div>

              <div className="h-px bg-zinc-200 dark:bg-zinc-800 my-2" />

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5 flex items-center justify-between">
                  <div>
                    <span className="text-zinc-500 dark:text-zinc-400 block">DB Sync State:</span>
                    <span className={`font-semibold ${status.sync_enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`}>
                      {status.sync_enabled ? 'Synchronization Active (ON)' : 'Synchronization Paused (OFF)'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleDbSync()}
                    disabled={togglingSync}
                    className={`h-7 px-2.5 rounded text-xs font-semibold cursor-pointer ${
                      status.sync_enabled
                        ? 'bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {status.sync_enabled ? 'Turn OFF' : 'Turn ON'}
                  </button>
                </div>
                <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg p-2.5">
                  <span className="font-medium text-black dark:text-white">
                    {(() => {
                      if (!status.lastSync) return 'Never';
                      try {
                        const d = new Date(status.lastSync);
                        return !isNaN(d.getTime()) ? formatDistanceToNow(d, { addSuffix: true }) : 'Never';
                      } catch {
                        return 'Never';
                      }
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* Bidirectional Info */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-zinc-800 dark:text-zinc-200 text-xs leading-relaxed">
              <span className="font-semibold text-black dark:text-white">Bidirectional Equalization: </span>
              MongoDB serves all normal requests as primary. The sync engine copies Supabase <code>{status.table || 'post'}</code> rows into MongoDB, and backs up MongoDB <code>posts</code> docs into Supabase, keeping both equal.
            </div>

            {!status.isMongoConnected && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-amber-900 dark:text-amber-300 text-xs">
                <span className="font-semibold">Setup Tip: </span>
                Add your <code className="bg-white dark:bg-zinc-900 px-1 py-0.5 rounded border border-amber-200 dark:border-amber-800">MONGODB_URI</code> to your environment secrets to activate MongoDB synchronization.
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="h-9 px-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium text-zinc-700 dark:text-zinc-300 shadow-sm cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={triggerSync}
              disabled={isSyncing}
              className="h-9 px-4 rounded-lg bg-black hover:bg-zinc-900 dark:bg-white dark:hover:bg-zinc-100 text-white dark:text-black text-xs font-medium inline-flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing Batches...' : 'Sync All 10,000+ Videos'}</span>
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
