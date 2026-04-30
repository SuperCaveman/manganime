'use strict';

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { badRequest, ok, serverError } = require('../utils/response');

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
