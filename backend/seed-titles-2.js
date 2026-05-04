'use strict';

/**
 * seed-titles-2.js — Second pass: corrected MAL IDs + missing 429-failed titles.
 * Run: node seed-titles-2.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = 'fantachi-titles';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TITLES = [
  // Anime — 429-failed from pass 1 (IDs were correct, just rate-limited)
  { malId: 1575,   type: 'anime', hint: 'Code Geass' },
  { malId: 47,     type: 'anime', hint: 'Akira' },
  { malId: 40748,  type: 'anime', hint: 'Jujutsu Kaisen' },
  { malId: 32182,  type: 'anime', hint: 'Mob Psycho 100' },
  // Manga — corrected IDs
  { malId: 42,     type: 'manga', hint: 'Dragon Ball' },
  { malId: 656,    type: 'manga', hint: 'Vagabond' },
  { malId: 51,     type: 'manga', hint: 'Slam Dunk' },
  { malId: 25,     type: 'manga', hint: 'Fullmetal Alchemist' },
  { malId: 4632,   type: 'manga', hint: 'Oyasumi Punpun' },
  { malId: 1517,   type: 'manga', hint: "JoJo's Bizarre Adventure" },
  { malId: 119161, type: 'manga', hint: 'Spy x Family' },
  { malId: 96792,  type: 'manga', hint: 'Demon Slayer' },
  { malId: 75989,  type: 'manga', hint: 'My Hero Academia' },
];

async function loadExisting() {
  const ids = new Set();
  const names = new Set();
  let lastKey;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: 'titleId, titleEn',
      ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
    }));
    for (const item of res.Items || []) {
      ids.add(item.titleId);
      if (item.titleEn) names.add(item.titleEn.toLowerCase().trim());
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return { ids, names };
}

async function fetchJikan(malId, type) {
  const url = type === 'anime'
    ? `https://api.jikan.moe/v4/anime/${malId}`
    : `https://api.jikan.moe/v4/manga/${malId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Fantachi/1.0 (seed script)' },
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 429) throw new Error('429 rate limited');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).data;
}

const ANILIST_QUERY = `query($s:String,$t:MediaType){Media(search:$s,type:$t,sort:SEARCH_MATCH){coverImage{extraLarge large}}}`;
async function fetchAniListCover(titleEn, type) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { s: titleEn, t: type === 'anime' ? 'ANIME' : 'MANGA' } }),
      signal: AbortSignal.timeout(8000),
    });
    const j = await res.json();
    const c = j?.data?.Media?.coverImage;
    return c?.extraLarge || c?.large || '';
  } catch { return ''; }
}

function buildTitle(data, type) {
  const titleEn = data.title_english || data.title || '';
  const titleJa = data.title_japanese || data.title || '';
  const genres = [...new Set([
    ...(data.genres || []).map(g => g.name),
    ...(data.themes || []).map(t => t.name),
  ])].slice(0, 8);
  const studio = type === 'anime'
    ? ((data.studios || [])[0]?.name || (data.producers || [])[0]?.name || '')
    : ((data.authors || [])[0]?.name || '');
  const year = data.aired?.prop?.from?.year || data.published?.prop?.from?.year || data.year || null;
  const coverImageUrl = data.images?.jpg?.large_image_url || data.images?.jpg?.image_url || data.images?.webp?.large_image_url || '';
  let trailerYoutubeId = null;
  if (type === 'anime') {
    const yt = data.trailer?.youtube_id;
    const m = data.trailer?.embed_url?.match(/embed\/([^?]+)/);
    trailerYoutubeId = yt || (m ? m[1] : null);
  }
  const enClean = titleEn.trim();
  const jaClean = titleJa.trim();
  return {
    titleId: `${type}-${data.mal_id}`,
    titleEn: enClean,
    titleJa: jaClean,
    titleEnLower: enClean.toLowerCase(),
    titleJaLower: jaClean.toLowerCase(),
    type,
    genres,
    studio,
    year: year ? parseInt(year, 10) : null,
    coverImageUrl,
    malId: String(data.mal_id),
    ...(trailerYoutubeId ? { trailerYoutubeId } : {}),
    criticScore: null,
    userScore: null,
    reviewCount: 0,
    createdAt: new Date().toISOString(),
  };
}

async function main() {
  console.log('Loading existing titles…');
  const { ids: existingIds, names: existingNames } = await loadExisting();
  console.log(`Found ${existingIds.size} existing titles.\n`);

  let seeded = 0;
  let skipped = 0;

  for (const entry of TITLES) {
    const titleId = `${entry.type}-${entry.malId}`;
    if (existingIds.has(titleId)) {
      console.log(`  SKIP (id)   ${entry.hint}`);
      skipped++; continue;
    }

    // Generous sleep to avoid 429s
    await sleep(800);

    let data;
    try {
      data = await fetchJikan(entry.malId, entry.type);
    } catch (err) {
      console.error(`  ERROR ${entry.hint}: ${err.message} — retrying in 3s`);
      await sleep(3000);
      try { data = await fetchJikan(entry.malId, entry.type); }
      catch (err2) { console.error(`  FAIL  ${entry.hint}: ${err2.message}`); continue; }
    }

    const title = buildTitle(data, entry.type);

    if (existingNames.has(title.titleEn.toLowerCase().trim())) {
      console.log(`  SKIP (name) ${title.titleEn}`);
      skipped++; continue;
    }

    if (!title.coverImageUrl) {
      await sleep(400);
      title.coverImageUrl = await fetchAniListCover(title.titleEn, entry.type);
    }

    await ddb.send(new PutCommand({ TableName: TABLE, Item: title }));
    existingIds.add(titleId);
    existingNames.add(title.titleEn.toLowerCase().trim());
    console.log(`  OK   [${entry.type}] ${title.titleEn} (${title.year || '?'}) — ${title.coverImageUrl ? 'cover ✓' : 'no cover'}`);
    seeded++;
  }

  const finalRes = await ddb.send(new ScanCommand({ TableName: TABLE, Select: 'COUNT' }));
  console.log(`\nDone. Seeded: ${seeded}  Skipped: ${skipped}`);
  console.log(`Total titles in table: ${finalRes.Count}`);
}

main().catch(err => { console.error(err); process.exit(1); });
