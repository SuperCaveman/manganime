'use strict';

/**
 * backfill-manga-covers.js
 *
 * Scans ReleaseCalendarTable for manga-volume entries with no coverImageUrl.
 * For each, tries four cover sources in order:
 *   1. OpenLibrary
 *   2. MangaDex
 *   3. Jikan (full title, then shortened)
 *   4. Google Books
 *
 * - If a cover is found: UpdateItem to set coverImageUrl.
 * - If all sources fail: DeleteItem (no placeholder cards).
 *
 * Usage: node backfill-manga-covers.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');

const REGION = process.env.AWS_REGION || 'us-east-1';
const TABLE  = process.env.RELEASE_CALENDAR_TABLE || 'fantachi-release-calendar';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Cover fetcher (mirrors fetchReleaseCalendar.js) ───────────────────────────

async function isValidCoverUrl(url) {
  if (!url) return false;
  if (url.includes('mangadex.org') || url.includes('placeholder')) return false;
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (r.status === 405) return true; // HEAD not allowed → assume valid
    if (!r.ok) return false;
    const len = parseInt(r.headers.get('content-length') || '-1', 10);
    if (len !== -1 && len < 1024) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchMangaCover(titleEn, volumeNumber = null) {
  const short = titleEn.replace(/\s*[:–—\-]\s*.+$/, '').trim();

  // 1. OpenLibrary
  try {
    const r = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(titleEn + ' manga')}&limit=1`,
      { signal: AbortSignal.timeout(6000) }
    );
    const j = await r.json();
    if (j.docs?.[0]?.cover_i) {
      const url = `https://covers.openlibrary.org/b/id/${j.docs[0].cover_i}-M.jpg`;
      if (await isValidCoverUrl(url)) return url;
    }
  } catch {}

  // 2. Google Books
  try {
    const q = volumeNumber
      ? `${titleEn} manga volume ${volumeNumber}`
      : `${titleEn} manga`;
    const r = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=1`,
      { signal: AbortSignal.timeout(6000) }
    );
    const j = await r.json();
    const thumb = j.items?.[0]?.volumeInfo?.imageLinks?.thumbnail;
    if (thumb) {
      const url = thumb
        .replace('http://', 'https://')
        .replace('&edge=curl', '')
        .replace('zoom=1', 'zoom=2');
      if (await isValidCoverUrl(url)) return url;
    }
  } catch {}

  // 3a. Jikan /manga — full title
  try {
    await sleep(400);
    const r = await fetch(
      `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(titleEn)}&limit=1`,
      { signal: AbortSignal.timeout(6000) }
    );
    const j = await r.json();
    const url = j.data?.[0]?.images?.jpg?.large_image_url || j.data?.[0]?.images?.jpg?.image_url;
    if (url && await isValidCoverUrl(url)) return url;
  } catch {}

  // 3b. Jikan /manga — shortened title (strip subtitle)
  if (short && short !== titleEn) {
    try {
      await sleep(400);
      const r = await fetch(
        `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(short)}&limit=1`,
        { signal: AbortSignal.timeout(6000) }
      );
      const j = await r.json();
      const url = j.data?.[0]?.images?.jpg?.large_image_url || j.data?.[0]?.images?.jpg?.image_url;
      if (url && await isValidCoverUrl(url)) return url;
    } catch {}
  }

  return '';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Scanning ${TABLE} for manga-volume entries with no coverImageUrl…`);

  const now = Math.floor(Date.now() / 1000);
  const items = [];
  let lastKey;

  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE,
      FilterExpression: '#t = :t AND (attribute_not_exists(coverImageUrl) OR coverImageUrl = :empty OR contains(coverImageUrl, :mdx))',
      ExpressionAttributeNames: { '#t': 'type' },
      ExpressionAttributeValues: { ':t': 'manga-volume', ':empty': '', ':mdx': 'mangadex.org' },
      ...(lastKey && { ExclusiveStartKey: lastKey }),
    }));
    for (const item of res.Items || []) {
      // Skip items whose TTL has already passed (DynamoDB TTL deletion is eventual)
      if (item.ttl && item.ttl < now) continue;
      items.push(item);
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Found ${items.length} manga-volume items missing a cover.`);
  if (items.length === 0) { console.log('Nothing to do.'); return; }

  let updated = 0;
  let deleted = 0;

  for (const item of items) {
    const title = item.titleEn || '';
    process.stdout.write(`  "${title}" … `);

    const coverImageUrl = await fetchMangaCover(title, item.volumeNumber || null);

    if (coverImageUrl) {
      await ddb.send(new UpdateCommand({
        TableName: TABLE,
        Key: { weekStart: item.weekStart, releaseId: item.releaseId },
        UpdateExpression: 'SET coverImageUrl = :url',
        ExpressionAttributeValues: { ':url': coverImageUrl },
      }));
      console.log(`✓ updated`);
      updated++;
    } else {
      await ddb.send(new DeleteCommand({
        TableName: TABLE,
        Key: { weekStart: item.weekStart, releaseId: item.releaseId },
      }));
      console.log(`✗ deleted (no cover found)`);
      deleted++;
    }

    // Brief pause between titles to avoid hammering APIs
    await sleep(200);
  }

  console.log(`\nDone. Updated: ${updated}, Deleted: ${deleted}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
