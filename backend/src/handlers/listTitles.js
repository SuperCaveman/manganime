'use strict';

const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const {
      type,
      genre,
      year,
      search,
      limit = '20',
      nextToken,
    } = event.queryStringParameters || {};

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
