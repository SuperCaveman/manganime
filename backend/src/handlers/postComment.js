'use strict';

const { randomUUID } = require('crypto');
const { PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { created, badRequest, unauthorized, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const { titleId, reviewId } = event.pathParameters;
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return unauthorized();

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

    const { text, displayName } = body;
    if (!text?.trim()) return badRequest('text is required');

    const commentId = randomUUID();
    const createdAt = new Date().toISOString();
    const authorName = displayName || 'User';

    const comment = {
      reviewId,
      commentId,
      titleId,
      authorUserId: userId,
      authorName,
      text: text.trim(),
      createdAt,
    };

    await ddb.send(new PutCommand({ TableName: process.env.COMMENTS_TABLE, Item: comment }));

    // Notify the review author (skip if commenter is the author)
    const reviewRes = await ddb.send(new GetCommand({
      TableName: process.env.REVIEWS_TABLE,
      Key: { titleId, reviewId },
    }));
    const reviewAuthorId = reviewRes.Item?.userId;

    if (reviewAuthorId && reviewAuthorId !== userId) {
      await ddb.send(new PutCommand({
        TableName: process.env.NOTIFICATIONS_TABLE,
        Item: {
          userId: reviewAuthorId,
          notificationId: randomUUID(),
          type: 'comment',
          fromUserId: userId,
          fromUsername: authorName,
          reviewId,
          titleId,
          preview: text.trim().slice(0, 120),
          read: false,
          createdAt,
        },
      }));
    }

    return created(comment);
  } catch (err) {
    console.error('PostComment error:', err);
    return serverError();
  }
};
