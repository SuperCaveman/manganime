'use strict';

const { GetCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { ok, notFound, serverError } = require('../utils/response');

exports.handler = async (event) => {
  try {
    const { titleId } = event.pathParameters;

    const result = await ddb.send(new GetCommand({
      TableName: process.env.TITLES_TABLE,
      Key: { titleId },
    }));

    if (!result.Item) {
      return notFound('Title not found');
    }

    return ok(result.Item);
  } catch (err) {
    console.error('GetTitle error:', err);
    return serverError();
  }
};
