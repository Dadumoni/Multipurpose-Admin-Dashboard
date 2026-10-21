import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, CheckCircle2, AlertCircle } from 'lucide-react';

interface ScraperStatsCardsProps {
  totalConfiguredSites: number;
  activeCount: number;
  displayTotalScraped: number;
  displayTotalFailed: number;
}

export default function ScraperStatsCards({
  totalConfiguredSites,
  activeCount,
  displayTotalScraped,
  displayTotalFailed,
}: ScraperStatsCardsProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div className="bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 shadow-xs">
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          <span>Configured Sites</span>
          <Globe className="h-4 w-4 text-zinc-400" />
        </div>
        <div className="mt-2 text-2xl font-bold text-black dark:text-white">
          {totalConfiguredSites}
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {activeCount} active • {totalConfiguredSites - activeCount} paused
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
  );
}
