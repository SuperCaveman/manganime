'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, badRequest, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const { titleId } = event.pathParameters;
    const {
      lang,
      source,
      limit = '20',
      nextToken,
    } = event.queryStringParameters || {};

    const params = {
      TableName: process.env.REVIEWS_TABLE,
      KeyConditionExpression: 'titleId = :tid',
      ExpressionAttributeValues: { ':tid': titleId },
      Limit: Math.min(parseInt(limit, 10) || 20, 100),
    };

    if (source) {
      params.FilterExpression = '#src = :src';
      params.ExpressionAttributeNames = { '#src': 'source' };
      params.ExpressionAttributeValues[':src'] = source;
    }

    if (nextToken) {
      let key;
      try {
        key = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf-8'));
      } catch {
        return badRequest('Invalid nextToken');
      }
      if (
        typeof key !== 'object' || key === null ||
        typeof key.titleId !== 'string' ||
        typeof key.reviewId !== 'string'
      ) {
        return badRequest('Invalid nextToken');
      }
      params.ExclusiveStartKey = { titleId: key.titleId, reviewId: key.reviewId };
    }

    const result = await ddb.send(new QueryCommand(params));

    let items = result.Items || [];

    // Sort by createdAt descending (SK is reviewId/UUID, not time-ordered)
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    // Strip the body language the caller didn't request
    if (lang === 'en') {
      items = items.map(({ bodyJa: _ja, ...rest }) => rest);
    } else if (lang === 'ja') {
      items = items.map(({ bodyEn: _en, ...rest }) => rest);
    }

    const response = { items, count: result.Count };

    if (result.LastEvaluatedKey) {
      response.nextToken = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey)
      ).toString('base64url');
    }

    return ok(response);
  } catch (err) {
    console.error('GetReviews error:', err);
    return serverError();
  }
};
