'use strict';

const { ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, badRequest, serverError } = require('../utils/response');

const ALLOWED_TYPES  = new Set(['anime', 'manga', 'manhwa', 'manhua', 'light-novel', 'movie', 'ova', 'ona']);
const GENRE_RE       = /^[\w\s\-&]{1,50}$/;
const MIN_YEAR       = 1917;
const MAX_YEAR       = new Date().getFullYear() + 2;
const SEARCH_MAX_PAGES = 8;

exports.handler = async (event) => {
  try {
    const {
      type,
      genre,
      year,
      search,
      divergent,
      limit = '20',
      nextToken,
    } = event.queryStringParameters || {};

    // Divergence query — returns titles with both scores and |critic - user| >= 20
    if (divergent) {
      const pageLimit = Math.min(parseInt(limit, 10) || 6, 25);
      const result = await ddb.send(new QueryCommand({
        TableName: process.env.TITLES_TABLE,
        IndexName: 'DivergenceIndex',
        KeyConditionExpression: 'hasScores = :hs AND divergence >= :minDiv',
        ExpressionAttributeValues: { ':hs': '1', ':minDiv': 20 },
        ScanIndexForward: false,
        Limit: pageLimit,
      }));
      return ok({ items: result.Items || [] });
    }

    const pageLimit = Math.min(parseInt(limit, 10) || 20, 100);

    // Search: paginated scan with FilterExpression against lowercase-normalized fields.
    // No Limit here — Limit applies before FilterExpression and would cause missed results.
    // titleEnLower / titleJaLower are maintained on every write so contains() works correctly.
    // Cap at SEARCH_MAX_PAGES iterations to prevent unbounded scans (DoS protection).
    if (search) {
      const q = search.toLowerCase().slice(0, 200);
      if (!q) return ok({ items: [], count: 0 });
      const params = {
        TableName: process.env.TITLES_TABLE,
        FilterExpression: 'contains(titleEnLower, :q) OR contains(titleJaLower, :q)',
        ExpressionAttributeValues: { ':q': q },
      };
      const allItems = [];
      let lastKey;
      let pages = 0;

      do {
        if (lastKey) params.ExclusiveStartKey = lastKey;
        const result = await ddb.send(new ScanCommand(params));
        allItems.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
        pages++;
      } while (lastKey && pages < SEARCH_MAX_PAGES);

      return ok({ items: allItems, count: allItems.length });
    }

    const params = {
      TableName: process.env.TITLES_TABLE,
      Limit: pageLimit,
    };

    const filterParts = [];
    const exprNames = {};
    const exprValues = {};

    if (type) {
      if (!ALLOWED_TYPES.has(type.toLowerCase())) return badRequest('Invalid type filter');
      filterParts.push('#type = :type');
      exprNames['#type'] = 'type';
      exprValues[':type'] = type;
    }

    if (genre) {
      if (!GENRE_RE.test(genre)) return badRequest('Invalid genre filter');
      filterParts.push('contains(genres, :genre)');
      exprValues[':genre'] = genre;
    }

    if (year) {
      const yr = parseInt(year, 10);
      if (isNaN(yr) || yr < MIN_YEAR || yr > MAX_YEAR) return badRequest('Invalid year filter');
      filterParts.push('#year = :year');
      exprNames['#year'] = 'year';
      exprValues[':year'] = yr;
    }

    if (filterParts.length > 0) {
      params.FilterExpression = filterParts.join(' AND ');
    }
    if (Object.keys(exprNames).length > 0) {
      params.ExpressionAttributeNames = exprNames;
    }
    if (Object.keys(exprValues).length > 0) {
      params.ExpressionAttributeValues = exprValues;
    }

    if (nextToken) {
      let key;
      try {
        key = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf-8'));
      } catch {
        return badRequest('Invalid nextToken');
      }
      if (typeof key !== 'object' || key === null || typeof key.titleId !== 'string') {
        return badRequest('Invalid nextToken');
      }
      params.ExclusiveStartKey = { titleId: key.titleId };
    }

    const result = await ddb.send(new ScanCommand(params));

    const response = { items: result.Items || [], count: result.Count };

    if (result.LastEvaluatedKey) {
      response.nextToken = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey)
      ).toString('base64url');
    }

    return ok(response);
  } catch (err) {
    console.error('ListTitles error:', err);
    return serverError();
  }
};
