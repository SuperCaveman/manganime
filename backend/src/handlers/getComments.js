'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const { reviewId } = event.pathParameters;

    const res = await ddb.send(new QueryCommand({
      TableName: process.env.COMMENTS_TABLE,
      KeyConditionExpression: 'reviewId = :rid',
      ExpressionAttributeValues: { ':rid': reviewId },
    }));

    const items = (res.Items || []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return ok({ items });
  } catch (err) {
    console.error('GetComments error:', err);
    return serverError();
  }
};
