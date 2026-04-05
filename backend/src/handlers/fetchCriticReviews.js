'use strict';

/**
 * FetchCriticReviews — runs daily at 08:00 UTC via EventBridge.
 *
 * Scrapes recent anime/manga reviews from:
 *   • Anime News Network (review.atom)
 *   • IGN (feeds.ign.com/ign/all — filtered for anime/manga reviews)
 *   • Otaku USA (otakuusamagazine.com/category/reviews/feed/)
 *   • ComicBookRoundup (recently-reviewed manga page)
 *   • Polygon (polygon.com/rss/index.xml — filtered, requires JSON-LD score)
 *   • The A.V. Club (avclub.com/rss — filtered for anime)
 *
 * Stores score + ≤150-char excerpt + full attribution into ReviewsTable.
 * Each review is deduplicated by a deterministic MD5-based reviewId derived
 * from the original URL, so re-runs never create duplicates.
 *
 * Legal: stores only numerical score, a single-sentence excerpt (≤150 chars),
 * reviewer/publication attribution, and a direct link to the source review.
 * This follows the same fair-use model as Metacritic and Rotten Tomatoes.
 */

const { createHash } = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
} = require('@aws-sdk/lib-dynamodb');
const { recalculate } = require('./recalculateScores');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const REVIEWS_TABLE = process.env.REVIEWS_TABLE;
const TITLES_TABLE  = process.env.TITLES_TABLE;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Score normalization ────────────────────────────────────────────────────────

const LETTER_GRADES = {
  'A+': 98, 'A': 95, 'A-': 90,
  'B+': 87, 'B': 83, 'B-': 80,
  'C+': 77, 'C': 73, 'C-': 70,
  'D+': 65, 'D': 60, 'D-': 55,
  'F': 50,
};

function normalizeScore(raw) {
  if (!raw) return null;
  const s = raw.trim();

  // X/10 or X.X/10
  const m10 = s.match(/^(\d+(?:\.\d+)?)\/10$/);
  if (m10) return Math.round(parseFloat(m10[1]) * 10);

  // X/5 or X.X/5
  const m5 = s.match(/^(\d+(?:\.\d+)?)\/5$/);
  if (m5) return Math.min(100, Math.round(parseFloat(m5[1]) * 20));

  // X/100
  const m100 = s.match(/^(\d+(?:\.\d+)?)\/100$/);
  if (m100) return Math.round(parseFloat(m100[1]));

  // Letter grade
  if (LETTER_GRADES[s] !== undefined) return LETTER_GRADES[s];

  // Percentage
  const mpct = s.match(/^(\d+)%$/);
  if (mpct) return Math.min(100, parseInt(mpct[1]));

  // Plain number — infer scale
  const mnum = s.match(/^(\d+(?:\.\d+)?)$/);
  if (mnum) {
    const n = parseFloat(mnum[1]);
    if (n <= 5)   return Math.round(n * 20); // /5
    if (n <= 10)  return Math.round(n * 10); // /10
    if (n <= 100) return Math.round(n);      // /100
  }

  return null;
}

// ── Granularity detection ──────────────────────────────────────────────────────

function extractGranularity(titleStr) {
  const volMatch = titleStr.match(/\bvol(?:ume)?s?\.?\s*(\d+)\b/i);
  if (volMatch) return { granularity: 'volume', volumeNumber: parseInt(volMatch[1]) };

  const snMatch  = titleStr.match(/\bseas?(?:on)?\.?\s*(\d+)\b/i);
  if (snMatch)  return { granularity: 'season', seasonNumber: parseInt(snMatch[1]) };

  return { granularity: 'series' };
}

// ── XML helpers ────────────────────────────────────────────────────────────────

function extractTag(xml, tag) {
  const r = new RegExp(
    `<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`,
    'i',
  );
  const m = xml.match(r);
  if (!m) return '';
  return m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const x = m[1];
    // <link> in RSS 2.0 is text content, not an attribute
    const linkText = extractTag(x, 'link');
    const linkAttr = (x.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || '';
    items.push({
      title:       extractTag(x, 'title'),
      link:        linkText || linkAttr,
      description: extractTag(x, 'description') || extractTag(x, 'summary'),
      pubDate:     extractTag(x, 'pubDate') || extractTag(x, 'published'),
      author:      extractTag(x, 'dc:creator') || extractTag(x, 'author'),
    });
  }
  return items;
}

function parseAtom(xml) {
  const items = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const x = m[1];
    const linkMatch = x.match(/<link[^>]+href="([^"]+)"/i);
    const nameMatch = x.match(/<name>([^<]+)<\/name>/i);
    items.push({
      title:       extractTag(x, 'title'),
      link:        linkMatch ? linkMatch[1] : '',
      description: extractTag(x, 'summary') || extractTag(x, 'content'),
      pubDate:     extractTag(x, 'published') || extractTag(x, 'updated'),
      author:      nameMatch ? nameMatch[1].trim() : '',
    });
  }
  return items;
}

// ── Excerpt helper ─────────────────────────────────────────────────────────────

function makeExcerpt(html, maxLen = 150) {
  const text = (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1).trimEnd() + '…';
}

// ── reviewId deduplication ────────────────────────────────────────────────────

function reviewIdFromUrl(url) {
  return 'ext-' + createHash('md5').update(url).digest('hex').slice(0, 16);
}

// ── Title matching ─────────────────────────────────────────────────────────────

async function loadAllTitles() {
  const items = [];
  let lastKey;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TITLES_TABLE,
      ProjectionExpression: 'titleId, titleEn, titleJa, #tp',
      ExpressionAttributeNames: { '#tp': 'type' },
      ExclusiveStartKey: lastKey,
    }));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

function normStr(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function matchTitle(query, allTitles) {
  const q = normStr(query);
  if (!q) return null;

  // Exact match
  const exact = allTitles.find(
    (t) => normStr(t.titleEn) === q || normStr(t.titleJa) === q,
  );
  if (exact) return exact;

  // One side starts with the other (handles "Bleach" matching "Bleach Vol. 3 Review")
  const partial = allTitles.find((t) => {
    const en = normStr(t.titleEn);
    return en && (q.startsWith(en) || en.startsWith(q));
  });
  return partial || null;
}

// ── HTTP fetch helper ──────────────────────────────────────────────────────────

const BOT_UA = 'MangaCriticBot/1.0 (review aggregator; scores and short excerpts only; +https://mangacritic.com)';

async function fetchText(url, timeout = 10000) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    headers: { 'User-Agent': BOT_UA, Accept: 'text/html,application/xhtml+xml,application/xml,text/xml' },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// ── JSON-LD score extraction (works for IGN and others with structured data) ──

function extractJsonLdScore(html) {
  const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        const rv = node.reviewRating || node.aggregateRating;
        if (rv?.ratingValue != null) return String(rv.ratingValue);
      }
    } catch { /* skip bad JSON-LD */ }
  }
  return null;
}

// ── Per-source scrapers ────────────────────────────────────────────────────────
//
// Each scraper returns an array of candidate objects:
// { titleQuery, publication, reviewerName, scoreRaw, score, excerpt, originalUrl, publishedAt }
//
// All HTTP errors are caught — a failing source is skipped entirely.

// ── Anime News Network ────────────────────────────────────────────────────────

async function fetchANN() {
  const xml = await fetchText('https://www.animenewsnetwork.com/review.atom', 15000);
  const items = parseAtom(xml);
  const results = [];

  for (const item of items.slice(0, 20)) {
    if (!item.link) continue;
    try {
      await sleep(500);
      const page = await fetchText(item.link);

      // ANN displays grades in several formats across their review templates.
      // Try each pattern in order; first match wins.
      let scoreRaw = null;

      // 1. JSON-LD structured data (newer ANN pages)
      scoreRaw = extractJsonLdScore(page);

      // 2. "Overall : A-" or "Grade : B+" in page text
      if (!scoreRaw) {
        const m = page.match(/(?:overall|grade)\s*[:\-]\s*([A-F][+\-]?)/i);
        if (m) scoreRaw = m[1].toUpperCase();
      }

      // 3. ANN rating element with class containing "rating" or "grade"
      if (!scoreRaw) {
        const m = page.match(/class="[^"]*(?:rating|grade)[^"]*"[^>]*>\s*([A-F][+\-]?)\s*</i);
        if (m) scoreRaw = m[1].toUpperCase();
      }

      // 4. ANN sometimes writes "Rating: X/10"
      if (!scoreRaw) {
        const m = page.match(/rating\s*[:\-]\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
        if (m) scoreRaw = m[1] + '/10';
      }

      if (!scoreRaw) continue;
      const score = normalizeScore(scoreRaw);
      if (score === null) continue;

      // Strip " (manga)" / " (anime)" / "Review" from the title
      const titleQuery = item.title
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/\s*review\s*$/i, '')
        .trim();

      const gran = extractGranularity(item.title);

      results.push({
        titleQuery,
        publication:  'Anime News Network',
        reviewerName: item.author || 'ANN Staff',
        scoreRaw,
        score,
        excerpt:      makeExcerpt(item.description),
        originalUrl:  item.link,
        publishedAt:  item.pubDate,
        ...gran,
      });
    } catch (err) {
      console.warn(`ANN item skip <${item.link}>: ${err.message}`);
    }
  }

  return results;
}

// ── IGN ────────────────────────────────────────────────────────────────────────

async function fetchIGN() {
  const xml = await fetchText('https://feeds.ign.com/ign/all', 15000);
  const items = parseRss(xml);
  const results = [];

  // Filter for items that mention anime or manga in title/description
  const candidates = items.filter((item) => {
    const text = (item.title + ' ' + item.description).toLowerCase();
    return /\b(anime|manga)\b/.test(text) && /\breview\b/.test(text);
  });

  for (const item of candidates.slice(0, 10)) {
    if (!item.link) continue;
    try {
      await sleep(500);
      const page = await fetchText(item.link);

      // IGN uses JSON-LD with reviewRating.ratingValue (out of 10)
      let scoreRaw = extractJsonLdScore(page);

      // Fallback: look for score in page metadata
      if (!scoreRaw) {
        const m = page.match(/"reviewScore"\s*[:\s]+([0-9.]+)/);
        if (m) scoreRaw = m[1];
      }

      if (!scoreRaw) continue;
      // IGN scores are out of 10
      const normalized = scoreRaw.includes('/') ? scoreRaw : `${scoreRaw}/10`;
      const score = normalizeScore(normalized);
      if (score === null) continue;

      const titleQuery = item.title.replace(/\s*review\s*$/i, '').trim();
      const gran = extractGranularity(item.title);

      results.push({
        titleQuery,
        publication:  'IGN',
        reviewerName: item.author || 'IGN Staff',
        scoreRaw:     normalized,
        score,
        excerpt:      makeExcerpt(item.description),
        originalUrl:  item.link,
        publishedAt:  item.pubDate,
        ...gran,
      });
    } catch (err) {
      console.warn(`IGN item skip <${item.link}>: ${err.message}`);
    }
  }

  return results;
}

// ── Otaku USA ──────────────────────────────────────────────────────────────────

async function fetchOtakuUSA() {
  const xml = await fetchText('https://www.otakuusamagazine.com/category/reviews/feed/', 15000);
  const items = parseRss(xml);
  const results = [];

  for (const item of items.slice(0, 15)) {
    if (!item.link) continue;
    try {
      await sleep(500);
      const page = await fetchText(item.link);

      let scoreRaw = extractJsonLdScore(page);

      if (!scoreRaw) {
        // Otaku USA often uses letter grades or X/10 stars
        const m = page.match(/(?:grade|rating|score)\s*[:\-]\s*([A-F][+\-]?|\d+(?:\.\d+)?\/(?:5|10))/i);
        if (m) scoreRaw = m[1].toUpperCase();
      }

      if (!scoreRaw) continue;
      const score = normalizeScore(scoreRaw);
      if (score === null) continue;

      const titleQuery = item.title
        .replace(/\s*vol(?:ume)?\.?\s*\d+\b.*$/i, '')
        .replace(/\s*review\s*$/i, '')
        .trim();

      const gran = extractGranularity(item.title);

      results.push({
        titleQuery,
        publication:  'Otaku USA',
        reviewerName: item.author || 'Otaku USA Staff',
        scoreRaw,
        score,
        excerpt:      makeExcerpt(item.description),
        originalUrl:  item.link,
        publishedAt:  item.pubDate,
        ...gran,
      });
    } catch (err) {
      console.warn(`OtakuUSA item skip <${item.link}>: ${err.message}`);
    }
  }

  return results;
}

// ── ComicBookRoundup ───────────────────────────────────────────────────────────

async function fetchCBR(allTitles) {
  const results = [];

  // Fetch CBR's recently-reviewed manga page to discover new volume reviews
  let recentPage;
  try {
    recentPage = await fetchText('https://comicbookroundup.com/manga/reviews/', 15000);
  } catch (err) {
    console.warn(`CBR recent page fetch failed: ${err.message}`);
    return results;
  }

  // CBR recent page contains links to individual volume review pages
  // Pattern: href="/manga/reviews/[publisher]/[title]/volume-[n]"
  const linkRe = /href="(\/manga\/reviews\/[^"]+\/volume-\d+)"/gi;
  const seen = new Set();
  let lm;
  while ((lm = linkRe.exec(recentPage)) !== null) {
    seen.add('https://comicbookroundup.com' + lm[1]);
    if (seen.size >= 20) break;
  }

  for (const pageUrl of seen) {
    try {
      await sleep(600);
      const page = await fetchText(pageUrl);

      // CBR displays a "Round-Up Score" at the top: e.g. "8.3/10"
      const roundupMatch = page.match(/round.up\s+score[^>]*>\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
      if (!roundupMatch) continue;

      const scoreRaw = roundupMatch[1] + '/10';
      const score = normalizeScore(scoreRaw);
      if (score === null) continue;

      // Extract series title from the page <title> or a heading
      const titleMatch = page.match(/<h1[^>]*>([^<]+)<\/h1>/i);
      if (!titleMatch) continue;

      // CBR headings look like "Berserk Volume 39 Reviews"
      const titleQuery = titleMatch[1]
        .replace(/\s*(?:vol(?:ume)?\.?\s*\d+)?\s*reviews?\s*$/i, '')
        .trim();

      const gran = extractGranularity(titleMatch[1]);

      // Best short excerpt from the page's meta description
      const metaDesc = (page.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) || [])[1] || '';
      const excerpt = makeExcerpt(metaDesc || 'Aggregated manga volume critic scores.');

      results.push({
        titleQuery,
        publication:  'ComicBookRoundup',
        reviewerName: 'Editorial Round-Up',
        scoreRaw,
        score,
        excerpt,
        originalUrl:  pageUrl,
        publishedAt:  new Date().toISOString(),
        ...gran,
      });
    } catch (err) {
      console.warn(`CBR page skip <${pageUrl}>: ${err.message}`);
    }
  }

  return results;
}

// ── Polygon ────────────────────────────────────────────────────────────────────

async function fetchPolygon() {
  const xml = await fetchText('https://www.polygon.com/rss/index.xml', 15000);
  const items = parseRss(xml);
  const results = [];

  const candidates = items.filter((item) => {
    const text = (item.title + ' ' + item.description).toLowerCase();
    return /\b(anime|manga)\b/.test(text) && /\breview\b/.test(text);
  });

  for (const item of candidates.slice(0, 8)) {
    if (!item.link) continue;
    try {
      await sleep(500);
      const page = await fetchText(item.link);

      // Polygon stopped numerical scores in 2018.
      // Only store the review if JSON-LD provides a score.
      const scoreRaw = extractJsonLdScore(page);
      if (!scoreRaw) continue;

      const normalized = scoreRaw.includes('/') ? scoreRaw : `${scoreRaw}/10`;
      const score = normalizeScore(normalized);
      if (score === null) continue;

      const titleQuery = item.title.replace(/\s*review\s*$/i, '').trim();
      const gran = extractGranularity(item.title);

      results.push({
        titleQuery,
        publication:  'Polygon',
        reviewerName: item.author || 'Polygon Staff',
        scoreRaw:     normalized,
        score,
        excerpt:      makeExcerpt(item.description),
        originalUrl:  item.link,
        publishedAt:  item.pubDate,
        ...gran,
      });
    } catch (err) {
      console.warn(`Polygon item skip <${item.link}>: ${err.message}`);
    }
  }

  return results;
}

// ── The A.V. Club ──────────────────────────────────────────────────────────────

async function fetchAVClub() {
  const xml = await fetchText('https://www.avclub.com/reviews/rss', 15000);
  const items = parseRss(xml);
  const results = [];

  const candidates = items.filter((item) => {
    const text = (item.title + ' ' + item.description).toLowerCase();
    return /\b(anime|manga)\b/.test(text);
  });

  for (const item of candidates.slice(0, 8)) {
    if (!item.link) continue;
    try {
      await sleep(500);
      const page = await fetchText(item.link);

      let scoreRaw = extractJsonLdScore(page);

      if (!scoreRaw) {
        // AV Club uses letter grades in their review metadata
        const m = page.match(/(?:grade|rating)[^>]{0,80}>\s*([A-F][+\-]?)\s*<\/|(?:grade|rating)[^:]{0,20}:\s*([A-F][+\-]?)/i);
        if (m) scoreRaw = (m[1] || m[2]).toUpperCase();
      }

      if (!scoreRaw) continue;
      const score = normalizeScore(scoreRaw);
      if (score === null) continue;

      const titleQuery = item.title
        .replace(/^review:\s*/i, '')
        .replace(/\s*review\s*$/i, '')
        .trim();

      const gran = extractGranularity(item.title);

      results.push({
        titleQuery,
        publication:  'The A.V. Club',
        reviewerName: item.author || 'AV Club Staff',
        scoreRaw,
        score,
        excerpt:      makeExcerpt(item.description),
        originalUrl:  item.link,
        publishedAt:  item.pubDate,
        ...gran,
      });
    } catch (err) {
      console.warn(`AVClub item skip <${item.link}>: ${err.message}`);
    }
  }

  return results;
}

// ── Review storage ────────────────────────────────────────────────────────────

async function storeReview(review) {
  try {
    await ddb.send(new PutCommand({
      TableName: REVIEWS_TABLE,
      Item: review,
      ConditionExpression: 'attribute_not_exists(reviewId)',
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return false; // already stored
    throw err;
  }
}

// ── Main handler ───────────────────────────────────────────────────────────────

const SOURCES = [
  { name: 'Anime News Network', fn: (titles) => fetchANN()        },
  { name: 'IGN',                fn: (titles) => fetchIGN()        },
  { name: 'Otaku USA',          fn: (titles) => fetchOtakuUSA()   },
  { name: 'ComicBookRoundup',   fn: (titles) => fetchCBR(titles)  },
  { name: 'Polygon',            fn: (titles) => fetchPolygon()    },
  { name: 'The A.V. Club',      fn: (titles) => fetchAVClub()     },
];

exports.handler = async () => {
  console.log('FetchCriticReviews: starting run');

  const allTitles = await loadAllTitles();
  console.log(`Loaded ${allTitles.length} titles for matching`);

  let totalNew = 0;
  const affectedTitles = new Set();

  for (const src of SOURCES) {
    let scraped;
    try {
      console.log(`Fetching ${src.name}…`);
      scraped = await src.fn(allTitles);
      console.log(`${src.name}: ${scraped.length} candidates`);
    } catch (err) {
      console.error(`${src.name} source failed (skipping):`, err.message);
      continue;
    }

    for (const item of scraped) {
      const titleRecord = matchTitle(item.titleQuery, allTitles);
      if (!titleRecord) {
        console.log(`${src.name}: no title match for "${item.titleQuery}" — skipping`);
        continue;
      }

      const { granularity, seasonNumber, volumeNumber, ...rest } = item;
      const review = {
        titleId:      titleRecord.titleId,
        reviewId:     reviewIdFromUrl(item.originalUrl),
        source:       'critic-external',
        publication:  item.publication,
        reviewerName: item.reviewerName,
        score:        item.score,
        scoreRaw:     item.scoreRaw,
        excerpt:      item.excerpt,
        originalUrl:  item.originalUrl,
        language:     'en',
        granularity,
        createdAt:    item.publishedAt
          ? new Date(item.publishedAt).toISOString()
          : new Date().toISOString(),
      };
      if (seasonNumber != null) review.seasonNumber = seasonNumber;
      if (volumeNumber  != null) review.volumeNumber  = volumeNumber;

      try {
        const isNew = await storeReview(review);
        if (isNew) {
          totalNew++;
          affectedTitles.add(titleRecord.titleId);
          console.log(`Stored: [${item.publication}] "${item.titleQuery}" (${item.scoreRaw})`);
        }
      } catch (err) {
        console.error(`Store failed for "${item.titleQuery}":`, err.message);
      }
    }
  }

  // Recalculate aggregate scores for all titles that got new reviews
  console.log(`Recalculating scores for ${affectedTitles.size} titles…`);
  for (const titleId of affectedTitles) {
    try {
      await recalculate(titleId);
    } catch (err) {
      console.error(`Recalculate failed for ${titleId}:`, err.message);
    }
  }

  console.log(`FetchCriticReviews: done — ${totalNew} new reviews stored.`);
  return { ok: true, newReviews: totalNew };
};
