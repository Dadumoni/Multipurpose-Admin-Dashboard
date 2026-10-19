import express from 'express';
import {
  startBot,
  stopBot,
  getBotDashboardData,
  toggleChannelActive,
  removeChannel,
  addChannelManual,
  postToChannel,
  setCustomText,
  setHourlyPostsPerChannel,
  triggerHourlyJobNow,
} from '../telegramPosterBot.js';

export const telegramBotRouter = express.Router();

telegramBotRouter.get('/api/telegram-bot/status', async (_req, res) => {
  try {
    const data = await getBotDashboardData();
    res.json({ success: true, ...data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch bot data' });
  }
});

telegramBotRouter.post('/api/telegram-bot/start', async (_req, res) => {
  try {
    const result = await startBot();
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to start bot' });
  }
});

telegramBotRouter.post('/api/telegram-bot/stop', async (_req, res) => {
  try {
    const result = await stopBot();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to stop bot' });
  }
});

telegramBotRouter.post('/api/telegram-bot/channels/toggle', async (req, res) => {
  try {
    const { chatId, isActive } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });
    const modified = await toggleChannelActive(chatId, Boolean(isActive));
    res.json({ success: true, modified });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

telegramBotRouter.post('/api/telegram-bot/channels/remove', async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });
    const deleted = await removeChannel(chatId);
    res.json({ success: true, deleted });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

telegramBotRouter.post('/api/telegram-bot/channels/add', async (req, res) => {
  try {
    const { chatId, channelName } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });
    const result = await addChannelManual(chatId, channelName);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

telegramBotRouter.post('/api/telegram-bot/channels/test-post', async (req, res) => {
  try {
    const { chatId } = req.body;
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });
    const result = await postToChannel(chatId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

telegramBotRouter.post('/api/telegram-bot/settings/custom-text', async (req, res) => {
  try {
    const { text } = req.body;
    await setCustomText(String(text || ''));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

telegramBotRouter.post('/api/telegram-bot/settings/hourly-posts', async (req, res) => {
  try {
    const { count } = req.body;
    await setHourlyPostsPerChannel(Number(count));
    res.json({ success: true, count: Number(count) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

telegramBotRouter.post('/api/telegram-bot/run-hourly-now', async (_req, res) => {
  try {
    const result = await triggerHourlyJobNow();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
