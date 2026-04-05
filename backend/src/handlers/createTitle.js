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

async function fetchJikanTrailer(malId) {
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${malId}`);
    if (!res.ok) return null;
    const json = await res.json();
    const trailer = json.data?.trailer;
    const embedMatch = trailer?.embed_url?.match(/embed\/([^?]+)/);
    return trailer?.youtube_id || (embedMatch ? embedMatch[1] : null);
  } catch {
    return null;
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

    const { titleEn, titleJa, type, genres, studio, year, malId, coverImageUrl: providedCover, trailerYoutubeId: providedTrailer } = body;

    if (!titleEn?.trim()) return badRequest('titleEn is required');
    if (!['anime', 'manga'].includes(type)) return badRequest('type must be "anime" or "manga"');

    // Jikan-sourced titles use a stable malId-based key; manual titles use a slug
    const titleId = malId ? `${type}-${malId}` : slugify(titleEn);

    // Return existing title if already present
    const existing = await ddb.send(new GetCommand({
      TableName: process.env.TITLES_TABLE,
      Key: { titleId },
    }));
    if (existing.Item) {
      return ok({ ...existing.Item, alreadyExists: true });
    }

    // Use provided cover (from Jikan) or fetch from AniList as fallback
    const coverImageUrl = providedCover || await fetchCover(titleEn.trim(), type);

    // Use provided trailer ID (from Jikan search result) or fetch from Jikan for anime
    let trailerYoutubeId = providedTrailer || null;
    if (!trailerYoutubeId && type === 'anime' && malId) {
      trailerYoutubeId = await fetchJikanTrailer(malId);
    }

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
      ...(malId && { malId: String(malId) }),
      ...(trailerYoutubeId && { trailerYoutubeId }),
      criticScore: null,
      userScore: null,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
    };

    await ddb.send(new PutCommand({ TableName: process.env.TITLES_TABLE, Item: title }));

    return created(title);
  } catch (err) {
    console.error('CreateTitle error:', err);
    return serverError();
  }
};
