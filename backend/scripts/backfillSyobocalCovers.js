'use strict';

/**
 * Backfill cover images for JA anime-episode entries that have no coverImageUrl.
 * Looks up each titleJa on Jikan /anime and updates DynamoDB with the first valid result.
 *
 * Usage:
 *   node scripts/backfillSyobocalCovers.js
 *
 * Requires AWS credentials in the environment (same profile used for SAM deploy).
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE  = process.env.RELEASE_CALENDAR_TABLE || 'mangacritic-release-calendar';
const REGION = process.env.AWS_REGION || 'us-east-1';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function isValidCoverUrl(url) {
  if (!url) return false;
  if (url.includes('mangadex.org') || url.includes('placeholder')) return false;
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (r.status === 405) return true;
    if (!r.ok) return false;
    const len = parseInt(r.headers.get('content-length') || '-1', 10);
    if (len !== -1 && len < 1024) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchCoverJa(titleJa) {
  await sleep(500);
  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(titleJa)}&limit=3`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) {
      process.stdout.write(`[HTTP ${res.status}] `);
      return '';
    }
    const json = await res.json();
    for (const item of json.data || []) {
      const url = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url;
      if (url && await isValidCoverUrl(url)) return url;
    }
  } catch (err) {
    process.stdout.write(`[${err.message}] `);
  }
  return '';
}

async function main() {
  console.log(`Scanning ${TABLE} for JA anime episodes without cover images…`);

  const items = [];
  let lastKey;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: '#t = :type AND #l = :locale AND (attribute_not_exists(coverImageUrl) OR coverImageUrl = :empty)',
      ExpressionAttributeNames: { '#t': 'type', '#l': 'locale' },
      ExpressionAttributeValues: { ':type': 'anime-episode', ':locale': 'ja', ':empty': '' },
      ...(lastKey && { ExclusiveStartKey: lastKey }),
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Found ${items.length} items to backfill.\n`);

  let updated = 0;
  let notFound = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const titleJa = item.titleJa || item.titleEn || '';
    process.stdout.write(`[${i + 1}/${items.length}] "${titleJa}" … `);

    if (!titleJa) {
      console.log('no title, skipping');
      notFound++;
      continue;
    }

    const coverImageUrl = await fetchCoverJa(titleJa);

    if (!coverImageUrl) {
      console.log('no cover found');
      notFound++;
      continue;
    }

    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { weekStart: item.weekStart, releaseId: item.releaseId },
      UpdateExpression: 'SET coverImageUrl = :url',
      ExpressionAttributeValues: { ':url': coverImageUrl },
    }));

    console.log('✓');
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}  Not found: ${notFound}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
