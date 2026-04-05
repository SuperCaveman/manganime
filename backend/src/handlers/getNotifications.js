'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, unauthorized, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return unauthorized();

    const res = await ddb.send(new QueryCommand({
      TableName: process.env.NOTIFICATIONS_TABLE,
      KeyConditionExpression: 'userId = :uid',
      ExpressionAttributeValues: { ':uid': userId },
    }));

    const items = (res.Items || [])
      .filter((n) => !n.read)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return ok({ items });
  } catch (err) {
    console.error('GetNotifications error:', err);
    return serverError();
  }
};
