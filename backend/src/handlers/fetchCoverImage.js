'use strict';

/**
 * Fetches a cover image for a title from AniList's free GraphQL API
 * and saves it back to DynamoDB.
 *
 * AniList requires no API key for read-only queries.
 * POST /titles/{titleId}/fetch-cover
 */

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, notFound, serverError } = require('../utils/response');

const ANILIST_URL = 'https://graphql.anilist.co';

const QUERY = `
  query ($search: String, $type: MediaType) {
    Media(search: $search, type: $type, sort: SEARCH_MATCH) {
      coverImage {
        extraLarge
        large
      }
      title {
        romaji
        native
        english
      }
    }
  }
`;

async function fetchFromAniList(titleEn, type) {
  const mediaType = type === 'anime' ? 'ANIME' : 'MANGA';

  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { search: titleEn, type: mediaType } }),
  });

  if (!res.ok) throw new Error(`AniList returned ${res.status}`);

  const json = await res.json();
  const cover = json?.data?.Media?.coverImage;
  return cover?.extraLarge || cover?.large || null;
}

exports.handler = async (event) => {
  try {
    const { titleId } = event.pathParameters;

    const result = await ddb.send(new GetCommand({
      TableName: process.env.TITLES_TABLE,
      Key: { titleId },
    }));

    if (!result.Item) return notFound('Title not found');

    const { titleEn, type } = result.Item;
    const coverImageUrl = await fetchFromAniList(titleEn, type);

    if (!coverImageUrl) {
      return ok({ titleId, message: 'No cover found on AniList', coverImageUrl: null });
    }

    await ddb.send(new UpdateCommand({
      TableName: process.env.TITLES_TABLE,
      Key: { titleId },
      UpdateExpression: 'SET coverImageUrl = :url',
      ExpressionAttributeValues: { ':url': coverImageUrl },
    }));

    return ok({ titleId, coverImageUrl });
  } catch (err) {
    console.error('FetchCoverImage error:', err);
    return serverError();
  }
};
