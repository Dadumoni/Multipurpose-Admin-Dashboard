import React from 'react';
import { Compass, AlertTriangle } from 'lucide-react';
import TopBrowsersBarChart, { BrowserItem } from './TopBrowsersBarChart';

interface TopBrowsersCardProps {
  available: boolean;
  message?: string;
  browsers: BrowserItem[];
  selectedMonthLabel: string;
}

export default function TopBrowsersCard({
  available,
  message,
  browsers,
  selectedMonthLabel,
}: TopBrowsersCardProps) {
  return (
    <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <h3 className="text-sm font-semibold text-black dark:text-white">Top Browsers</h3>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Traffic by browser &amp; in-app webviews
          </p>
        </div>
        {available && (
          <span className="text-[11px] font-mono px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300">
            [ Web: {(() => {
              const inApp = browsers.find(b => b.name.toLowerCase().includes('in-app') || b.name.toLowerCase().includes('telegram'))?.count || 0;
              const total = browsers.reduce((acc, b) => acc + b.count, 0);
              return total > 0 ? (((total - inApp) / total) * 100).toFixed(1) : '100.0';
            })()}% ]
          </span>
        )}
      </div>

      {!available ? (
        /* Database Fallback Warning inside card */
        <div className="h-[180px] flex flex-col items-center justify-center p-6 text-center rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="p-2.5 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 mb-2.5">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            Visitor Telemetry Unavailable
          </span>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 max-w-[320px]">
            {message || 'No browser telemetry recorded yet in visitor_views.'}
          </p>
        </div>
      ) : browsers.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-zinc-500">
          No browser telemetry recorded for {selectedMonthLabel}.
        </div>
      ) : (
        <div className="pt-2">
          <TopBrowsersBarChart browsers={browsers} selectedMonthLabel={selectedMonthLabel} />
        </div>
      )}
    </div>
  );
}
