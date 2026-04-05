'use strict';

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, notFound, forbidden, badRequest, unauthorized, serverError } = require('../utils/response');
const { recalculate } = require('./recalculateScores');

exports.handler = async (event) => {
  try {
    const { titleId, reviewId } = event.pathParameters;
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return unauthorized();

    const existing = await ddb.send(new GetCommand({
      TableName: process.env.REVIEWS_TABLE,
      Key: { titleId, reviewId },
    }));

    if (!existing.Item) return notFound('Review not found');
    if (existing.Item.userId !== userId) return forbidden();

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return badRequest('Invalid JSON body');
    }

    const { score, bodyEn, bodyJa } = body;

    if (score !== undefined && (score < 0 || score > 100)) {
      return badRequest('score must be 0–100');
    }

    const setParts = [];
    const exprValues = {};

    if (score !== undefined) { setParts.push('score = :score'); exprValues[':score'] = Math.round(score); }
    if (bodyEn !== undefined) { setParts.push('bodyEn = :bodyEn'); exprValues[':bodyEn'] = bodyEn; }
    if (bodyJa !== undefined) { setParts.push('bodyJa = :bodyJa'); exprValues[':bodyJa'] = bodyJa; }

    if (!setParts.length) return badRequest('Nothing to update');

    const updated = await ddb.send(new UpdateCommand({
      TableName: process.env.REVIEWS_TABLE,
      Key: { titleId, reviewId },
      UpdateExpression: `SET ${setParts.join(', ')}`,
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW',
    }));

    if (score !== undefined) {
      await recalculate(titleId);
    }

    return ok(updated.Attributes);
  } catch (err) {
    console.error('UpdateReview error:', err);
    return serverError();
  }
};
