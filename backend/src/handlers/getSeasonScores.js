'use strict';

const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const { titleId } = event.pathParameters;

    const result = await ddb.send(new QueryCommand({
      TableName: process.env.SEASON_SCORES_TABLE,
      KeyConditionExpression: 'titleId = :tid',
      ExpressionAttributeValues: { ':tid': titleId },
    }));

    const items = (result.Items || []).sort((a, b) => a.seasonNumber - b.seasonNumber);
    return ok({ items });
  } catch (err) {
    console.error('GetSeasonScores error:', err);
    return serverError();
  }
};
