import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://aswphdoqnayyacivxebf.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzd3BoZG9xbmF5eWFjaXZ4ZWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MTI5MDAsImV4cCI6MjA5NDA4ODkwMH0.YI-El-cOLl2Jy1qJmIby3-ZZXrQiPmPlYPnaFfnFc5o';
const TABLE_NAME = 'viralhub_db';
const BATCH_SIZE = 250;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sanitizeThumbnailPath(url: string): string {
  if (!url) return url;
  const match = url.match(/https?:\/\/[^/]+(\/thumbnails\/.*)$/i);
  if (match) return match[1];
  if (url.startsWith('/thumbnails/')) return url;
  if (url.startsWith('thumbnails/')) return `/${url}`;
  return url;
}

async function migrateThumbnails() {
  console.log(`[Thumbnail Path Migration] Checking records in ${TABLE_NAME}...`);
  
  const { count: initialCount } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact', head: true })
    .ilike('thumbnail_url', '%r2.dev%');

  console.log(`[Thumbnail Path Migration] Found ${initialCount || 0} records requiring domain removal.`);

  if (!initialCount || initialCount === 0) {
    console.log('[Thumbnail Path Migration] All records are already using relative paths!');
    return;
  }

  let totalProcessed = 0;
  let hasMore = true;

  while (hasMore) {
    // Always fetch records that still have r2.dev in thumbnail_url
    const { data: rows, error: fetchErr } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .ilike('thumbnail_url', '%r2.dev%')
      .limit(BATCH_SIZE);

    if (fetchErr) {
      console.error('[Thumbnail Path Migration] Fetch error:', fetchErr.message);
      break;
    }

    if (!rows || rows.length === 0) {
      console.log('[Thumbnail Path Migration] No more matching records found.');
      hasMore = false;
      break;
    }

    const modifiedRows = rows.map((r: any) => ({
      ...r,
      thumbnail_url: sanitizeThumbnailPath(r.thumbnail_url),
    }));

    const { error: upsertErr } = await supabase
      .from(TABLE_NAME)
      .upsert(modifiedRows, { onConflict: 'id' });

    if (upsertErr) {
      console.error('[Thumbnail Path Migration] Upsert error:', upsertErr.message);
      // Fallback: update individual rows
      for (const r of modifiedRows) {
        await supabase
          .from(TABLE_NAME)
          .update({ thumbnail_url: r.thumbnail_url })
          .eq('id', r.id);
      }
    }

    totalProcessed += rows.length;
    console.log(`[Thumbnail Path Migration] Progress: ${totalProcessed} / ${initialCount} records updated (${Math.round((totalProcessed / initialCount) * 100)}%)`);

    if (rows.length < BATCH_SIZE) {
      hasMore = false;
    }
  }

  // Final verification
  const { count: finalCount } = await supabase
    .from(TABLE_NAME)
    .select('*', { count: 'exact', head: true })
    .ilike('thumbnail_url', '%r2.dev%');

  console.log(`\n[Thumbnail Path Migration] Complete! Remaining unmigrated: ${finalCount || 0}`);
}

migrateThumbnails().catch((err) => {
  console.error('[Thumbnail Path Migration] Unhandled failure:', err);
  process.exit(1);
});
