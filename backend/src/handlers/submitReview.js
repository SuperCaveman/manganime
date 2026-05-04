'use strict';

const { randomUUID } = require('crypto');
const { PutCommand } = require('@aws-sdk/lib-dynamodb');
const { ddb } = require('../utils/dynamodb');
const { created, badRequest, unauthorized, serverError } = require('../utils/response');
const { recalculate } = require('./recalculateScores');

exports.handler = async (event) => {
  try {
    const { titleId } = event.pathParameters;
    const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;
    if (!userId) return unauthorized();

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return badRequest('Invalid JSON body');
    }

    const {
      score, bodyEn, bodyJa, language, displayName,
      granularity, seasonNumber, episodeNumber, volumeNumber,
    } = body;

    if (score === undefined || score === null || score < 0 || score > 100) {
      return badRequest('score must be an integer 0–100');
    }
    if (!bodyEn && !bodyJa) {
      return badRequest('At least one of bodyEn or bodyJa is required');
    }
    const MAX_BODY = 5000;
    if (bodyEn && bodyEn.length > MAX_BODY) return badRequest(`bodyEn must be ${MAX_BODY} characters or fewer`);
    if (bodyJa && bodyJa.length > MAX_BODY) return badRequest(`bodyJa must be ${MAX_BODY} characters or fewer`);
    if (!['en', 'ja'].includes(language)) {
      return badRequest('language must be "en" or "ja"');
    }

    // Granularity validation
    const gran = granularity || 'series';
    if (!['series', 'season', 'episode', 'volume', 'movie'].includes(gran)) {
      return badRequest('granularity must be series, season, episode, volume, or movie');
    }
    if ((gran === 'season' || gran === 'episode') && seasonNumber == null) {
      return badRequest('seasonNumber is required for season/episode granularity');
    }
    if (gran === 'episode' && episodeNumber == null) {
      return badRequest('episodeNumber is required for episode granularity');
    }
    if (gran === 'volume' && volumeNumber == null) {
      return badRequest('volumeNumber is required for volume granularity');
    }

    const review = {
      titleId,
      reviewId:   randomUUID(),
      userId,
      source:     'user',
      score:      Math.round(score),
      language,
      granularity: gran,
      createdAt:  new Date().toISOString(),
    };

    if (bodyEn)      review.bodyEn      = bodyEn;
    if (bodyJa)      review.bodyJa      = bodyJa;
    if (displayName) {
      const clean = String(displayName).replace(/<[^>]*>/g, '').trim().slice(0, 100);
      if (clean) review.displayName = clean;
    }

    if (gran === 'season' || gran === 'episode') {
      const sn = parseInt(seasonNumber, 10);
      if (!Number.isInteger(sn) || sn < 1 || sn > 100) return badRequest('seasonNumber must be 1–100');
      review.seasonNumber = sn;
    }
    if (gran === 'episode') {
      const ep = parseInt(episodeNumber, 10);
      if (!Number.isInteger(ep) || ep < 1 || ep > 2000) return badRequest('episodeNumber must be 1–2000');
      review.episodeNumber = ep;
    }
    if (gran === 'volume') {
      const vn = parseInt(volumeNumber, 10);
      if (!Number.isInteger(vn) || vn < 1 || vn > 500) return badRequest('volumeNumber must be 1–500');
      review.volumeNumber = vn;
    }

    await ddb.send(new PutCommand({ TableName: process.env.REVIEWS_TABLE, Item: review }));
    await recalculate(titleId);

    return created(review);
  } catch (err) {
    console.error('SubmitReview error:', err);
    return serverError();
  }
};
