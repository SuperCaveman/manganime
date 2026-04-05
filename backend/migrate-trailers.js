#!/usr/bin/env node
'use strict';

/**
 * Backfills trailerYoutubeId for all anime titles in DynamoDB.
 *
 * - Items with a malId: fetched directly via /anime/{id}
 * - Items without a malId: searched via /anime?q=titleEn; first match used
 *   and malId is written back if not already present.
 * - Non-anime titles (manga) are skipped.
 *
 * Usage:
 *   STACK_NAME=mangacritic AWS_REGION=us-east-1 node migrate-trailers.js
 *
 * Jikan rate limit: 3 req/sec — waits 400 ms between requests.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const STACK_NAME = process.env.STACK_NAME || 'mangacritic';
const REGION     = process.env.AWS_REGION  || 'us-east-1';
const TABLE      = `${STACK_NAME}-titles`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Jikan ─────────────────────────────────────────────────────────────────────

async function fetchByMalId(malId) {
  const url = `https://api.jikan.moe/v4/anime/${malId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jikan ${url} → ${res.status}`);
  const json = await res.json();
  return json.data || null;
}

async function searchJikan(query) {
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=3&sfw`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jikan ${url} → ${res.status}`);
  const json = await res.json();
  return (json.data || [])[0] || null;
}

// ── DynamoDB ──────────────────────────────────────────────────────────────────

async function applyUpdate(titleId, fields) {
  const setExprs = Object.keys(fields).map((k) => `${k} = :${k}`);
  const vals     = Object.fromEntries(Object.entries(fields).map(([k, v]) => [`:${k}`, v]));
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { titleId },
    UpdateExpression: `SET ${setExprs.join(', ')}`,
    ExpressionAttributeValues: vals,
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function migrate() {
  console.log(`Scanning ${TABLE} for anime titles…\n`);

  const items = [];
  let lastKey;
  do {
    const params = {
      TableName: TABLE,
      FilterExpression: '#t = :anime',
      ExpressionAttributeNames: { '#t': 'type' },
      ExpressionAttributeValues: { ':anime': 'anime' },
    };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await ddb.send(new ScanCommand(params));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Found ${items.length} anime title(s).\n`);

  let updated = 0;
  let skipped = 0;

  for (const item of items) {
    const { titleId, titleEn, malId, trailerYoutubeId } = item;
    console.log(`── ${titleId} (malId: ${malId || 'none'})`);

    if (trailerYoutubeId) {
      console.log(`   ✓ Already has trailerYoutubeId: ${trailerYoutubeId} — skipping.\n`);
      skipped++;
      await sleep(400);
      continue;
    }

    let jikanItem = null;
    try {
      if (malId) {
        jikanItem = await fetchByMalId(malId);
      } else {
        console.log(`   Searching Jikan for "${titleEn}"…`);
        jikanItem = await searchJikan(titleEn);
        if (!jikanItem) {
          console.log(`   ⚠ No Jikan match — skipping.\n`);
          await sleep(400);
          continue;
        }
      }
    } catch (err) {
      console.error(`   ✗ Jikan fetch failed: ${err.message} — skipping.\n`);
      await sleep(400);
      continue;
    }

    const t = jikanItem.trailer;
    const embedMatch = t?.embed_url?.match(/embed\/([^?]+)/);
    const youtubeId = t?.youtube_id || (embedMatch ? embedMatch[1] : null);
    if (!youtubeId) {
      console.log(`   ⚠ No trailer on Jikan (malId: ${jikanItem.mal_id}) — skipping.\n`);
      await sleep(400);
      continue;
    }

    const fields = { trailerYoutubeId: youtubeId };
    // Also backfill malId if missing
    if (!malId && jikanItem.mal_id) {
      fields.malId = String(jikanItem.mal_id);
    }

    await applyUpdate(titleId, fields);
    console.log(`   ✏  trailerYoutubeId: ${youtubeId}${!malId ? ` (malId backfilled: ${jikanItem.mal_id})` : ''}\n`);
    updated++;

    await sleep(400);
  }

  console.log(`Migration complete. Updated: ${updated}, already set: ${skipped}.`);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
