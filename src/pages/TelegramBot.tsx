import React, { useState, useEffect } from 'react';
import { 
  Bot, 
  Play, 
  Square, 
  Trash2, 
  Plus, 
  RotateCw, 
  Send, 
  Check, 
  Copy, 
  AlertCircle, 
  FileText, 
  Radio, 
  Pause,
  ExternalLink,
  Search,
  MessageSquare
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";

interface ChannelItem {
  chat_id: number | string;
  channel_name: string;
  total_posts: number;
  success_posts: number;
  failed_posts: number;
  is_active: boolean;
  posted_ids: (number | string)[];
  added_at: string;
}

interface BotState {
  id: string;
  is_running: boolean;
  stopped: boolean;
  bot_name: string;
  bot_username: string;
  last_started_at: string | null;
  last_stopped_at: string | null;
}

export default function TelegramBot() {
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [botState, setBotState] = useState<BotState>({
    id: 'status',
    is_running: false,
    stopped: true,
    bot_name: 'Poster Bot',
    bot_username: '',
    last_started_at: null,
    last_stopped_at: null,
  });
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [customText, setCustomText] = useState('');
  const [search, setSearch] = useState('');
  const [hourlyPosts, setHourlyPosts] = useState<number>(1);
  const [isSavingHourly, setIsSavingHourly] = useState<boolean>(false);

  // Modals
  const [addChannelOpen, setAddChannelOpen] = useState(false);
  const [newChatId, setNewChatId] = useState('');
  const [newChatName, setNewChatName] = useState('');
  const [customTextOpen, setCustomTextOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState<ChannelItem | null>(null);

  // Fetch bot data from MongoDB (no external API calls on read)
  const fetchBotData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/telegram-bot/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.state) setBotState(data.state);
          if (Array.isArray(data.channels)) setChannels(data.channels);
          if (typeof data.customText === 'string') setCustomText(data.customText);
          if (typeof data.hourlyPostsPerChannel === 'number') setHourlyPosts(data.hourlyPostsPerChannel);
        }
      }
    } catch (err: any) {
      console.error('Error fetching bot status:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchBotData();
    // Poll status every 15s to update counts live
    const interval = setInterval(() => fetchBotData(true), 15000);
    return () => clearInterval(interval);
  }, []);

  // Start Bot Handler
  const handleStartBot = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/telegram-bot/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Bot started: ${data.botName || 'Online'}`);
        await fetchBotData(true);
      } else {
        toast.error(data.error || 'Failed to start bot');
      }
    } catch {
      toast.error('Network error starting bot');
    } finally {
      setActionLoading(false);
    }
  };

  // Stop Bot Handler
  const handleStopBot = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/telegram-bot/stop', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.info('Bot stopped (Offline)');
        await fetchBotData(true);
      } else {
        toast.error(data.error || 'Failed to stop bot');
      }
    } catch {
      toast.error('Network error stopping bot');
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle channel active status (Pause / Start)
  const handleToggleChannel = async (channel: ChannelItem) => {
    const nextState = !channel.is_active;
    try {
      const res = await fetch('/api/telegram-bot/channels/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: channel.chat_id, isActive: nextState }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(nextState ? `Started posting to ${channel.channel_name}` : `Paused posting to ${channel.channel_name}`);
        setChannels(prev => prev.map(c => c.chat_id === channel.chat_id ? { ...c, is_active: nextState } : c));
      } else {
        toast.error(data.error || 'Failed to update channel');
      }
    } catch {
      toast.error('Network error updating channel');
    }
  };

  // Remove channel
  const handleRemoveChannel = async () => {
    if (!channelToDelete) return;
    try {
      const res = await fetch('/api/telegram-bot/channels/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: channelToDelete.chat_id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Channel ${channelToDelete.channel_name} removed`);
        setChannels(prev => prev.filter(c => c.chat_id !== channelToDelete.chat_id));
        setDeleteConfirmOpen(false);
        setChannelToDelete(null);
      } else {
        toast.error(data.error || 'Failed to remove channel');
      }
    } catch {
      toast.error('Network error removing channel');
    }
  };

  // Test post to a specific channel
  const handleTestPost = async (channel: ChannelItem) => {
    try {
      toast.info(`Sending test post to ${channel.channel_name}...`);
      const res = await fetch('/api/telegram-bot/channels/test-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: channel.chat_id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Test post sent successfully to ${channel.channel_name}!`);
        await fetchBotData(true);
      } else {
        toast.error(data.error || 'Failed to send test post');
      }
    } catch {
      toast.error('Network error sending test post');
    }
  };

  // Add channel manually
  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatId.trim()) {
      toast.error('Channel ID is required');
      return;
    }

    try {
      const res = await fetch('/api/telegram-bot/channels/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: newChatId.trim(), channelName: newChatName.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Channel added successfully!');
        setNewChatId('');
        setNewChatName('');
        setAddChannelOpen(false);
        await fetchBotData(true);
      } else {
        toast.error(data.error || 'Failed to add channel');
      }
    } catch {
      toast.error('Network error adding channel');
    }
  };

  // Save custom text
  const handleSaveCustomText = async () => {
    try {
      const res = await fetch('/api/telegram-bot/settings/custom-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: editText }),
      });
      if (res.ok) {
        setCustomText(editText);
        setCustomTextOpen(false);
        toast.success('Custom text updated successfully!');
      } else {
        toast.error('Failed to save custom text');
      }
    } catch {
      toast.error('Network error saving custom text');
    }
  };

  const handleSaveHourlyPosts = async (val: number) => {
    setHourlyPosts(val);
    setIsSavingHourly(true);
    try {
      const res = await fetch('/api/telegram-bot/settings/hourly-posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: val }),
      });
      if (res.ok) {
        toast.success(`Hourly auto-posting set to ${val} post${val > 1 ? 's' : ''} per channel`);
      } else {
        toast.error('Failed to update hourly posts limit');
      }
    } catch {
      toast.error('Network error updating hourly posts');
    } finally {
      setIsSavingHourly(false);
    }
  };

  const isOnline = Boolean(botState.is_running && !botState.stopped);

  const filteredChannels = channels.filter(c => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      String(c.chat_id).toLowerCase().includes(q) ||
      (c.channel_name || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-black dark:text-white">Telegram Poster Bot</h1>
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Automated video posting directly to your Telegram channels from MongoDB.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchBotData()}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium text-black dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Refresh status"
          >
            <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditText(customText);
              setCustomTextOpen(true);
            }}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black hover:bg-zinc-50 dark:hover:bg-zinc-900 text-xs font-medium text-black dark:text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Set custom caption text/links"
          >
            <MessageSquare className="h-3.5 w-3.5 text-zinc-500" />
            <span>Custom Caption Text</span>
          </button>
        </div>
      </div>

      {/* 1. BOT DETAILS CARD */}
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Bot Profile & Status Info */}
          <div className="flex items-start sm:items-center gap-4">
            <div className="h-14 w-14 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 grid place-items-center shrink-0">
              <Bot className="h-7 w-7 text-black dark:text-white" />
            </div>

            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-lg font-bold text-black dark:text-white">
                  {botState.bot_name || 'Poster Bot'}
                </span>

                {botState.bot_username && (
                  <span className="text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded-md">
                    {botState.bot_username}
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
                onChange={(e) => handleSaveHourlyPosts(Number(e.target.value))}
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
                onClick={handleStopBot}
                className="h-10 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-xs font-semibold text-rose-600 dark:text-rose-400 inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>{actionLoading ? 'Stopping...' : 'Stop Bot'}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleStartBot}
                className="h-10 px-5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-2 transition-colors cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{actionLoading ? 'Starting...' : 'Start Bot'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. ALL CHANNELS CARD */}
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

            {/* Add Channel Button right after Search Channels */}
            <button
              type="button"
              onClick={() => setAddChannelOpen(true)}
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
              onClick={() => setAddChannelOpen(true)}
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

                    {/* Total Post: Success (Green) / Failed (Red) */}
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

                    {/* Actions: Stop (Pause) / Start (Play) / Test / Remove */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Play / Pause Toggle button */}
                        {ch.is_active !== false ? (
                          <button
                            type="button"
                            onClick={() => handleToggleChannel(ch)}
                            className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-600 dark:text-amber-400 transition-colors cursor-pointer"
                            title="Pause posting to this channel"
                            aria-label="Pause posting"
                          >
                            <Pause className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleChannel(ch)}
                            className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer"
                            title="Resume posting to this channel"
                            aria-label="Resume posting"
                          >
                            <Play className="h-3.5 w-3.5 fill-current" />
                          </button>
                        )}

                        {/* Send Test Post */}
                        <button
                          type="button"
                          onClick={() => handleTestPost(ch)}
                          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors cursor-pointer"
                          title="Send test video post now"
                          aria-label="Send test post"
                        >
                          <Send className="h-3.5 w-3.5" />
                        </button>

                        {/* Remove / Delete Channel */}
                        <button
                          type="button"
                          onClick={() => {
                            setChannelToDelete(ch);
                            setDeleteConfirmOpen(true);
                          }}
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

      {/* MODAL: ADD CHANNEL */}
      <Dialog open={addChannelOpen} onOpenChange={setAddChannelOpen}>
        <DialogContent className="max-w-md border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Add Telegram Channel</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Provide the Telegram Channel ID. The bot must be an administrator in the channel with &ldquo;Post Messages&rdquo; permission.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddChannel} className="space-y-4 pt-2 text-xs">
            <div className="space-y-1.5">
              <label className="font-medium text-zinc-700 dark:text-zinc-300">
                Channel ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. -1001234567890"
                value={newChatId}
                onChange={(e) => setNewChatId(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white font-mono focus:outline-none"
              />
              <p className="text-[11px] text-zinc-400">
                You can forward any message from your channel to @userinfobot or your poster bot to get the channel ID.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="font-medium text-zinc-700 dark:text-zinc-300">
                Channel Name (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Movie Updates Channel"
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white focus:outline-none"
              />
            </div>

            <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/50 text-[11px] text-zinc-500 space-y-1">
              <div className="font-semibold text-black dark:text-white">Notice:</div>
              <div>Once added, the bot will immediately post an initial burst of 10 videos (with a 10s gap).</div>
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setAddChannelOpen(false)}
                className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="h-8 px-4 rounded-lg bg-black text-white dark:bg-white dark:text-black font-semibold hover:opacity-90 transition-opacity"
              >
                Add Channel
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL: CUSTOM TEXT SETTINGS */}
      <Dialog open={customTextOpen} onOpenChange={setCustomTextOpen}>
        <DialogContent className="max-w-md border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Custom Caption Text</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              This text, emojis, or promotional link will automatically be appended at the end of every video post caption.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2 text-xs">
            <textarea
              rows={4}
              placeholder="e.g. Join our backup channel @mychannel for daily leaks! 🔥"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="w-full p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-black dark:text-white focus:outline-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={() => setCustomTextOpen(false)}
              className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveCustomText}
              className="h-8 px-4 rounded-lg bg-black text-white dark:bg-white dark:text-black font-semibold hover:opacity-90 transition-opacity"
            >
              Save Text
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: DELETE CHANNEL CONFIRMATION */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black text-black dark:text-white">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-red-600 dark:text-red-400">Remove Channel</DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Are you sure you want to remove <strong>{channelToDelete?.channel_name}</strong> (<code>{channelToDelete?.chat_id}</code>)? The bot will permanently stop posting to this channel and remove it from MongoDB.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(false)}
              className="h-8 px-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRemoveChannel}
              className="h-8 px-4 rounded-lg bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors"
            >
              Confirm Remove
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
