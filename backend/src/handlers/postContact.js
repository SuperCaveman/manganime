'use strict';

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { badRequest, ok, serverError, tooManyRequests } = require('../utils/response');

const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.handler = async (event) => {
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return badRequest('Invalid JSON');
  }

  const name    = String(body.name    || '').replace(/<[^>]*>/g, '').trim().slice(0, 100);
  const email   = String(body.email   || '').trim().slice(0, 254);
  const message = String(body.message || '').replace(/<[^>]*>/g, '').trim().slice(0, 2000);

  if (!name)                      return badRequest('name is required');
  if (!EMAIL_RE.test(email))      return badRequest('valid email is required');
  if (message.length < 5)         return badRequest('message is required');

  // Rate limit: 3 submissions per email per hour via DynamoDB TTL record
  const rateLimitKey = `contact:${email.toLowerCase()}`;
  const windowTtl = Math.floor(Date.now() / 1000) + 3600;
  try {
    await ddb.send(new UpdateCommand({
      TableName: process.env.RATE_LIMIT_TABLE,
      Key: { key: rateLimitKey },
      ConditionExpression: 'attribute_not_exists(#cnt) OR #cnt < :max',
      UpdateExpression: 'ADD #cnt :inc SET #ttl = if_not_exists(#ttl, :ttl)',
      ExpressionAttributeNames: { '#cnt': 'count', '#ttl': 'ttl' },
      ExpressionAttributeValues: { ':max': 3, ':inc': 1, ':ttl': windowTtl },
    }));
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return tooManyRequests('Too many submissions. Please try again later.');
    }
    throw err;
  }

  const dest = process.env.CONTACT_EMAIL;
  if (!dest) {
    console.error('CONTACT_EMAIL env var not set');
    return serverError();
  }

  try {
    await ses.send(new SendEmailCommand({
      Source: dest,
      Destination: { ToAddresses: [dest] },
      ReplyToAddresses: [email],
      Message: {
        Subject: {
          Data: `[Fantachi] Message from ${name}`,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: [
              `Name:    ${name}`,
              `Email:   ${email}`,
              ``,
              `Message:`,
              message,
            ].join('\n'),
            Charset: 'UTF-8',
          },
        },
      },
    }));

    return ok({ sent: true });
  } catch (err) {
    console.error('SES send failed:', err.message);
    return serverError('Could not send message. Please try again later.');
  }
};
