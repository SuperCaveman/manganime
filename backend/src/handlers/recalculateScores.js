'use strict';

const {
  QueryCommand, GetCommand, PutCommand, DeleteCommand, UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');

// ── helpers ────────────────────────────────────────────────────────────────────

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

// Reviews without a granularity field are treated as series-level.
const gran = (r) => r.granularity || 'series';

// ── fetch ──────────────────────────────────────────────────────────────────────

async function getAllReviews(titleId) {
  const items = [];
  let lastKey;
  do {
    const params = {
      TableName: process.env.REVIEWS_TABLE,
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

// ── aggregation ────────────────────────────────────────────────────────────────

// Season-level score for one season:
//   episode reviews → averaged into one data point
//   direct season reviews → each counts individually
function seasonAggregate(reviews) {
  const eps     = reviews.filter(r => gran(r) === 'episode');
  const direct  = reviews.filter(r => gran(r) === 'season');
  const pts = [];
  if (eps.length) pts.push(avg(eps.map(r => r.score)));
  direct.forEach(r => pts.push(r.score));
  return pts.length ? Math.round(avg(pts)) : null;
}

// Title-level score for anime:
//   series reviews → each is a data point
//   per-season aggregate → each season is one data point
function computeAnimeScore(reviews) {
  if (!reviews.length) return null;

  const series  = reviews.filter(r => gran(r) === 'series' || gran(r) === 'movie');
  const seasons = reviews.filter(r => gran(r) === 'season' || gran(r) === 'episode');

  // Only include season-keyed reviews that have a defined seasonNumber
  const byseason = groupBy(
    seasons.filter(r => r.seasonNumber != null),
    r => r.seasonNumber,
  );

  const pts = [
    ...series.map(r => r.score),
    ...[...byseason.values()].map(g => seasonAggregate(g)).filter(s => s !== null),
  ];

  return pts.length ? Math.round(avg(pts)) : null;
}

// Title-level score for manga:
//   series reviews → each is a data point
//   per-volume reviews → averaged per volume, each volume is one data point
function computeMangaScore(reviews) {
  if (!reviews.length) return null;

  const series  = reviews.filter(r => gran(r) === 'series');
  const volumes = reviews.filter(r => gran(r) === 'volume' && r.volumeNumber != null);

  const byVolume = groupBy(volumes, r => r.volumeNumber);
  const volAvgs  = [...byVolume.values()]
    .map(g => avg(g.map(r => r.score)))
    .filter(a => a !== null);

  const pts = [
    ...series.map(r => r.score),
    ...volAvgs,
  ];

  return pts.length ? Math.round(avg(pts)) : null;
}

// ── season-scores table ────────────────────────────────────────────────────────

async function writeSeasonScores(titleId, allReviews) {
  const seasoned = allReviews.filter(
    r => (gran(r) === 'season' || gran(r) === 'episode') && r.seasonNumber != null,
  );
  const bySeason = groupBy(seasoned, r => r.seasonNumber);

  // Delete stale rows (seasons that no longer have any reviews)
  const existing = await ddb.send(new QueryCommand({
    TableName: process.env.SEASON_SCORES_TABLE,
    KeyConditionExpression: 'titleId = :tid',
    ExpressionAttributeValues: { ':tid': titleId },
  }));
  for (const row of existing.Items || []) {
    if (!bySeason.has(row.seasonNumber)) {
      await ddb.send(new DeleteCommand({
        TableName: process.env.SEASON_SCORES_TABLE,
        Key: { titleId, seasonNumber: row.seasonNumber },
      }));
    }
  }

  const now = new Date().toISOString();
  for (const [seasonNumber, revs] of bySeason) {
    const crit = revs.filter(r => r.source === 'critic');
    const user = revs.filter(r => r.source === 'user');
    await ddb.send(new PutCommand({
      TableName: process.env.SEASON_SCORES_TABLE,
      Item: {
        titleId,
        seasonNumber,
        criticScore: crit.length ? seasonAggregate(crit) : null,
        userScore:   user.length ? seasonAggregate(user) : null,
        criticCount: crit.length,
        userCount:   user.length,
        updatedAt:   now,
      },
    }));
  }
}

// ── volume-scores table ────────────────────────────────────────────────────────

async function writeVolumeScores(titleId, allReviews) {
  const volumed  = allReviews.filter(r => gran(r) === 'volume' && r.volumeNumber != null);
  const byVolume = groupBy(volumed, r => r.volumeNumber);

  const existing = await ddb.send(new QueryCommand({
    TableName: process.env.VOLUME_SCORES_TABLE,
    KeyConditionExpression: 'titleId = :tid',
    ExpressionAttributeValues: { ':tid': titleId },
  }));
  for (const row of existing.Items || []) {
    if (!byVolume.has(row.volumeNumber)) {
      await ddb.send(new DeleteCommand({
        TableName: process.env.VOLUME_SCORES_TABLE,
        Key: { titleId, volumeNumber: row.volumeNumber },
      }));
    }
  }

  const now = new Date().toISOString();
  for (const [volumeNumber, revs] of byVolume) {
    const crit = revs.filter(r => r.source === 'critic');
    const user = revs.filter(r => r.source === 'user');
    await ddb.send(new PutCommand({
      TableName: process.env.VOLUME_SCORES_TABLE,
      Item: {
        titleId,
        volumeNumber,
        criticScore: crit.length ? roundedAvg(crit.map(r => r.score)) : null,
        userScore:   user.length ? roundedAvg(user.map(r => r.score)) : null,
        criticCount: crit.length,
        userCount:   user.length,
        updatedAt:   now,
      },
    }));
  }
}

// ── write Titles table ─────────────────────────────────────────────────────────

async function updateTitleScores(titleId, criticScore, userScore, userCount) {
  const setExprs = ['reviewCount = :rc'];
  const removeExprs = [];
  const vals = { ':rc': userCount };

  if (criticScore !== null) { setExprs.push('criticScore = :cs'); vals[':cs'] = criticScore; }
  else { removeExprs.push('criticScore'); }

  if (userScore !== null)   { setExprs.push('userScore = :us');   vals[':us'] = userScore;   }
  else { removeExprs.push('userScore'); }

  let expr = `SET ${setExprs.join(', ')}`;
  if (removeExprs.length) expr += ` REMOVE ${removeExprs.join(', ')}`;

  await ddb.send(new UpdateCommand({
    TableName: process.env.TITLES_TABLE,
    Key: { titleId },
    UpdateExpression: expr,
    ExpressionAttributeValues: vals,
  }));
}

// ── main ───────────────────────────────────────────────────────────────────────

async function recalculate(titleId) {
  const [titleRes, allReviews] = await Promise.all([
    ddb.send(new GetCommand({ TableName: process.env.TITLES_TABLE, Key: { titleId } })),
    getAllReviews(titleId),
  ]);

  const titleType   = titleRes.Item?.type;
  const criticRevs  = allReviews.filter(r => r.source === 'critic');
  const userRevs    = allReviews.filter(r => r.source === 'user');

  let criticScore, userScore;

  if (titleType === 'anime') {
    criticScore = computeAnimeScore(criticRevs);
    userScore   = computeAnimeScore(userRevs);
    await writeSeasonScores(titleId, allReviews);
  } else if (titleType === 'manga') {
    criticScore = computeMangaScore(criticRevs);
    userScore   = computeMangaScore(userRevs);
    await writeVolumeScores(titleId, allReviews);
  } else {
    // Unknown type — flat average fallback
    criticScore = criticRevs.length ? roundedAvg(criticRevs.map(r => r.score)) : null;
    userScore   = userRevs.length   ? roundedAvg(userRevs.map(r => r.score))   : null;
  }

  await updateTitleScores(titleId, criticScore, userScore, userRevs.length);
}

module.exports = { recalculate };

// Direct Lambda invocation (e.g. manual backfill)
exports.handler = async (event) => {
  try {
    const titleId = event.titleId;
    if (!titleId) return { statusCode: 400, body: JSON.stringify({ error: 'titleId required' }) };
    await recalculate(titleId);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('RecalculateScores error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
