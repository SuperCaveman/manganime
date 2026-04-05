'use strict';

/**
 * Fetches and parses anime/manga news.
 * - English (default): Anime News Network RSS + parallel OG-image fetch
 * - Japanese (lang=ja): アニメ！アニメ！ RSS + parallel OG-image fetch
 * Results are cached in Lambda memory for 15 minutes.
 * GET /news?limit=9&lang=en|ja
 */

const { ok, serverError } = require('../utils/response');

const SOURCES = {
  en: {
    url: 'https://www.animenewsnetwork.com/news/rss.xml?ann-edition=us',
    name: 'Anime News Network',
    format: 'rss2',
  },
  ja: {
    url: 'https://animeanime.jp/rss/index.rdf',
    name: 'アニメ！アニメ！',
    format: 'rdf',
  },
};

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const cache = { en: { ts: 0, items: [] }, ja: { ts: 0, items: [] } };

// ── RSS/RDF parsers ───────────────────────────────────────────────────────────

function textTag(xml, tag) {
  const cdata = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(xml);
  if (cdata) return cdata[1].trim();
  const plain = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
  return plain ? plain[1].trim() : '';
}

/** Parse RSS 2.0 <item> blocks */
function parseRSS2(xml) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const chunk = m[1];
    const link = textTag(chunk, 'guid') || textTag(chunk, 'link');
    const title = textTag(chunk, 'title');
    const rawDesc = textTag(chunk, 'description');
    const description = rawDesc.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').slice(0, 200);
    const pubDate = textTag(chunk, 'pubDate');
    if (title && link) items.push({ title, link, description, pubDate, thumbnail: '' });
  }
  return items;
}

/** Parse RSS 1.0 / RDF <item rdf:about="..."> blocks */
function parseRDF(xml) {
  const items = [];
  const itemRe = /<item[^>]*rdf:about="([^"]*)"[^>]*>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const link = m[1];
    const chunk = m[2];
    const title = textTag(chunk, 'title');
    const rawDesc = textTag(chunk, 'description') || '';
    const description = rawDesc.replace(/<[^>]+>/g, '').slice(0, 200);
    const pubDate = textTag(chunk, 'dc:date') || textTag(chunk, 'pubDate');
    if (title && link) items.push({ title, link, description, pubDate, thumbnail: '' });
  }
  return items;
}

// ── OG image fetching ─────────────────────────────────────────────────────────

const OG_RE = [
  /property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
  /content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
  /name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  /content=["']([^"']+)["'][^>]*name=["']twitter:image["']/i,
];

async function fetchOgImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MangaCritic/1.0 (news aggregator)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return '';
    // Only read up to 30KB — OG tags are always near the top
    const reader = res.body.getReader();
    let html = '';
    while (html.length < 30000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      for (const re of OG_RE) {
        const m = re.exec(html);
        if (m) { reader.cancel(); return m[1]; }
      }
    }
    reader.cancel();
    return '';
  } catch {
    return '';
  }
}

async function enrichWithImages(items) {
  const results = await Promise.allSettled(
    items.map((item) => fetchOgImage(item.link))
  );
  return items.map((item, i) => ({
    ...item,
    thumbnail: results[i].status === 'fulfilled' ? results[i].value : '',
  }));
}

// ── Handler ───────────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const limit = Math.min(parseInt(params.limit || '9', 10), 30);
    const lang = params.lang === 'ja' ? 'ja' : 'en';
    const source = SOURCES[lang];
    const now = Date.now();

    if (now - cache[lang].ts < CACHE_TTL_MS && cache[lang].items.length > 0) {
      return ok({ items: cache[lang].items.slice(0, limit), source: source.name });
    }

    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'MangaCritic/1.0 (news aggregator)',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!res.ok) throw new Error(`Feed returned ${res.status}`);

    const xml = await res.text();
    const rawItems = source.format === 'rdf' ? parseRDF(xml) : parseRSS2(xml);

    // Fetch OG images in parallel (only for the items we'll actually serve)
    const toEnrich = rawItems.slice(0, Math.max(limit, 9));
    const enriched = await enrichWithImages(toEnrich);

    cache[lang] = { ts: now, items: enriched };

    return ok({ items: enriched.slice(0, limit), source: source.name });
  } catch (err) {
    console.error('GetNews error:', err);
    const lang = (event.queryStringParameters?.lang === 'ja') ? 'ja' : 'en';
    if (cache[lang].items.length > 0) {
      return ok({ items: cache[lang].items, source: SOURCES[lang].name, stale: true });
    }
    return serverError('Could not fetch news');
  }
};
