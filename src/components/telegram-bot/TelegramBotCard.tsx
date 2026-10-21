import React from 'react';
import { Bot, Radio, Play, Square } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { BotState, ChannelItem } from './types';

interface TelegramBotCardProps {
  botState: BotState;
  channels: ChannelItem[];
  hourlyPosts: number;
  isSavingHourly: boolean;
  actionLoading: boolean;
  onSaveHourlyPosts: (num: number) => void;
  onStartBot: () => void;
  onStopBot: () => void;
}

export default function TelegramBotCard({
  botState,
  channels,
  hourlyPosts,
  isSavingHourly,
  actionLoading,
  onSaveHourlyPosts,
  onStartBot,
  onStopBot,
}: TelegramBotCardProps) {
  const isOnline = botState.is_running && !botState.stopped;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Left Info */}
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 grid place-items-center shrink-0">
            <Bot className="h-6 w-6 text-black dark:text-white" />
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-base font-bold text-black dark:text-white">
                {botState.bot_name || 'Poster Bot'}
              </span>

              {botState.bot_username && (
                <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400">
                  @{botState.bot_username}
                </span>
              )}

              {/* Online / Offline Status Badge */}
              <div className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold",
                isOnline 
                  ? "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
                  : "bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800"
              )}>
                <span className={cn(
                  "h-2 w-2 rounded-full",
                  isOnline ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"
                )} />
                <span>{isOnline ? 'Online' : 'Offline'}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400">
              <div className="flex items-center gap-1.5">
                <Radio className="h-3.5 w-3.5 text-zinc-400" />
                <span>Total Channels: <strong className="text-black dark:text-white font-mono">{channels.length}</strong></span>
              </div>
              <span>•</span>
              <div>
                Database: <strong className="text-black dark:text-white font-mono">videos_db</strong>
              </div>
              {botState.last_started_at && (
                <>
                  <span>•</span>
                  <div>
                    Started: <span className="font-mono">{new Date(botState.last_started_at).toLocaleTimeString()}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons & Hourly Posts per Channel setting */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          {/* Hourly Posts Per Channel Selector */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 text-xs">
            <span className="text-zinc-600 dark:text-zinc-400 font-medium whitespace-nowrap">
              Hourly Posts / Channel:
            </span>
            <select
              value={hourlyPosts}
              disabled={isSavingHourly}
              onChange={(e) => onSaveHourlyPosts(Number(e.target.value))}
              className="h-7 px-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-black text-black dark:text-white font-mono font-semibold text-xs focus:outline-none cursor-pointer"
              title="Number of posts per channel every hour (sequential with 5s delay)"
            >
              {[1, 2, 3, 5, 8, 10, 15, 20].map((num) => (
                <option key={num} value={num}>
                  {num} post{num > 1 ? 's' : ''} / hr
                </option>
              ))}
            </select>
          </div>

          {isOnline ? (
            <button
              type="button"
              disabled={actionLoading}
              onClick={onStopBot}
              className="h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              <span>{actionLoading ? 'Stopping...' : 'Stop Bot'}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={actionLoading}
              onClick={onStartBot}
              className="h-10 px-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>{actionLoading ? 'Starting...' : 'Start Bot'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
