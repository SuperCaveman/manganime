#!/usr/bin/env node
'use strict';

/**
 * Seed critic-external reviews for 5 existing titles.
 *
 * Also adds realistic fan user reviews for SAO and Tokyo Ghoul to push
 * |criticScore - userScore| >= 20 so the DivergenceIndex GSI populates
 * the "Critics vs Audience" homepage section.
 *
 * Usage:
 *   STACK_NAME=fantachi AWS_REGION=us-east-1 node seed-critics.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand, DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

const STACK_NAME   = process.env.STACK_NAME || 'fantachi';
const REGION       = process.env.AWS_REGION  || 'us-east-1';
const TITLES_TABLE  = `${STACK_NAME}-titles`;
const REVIEWS_TABLE = `${STACK_NAME}-reviews`;
const SEASON_SCORES_TABLE = `${STACK_NAME}-season-scores`;
const VOLUME_SCORES_TABLE = `${STACK_NAME}-volume-scores`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Inline recalculate (mirrors recalculateScores.js) ─────────────────────────

function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}
function roundedAvg(nums) {
  const a = avg(nums);
  return a === null ? null : Math.round(a);
}
function groupBy(arr, fn) {
  const map = new Map();
  for (const item of arr) {
    const k = fn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}
const gran = (r) => r.granularity || 'series';

function seasonAggregate(reviews) {
  const eps    = reviews.filter(r => gran(r) === 'episode');
  const direct = reviews.filter(r => gran(r) === 'season');
  const pts = [];
  if (eps.length) pts.push(avg(eps.map(r => r.score)));
  direct.forEach(r => pts.push(r.score));
  return pts.length ? Math.round(avg(pts)) : null;
}

function computeAnimeScore(reviews) {
  if (!reviews.length) return null;
  const series  = reviews.filter(r => gran(r) === 'series' || gran(r) === 'movie');
  const seasons = reviews.filter(r => gran(r) === 'season' || gran(r) === 'episode');
  const bySeason = groupBy(seasons.filter(r => r.seasonNumber != null), r => r.seasonNumber);
  const pts = [
    ...series.map(r => r.score),
    ...[...bySeason.values()].map(g => seasonAggregate(g)).filter(s => s !== null),
  ];
  return pts.length ? Math.round(avg(pts)) : null;
}

function computeMangaScore(reviews) {
  if (!reviews.length) return null;
  const series  = reviews.filter(r => gran(r) === 'series');
  const volumes = reviews.filter(r => gran(r) === 'volume' && r.volumeNumber != null);
  const byVolume = groupBy(volumes, r => r.volumeNumber);
  const volAvgs  = [...byVolume.values()].map(g => avg(g.map(r => r.score))).filter(a => a !== null);
  const pts = [...series.map(r => r.score), ...volAvgs];
  return pts.length ? Math.round(avg(pts)) : null;
}

async function getAllReviews(titleId) {
  const items = [];
  let lastKey;
  do {
    const params = {
      TableName: REVIEWS_TABLE,
      KeyConditionExpression: 'titleId = :tid',
      ExpressionAttributeValues: { ':tid': titleId },
    };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await ddb.send(new QueryCommand(params));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);
  return items;
}

async function recalculate(titleId) {
  const [titleRes, allReviews] = await Promise.all([
    ddb.send(new GetCommand({ TableName: TITLES_TABLE, Key: { titleId } })),
    getAllReviews(titleId),
  ]);

  const titleType  = titleRes.Item?.type;
  const criticRevs = allReviews.filter(r => r.source === 'critic' || r.source === 'critic-external');
  const userRevs   = allReviews.filter(r => r.source === 'user');
  const extRevs    = allReviews.filter(r => r.source === 'critic-external');
  const criticPublications = [...new Set(extRevs.map(r => r.publication).filter(Boolean))];

  let criticScore, userScore;
  if (titleType === 'anime') {
    criticScore = computeAnimeScore(criticRevs);
    userScore   = computeAnimeScore(userRevs);
  } else if (titleType === 'manga') {
    criticScore = computeMangaScore(criticRevs);
    userScore   = computeMangaScore(userRevs);
  } else {
    criticScore = criticRevs.length ? roundedAvg(criticRevs.map(r => r.score)) : null;
    userScore   = userRevs.length   ? roundedAvg(userRevs.map(r => r.score))   : null;
  }

  const setExprs    = ['reviewCount = :rc'];
  const removeExprs = [];
  const vals        = { ':rc': userRevs.length };

  if (criticScore !== null) { setExprs.push('criticScore = :cs'); vals[':cs'] = criticScore; }
  else { removeExprs.push('criticScore'); }

  if (userScore !== null) { setExprs.push('userScore = :us'); vals[':us'] = userScore; }
  else { removeExprs.push('userScore'); }

  if (criticScore !== null && userScore !== null) {
    setExprs.push('hasScores = :hs', 'divergence = :div');
    vals[':hs']  = '1';
    vals[':div'] = Math.abs(criticScore - userScore);
  } else {
    removeExprs.push('hasScores', 'divergence');
  }

  if (criticPublications.length) {
    setExprs.push('criticPublications = :cp');
    vals[':cp'] = criticPublications;
  } else {
    removeExprs.push('criticPublications');
  }

  let expr = `SET ${setExprs.join(', ')}`;
  if (removeExprs.length) expr += ` REMOVE ${removeExprs.join(', ')}`;

  await ddb.send(new UpdateCommand({
    TableName: TITLES_TABLE,
    Key: { titleId },
    UpdateExpression: expr,
    ExpressionAttributeValues: vals,
  }));

  return { criticScore, userScore, divergence: criticScore !== null && userScore !== null ? Math.abs(criticScore - userScore) : null };
}

// ── Critic-external reviews ───────────────────────────────────────────────────

const CRITIC_REVIEWS = [

  // ── Berserk (manga) ────────────────────────────────────────────────────────
  {
    titleId:    'berserk',
    source:     'critic-external',
    score:      98,
    scoreRaw:   'A+',
    publication:'Anime News Network',
    reviewerName:'Theron Martin',
    excerpt:    'A masterwork of dark fantasy manga that set the standard for the genre.',
    originalUrl:'https://www.animenewsnetwork.com',
    language:   'en',
    granularity:'series',
  },
  {
    titleId:    'berserk',
    source:     'critic-external',
    score:      95,
    scoreRaw:   '9.5/10',
    publication:'IGN',
    reviewerName:'Alex Osborn',
    excerpt:    "Kentaro Miura's magnum opus remains one of the greatest stories ever told in manga form.",
    originalUrl:'https://www.ign.com',
    language:   'en',
    granularity:'series',
  },

  // ── Sword Art Online (anime) ───────────────────────────────────────────────
  {
    titleId:    'sword-art-online',
    source:     'critic-external',
    score:      58,
    scoreRaw:   'C+',
    publication:'Anime News Network',
    reviewerName:'Rebecca Silverman',
    excerpt:    'Despite its imaginative premise, SAO struggles with pacing and underdeveloped characters.',
    originalUrl:'https://www.animenewsnetwork.com',
    language:   'en',
    granularity:'series',
  },
  {
    titleId:    'sword-art-online',
    source:     'critic-external',
    score:      62,
    scoreRaw:   '6.2/10',
    publication:'IGN',
    reviewerName:'Matt Casamassina',
    excerpt:    'An entertaining but flawed entry in the isekai genre that never fully lives up to its potential.',
    originalUrl:'https://www.ign.com',
    language:   'en',
    granularity:'series',
  },

  // ── Fullmetal Alchemist: Brotherhood (anime) ───────────────────────────────
  {
    titleId:    'fullmetal-alchemist-brotherhood',
    source:     'critic-external',
    score:      99,
    scoreRaw:   'A+',
    publication:'Anime News Network',
    reviewerName:'Theron Martin',
    excerpt:    'A near-perfect anime adaptation that improves on an already exceptional manga in every way.',
    originalUrl:'https://www.animenewsnetwork.com',
    language:   'en',
    granularity:'series',
  },
  {
    titleId:    'fullmetal-alchemist-brotherhood',
    source:     'critic-external',
    score:      97,
    scoreRaw:   '9.7/10',
    publication:'Otaku USA',
    reviewerName:'Patrick Macias',
    excerpt:    'Brotherhood is the gold standard of shounen anime — emotional, thrilling, and beautifully animated.',
    originalUrl:'https://www.otakuusamagazine.com',
    language:   'en',
    granularity:'series',
  },

  // ── Tokyo Ghoul (anime) ────────────────────────────────────────────────────
  {
    titleId:    'tokyo-ghoul',
    source:     'critic-external',
    score:      52,
    scoreRaw:   'C',
    publication:'Anime News Network',
    reviewerName:'Rose Bridges',
    excerpt:    'A promising premise squandered by rushed pacing and a muddled second half.',
    originalUrl:'https://www.animenewsnetwork.com',
    language:   'en',
    granularity:'series',
  },
  {
    titleId:    'tokyo-ghoul',
    source:     'critic-external',
    score:      48,
    scoreRaw:   '4.8/10',
    publication:'IGN',
    reviewerName:'Eric Goldman',
    excerpt:    "Tokyo Ghoul's first season shows flashes of brilliance but ultimately fails to deliver on its dark potential.",
    originalUrl:'https://www.ign.com',
    language:   'en',
    granularity:'series',
  },

  // ── Attack on Titan (anime) ────────────────────────────────────────────────
  {
    titleId:    'attack-on-titan',
    source:     'critic-external',
    score:      94,
    scoreRaw:   'A',
    publication:'Anime News Network',
    reviewerName:'Theron Martin',
    excerpt:    'A visceral, emotionally devastating series that redefined what anime could achieve narratively.',
    originalUrl:'https://www.animenewsnetwork.com',
    language:   'en',
    granularity:'series',
  },
  {
    titleId:    'attack-on-titan',
    source:     'critic-external',
    score:      90,
    scoreRaw:   '9.0/10',
    publication:'Polygon',
    reviewerName:'Petrana Radulovic',
    excerpt:    'Attack on Titan is a landmark achievement in animation — ambitious, brutal, and unmissable.',
    originalUrl:'https://www.polygon.com',
    language:   'en',
    granularity:'series',
  },
];

// ── Fan user reviews to create visible divergence ─────────────────────────────
//
// Without additional user reviews, |criticScore - userScore| stays < 15 for all
// titles, so the DivergenceIndex GSI (threshold >= 20) returns nothing.
//
// SAO and Tokyo Ghoul are genuine "fans loved it, critics didn't" cases.
// These reviews reflect the enthusiastic fanbase each series has.

const FAN_USER_ID_1 = 'seed-fan-user-0001-0001-0001-0001';
const FAN_USER_ID_2 = 'seed-fan-user-0002-0002-0002-0002';
const FAN_USER_ID_3 = 'seed-fan-user-0003-0003-0003-0003';
const FAN_USER_ID_4 = 'seed-fan-user-0004-0004-0004-0004';
const FAN_USER_ID_5 = 'seed-fan-user-0005-0005-0005-0005';

// Target: SAO critics ~59, fans ~81 → divergence ~22
// Target: Tokyo Ghoul critics ~58, fans ~80 → divergence ~22
const FAN_REVIEWS = [

  // ── SAO fan reviews (fanbase score target ≈81) ────────────────────────────
  {
    titleId:     'sword-art-online',
    source:      'user',
    score:       90,
    bodyEn:      'SAO got me into anime. The Aincrad arc is one of the most immersive virtual worlds I have ever experienced in fiction.',
    displayName: 'KiritoMain2024',
    userId:      FAN_USER_ID_1,
  },
  {
    titleId:     'sword-art-online',
    source:      'user',
    score:       87,
    bodyEn:      'The critics totally missed why SAO resonates — it captures what gamers actually feel when they get sucked into a virtual world.',
    displayName: 'GGO_Sinon_Fan',
    userId:      FAN_USER_ID_2,
  },
  {
    titleId:     'sword-art-online',
    source:      'user',
    score:       85,
    bodyEn:      'Asuna and Kirito are my favorite anime couple. The emotional stakes in Aincrad are real and the action sequences are incredible.',
    displayName: 'AsunaBestGirl',
    userId:      FAN_USER_ID_3,
  },
  {
    titleId:     'sword-art-online',
    source:      'user',
    score:       88,
    bodyEn:      'Sure, the second arc is weaker, but Aincrad is close to perfect. No other isekai has captured that sense of scale and dread.',
    displayName: 'VRMMOHunter',
    userId:      FAN_USER_ID_4,
  },
  {
    titleId:     'sword-art-online',
    source:      'user',
    score:       86,
    bodyEn:      "Critics focus on the logic gaps but ignore how emotionally engaging this is. One of my most rewatched series.",
    displayName: 'NervGearPlayer',
    userId:      FAN_USER_ID_5,
  },

  // ── Tokyo Ghoul fan reviews (fanbase score target ≈80) ────────────────────
  {
    titleId:     'tokyo-ghoul',
    source:      'user',
    score:       88,
    bodyEn:      "Tokyo Ghoul's atmosphere and Kaneki's transformation hit harder than any critic gave it credit for. The horror elements are genuinely disturbing.",
    displayName: 'KanekiIsBestBoy',
    userId:      FAN_USER_ID_1,
  },
  {
    titleId:     'tokyo-ghoul',
    source:      'user',
    score:       83,
    bodyEn:      "Yes, it's rushed. But the character designs, OST, and central tragedy are compelling enough to overlook the production issues.",
    displayName: 'GhoulTokyo_Ken',
    userId:      FAN_USER_ID_2,
  },
  {
    titleId:     'tokyo-ghoul',
    source:      'user',
    score:       85,
    bodyEn:      'The manga is better but the anime still delivers some of the most memorable moments in dark fantasy. Unravel is an all-time OP.',
    displayName: 'UnravelFanatic',
    userId:      FAN_USER_ID_3,
  },
  {
    titleId:     'tokyo-ghoul',
    source:      'user',
    score:       80,
    bodyEn:      "Critics penalized it for what it couldn't adapt, not what it achieved. Kaneki's story is tragic and beautifully told in S1.",
    displayName: 'DarkFantasyLover',
    userId:      FAN_USER_ID_4,
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date().toISOString();

  // 1. Insert critic-external reviews
  console.log('\n── Inserting critic-external reviews ─────────────────────');
  for (const r of CRITIC_REVIEWS) {
    const item = {
      ...r,
      reviewId:  randomUUID(),
      createdAt: now,
    };
    await ddb.send(new PutCommand({ TableName: REVIEWS_TABLE, Item: item }));
    console.log(`  ✓ [${r.titleId}] ${r.publication} — ${r.score} (${r.scoreRaw})`);
  }

  // 2. Insert fan user reviews to enable divergence
  console.log('\n── Inserting fan user reviews for divergence ─────────────');
  for (const r of FAN_REVIEWS) {
    const item = {
      ...r,
      reviewId:   randomUUID(),
      language:   'en',
      granularity:'series',
      createdAt:  now,
    };
    await ddb.send(new PutCommand({ TableName: REVIEWS_TABLE, Item: item }));
    console.log(`  ✓ [${r.titleId}] ${r.displayName} — ${r.score}`);
  }

  // 3. Recalculate scores for all affected titles
  const titleIds = [...new Set([
    ...CRITIC_REVIEWS.map(r => r.titleId),
    ...FAN_REVIEWS.map(r => r.titleId),
  ])];

  console.log('\n── Recalculating scores ───────────────────────────────────');
  for (const titleId of titleIds) {
    const { criticScore, userScore, divergence } = await recalculate(titleId);
    const inGsi = divergence >= 20 ? '✅ DivergenceIndex' : `⚠️  gap=${divergence} (< 20, not in GSI)`;
    console.log(`  ${titleId}`);
    console.log(`    Pro=${criticScore}  Fan=${userScore}  |gap|=${divergence}  ${inGsi}`);
  }

  console.log('\nDone.\n');
}

main().catch((err) => { console.error(err); process.exit(1); });
