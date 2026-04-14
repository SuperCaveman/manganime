'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, badRequest, unauthorized, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return unauthorized();

    const { limit = '50', nextToken } = event.queryStringParameters || {};

    const params = {
      TableName: process.env.REVIEWS_TABLE,
      IndexName: 'UserIndex',
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
      ScanIndexForward: false,
      Limit: Math.min(parseInt(limit, 10) || 50, 100),
    };

    if (nextToken) {
      let key;
      try {
        key = JSON.parse(Buffer.from(nextToken, 'base64url').toString('utf-8'));
      } catch {
        return badRequest('Invalid nextToken');
      }
      // UserIndex GSI key: userId (GSI hash) + createdAt (GSI range) + titleId + reviewId (table PK)
      if (
        typeof key !== 'object' || key === null ||
        typeof key.userId !== 'string' ||
        typeof key.titleId !== 'string' ||
        typeof key.reviewId !== 'string'
      ) {
        return badRequest('Invalid nextToken');
      }
      params.ExclusiveStartKey = {
        userId: key.userId,
        titleId: key.titleId,
        reviewId: key.reviewId,
        ...(key.createdAt ? { createdAt: key.createdAt } : {}),
      };
    }

    const result = await ddb.send(new QueryCommand(params));

    const response = { items: result.Items || [], count: result.Count };

    if (result.LastEvaluatedKey) {
      response.nextToken = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey)
      ).toString('base64url');
    }

    return ok(response);
  } catch (err) {
    console.error('GetUserReviews error:', err);
    return serverError();
  }
};
