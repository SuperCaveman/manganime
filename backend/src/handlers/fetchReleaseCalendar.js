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
  // Sunday looks forward to the next Monday so "this week" always covers the
  // upcoming Mon–Sun window, matching how release data is bucketed.
  const daysToMonday = day === 0 ? 1 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMonday + offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

// Decode common HTML entities so titles with apostrophes/dashes render correctly
function decodeEntities(str) {
  return str
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
    .replace(/&rsquo;|&lsquo;|&apos;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—');
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
          // Use the first named streaming service; fall back to 'Streaming'
          const platform = item.streaming?.[0]?.name || 'Streaming';
          results.push({
            weekStart:   weekStartStr,
            releaseId:   `anime-episode#${malId}`,
            type:        'anime-episode',
            locale:      'en',
            releaseDate,
            titleEn:     item.title_english || item.title,
            titleJa:     item.title_japanese || '',
            malId,
            coverImageUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
            platform,
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

// ── JA anime cover fetcher (Jikan /anime) ────────────────────────────────────
// Looks up the Japanese title on Jikan and returns the first valid cover URL.
// Uses a 500ms pre-request sleep to stay within Jikan rate limits when called
// sequentially for many Syobocal entries.

async function fetchCoverJa(titleJa) {
  await sleep(500);
  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(titleJa)}&limit=3`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return '';
    const json = await res.json();
    for (const item of json.data || []) {
      const url = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url;
      if (url && await isValidCoverUrl(url)) return url;
    }
  } catch {}
  return '';
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
        'User-Agent': 'Mozilla/5.0 (compatible; FantachiBot/1.0; +https://fantachi.app)',
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
      // Decode entities first so smart-quotes/apostrophes don't break parsing
      const decoded = decodeEntities(row);
      const stripped = decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

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

      // Prefer the anchor-tag text for the title — it's already the clean title
      // without surrounding date/price noise and entities are already decoded.
      let titleEn, volNum;
      const anchorMatch = decoded.match(/<a[^>]+href="[^"]*sevenseasentertainment\.com[^"]*"[^>]*>([^<]+)<\/a>/i);
      if (anchorMatch) {
        const raw = decodeEntities(anchorMatch[1]).trim();
        const vm  = raw.match(/\s+Vol(?:ume)?\.?\s*(\d+)\s*$/i);
        volNum  = vm ? parseInt(vm[1]) : null;
        titleEn = raw.replace(/\s+Vol(?:ume)?\.?\s*\d+\s*$/i, '').trim();
      } else {
        // Fallback: extract from decoded stripped text
        const titleMatch = stripped.match(/([A-Za-z\u00C0-\u024F][^\d]{3,}?)\s+(?:Vol(?:ume)?\.?\s*(\d+))?(?:\s|$)/);
        if (!titleMatch || titleMatch[1].length < 4) continue;
        titleEn = titleMatch[1].replace(/\s+/g, ' ').trim();
        volNum  = titleMatch[2] ? parseInt(titleMatch[2]) : null;
      }

      if (!titleEn || titleEn.length < 3) continue;
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
        locale:       'en',
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

// ── Syobocal RSS (JA anime schedule) ─────────────────────────────────────────
// Returns items for the requested week using the public Syobocal RSS feed.
// pubDate values are in JST (+09:00); we convert to JST date strings for
// releaseDate and compare against the week's Mon–Sun window (also in JST).

async function fetchSyobocalRSS(monday) {
  const weekStartStr = toDateStr(monday);
  const jstOffsetMs  = 9 * 60 * 60 * 1000;
  const weekStartJST = new Date(monday.getTime() + jstOffsetMs).toISOString().slice(0, 10);
  const weekEndJST   = new Date(addDays(monday, 6).getTime() + jstOffsetMs).toISOString().slice(0, 10);
  const results      = [];

  try {
    const res = await fetch('https://cal.syoboi.jp/rss2.php', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FantachiBot/1.0; +https://fantachi.app)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();

    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];

      // Title (may be CDATA-wrapped)
      const titleMatch = block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ||
                         block.match(/<title>([\s\S]*?)<\/title>/);
      if (!titleMatch) continue;
      let rawTitle = titleMatch[1].trim();
      // Strip leading 【注】【新】 etc. markers, then strip trailing episode "  #12 「…」"
      rawTitle = rawTitle.replace(/^【[^】]*】\s*/, '');
      const titleJa = rawTitle.replace(/\s+#\d+.*$/, '').trim();
      if (!titleJa) continue;

      // Link → TID (anime series ID in Syobocal)
      const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/) ||
                        block.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>/);
      const tidMatch  = linkMatch?.[1]?.match(/\/tid\/(\d+)/);
      if (!tidMatch) continue;
      const tid = tidMatch[1];

      // pubDate → JST date string
      const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
      if (!pubDateMatch) continue;
      const pubDate = new Date(pubDateMatch[1].trim());
      if (isNaN(pubDate.getTime())) continue;
      const releaseDate = new Date(pubDate.getTime() + jstOffsetMs).toISOString().slice(0, 10);

      if (releaseDate < weekStartJST || releaseDate > weekEndJST) continue;

      const coverImageUrl = await fetchCoverJa(titleJa);

      results.push({
        weekStart:    weekStartStr,
        releaseId:    `anime-episode-ja#${tid}`,
        type:         'anime-episode',
        locale:       'ja',
        releaseDate,
        titleEn:      titleJa, // no EN title from Syobocal; use JA as fallback
        titleJa,
        malId:        '',
        coverImageUrl,
        platform:     'しょぼいカレンダー',
        ttl:          ttlFor(weekStartStr),
      });
    }

    console.log(`Syobocal RSS (${weekStartStr}): ${results.length} shows`);
  } catch (err) {
    console.error('Syobocal RSS fetch failed (skipping):', err.message);
  }

  return results;
}

// ── Jikan popular manga (JA) ──────────────────────────────────────────────────
// Uses the Jikan /manga endpoint to return popular currently-serializing manga.
// Since Comic Natalie / publisher sites are not statically scrapable, this
// shows a curated "reading now" list rather than literal release-week volumes.

async function fetchJikanMangaJa(monday) {
  const weekStartStr = toDateStr(monday);
  const results = [];

  try {
    const res = await fetch(
      'https://api.jikan.moe/v4/manga?order_by=members&sort=desc&status=publishing&type=manga&limit=25&sfw',
      { signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    for (const item of json.data || []) {
      const malId = String(item.mal_id);
      const titleJa = item.title_japanese || item.title;
      const coverImageUrl = item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '';
      if (!coverImageUrl) continue;

      results.push({
        weekStart:    weekStartStr,
        releaseId:    `manga-volume-ja#${malId}`,
        type:         'manga-volume',
        locale:       'ja',
        releaseDate:  weekStartStr,
        titleEn:      item.title_english || item.title,
        titleJa,
        malId,
        publisher:    'マンガ',
        coverImageUrl,
        amazonSearchUrl: '',
        ttl:          ttlFor(weekStartStr),
      });
    }

    console.log(`Jikan manga JA (${weekStartStr}): ${results.length} items`);
  } catch (err) {
    console.error('Jikan manga JA fetch failed (skipping):', err.message);
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

  // ── JA: Anime episodes (current week via Syobocal RSS) ───────────────────
  console.log('Fetching Syobocal RSS — current week JA…');
  try {
    allItems.push(...await fetchSyobocalRSS(thisMonday));
  } catch (err) {
    console.error('Syobocal current week failed:', err.message);
  }

  // ── JA: Anime episodes (next week via Syobocal RSS) ──────────────────────
  // The feed only covers the current broadcast week; next week returns 0 items.
  console.log('Fetching Syobocal RSS — next week JA…');
  try {
    allItems.push(...await fetchSyobocalRSS(nextMonday));
  } catch (err) {
    console.error('Syobocal next week failed:', err.message);
  }

  // ── JA: Manga (popular serializing titles via Jikan, both weeks) ─────────
  console.log('Fetching Jikan manga JA…');
  try {
    const jaManga = await fetchJikanMangaJa(thisMonday);
    for (const item of jaManga) {
      allItems.push(item); // current week
      allItems.push({ ...item, weekStart: toDateStr(nextMonday) }); // next week
    }
  } catch (err) {
    console.error('Jikan manga JA failed:', err.message);
  }

  await batchWrite(allItems);
  console.log(`FetchReleaseCalendar complete — ${allItems.length} raw items`);
  return { statusCode: 200, body: JSON.stringify({ count: allItems.length }) };
};
