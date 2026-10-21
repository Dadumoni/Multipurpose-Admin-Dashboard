import React from 'react';
import { Calendar, Users } from 'lucide-react';
import { format } from 'date-fns';

interface OverviewHeaderProps {
  totalUsers?: number;
  totalOnline?: number;
}

export default function OverviewHeader({ totalUsers = 0, totalOnline = 0 }: OverviewHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">Overview</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Manage your video content and performance.</p>
      </div>

      {/* Badges opposite of Overview: Month + Total Users {total ips} + Total Online */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Box 1: Dynamic Month Header Badge */}
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 shadow-sm">
          <Calendar className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400" />
          <span>{format(new Date(), 'MMMM yyyy')}</span>
        </div>

        {/* Box 2: Total Users {Total IPs} */}
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 shadow-sm">
          <Users className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
          <span>
            Total Users: <strong className="font-semibold text-black dark:text-white font-mono">{totalUsers}</strong>{' '}
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-mono">({totalUsers} IPs)</span>
          </span>
        </div>

        {/* Box 3: Total Online (Realtime Active Visitors) */}
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>
            Online: <strong className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono">{totalOnline}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}
