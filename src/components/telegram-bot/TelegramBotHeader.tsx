import React from 'react';
import { Bot, RotateCw, FileText } from 'lucide-react';
import { BotState } from './types';

interface TelegramBotHeaderProps {
  botState: BotState;
  onRefresh: () => void;
  onOpenCustomText: () => void;
}

export default function TelegramBotHeader({
  botState,
  onRefresh,
  onOpenCustomText,
}: TelegramBotHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-black dark:text-white flex items-center gap-2.5">
          <Bot className="h-6 w-6 text-blue-500" />
          <span>Telegram Auto-Poster Bot</span>
        </h1>
        <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Automated multi-channel broadcast engine posting video streams sequentially.
        </p>
      </div>

      <div className="flex items-center gap-2">
        {/* Custom Caption Template Button */}
        <button
          type="button"
          onClick={onOpenCustomText}
          className="h-9 px-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-semibold text-zinc-700 dark:text-zinc-300 inline-flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
          title="Configure custom promotional footer or caption text"
        >
          <FileText className="h-4 w-4 text-zinc-500" />
          <span>Custom Caption</span>
        </button>

        {/* Refresh Status */}
        <button
          type="button"
          onClick={onRefresh}
          className="h-9 w-9 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400 inline-flex items-center justify-center transition-colors cursor-pointer shadow-xs"
          title="Refresh bot status and channels"
        >
          <RotateCw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
