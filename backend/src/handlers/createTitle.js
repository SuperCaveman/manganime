'use strict';

const { PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, created, badRequest, serverError } = require('../utils/response');

const ANILIST_QUERY = `
  query ($search: String, $type: MediaType) {
    Media(search: $search, type: $type, sort: SEARCH_MATCH) {
      coverImage { extraLarge large }
    }
  }
`;

async function fetchCover(titleEn, type) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: ANILIST_QUERY,
        variables: { search: titleEn, type: type === 'anime' ? 'ANIME' : 'MANGA' },
      }),
    });
    const json = await res.json();
    const cover = json?.data?.Media?.coverImage;
    return cover?.extraLarge || cover?.large || '';
  } catch {
    return '';
  }
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return badRequest('Unauthorized');

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return badRequest('Invalid JSON body');
    }

    const { titleEn, titleJa, type, genres, studio, year } = body;

    if (!titleEn?.trim()) return badRequest('titleEn is required');
    if (!['anime', 'manga'].includes(type)) return badRequest('type must be "anime" or "manga"');

    const titleId = slugify(titleEn);

    // Return existing title if already present
    const existing = await ddb.send(new GetCommand({
      TableName: process.env.TITLES_TABLE,
      Key: { titleId },
    }));
    if (existing.Item) {
      return ok({ ...existing.Item, alreadyExists: true });
    }

    // Auto-fetch cover from AniList
    const coverImageUrl = await fetchCover(titleEn.trim(), type);

    const enClean = titleEn.trim();
    const jaClean = titleJa?.trim() || '';
    const title = {
      titleId,
      titleEn: enClean,
      titleJa: jaClean,
      titleEnLower: enClean.toLowerCase(),
      titleJaLower: jaClean.toLowerCase(),
      type,
      genres: Array.isArray(genres) ? genres.filter(Boolean) : [],
      studio: studio?.trim() || '',
      year: year ? parseInt(year, 10) : null,
      coverImageUrl,
      criticScore: null,
      userScore: null,
      reviewCount: 0,
    };

    await ddb.send(new PutCommand({ TableName: process.env.TITLES_TABLE, Item: title }));

    return created(title);
  } catch (err) {
    console.error('CreateTitle error:', err);
    return serverError();
  }
};
