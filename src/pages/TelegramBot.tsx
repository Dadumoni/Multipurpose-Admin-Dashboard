import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';

// Modular Telegram Bot Subcomponents & Types
import { ChannelItem, BotState } from '@/src/components/telegram-bot/types';
import TelegramBotHeader from '@/src/components/telegram-bot/TelegramBotHeader';
import TelegramBotCard from '@/src/components/telegram-bot/TelegramBotCard';
import TelegramChannelsTable from '@/src/components/telegram-bot/TelegramChannelsTable';
import AddChannelModal from '@/src/components/telegram-bot/AddChannelModal';
import CustomCaptionModal from '@/src/components/telegram-bot/CustomCaptionModal';
import DeleteChannelDialog from '@/src/components/telegram-bot/DeleteChannelDialog';

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

  // Fetch bot data from MongoDB
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
    const interval = setInterval(() => fetchBotData(true), 15000);
    return () => clearInterval(interval);
  }, []);

  const handleStartBot = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/telegram-bot/start', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Telegram Bot started successfully!');
        setBotState(prev => ({ ...prev, is_running: true, stopped: false }));
      } else {
        toast.error(data.error || 'Failed to start bot');
      }
    } catch {
      toast.error('Network error starting bot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStopBot = async () => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/telegram-bot/stop', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.info(data.message || 'Telegram Bot stopped.');
        setBotState(prev => ({ ...prev, is_running: false, stopped: true }));
      } else {
        toast.error(data.error || 'Failed to stop bot');
      }
    } catch {
      toast.error('Network error stopping bot');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveHourlyPosts = async (newVal: number) => {
    setIsSavingHourly(true);
    try {
      const res = await fetch('/api/telegram-bot/hourly-rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hourlyPostsPerChannel: newVal }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setHourlyPosts(newVal);
        toast.success(`Hourly rate updated to ${newVal} post${newVal > 1 ? 's' : ''}/hr per channel!`);
      } else {
        toast.error(data.error || 'Failed to update hourly rate');
      }
    } catch {
      toast.error('Network error saving hourly posts rate');
    } finally {
      setIsSavingHourly(false);
    }
  };

  const handleAddChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatId.trim()) {
      toast.error('Please enter a valid Telegram Chat ID');
      return;
    }

    try {
      const res = await fetch('/api/telegram-bot/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: newChatId.trim(),
          channel_name: newChatName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Channel ${data.channel?.channel_name || newChatId} added! Initial burst queued.`);
        setNewChatId('');
        setNewChatName('');
        setAddChannelOpen(false);
        fetchBotData();
      } else {
        toast.error(data.error || 'Failed to add channel');
      }
    } catch {
      toast.error('Network error adding channel');
    }
  };

  const handleToggleChannel = async (ch: ChannelItem) => {
    const nextActive = !ch.is_active;
    try {
      const res = await fetch(`/api/telegram-bot/channels/${encodeURIComponent(String(ch.chat_id))}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: nextActive }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Channel "${ch.channel_name || ch.chat_id}" ${nextActive ? 'activated' : 'paused'}`);
        setChannels(prev => prev.map(c => c.chat_id === ch.chat_id ? { ...c, is_active: nextActive } : c));
      } else {
        toast.error(data.error || 'Failed to update channel status');
      }
    } catch {
      toast.error('Network error updating channel');
    }
  };

  const handleTestPost = async (ch: ChannelItem) => {
    const toastId = toast.loading(`Sending test video to "${ch.channel_name || ch.chat_id}"...`);
    try {
      const res = await fetch(`/api/telegram-bot/channels/${encodeURIComponent(String(ch.chat_id))}/test-post`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Test video sent successfully to ${ch.channel_name}!`, { id: toastId });
        fetchBotData(true);
      } else {
        toast.error(data.error || 'Test post failed', { id: toastId });
      }
    } catch {
      toast.error('Network error sending test post', { id: toastId });
    }
  };

  const handleRemoveChannel = async () => {
    if (!channelToDelete) return;
    try {
      const res = await fetch(`/api/telegram-bot/channels/${encodeURIComponent(String(channelToDelete.chat_id))}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`Removed channel "${channelToDelete.channel_name}"`);
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

  const handleSaveCustomText = async () => {
    try {
      const res = await fetch('/api/telegram-bot/custom-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customText: editText }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success('Custom caption template updated successfully!');
        setCustomText(editText);
        setCustomTextOpen(false);
      } else {
        toast.error(data.error || 'Failed to save custom text');
      }
    } catch {
      toast.error('Network error saving custom text');
    }
  };

  const filteredChannels = channels.filter(ch => {
    if (!search.trim()) return true;
    const query = search.toLowerCase();
    const nameMatch = (ch.channel_name || '').toLowerCase().includes(query);
    const idMatch = String(ch.chat_id).toLowerCase().includes(query);
    return nameMatch || idMatch;
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      {/* Reusable Header */}
      <TelegramBotHeader
        botState={botState}
        onRefresh={() => fetchBotData()}
        onOpenCustomText={() => {
          setEditText(customText);
          setCustomTextOpen(true);
        }}
      />

      {/* Reusable Bot Engine Card */}
      <TelegramBotCard
        botState={botState}
        channels={channels}
        hourlyPosts={hourlyPosts}
        isSavingHourly={isSavingHourly}
        actionLoading={actionLoading}
        onSaveHourlyPosts={handleSaveHourlyPosts}
        onStartBot={handleStartBot}
        onStopBot={handleStopBot}
      />

      {/* Reusable Channels Table */}
      <TelegramChannelsTable
        channels={channels}
        filteredChannels={filteredChannels}
        search={search}
        setSearch={setSearch}
        onOpenAddChannel={() => setAddChannelOpen(true)}
        onToggleChannel={handleToggleChannel}
        onTestPost={handleTestPost}
        onDeleteChannel={(ch) => {
          setChannelToDelete(ch);
          setDeleteConfirmOpen(true);
        }}
      />

      {/* Reusable Modals */}
      <AddChannelModal
        open={addChannelOpen}
        onOpenChange={setAddChannelOpen}
        newChatId={newChatId}
        setNewChatId={setNewChatId}
        newChatName={newChatName}
        setNewChatName={setNewChatName}
        onSubmit={handleAddChannel}
      />

      <CustomCaptionModal
        open={customTextOpen}
        onOpenChange={setCustomTextOpen}
        editText={editText}
        setEditText={setEditText}
        onSave={handleSaveCustomText}
      />

      <DeleteChannelDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        channelToDelete={channelToDelete}
        onConfirm={handleRemoveChannel}
      />
    </div>
  );
}
