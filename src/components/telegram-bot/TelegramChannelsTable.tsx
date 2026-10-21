import React from 'react';
import { 
  Radio, 
  Search, 
  Plus, 
  Copy, 
  Pause, 
  Play, 
  Send, 
  Trash2 
} from 'lucide-react';
import { toast } from 'sonner';
import { ChannelItem } from './types';

interface TelegramChannelsTableProps {
  channels: ChannelItem[];
  filteredChannels: ChannelItem[];
  search: string;
  setSearch: (s: string) => void;
  onOpenAddChannel: () => void;
  onToggleChannel: (ch: ChannelItem) => void;
  onTestPost: (ch: ChannelItem) => void;
  onDeleteChannel: (ch: ChannelItem) => void;
}

export default function TelegramChannelsTable({
  channels,
  filteredChannels,
  search,
  setSearch,
  onOpenAddChannel,
  onToggleChannel,
  onTestPost,
  onDeleteChannel,
}: TelegramChannelsTableProps) {
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black shadow-sm overflow-hidden">
      {/* Table Top Bar */}
      <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-black dark:text-white">All Channels</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Channels configured for automated video posting ({channels.length} total).
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search channels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 pr-3 w-48 sm:w-56 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-xs text-black dark:text-white focus:outline-none"
            />
          </div>

          {/* Add Channel Button */}
          <button
            type="button"
            onClick={onOpenAddChannel}
            className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-black text-white dark:bg-white dark:text-black hover:opacity-90 text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Channel</span>
          </button>
        </div>
      </div>

      {/* Channels List Table */}
      {filteredChannels.length === 0 ? (
        <div className="p-12 text-center space-y-3">
          <div className="h-12 w-12 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 grid place-items-center mx-auto text-zinc-400">
            <Radio className="h-5 w-5" />
          </div>
          <div className="text-sm font-semibold text-black dark:text-white">No Channels Added Yet</div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            Add a channel using the &ldquo;Add Channel&rdquo; button above or send <code>/add_channel</code> directly in your Telegram bot chat.
          </p>
          <button
            type="button"
            onClick={onOpenAddChannel}
            className="mt-2 h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 text-xs font-medium text-black dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Your First Channel</span>
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 text-zinc-500 dark:text-zinc-400 font-medium">
                <th className="py-3 px-4">Channel Name</th>
                <th className="py-3 px-4">Channel ID</th>
                <th className="py-3 px-4">Total Post (Success / Failed)</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {filteredChannels.map((ch) => (
                <tr 
                  key={String(ch.chat_id)}
                  className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors"
                >
                  {/* Channel Name */}
                  <td className="py-3.5 px-4 font-semibold text-black dark:text-white max-w-[200px] truncate">
                    {ch.channel_name || `Channel ${ch.chat_id}`}
                  </td>

                  {/* Channel ID */}
                  <td className="py-3.5 px-4 font-mono text-zinc-600 dark:text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <span>{ch.chat_id}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(String(ch.chat_id));
                          toast.success('Channel ID copied');
                        }}
                        className="text-zinc-400 hover:text-black dark:hover:text-white p-0.5 rounded cursor-pointer"
                        title="Copy ID"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    </div>
                  </td>

                  {/* Total Post: Success / Failed */}
                  <td className="py-3.5 px-4 font-mono">
                    <div className="flex items-center gap-1.5">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold" title="Success posts">
                        +{ch.success_posts || 0}
                      </span>
                      <span className="text-zinc-400 dark:text-zinc-600">/</span>
                      <span className="text-rose-600 dark:text-rose-400 font-semibold" title="Failed posts">
                        {ch.failed_posts || 0}
                      </span>
                      <span className="text-zinc-400 text-[11px] ml-1">
                        ({ch.total_posts || 0} total)
                      </span>
                    </div>
                  </td>

                  {/* Status Badge */}
                  <td className="py-3.5 px-4">
                    {ch.is_active !== false ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                        Paused
                      </span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {ch.is_active !== false ? (
                        <button
                          type="button"
                          onClick={() => onToggleChannel(ch)}
                          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 transition-colors cursor-pointer"
                          title="Pause posting to this channel"
                          aria-label="Pause posting"
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onToggleChannel(ch)}
                          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                          title="Resume posting to this channel"
                          aria-label="Resume posting"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onTestPost(ch)}
                        className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                        title="Send test video post now"
                        aria-label="Send test post"
                      >
                        <Send className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteChannel(ch)}
                        className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer"
                        title="Remove channel from database"
                        aria-label="Remove channel"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
