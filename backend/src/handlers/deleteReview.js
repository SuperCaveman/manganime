'use strict';

const { GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, notFound, forbidden, unauthorized, serverError } = require('../utils/response');
const { recalculate } = require('./recalculateScores');

exports.handler = async (event) => {
  try {
    const { titleId, reviewId } = event.pathParameters;
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return unauthorized();

    const result = await ddb.send(new GetCommand({
      TableName: process.env.REVIEWS_TABLE,
      Key: { titleId, reviewId },
    }));

    if (!result.Item) return notFound('Review not found');
    if (result.Item.userId !== userId) return forbidden();

    await ddb.send(new DeleteCommand({
      TableName: process.env.REVIEWS_TABLE,
      Key: { titleId, reviewId },
      ConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }));

    await recalculate(titleId);

    return ok({ deleted: true });
  } catch (err) {
    console.error('DeleteReview error:', err);
    return serverError();
  }
};
