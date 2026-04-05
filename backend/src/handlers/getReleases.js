'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand } = require('@aws-sdk/lib-dynamodb');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' }));
const TABLE = process.env.RELEASE_CALENDAR_TABLE;

function getMondayUTC(offsetWeeks = 0) {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + daysToMonday + offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function toDateStr(d) {
  return d.toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  try {
    const week = event.queryStringParameters?.week || 'current';
    const offsetWeeks = week === 'next' ? 1 : 0;
    const weekStart = toDateStr(getMondayUTC(offsetWeeks));

    const result = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: 'weekStart = :ws',
      ExpressionAttributeValues: { ':ws': weekStart },
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ weekStart, animeEpisodes, mangaVolumes, animePhysical }),
    };
  } catch (err) {
    console.error('getReleases error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch releases' }),
    };
  }
};
