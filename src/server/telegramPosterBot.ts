import axios from 'axios';
import {
  connectToDatabase,
  PostModel,
  TelegramBotChannelModel,
  TelegramBotStateModel,
  TelegramBotSettingsModel,
  ITelegramBotChannel,
  ITelegramBotState,
} from '../lib/mongodb.js';

let isRunning = false;
let isGloballyStopped = false;
let pollingAbortController: AbortController | null = null;
let hourlyIntervalTimer: NodeJS.Timeout | null = null;
let lastUpdateId = 0;
const waitingConversations = new Map<number | string, 'WAITING_FOR_CHANNEL' | 'WAITING_FOR_CUSTOM_TEXT'>();

export function slugify(title: string): string {
  return (title || '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\-]/g, '')
    .replace(/\-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getBotToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || '').trim();
}

function getStreamingUrl(): string {
  const url = process.env.STREAMING_URL || process.env.APP_URL || '';
  return url.replace(/\/+$/, '');
}

export async function getCustomText(): Promise<string> {
  try {
    await connectToDatabase();
    const setting = await TelegramBotSettingsModel.findOne({ id: 'custom_text' }).lean();
    return setting?.text || '';
  } catch {
    return '';
  }
}

export async function setCustomText(text: string): Promise<void> {
  await connectToDatabase();
  await TelegramBotSettingsModel.findOneAndUpdate(
    { id: 'custom_text' },
    { $set: { text, updated_at: new Date() } },
    { upsert: true }
  );
}

export async function getHourlyPostsPerChannel(): Promise<number> {
  try {
    await connectToDatabase();
    const config = await TelegramBotSettingsModel.findOne({ id: 'hourly_config' }).lean();
    const parsed = Number(config?.text);
    return !isNaN(parsed) && parsed > 0 ? parsed : 5;
  } catch {
    return 5;
  }
}

export async function setHourlyPostsPerChannel(count: number): Promise<void> {
  await connectToDatabase();
  const safeCount = Math.max(1, Math.min(50, Math.floor(Number(count) || 5)));
  await TelegramBotSettingsModel.findOneAndUpdate(
    { id: 'hourly_config' },
    { $set: { text: String(safeCount), updated_at: new Date() } },
    { upsert: true }
  );
}

/**
 * Posts a single random unposted video from MongoDB 'posts' table to the specified Telegram channel.
 */
export async function postToChannel(chatId: number | string): Promise<{ success: boolean; error?: string; postId?: any }> {
  const token = getBotToken();
  if (!token) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  try {
    await connectToDatabase();

    const channel = await TelegramBotChannelModel.findOne({ chat_id: chatId });
    if (!channel || channel.is_active === false) {
      return { success: false, error: 'Channel is paused or not found' };
    }

    const postedIds = (channel.posted_ids || []).map((id: any) => String(id));

    // Fetch unposted videos from MongoDB posts table (NOT Supabase)
    const filter: any = {};
    if (postedIds.length > 0) {
      filter.$and = [
        { id: { $nin: postedIds.map(Number).filter((n: number) => !isNaN(n)) } },
        { video_id: { $nin: postedIds } },
      ];
    }

    let availablePosts = await PostModel.find(filter).limit(100).lean();

    // If all posts were already posted, reset channel's posted_ids and pick from all posts
    if (!availablePosts || availablePosts.length === 0) {
      console.log(`[TelegramBot] All posts published to channel ${chatId}. Resetting history.`);
      await TelegramBotChannelModel.updateOne({ chat_id: chatId }, { $set: { posted_ids: [] } });
      availablePosts = await PostModel.find({}).limit(100).lean();
    }

    if (!availablePosts || availablePosts.length === 0) {
      return { success: false, error: 'No posts available in MongoDB database' };
    }

    const randomPost = availablePosts[Math.floor(Math.random() * availablePosts.length)];
    const postIdentifier = randomPost.id || randomPost.video_id || String(randomPost._id);
    const title = randomPost.title || 'Exclusive Video';
    const thumbnailUrl = randomPost.thumbnail_url || null;

    // Generate slug-based streaming URL
    const slug = slugify(title);
    const streamingUrl = getStreamingUrl();
    const videoLink = streamingUrl ? `${streamingUrl}/${slug}` : (randomPost.video_url || '#');

    const customText = await getCustomText();

    // Build caption HTML
    const formattedTitle = `<b><code>${escapeHtml(title)}</code></b>`;
    const formattedHeading = `<b>Watch Full Video👇</b>`;
    const formattedLink = `<blockquote>${escapeHtml(videoLink)}</blockquote>`;

    let caption = `${formattedTitle}\n\n${formattedHeading}\n${formattedLink}`;
    if (customText) {
      caption += `\n\n${customText}`;
    }

    let sent = false;

    // Try sending photo if thumbnail is available
    if (thumbnailUrl) {
      try {
        const sendPhotoRes = await axios.post(
          `https://api.telegram.org/bot${token}/sendPhoto`,
          {
            chat_id: chatId,
            photo: thumbnailUrl,
            caption: caption,
            parse_mode: 'HTML',
          },
          { timeout: 15000 }
        );
        if (sendPhotoRes.data?.ok) {
          sent = true;
        }
      } catch (err: any) {
        console.warn(`[TelegramBot] sendPhoto failed for ${chatId}, falling back to text message:`, err.message);
      }
    }

    // Fallback to text message
    if (!sent) {
      const sendMsgRes = await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          chat_id: chatId,
          text: caption,
          parse_mode: 'HTML',
        },
        { timeout: 15000 }
      );
      if (sendMsgRes.data?.ok) {
        sent = true;
      }
    }

    if (sent) {
      await TelegramBotChannelModel.updateOne(
        { chat_id: chatId },
        {
          $push: { posted_ids: postIdentifier },
          $inc: { total_posts: 1, success_posts: 1 },
        }
      );
      console.log(`[TelegramBot] Successfully posted "${title}" to channel ${chatId}`);
      return { success: true, postId: postIdentifier };
    } else {
      await TelegramBotChannelModel.updateOne({ chat_id: chatId }, { $inc: { failed_posts: 1 } });
      return { success: false, error: 'Telegram API rejected post message' };
    }
  } catch (err: any) {
    console.error(`[TelegramBot] Error posting to channel ${chatId}:`, err.message);
    await TelegramBotChannelModel.updateOne({ chat_id: chatId }, { $inc: { failed_posts: 1 } }).catch(() => {});
    return { success: false, error: err.message };
  }
}

/**
 * Immediately posts 10 messages with a 10-second gap when a channel is added.
 */
export async function processInitialBurst(chatId: number | string): Promise<void> {
  console.log(`[TelegramBot] Starting initial 10-posts burst for channel ${chatId}`);
  for (let i = 0; i < 10; i++) {
    if (isGloballyStopped || !isRunning) {
      console.log(`[TelegramBot] Initial burst halted because bot is stopped.`);
      break;
    }
    const channel = await TelegramBotChannelModel.findOne({ chat_id: chatId }).lean();
    if (!channel || channel.is_active === false) {
      console.log(`[TelegramBot] Initial burst halted because channel is paused or removed.`);
      break;
    }

    await postToChannel(chatId);

    if (i < 9) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  console.log(`[TelegramBot] Completed initial burst for channel ${chatId}`);
}

/**
 * Hourly scheduled posting job across all active channels.
 * Runs sequentially: Channel 1 posts N videos with 5s gap -> 5s gap -> Channel 2 posts N videos with 5s gap...
 */
export async function hourlyPostingJob(): Promise<void> {
  if (isGloballyStopped || !isRunning) {
    console.log('[TelegramBot] Hourly posting job skipped (bot stopped).');
    return;
  }

  try {
    await connectToDatabase();
    const channels = await TelegramBotChannelModel.find({ is_active: { $ne: false } }).lean();

    if (!channels || channels.length === 0) {
      console.log('[TelegramBot] No active channels found for hourly posting.');
      return;
    }

    const postsPerChannel = await getHourlyPostsPerChannel();
    console.log(`[TelegramBot] Starting Hourly Job: ${channels.length} active channel(s), ${postsPerChannel} post(s) per channel with 5s gap.`);

    for (let cIdx = 0; cIdx < channels.length; cIdx++) {
      if (isGloballyStopped || !isRunning) {
        console.log('[TelegramBot] Hourly job halted because bot was stopped.');
        break;
      }

      const ch = channels[cIdx];
      console.log(`[TelegramBot] Processing channel [${cIdx + 1}/${channels.length}] "${ch.channel_name}" (${ch.chat_id}): queueing ${postsPerChannel} posts.`);

      for (let p = 1; p <= postsPerChannel; p++) {
        if (isGloballyStopped || !isRunning) break;

        // Verify channel is still active in database
        const currentCh = await TelegramBotChannelModel.findOne({ chat_id: ch.chat_id }).lean();
        if (!currentCh || currentCh.is_active === false) {
          console.log(`[TelegramBot] Channel "${ch.channel_name}" paused or removed. Stopping posts for this channel.`);
          break;
        }

        console.log(`[TelegramBot] Channel "${ch.channel_name}": posting video ${p} of ${postsPerChannel}...`);
        await postToChannel(ch.chat_id);

        // 5-second gap between each post within the same channel
        if (p < postsPerChannel) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      // 5-second gap before starting the next channel
      if (cIdx < channels.length - 1 && isRunning && !isGloballyStopped) {
        console.log(`[TelegramBot] Finished channel "${ch.channel_name}". Waiting 5s before next channel...`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    console.log('[TelegramBot] Hourly posting job completed for all channels.');
  } catch (err: any) {
    console.error('[TelegramBot] Error in hourly posting job:', err.message);
  }
}

export async function triggerHourlyJobNow(): Promise<{ success: boolean; message: string }> {
  if (!isRunning || isGloballyStopped) {
    return { success: false, message: 'Bot is currently Offline or Stopped. Start the bot first.' };
  }
  hourlyPostingJob().catch((err) => console.error('[TelegramBot] Trigger hourly job error:', err));
  return { success: true, message: 'Hourly posting job triggered successfully.' };
}

function escapeHtml(text: string): string {
  return (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Handle incoming Telegram messages and commands.
 */
async function handleUpdate(update: any): Promise<void> {
  const token = getBotToken();
  if (!token) return;

  const message = update.message;
  if (!message) return;

  const chatId = message.chat?.id;
  const text = (message.text || '').trim();

  // Check ongoing conversation state
  const convState = waitingConversations.get(chatId);

  if (convState === 'WAITING_FOR_CHANNEL') {
    waitingConversations.delete(chatId);

    let targetChatId: number | string | null = null;
    let targetChatTitle = 'Unknown Channel';

    if (message.forward_origin?.chat) {
      targetChatId = message.forward_origin.chat.id;
      targetChatTitle = message.forward_origin.chat.title || String(targetChatId);
    } else if (message.forward_from_chat) {
      targetChatId = message.forward_from_chat.id;
      targetChatTitle = message.forward_from_chat.title || String(targetChatId);
    } else if (text) {
      const parsedNum = Number(text);
      if (!isNaN(parsedNum)) {
        targetChatId = parsedNum;
        try {
          const chatInfoRes = await axios.post(`https://api.telegram.org/bot${token}/getChat`, { chat_id: parsedNum });
          if (chatInfoRes.data?.result) {
            targetChatTitle = chatInfoRes.data.result.title || String(parsedNum);
          }
        } catch {}
      }
    }

    if (!targetChatId) {
      await sendReply(chatId, '❌ Invalid Channel ID or forwarded message. Please provide a valid Channel ID (e.g. <code>-1001234567890</code>).');
      return;
    }

    await connectToDatabase();
    const existing = await TelegramBotChannelModel.findOne({ chat_id: targetChatId });
    if (existing) {
      await sendReply(chatId, `⚠️ This channel (<b>${escapeHtml(targetChatTitle)}</b>) is already registered in the database!`);
      return;
    }

    await TelegramBotChannelModel.create({
      chat_id: targetChatId,
      channel_name: targetChatTitle,
      total_posts: 0,
      success_posts: 0,
      failed_posts: 0,
      is_active: true,
      posted_ids: [],
      added_at: new Date(),
    });

    await sendReply(
      chatId,
      `✅ <b>Channel Added Successfully!</b>\n📢 Name: <b>${escapeHtml(targetChatTitle)}</b>\n🆔 ID: <code>${targetChatId}</code>\n\n🚀 Starting initial 10 posts right now (with a 10-second gap)...`
    );

    // Fire initial 10-post burst asynchronously
    processInitialBurst(targetChatId).catch((err) => console.error('[TelegramBot] Initial burst error:', err));
    return;
  }

  if (convState === 'WAITING_FOR_CUSTOM_TEXT') {
    waitingConversations.delete(chatId);
    await setCustomText(text);
    await sendReply(chatId, `✅ <b>Custom Text Updated Successfully!</b>\n\nNew Custom Text:\n${text}`);
    return;
  }

  // Handle standard slash commands
  if (text.startsWith('/start')) {
    const welcome =
      `👋 <b>Welcome to the Automated Telegram Poster Bot!</b>\n\n` +
      `This bot automatically posts random videos from your MongoDB database to configured channels.\n\n` +
      `📌 <b>Supported Commands:</b>\n` +
      `• /start - Show this welcome message and command guide.\n` +
      `• /add_channel - Add a new channel (Bot will immediately make 10 initial posts).\n` +
      `• /remove_channel &lt;id&gt; - Remove a channel from the database.\n` +
      `• /all_channel - View a list of all connected channels.\n` +
      `• /add_custom_text - Set custom text/emojis/links for captions.\n` +
      `• /test_post - Immediately trigger a test post to all connected channels.\n` +
      `• /stop_posting - Temporarily stop automated posting.\n` +
      `• /start_posting - Resume automated posting.\n\n` +
      `💡 <i>Managed seamlessly from your Admin Dashboard!</i>`;
    await sendReply(chatId, welcome);
    return;
  }

  if (text.startsWith('/add_channel')) {
    waitingConversations.set(chatId, 'WAITING_FOR_CHANNEL');
    await sendReply(
      chatId,
      `➕ Please <b>forward</b> a message from the channel here, or send the channel's <b>Channel ID</b> directly (e.g., <code>-100xxxxxxxxxx</code>).`
    );
    return;
  }

  if (text.startsWith('/remove_channel')) {
    const parts = text.split(/\s+/);
    if (parts.length < 2) {
      await sendReply(chatId, '⚠️ Please provide the channel ID. Example: <code>/remove_channel -100123456789</code>');
      return;
    }
    const targetChatId = parts[1];
    await connectToDatabase();
    const res = await TelegramBotChannelModel.deleteOne({
      $or: [{ chat_id: targetChatId }, { chat_id: Number(targetChatId) }],
    });
    if (res.deletedCount > 0) {
      await sendReply(chatId, `🗑️ Channel <code>${targetChatId}</code> successfully removed from the database.`);
    } else {
      await sendReply(chatId, `❌ Channel <code>${targetChatId}</code> was not found in the database.`);
    }
    return;
  }

  if (text.startsWith('/all_channel')) {
    await connectToDatabase();
    const channels = await TelegramBotChannelModel.find({}).lean();
    if (!channels || channels.length === 0) {
      await sendReply(chatId, '📂 No channels connected yet. Use <code>/add_channel</code> to add one.');
      return;
    }
    let listText = `📋 <b>Connected Channels List (${channels.length}):</b>\n\n`;
    channels.forEach((ch, idx) => {
      const statusIcon = ch.is_active === false ? '⏸️ (Paused)' : '▶️ (Active)';
      listText +=
        `${idx + 1}. <b>${escapeHtml(ch.channel_name || 'Channel')}</b> ${statusIcon}\n` +
        `   • ID: <code>${ch.chat_id}</code>\n` +
        `   • Total Posts: <b>${ch.total_posts || 0}</b> (${ch.success_posts || 0} sent, ${ch.failed_posts || 0} failed)\n\n`;
    });
    await sendReply(chatId, listText);
    return;
  }

  if (text.startsWith('/add_custom_text')) {
    const cur = await getCustomText();
    waitingConversations.set(chatId, 'WAITING_FOR_CUSTOM_TEXT');
    let prompt = `✏️ Please send the <b>custom text</b>, emojis, or links to append at the end of every caption.`;
    if (cur) {
      prompt += `\n\n📌 <b>Current Custom Text:</b>\n${escapeHtml(cur)}`;
    }
    await sendReply(chatId, prompt);
    return;
  }

  if (text.startsWith('/test_post')) {
    await connectToDatabase();
    const channels = await TelegramBotChannelModel.find({ is_active: { $ne: false } }).lean();
    if (!channels || channels.length === 0) {
      await sendReply(chatId, '📂 No active channels connected yet.');
      return;
    }
    await sendReply(chatId, `🚀 Triggering test post to ${channels.length} channel(s)...`);
    for (const ch of channels) {
      await postToChannel(ch.chat_id);
      await new Promise((r) => setTimeout(r, 2000));
    }
    await sendReply(chatId, '✅ Test posts completed!');
    return;
  }

  if (text.startsWith('/stop_posting')) {
    await setPostingStopped(true);
    await sendReply(chatId, '🛑 <b>Posting Stopped!</b> Automated posting has been paused.');
    return;
  }

  if (text.startsWith('/start_posting')) {
    await setPostingStopped(false);
    await sendReply(chatId, '▶️ <b>Posting Resumed!</b> Automated posting is now active again.');
    return;
  }
}

async function sendReply(chatId: number | string, html: string): Promise<void> {
  const token = getBotToken();
  if (!token) return;
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text: html,
        parse_mode: 'HTML',
      },
      { timeout: 10000 }
    );
  } catch (err: any) {
    console.warn(`[TelegramBot] sendReply error:`, err.message);
  }
}

/**
 * Long polling loop to fetch Telegram updates.
 */
async function runPollingLoop(): Promise<void> {
  const token = getBotToken();
  if (!token) return;

  console.log('[TelegramBot] Long polling started for Telegram updates.');

  while (isRunning) {
    try {
      pollingAbortController = new AbortController();
      const res = await axios.get(`https://api.telegram.org/bot${token}/getUpdates`, {
        params: {
          offset: lastUpdateId + 1,
          timeout: 20,
        },
        signal: pollingAbortController.signal,
        timeout: 25000,
      });

      if (res.data?.ok && Array.isArray(res.data.result)) {
        for (const update of res.data.result) {
          if (!isRunning) break;
          lastUpdateId = Math.max(lastUpdateId, update.update_id);
          await handleUpdate(update).catch((err) => console.error('[TelegramBot] Update handler error:', err));
        }
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || axios.isCancel(err) || !isRunning) {
        break;
      }
      // Delay before retry on network error
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }

  console.log('[TelegramBot] Long polling stopped.');
}

/**
 * Start the Telegram poster bot manually.
 * Fetches bot profile via getMe() once and stores in MongoDB telegram_bot_state.
 */
export async function startBot(): Promise<{ success: boolean; error?: string; botName?: string }> {
  const token = getBotToken();
  if (!token) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN environment variable is missing' };
  }

  if (isRunning) {
    return { success: true, botName: 'Already Running' };
  }

  try {
    await connectToDatabase();

    // Call getMe() on startup to get bot identity once and store in MongoDB
    console.log('[TelegramBot] Contacting Telegram API (getMe)...');
    const meRes = await axios.get(`https://api.telegram.org/bot${token}/getMe`, { timeout: 10000 });
    const botUser = meRes.data?.result;

    const botName = botUser?.first_name || 'Poster Bot';
    const botUsername = botUser?.username ? `@${botUser.username}` : '';

    await TelegramBotStateModel.findOneAndUpdate(
      { id: 'status' },
      {
        $set: {
          id: 'status',
          is_running: true,
          stopped: false,
          bot_name: botName,
          bot_username: botUsername,
          last_started_at: new Date(),
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );

    isRunning = true;
    isGloballyStopped = false;

    // Start background polling
    runPollingLoop().catch((err) => console.error('[TelegramBot] Polling loop error:', err));

    // Start hourly scheduler (1 hour = 3600000ms)
    if (hourlyIntervalTimer) clearInterval(hourlyIntervalTimer);
    hourlyIntervalTimer = setInterval(() => {
      hourlyPostingJob().catch((err) => console.error('[TelegramBot] Hourly job error:', err));
    }, 3600000);

    console.log(`[TelegramBot] Bot started successfully: ${botName} (${botUsername}) [ONLINE]`);
    return { success: true, botName: `${botName} ${botUsername}` };
  } catch (err: any) {
    console.error('[TelegramBot] Failed to start bot:', err.message);
    return { success: false, error: err.response?.data?.description || err.message };
  }
}

/**
 * Stop the Telegram poster bot manually.
 */
export async function stopBot(): Promise<{ success: boolean }> {
  isRunning = false;
  isGloballyStopped = true;

  if (pollingAbortController) {
    pollingAbortController.abort();
    pollingAbortController = null;
  }

  if (hourlyIntervalTimer) {
    clearInterval(hourlyIntervalTimer);
    hourlyIntervalTimer = null;
  }

  try {
    await connectToDatabase();
    await TelegramBotStateModel.findOneAndUpdate(
      { id: 'status' },
      {
        $set: {
          is_running: false,
          stopped: true,
          last_stopped_at: new Date(),
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );
  } catch {}

  console.log('[TelegramBot] Bot stopped [OFFLINE]');
  return { success: true };
}

export async function setPostingStopped(stopped: boolean): Promise<void> {
  isGloballyStopped = stopped;
  await connectToDatabase();
  await TelegramBotStateModel.findOneAndUpdate(
    { id: 'status' },
    { $set: { stopped, updated_at: new Date() } },
    { upsert: true }
  );
}

/**
 * Retrieve bot details and channels from MongoDB directly (no unnecessary repeated API calls).
 */
export async function getBotDashboardData(): Promise<{
  state: ITelegramBotState;
  totalChannels: number;
  channels: ITelegramBotChannel[];
  customText: string;
  hourlyPostsPerChannel: number;
}> {
  await connectToDatabase();

  let state = await TelegramBotStateModel.findOne({ id: 'status' }).lean();
  if (!state) {
    state = {
      id: 'status',
      is_running: false,
      stopped: true,
      bot_name: 'Poster Bot',
      bot_username: '',
      last_started_at: null,
      last_stopped_at: null,
      updated_at: new Date(),
    };
  }

  // Ensure current in-memory status matches state
  (state as any).is_running = isRunning;
  (state as any).stopped = isGloballyStopped || !isRunning;

  const channels = await TelegramBotChannelModel.find({}).sort({ added_at: -1 }).lean();
  const customText = await getCustomText();
  const hourlyPostsPerChannel = await getHourlyPostsPerChannel();

  return {
    state: state as ITelegramBotState,
    totalChannels: channels.length,
    channels: channels as ITelegramBotChannel[],
    customText,
    hourlyPostsPerChannel,
  };
}

/**
 * Toggle active state of a specific channel (Start/Pause posting for that channel).
 */
export async function toggleChannelActive(chatId: number | string, isActive: boolean): Promise<boolean> {
  await connectToDatabase();
  const res = await TelegramBotChannelModel.updateOne(
    { $or: [{ chat_id: chatId }, { chat_id: Number(chatId) }] },
    { $set: { is_active: isActive } }
  );
  return res.modifiedCount > 0;
}

/**
 * Remove a channel permanently from database.
 */
export async function removeChannel(chatId: number | string): Promise<boolean> {
  await connectToDatabase();
  const res = await TelegramBotChannelModel.deleteOne({
    $or: [{ chat_id: chatId }, { chat_id: Number(chatId) }],
  });
  return res.deletedCount > 0;
}

/**
 * Add channel manually from Dashboard.
 */
export async function addChannelManual(chatId: number | string, channelName?: string): Promise<{ success: boolean; error?: string }> {
  await connectToDatabase();
  const existing = await TelegramBotChannelModel.findOne({
    $or: [{ chat_id: chatId }, { chat_id: Number(chatId) }],
  });
  if (existing) {
    return { success: false, error: 'Channel is already added in the database' };
  }

  let resolvedTitle = channelName || `Channel ${chatId}`;

  // Optionally attempt resolving real title from Telegram getChat
  const token = getBotToken();
  if (token) {
    try {
      const res = await axios.post(`https://api.telegram.org/bot${token}/getChat`, { chat_id: chatId }, { timeout: 8000 });
      if (res.data?.result?.title) {
        resolvedTitle = res.data.result.title;
      }
    } catch {}
  }

  await TelegramBotChannelModel.create({
    chat_id: chatId,
    channel_name: resolvedTitle,
    total_posts: 0,
    success_posts: 0,
    failed_posts: 0,
    is_active: true,
    posted_ids: [],
    added_at: new Date(),
  });

  // Start 10-post burst if bot is running
  if (isRunning && !isGloballyStopped) {
    processInitialBurst(chatId).catch((err) => console.error('[TelegramBot] Manual add burst error:', err));
  }

  return { success: true };
}
