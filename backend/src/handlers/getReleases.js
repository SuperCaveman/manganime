'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }));
const TABLE = process.env.RELEASE_CALENDAR_TABLE;

function getMondayUTC(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getUTCDay();
  // Sunday (0) looks forward to the next Monday (+1) rather than back to the
  // previous Monday (-6), so "this week" on a Sunday shows the upcoming week.
  const daysToMonday = day === 0 ? 1 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMonday + offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

const { ok, badRequest, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const { week, locale: rawLocale } = event.queryStringParameters || {};
    const locale = rawLocale === 'ja' ? 'ja' : 'en';
    const offsetWeeks = week === 'next' ? 1 : 0;
    const weekStart = toDateStr(getMondayUTC(offsetWeeks));

    const filterExpr = locale === 'en'
      ? '(#loc = :locale OR attribute_not_exists(#loc))'
      : '#loc = :locale';

    const result = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'weekStart = :ws',
      FilterExpression: filterExpr,
      ExpressionAttributeNames: { '#loc': 'locale' },
      ExpressionAttributeValues: { ':ws': weekStart, ':locale': locale },
    }));

    const items = result.Items || [];

    const animeEpisodes = items
      .filter(i => i.type === 'anime-episode')
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

    const mangaVolumes = items
      .filter(i => i.type === 'manga-volume')
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

    const animePhysical = items
      .filter(i => i.type === 'anime-physical')
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

    return ok({ weekStart, animeEpisodes, mangaVolumes, animePhysical });
  } catch (err) {
    console.error('getReleases error:', err);
    return serverError();
  }
};
