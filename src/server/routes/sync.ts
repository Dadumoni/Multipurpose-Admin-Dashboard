import express from 'express';
import {
  runSync,
  getSyncStatus,
  setDbSyncEnabled,
  migrateMongoToSupabase,
  isMigrationRunning,
  getMigrationProgress,
} from '../sync.js';
import { getLogs, clearLogs } from '../logger.js';

export const syncRouter = express.Router();

// API Route to Toggle DB Sync ON/OFF
syncRouter.post('/api/sync/toggle', async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled boolean field is required' });
    }

    await setDbSyncEnabled(enabled);
    const status = await getSyncStatus();
    res.json({
      success: true,
      message: enabled ? 'DB Sync turned ON' : 'DB Sync turned OFF',
      sync_enabled: enabled,
      status,
    });
  } catch (error: any) {
    console.error('Failed to toggle DB Sync:', error);
    res.status(500).json({ error: error.message || 'Failed to toggle DB Sync' });
  }
});

// API Route for Sync Status
syncRouter.get('/api/sync/status', async (_req, res) => {
  try {
    const status = await getSyncStatus();
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to get sync status' });
  }
});

// API Routes for Real-Time Terminal Logs & Migration Progress
syncRouter.get('/api/logs', (req, res) => {
  try {
    const sinceId = typeof req.query.since === 'string' ? req.query.since : undefined;
    res.json({
      logs: getLogs(sinceId),
      migration: getMigrationProgress(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch logs' });
  }
});

syncRouter.post('/api/logs/clear', (_req, res) => {
  try {
    clearLogs();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to clear logs' });
  }
});

// Background Native Migration Runner (MongoDB videos_db.posts -> Supabase viralhub_db)
syncRouter.post(['/api/sync/migrate', '/api/sync/python'], (_req, res) => {
  try {
    if (isMigrationRunning()) {
      return res.json({
        success: true,
        alreadyRunning: true,
        message: 'Copying MongoDB data to Supabase in background...',
        migration: getMigrationProgress(),
      });
    }

    // Run migration asynchronously in the background
    migrateMongoToSupabase().catch((err) => {
      console.error('[DB Sync] Background migration error:', err?.message || err);
    });

    return res.json({
      success: true,
      message: 'Copying MongoDB data to Supabase in background...',
      migration: getMigrationProgress(),
    });
  } catch (error: any) {
    console.error('Failed to start DB Sync:', error);
    return res.status(500).json({ error: error.message || 'Failed to start DB Sync' });
  }
});

// API Route for triggering manual / auto bidirectional sync
syncRouter.post('/api/sync', async (req, res) => {
  try {
    const result = await runSync(req.body);
    res.json(result);
  } catch (error: any) {
    console.error('Sync route error:', error);
    res.status(500).json({ error: error.message || 'Sync failed' });
  }
});
