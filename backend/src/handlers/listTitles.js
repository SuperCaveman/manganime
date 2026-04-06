'use strict';

const { ScanCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, serverError } = require('../utils/response');

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

    // Search: full paginated scan with FilterExpression against lowercase-normalized fields.
    // No Limit here — Limit applies before FilterExpression and would cause missed results.
    // titleEnLower / titleJaLower are maintained on every write so contains() works correctly.
    if (search) {
      const q = search.toLowerCase();
      const params = {
        TableName: process.env.TITLES_TABLE,
        FilterExpression: 'contains(titleEnLower, :q) OR contains(titleJaLower, :q)',
        ExpressionAttributeValues: { ':q': q },
      };
      const allItems = [];
      let lastKey;

      do {
        if (lastKey) params.ExclusiveStartKey = lastKey;
        const result = await ddb.send(new ScanCommand(params));
        allItems.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
      } while (lastKey);

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
      filterParts.push('#type = :type');
      exprNames['#type'] = 'type';
      exprValues[':type'] = type;
    }

    if (genre) {
      filterParts.push('contains(genres, :genre)');
      exprValues[':genre'] = genre;
    }

    if (year) {
      filterParts.push('#year = :year');
      exprNames['#year'] = 'year';
      exprValues[':year'] = parseInt(year, 10);
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
      params.ExclusiveStartKey = JSON.parse(
        Buffer.from(nextToken, 'base64url').toString('utf-8')
      );
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
