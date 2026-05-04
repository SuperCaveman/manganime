'use strict';

const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, badRequest, unauthorized, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return unauthorized();

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

    const { notificationIds } = body;
    if (!Array.isArray(notificationIds) || !notificationIds.length) {
      return badRequest('notificationIds array is required');
    }
    if (notificationIds.length > 100) {
      return badRequest('notificationIds must contain 100 or fewer entries');
    }
    if (notificationIds.some((id) => typeof id !== 'string' || id.length > 200)) {
      return badRequest('Invalid notificationId');
    }

    await Promise.all(notificationIds.map((notificationId) =>
      ddb.send(new UpdateCommand({
        TableName: process.env.NOTIFICATIONS_TABLE,
        Key: { userId, notificationId },
        UpdateExpression: 'SET #r = :t',
        ExpressionAttributeNames: { '#r': 'read' },
        ExpressionAttributeValues: { ':t': true },
      }))
    ));

    return ok({ ok: true });
  } catch (err) {
    console.error('MarkNotificationsRead error:', err);
    return serverError();
  }
};
