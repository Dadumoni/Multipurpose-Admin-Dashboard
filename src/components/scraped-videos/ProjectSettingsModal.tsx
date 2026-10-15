import React from 'react';
import { Database } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/src/components/ui/dialog';

interface ProjectSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentConfig: {
    projectRef?: string;
    isCustom?: boolean;
  };
  activeTable: string;
  customUrl: string;
  setCustomUrl: (url: string) => void;
  customKey: string;
  setCustomKey: (key: string) => void;
  onSave: (e: React.FormEvent) => void;
  onReset: () => void;
}

export const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({
  open,
  onOpenChange,
  currentConfig,
  activeTable,
  customUrl,
  setCustomUrl,
  customKey,
  setCustomKey,
  onSave,
  onReset,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-black text-black dark:text-white rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-black dark:text-white flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span>Supabase Project Connection</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Connect to the project hosting your <code>public.posts</code> table.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSave} className="space-y-4 mt-2">
          <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Connected Project Ref:</span>
              <span className="font-mono font-medium text-black dark:text-white bg-white dark:bg-black px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800">
                {currentConfig.projectRef || 'None'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Active Detected Table:</span>
              <span className="font-mono font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                public.{activeTable}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Config Source:</span>
              <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                {currentConfig.isCustom ? 'Custom Override' : 'Environment Variables'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Supabase Project URL
              </label>
              <input
                type="url"
                required
                placeholder="https://xyzcompany.supabase.co"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white shadow-sm"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                Supabase Anon Key
              </label>
              <textarea
                rows={3}
                required
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                className="w-full p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white text-xs font-mono focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white shadow-sm resize-none"
              />
            </div>
          </div>

          <DialogFooter className="mt-4 flex items-center justify-between gap-2 pt-2">
            {currentConfig.isCustom ? (
              <button
                type="button"
                onClick={onReset}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-black dark:hover:text-white underline cursor-pointer"
              >
                Reset to Environment Project
              </button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 shadow-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-9 px-4 rounded-lg bg-black dark:bg-white text-white dark:text-black text-xs font-medium hover:bg-zinc-900 dark:hover:bg-zinc-100 shadow-sm cursor-pointer"
              >
                Save & Connect
              </button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
