'use strict';

/**
 * FetchReleaseCalendar — runs every Monday at 06:00 UTC via EventBridge.
 *
 * Writes two weeks of release data to ReleaseCalendarTable:
 *  • Anime episodes  — Jikan /v4/schedules (reliable)
 *  • Manga volumes   — Seven Seas HTML scrape (best-effort)
 *  • Anime physical  — stub (JS-rendered sources require headless browser)
 *
 * Each source failure is logged and skipped; the job never throws.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true },
});
const TABLE = process.env.RELEASE_CALENDAR_TABLE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Date helpers ──────────────────────────────────────────────────────────────

function getMondayUTC(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const daysToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMonday + offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setUTCDate(d.getUTCDate() + n);
  return r;
}

// TTL = 4 weeks after weekStart
function ttlFor(weekStart) {
  return Math.floor(new Date(weekStart + 'T00:00:00Z').getTime() / 1000) + 4 * 7 * 24 * 3600;
}

// ── Episode estimation ────────────────────────────────────────────────────────
// Approximate the current episode number based on premiere date.

function estimateEpisode(airedFromStr, weekStartStr) {
  if (!airedFromStr) return null;
  try {
    const start = new Date(airedFromStr);
    const week  = new Date(weekStartStr + 'T00:00:00Z');
    const weeks = Math.floor((week.getTime() - start.getTime()) / (7 * 24 * 3600 * 1000));
    return Math.max(1, weeks + 1);
  } catch {
    return null;
  }
}

// ── Jikan anime schedule ──────────────────────────────────────────────────────

const JIKAN_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

async function fetchJikanSchedule(monday) {
  const weekStartStr = toDateStr(monday);
  const results = [];

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayName    = JIKAN_DAYS[dayIdx];
    const releaseDate = toDateStr(addDays(monday, dayIdx));

    let page = 1;
    let more = true;

    while (more) {
      try {
        const res  = await fetch(`https://api.jikan.moe/v4/schedules?filter=${dayName}&limit=25&page=${page}`);
        if (!res.ok) { console.warn(`Jikan schedule ${dayName} p${page}: HTTP ${res.status}`); break; }
        const json = await res.json();
        const data = json.data || [];

        for (const item of data) {
          const malId = String(item.mal_id);
          const ep    = estimateEpisode(item.aired?.from, weekStartStr);
          results.push({
            weekStart:   weekStartStr,
            releaseId:   `anime-episode#${malId}`,
            type:        'anime-episode',
            releaseDate,
            titleEn:     item.title_english || item.title,
            titleJa:     item.title_japanese || '',
            malId,
            coverImageUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
            platform:    'Streaming',
            ...(ep && { episodeNumber: ep }),
            ttl: ttlFor(weekStartStr),
          });
        }

        more = data.length === 25 && page < 4;
        page++;
        await sleep(350);
      } catch (err) {
        console.error(`Jikan schedule ${dayName} p${page} error:`, err.message);
        more = false;
      }
    }
  }

  console.log(`Jikan schedule (${weekStartStr}): ${results.length} shows`);
  return results;
}

// ── Manga cover image fetcher ─────────────────────────────────────────────────
// Tries three sources in order; returns '' if all fail.

async function isValidCoverUrl(url) {
  if (!url) return false;
  if (url.includes('mangadex.org') || url.includes('placeholder')) return false;
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    if (r.status === 405) return true; // HEAD not allowed → assume valid
    if (!r.ok) return false;
    const len = parseInt(r.headers.get('content-length') || '-1', 10);
    if (len !== -1 && len < 1024) return false; // definitely a tiny placeholder
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

  // 2. Google Books (include volume number for better precision)
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
    await sleep(350);
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
      await sleep(350);
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

// ── Seven Seas HTML scraper ───────────────────────────────────────────────────
// Seven Seas renders release dates as a straightforward HTML table/list.
// Other publisher sites (VIZ, Yen Press, Kodansha) are JS-rendered React apps
// that cannot be parsed with simple HTTP fetching — they are skipped gracefully.

async function fetchSevenSeas(weekStartStr, weekEndStr) {
  const results = [];
  const weekStartTs = new Date(weekStartStr + 'T00:00:00Z').getTime();
  const weekEndTs   = new Date(weekEndStr   + 'T23:59:59Z').getTime();

  try {
    const res = await fetch('https://sevenseasentertainment.com/release-dates/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MangaCriticBot/1.0; +https://mangacritic.app)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Seven Seas release list: rows typically look like
    // <tr ...><td>2026-04-08</td><td><a href="...">Title Vol. 3</a></td>...
    // Try two patterns: ISO date or US date format.
    const rowRe = /<tr[\s\S]*?<\/tr>/gi;
    const rows  = html.match(rowRe) || [];

    for (const row of rows) {
      const stripped = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      // ISO date: 2026-04-08
      let dateStr  = null;
      const isoMatch = stripped.match(/\b(\d{4}-\d{2}-\d{2})\b/);
      if (isoMatch) {
        dateStr = isoMatch[1];
      } else {
        // US date: April 8, 2026 or Apr. 8, 2026
        const usMatch = stripped.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.\s]+(\d{1,2})[,\s]+(\d{4})\b/i);
        if (usMatch) {
          const monthNames = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
          const m = monthNames[usMatch[1].toLowerCase().slice(0, 3)];
          const d = new Date(Date.UTC(parseInt(usMatch[3]), m, parseInt(usMatch[2])));
          dateStr = toDateStr(d);
        }
      }

      if (!dateStr) continue;
      const ts = new Date(dateStr + 'T00:00:00Z').getTime();
      if (ts < weekStartTs || ts > weekEndTs) continue;

      // Extract title — look for a linked or bolded title text
      const titleMatch = stripped.match(/([A-Za-z][A-Za-z0-9 :'\-!?.,]+?)\s+(?:Vol(?:ume)?\.?\s*(\d+))?(?:\s|$)/);
      if (!titleMatch || titleMatch[1].length < 4) continue;

      const titleEn   = titleMatch[1].replace(/\s+/g, ' ').trim();
      const volNum    = titleMatch[2] ? parseInt(titleMatch[2]) : null;
      const slug      = titleEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const releaseId = `manga-volume#ss-${slug}${volNum ? `-v${volNum}` : ''}`;
      const amazonQ   = encodeURIComponent(`${titleEn}${volNum ? ` volume ${volNum}` : ''} manga`);

      const coverImageUrl = await fetchMangaCover(titleEn, volNum);
      if (!coverImageUrl) {
        console.log(`Seven Seas: no cover found for "${titleEn}", skipping`);
        continue;
      }

      results.push({
        weekStart:    weekStartStr,
        releaseId,
        type:         'manga-volume',
        releaseDate:  dateStr,
        titleEn,
        titleJa:      '',
        ...(volNum && { volumeNumber: volNum }),
        publisher:    'Seven Seas',
        coverImageUrl,
        amazonSearchUrl: `https://www.amazon.com/s?k=${amazonQ}&tag=${process.env.AFFILIATE_TAG || 'thunderwolfdr-20'}`,
        ttl: ttlFor(weekStartStr),
      });
    }

    console.log(`Seven Seas (${weekStartStr}–${weekEndStr}): ${results.length} releases`);
  } catch (err) {
    console.error('Seven Seas scraper failed (skipping):', err.message);
  }

  return results;
}

// ── DynamoDB batch write ──────────────────────────────────────────────────────

async function batchWrite(items) {
  if (!items.length) return;
  // Deduplicate by weekStart+releaseId
  const seen  = new Set();
  const deduped = items.filter((item) => {
    const k = `${item.weekStart}#${item.releaseId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const CHUNK = 25;
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK);
    await ddb.send(new BatchWriteCommand({
      RequestItems: {
        [TABLE]: chunk.map((item) => ({ PutRequest: { Item: item } })),
      },
    }));
  }
  console.log(`Wrote ${deduped.length} items to DynamoDB`);
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async () => {
  console.log('FetchReleaseCalendar started');

  const thisMonday = getMondayUTC(0);
  const nextMonday = getMondayUTC(1);
  const nextSunday = addDays(nextMonday, 6);

  const allItems = [];

  // ── Anime episodes (current week) ─────────────────────────────────────────
  console.log('Fetching Jikan schedule — current week…');
  try {
    allItems.push(...await fetchJikanSchedule(thisMonday));
  } catch (err) {
    console.error('Jikan current week failed:', err.message);
  }

  // ── Anime episodes (next week) ────────────────────────────────────────────
  console.log('Fetching Jikan schedule — next week…');
  try {
    allItems.push(...await fetchJikanSchedule(nextMonday));
  } catch (err) {
    console.error('Jikan next week failed:', err.message);
  }

  // ── Manga volumes (both weeks combined, then split by week) ───────────────
  console.log('Fetching manga volume releases…');
  try {
    const mangaItems = await fetchSevenSeas(toDateStr(thisMonday), toDateStr(nextSunday));
    for (const item of mangaItems) {
      const ts   = new Date(item.releaseDate + 'T00:00:00Z').getTime();
      const next = nextMonday.getTime();
      if (ts >= next) item.weekStart = toDateStr(nextMonday);
      allItems.push(item);
    }
  } catch (err) {
    console.error('Manga volume fetch failed:', err.message);
  }

  // Note: Blu-ray/DVD sources (Crunchyroll Store, Funimation) are JS-rendered
  // React apps that cannot be scraped from Lambda. Skipping gracefully.
  console.log('Anime physical releases: skipped (JS-rendered sources require headless browser)');

  await batchWrite(allItems);
  console.log(`FetchReleaseCalendar complete — ${allItems.length} raw items`);
  return { statusCode: 200, body: JSON.stringify({ count: allItems.length }) };
};
