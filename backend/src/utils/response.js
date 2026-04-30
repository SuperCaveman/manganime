'use strict';

const headers = {
  'Content-Type': 'application/json',
};

const ok = (body, statusCode = 200) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});

const created = (body) => ok(body, 201);

const notFound = (message = 'Not found') => ({
  statusCode: 404,
  headers,
  body: JSON.stringify({ error: message }),
});

const badRequest = (message = 'Bad request') => ({
  statusCode: 400,
  headers,
  body: JSON.stringify({ error: message }),
});

const unauthorized = (message = 'Unauthorized') => ({
  statusCode: 401,
  headers,
  body: JSON.stringify({ error: message }),
});

const forbidden = (message = 'Forbidden') => ({
  statusCode: 403,
  headers,
  body: JSON.stringify({ error: message }),
});

const serverError = (message = 'Internal server error') => ({
  statusCode: 500,
  headers,
  body: JSON.stringify({ error: message }),
});

module.exports = { ok, created, notFound, badRequest, unauthorized, forbidden, serverError };
