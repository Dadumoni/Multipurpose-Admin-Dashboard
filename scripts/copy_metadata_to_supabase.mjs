import dotenv from 'dotenv';
dotenv.config();

import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import { MongoClient } from 'mongodb';
import { createClient } from '@supabase/supabase-js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

if (!MONGO_URI || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[Error] Missing MongoDB or Supabase credentials in .env');
  process.exit(1);
}

const BATCH_SIZE = 500;

async function run() {
  console.log('[Migration] Connecting to MongoDB and Supabase...');
  const mongoClient = new MongoClient(MONGO_URI);
  await mongoClient.connect();
  const db = mongoClient.db('videos_db');
  const collection = db.collection('posts');

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  const totalMongoDocs = await collection.countDocuments();
  console.log(`[Migration] Total MongoDB documents: ${totalMongoDocs.toLocaleString()}`);

  const cursor = collection.find({}).project({
    _id: 1,
    domain: 1,
    duration: 1,
    post_url: 1,
    url: 1,
    site: 1,
    source: 1,
  }).batchSize(1000);

  let processed = 0;
  let totalUpdated = 0;
  let batch = [];
  const startTime = Date.now();

  for await (const doc of cursor) {
    const id = doc._id.toString();
    let domain = doc.domain || null;
    const postUrl = doc.post_url || doc.url || null;

    if (!domain && postUrl) {
      try {
        domain = new URL(postUrl).hostname.replace(/^www\./, '');
      } catch {}
    }

    const duration = doc.duration || null;
    const source = doc.site || doc.source || domain || null;

    batch.push({
      id,
      domain,
      duration,
      post_url: postUrl,
      source,
    });

    if (batch.length >= BATCH_SIZE) {
      const toSend = batch;
      batch = [];
      const res = await supabase.rpc('bulk_update_viralhub_metadata', { items: toSend });
      if (res.error) {
        console.error(`[Error] Batch at ${processed}:`, res.error.message);
      } else {
        totalUpdated += (res.data || 0);
      }
      processed += toSend.length;

      if (processed % 2500 === 0 || processed >= totalMongoDocs) {
        const elapsedSec = (Date.now() - startTime) / 1000;
        const speed = Math.round(processed / elapsedSec);
        const percent = ((processed / totalMongoDocs) * 100).toFixed(1);
        console.log(`[Progress] ${processed.toLocaleString()} / ${totalMongoDocs.toLocaleString()} (${percent}%) | Updated: ${totalUpdated.toLocaleString()} | Speed: ${speed} docs/s`);
      }
    }
  }

  if (batch.length > 0) {
    const res = await supabase.rpc('bulk_update_viralhub_metadata', { items: batch });
    if (!res.error) {
      totalUpdated += (res.data || 0);
    }
    processed += batch.length;
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n======================================================`);
  console.log(`[Completed] Successfully processed ${processed.toLocaleString()} documents in ${totalTime}s!`);
  console.log(`[Summary] Total records updated in Supabase viralhub_db: ${totalUpdated.toLocaleString()}`);
  console.log(`======================================================\n`);

  await mongoClient.close();
}

run().catch((err) => {
  console.error('[Fatal Error]', err);
  process.exit(1);
});
