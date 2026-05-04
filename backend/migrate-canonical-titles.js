#!/usr/bin/env node
'use strict';

/**
 * Backfills canonical titleEn / titleJa / titleEnLower / titleJaLower from Jikan
 * for all Title records in DynamoDB.
 *
 * - Items that already have a malId: fetched directly via /anime/{id} or /manga/{id}
 * - Items without a malId: searched by type+titleEn; first Jikan match is used
 *   and malId is written back to DynamoDB for future use.
 *
 * Usage:
 *   STACK_NAME=fantachi AWS_REGION=us-east-1 node migrate-canonical-titles.js
 *
 * Jikan rate limit: 3 req/sec — we wait 400 ms between requests to stay safe.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const STACK_NAME = process.env.STACK_NAME || 'fantachi';
const REGION     = process.env.AWS_REGION  || 'us-east-1';
const TABLE      = `${STACK_NAME}-titles`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Jikan fetchers ─────────────────────────────────────────────────────────────

async function fetchByMalId(type, malId) {
  const url = `https://api.jikan.moe/v4/${type}/${malId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jikan ${url} → ${res.status}`);
  const json = await res.json();
  return json.data || null;
}

async function searchJikan(type, query) {
  const url = `https://api.jikan.moe/v4/${type}?q=${encodeURIComponent(query)}&limit=5&sfw`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Jikan ${url} → ${res.status}`);
  const json = await res.json();
  return (json.data || [])[0] || null; // first / best match
}

function canonicalFromJikan(item, type) {
  const titleEn = item.title_english || item.title;
  const titleJa = item.title_japanese || '';
  return {
    malId: String(item.mal_id),
    titleEn,
    titleJa,
    titleEnLower: titleEn.toLowerCase(),
    titleJaLower: titleJa.toLowerCase(),
  };
}

// ── DynamoDB update ────────────────────────────────────────────────────────────

async function applyUpdate(titleId, fields) {
  const setExprs  = Object.keys(fields).map((k) => `${k} = :${k}`);
  const vals      = Object.fromEntries(Object.entries(fields).map(([k, v]) => [`:${k}`, v]));
  await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { titleId },
    UpdateExpression: `SET ${setExprs.join(', ')}`,
    ExpressionAttributeValues: vals,
  }));
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function migrate() {
  console.log(`Scanning ${TABLE}...\n`);

  const items = [];
  let lastKey;
  do {
    const params = { TableName: TABLE };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await ddb.send(new ScanCommand(params));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Found ${items.length} title(s).\n`);

  for (const item of items) {
    const { titleId, titleEn, type, malId } = item;
    console.log(`── ${titleId} (type: ${type}, malId: ${malId || 'none'})`);
    console.log(`   current titleEn: "${titleEn}"`);

    let jikanItem = null;

    try {
      if (malId) {
        // Direct lookup — authoritative
        jikanItem = await fetchByMalId(type, malId);
      } else {
        // Search by existing titleEn
        jikanItem = await searchJikan(type, titleEn);
        if (!jikanItem) {
          console.log(`   ⚠ No Jikan match found — skipping.\n`);
          await sleep(400);
          continue;
        }
      }
    } catch (err) {
      console.error(`   ✗ Jikan fetch failed: ${err.message} — skipping.\n`);
      await sleep(400);
      continue;
    }

    const canonical = canonicalFromJikan(jikanItem, type);

    const titleEnChanged = canonical.titleEn !== titleEn;
    const malIdAdded     = !malId && canonical.malId;

    console.log(`   canonical titleEn: "${canonical.titleEn}" (malId: ${canonical.malId})`);

    if (!titleEnChanged && !malIdAdded) {
      console.log(`   ✓ Already correct — no update needed.\n`);
    } else {
      const fields = {
        titleEn:      canonical.titleEn,
        titleJa:      canonical.titleJa,
        titleEnLower: canonical.titleEnLower,
        titleJaLower: canonical.titleJaLower,
        malId:        canonical.malId,
      };
      await applyUpdate(titleId, fields);
      if (titleEnChanged) console.log(`   ✏  titleEn: "${titleEn}" → "${canonical.titleEn}"`);
      if (malIdAdded)     console.log(`   ✏  malId backfilled: ${canonical.malId}`);
      console.log(`   ✓ Updated.\n`);
    }

    await sleep(400); // respect Jikan rate limit
  }

  console.log('Migration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
