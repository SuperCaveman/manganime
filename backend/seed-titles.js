'use strict';

/**
 * seed-titles.js — Seeds 30 well-known anime/manga titles from Jikan + AniList.
 * Run: node seed-titles.js
 * Skips titles already in DynamoDB (checked by titleId = `${type}-${malId}` and by titleEn).
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: 'us-east-1' });
const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const TABLE = 'mangacritic-titles';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Titles to seed (MAL IDs hardcoded for accuracy) ──────────────────────────

const TITLES = [
  // Anime
  { malId: 30,     type: 'anime', hint: 'Neon Genesis Evangelion' },
  { malId: 813,    type: 'anime', hint: 'Dragon Ball Z' },
  { malId: 20,     type: 'anime', hint: 'Naruto' },
  { malId: 30276,  type: 'anime', hint: 'One Punch Man' },
  { malId: 11061,  type: 'anime', hint: 'Hunter x Hunter (2011)' },
  { malId: 1535,   type: 'anime', hint: 'Death Note' },
  { malId: 9253,   type: 'anime', hint: 'Steins;Gate' },
  { malId: 1575,   type: 'anime', hint: 'Code Geass' },
  { malId: 199,    type: 'anime', hint: 'Spirited Away' },
  { malId: 164,    type: 'anime', hint: 'Princess Mononoke' },
  { malId: 47,     type: 'anime', hint: 'Akira' },
  { malId: 43,     type: 'anime', hint: 'Ghost in the Shell' },
  { malId: 31964,  type: 'anime', hint: 'My Hero Academia' },
  { malId: 40748,  type: 'anime', hint: 'Jujutsu Kaisen' },
  { malId: 44511,  type: 'anime', hint: 'Chainsaw Man' },
  { malId: 37521,  type: 'anime', hint: 'Vinland Saga' },
  { malId: 32182,  type: 'anime', hint: 'Mob Psycho 100' },
  { malId: 33352,  type: 'anime', hint: 'Violet Evergarden' },
  // Manga
  { malId: 11,     type: 'manga', hint: 'Naruto' },
  { malId: 42,     type: 'manga', hint: 'Dragon Ball' },
  { malId: 21,     type: 'manga', hint: 'Death Note' },
  { malId: 2,      type: 'manga', hint: 'Vagabond' },
  { malId: 44,     type: 'manga', hint: 'Slam Dunk' },
  { malId: 13,     type: 'manga', hint: 'One Piece' },      // may already exist by slug
  { malId: 25,     type: 'manga', hint: 'Fullmetal Alchemist' },
  { malId: 13103,  type: 'manga', hint: 'Oyasumi Punpun' },
  { malId: 1902,   type: 'manga', hint: "JoJo's Bizarre Adventure" },
  { malId: 116778, type: 'manga', hint: 'Chainsaw Man' },
  { malId: 119621, type: 'manga', hint: 'Spy x Family' },
  { malId: 87216,  type: 'manga', hint: 'Demon Slayer' },
  { malId: 75989,  type: 'manga', hint: 'My Hero Academia' },
];

// ── Load existing titles for duplicate detection ───────────────────────────────

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

// ── Jikan fetch ───────────────────────────────────────────────────────────────

async function fetchJikan(malId, type) {
  const endpoint = type === 'anime'
    ? `https://api.jikan.moe/v4/anime/${malId}`
    : `https://api.jikan.moe/v4/manga/${malId}`;
  const res = await fetch(endpoint, {
    headers: { 'User-Agent': 'MangaCritic/1.0 (seed script)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Jikan ${res.status} for ${type} ${malId}`);
  const json = await res.json();
  return json.data;
}

// ── AniList cover fallback ────────────────────────────────────────────────────

const ANILIST_QUERY = `
  query ($search: String, $type: MediaType) {
    Media(search: $search, type: $type, sort: SEARCH_MATCH) {
      coverImage { extraLarge large }
    }
  }
`;

async function fetchAniListCover(titleEn, type) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: ANILIST_QUERY,
        variables: { search: titleEn, type: type === 'anime' ? 'ANIME' : 'MANGA' },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    const cover = json?.data?.Media?.coverImage;
    return cover?.extraLarge || cover?.large || '';
  } catch {
    return '';
  }
}

// ── Build title record from Jikan data ───────────────────────────────────────

function buildTitle(data, type) {
  const titleEn = data.title_english || data.title || '';
  const titleJa = data.title_japanese || data.title || '';

  const genres = (data.genres || []).map((g) => g.name).filter(Boolean);
  const themes  = (data.themes || []).map((t) => t.name).filter(Boolean);
  const allGenres = [...new Set([...genres, ...themes])].slice(0, 8);

  const studio = type === 'anime'
    ? ((data.studios || [])[0]?.name || (data.producers || [])[0]?.name || '')
    : ((data.authors || [])[0]?.name || '');

  const year = data.aired?.prop?.from?.year
    || data.published?.prop?.from?.year
    || data.year
    || null;

  const coverImageUrl = data.images?.jpg?.large_image_url
    || data.images?.jpg?.image_url
    || data.images?.webp?.large_image_url
    || '';

  // Trailer (anime only)
  let trailerYoutubeId = null;
  if (type === 'anime') {
    const yt = data.trailer?.youtube_id;
    const embedMatch = data.trailer?.embed_url?.match(/embed\/([^?]+)/);
    trailerYoutubeId = yt || (embedMatch ? embedMatch[1] : null);
  }

  const titleId = `${type}-${data.mal_id}`;
  const enClean = titleEn.trim();
  const jaClean = titleJa.trim();

  return {
    titleId,
    titleEn: enClean,
    titleJa: jaClean,
    titleEnLower: enClean.toLowerCase(),
    titleJaLower: jaClean.toLowerCase(),
    type,
    genres: allGenres,
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

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Loading existing titles…');
  const { ids: existingIds, names: existingNames } = await loadExisting();
  console.log(`Found ${existingIds.size} existing titles.\n`);

  let seeded = 0;
  let skipped = 0;

  for (const entry of TITLES) {
    const titleId = `${entry.type}-${entry.malId}`;

    if (existingIds.has(titleId)) {
      console.log(`  SKIP (id) ${entry.hint}`);
      skipped++;
      continue;
    }

    // Jikan rate limit: ~3 req/s — sleep 400ms between requests
    await sleep(400);

    let data;
    try {
      data = await fetchJikan(entry.malId, entry.type);
    } catch (err) {
      console.error(`  ERROR fetching ${entry.hint}: ${err.message}`);
      continue;
    }

    const title = buildTitle(data, entry.type);

    if (existingNames.has(title.titleEn.toLowerCase().trim())) {
      console.log(`  SKIP (name) ${title.titleEn}`);
      skipped++;
      continue;
    }

    // Fetch AniList cover if Jikan image is missing
    if (!title.coverImageUrl) {
      await sleep(300);
      title.coverImageUrl = await fetchAniListCover(title.titleEn, entry.type);
    }

    await ddb.send(new PutCommand({ TableName: TABLE, Item: title }));
    existingIds.add(titleId);
    existingNames.add(title.titleEn.toLowerCase().trim());

    console.log(`  OK  [${entry.type}] ${title.titleEn} (${title.year || '?'}) — ${title.coverImageUrl ? 'cover ✓' : 'no cover'}`);
    seeded++;
  }

  // Final count
  const finalRes = await ddb.send(new ScanCommand({
    TableName: TABLE,
    Select: 'COUNT',
  }));

  console.log(`\nDone. Seeded: ${seeded}  Skipped: ${skipped}`);
  console.log(`Total titles in table: ${finalRes.Count}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
