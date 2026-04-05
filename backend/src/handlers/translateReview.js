'use strict';

const { GetCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { TranslateClient, TranslateTextCommand } = require('@aws-sdk/client-translate');
const { ddb } = require('../utils/dynamodb');
const { ok, notFound, badRequest, serverError } = require('../utils/response');

const translateClient = new TranslateClient({});

exports.handler = async (event) => {
  try {
    const { titleId, reviewId } = event.pathParameters;
    const { targetLang } = event.queryStringParameters || {};

    if (!['en', 'ja'].includes(targetLang)) {
      return badRequest('targetLang must be "en" or "ja"');
    }

    const result = await ddb.send(new GetCommand({
      TableName: process.env.REVIEWS_TABLE,
      Key: { titleId, reviewId },
    }));

    if (!result.Item) {
      return notFound('Review not found');
    }

    const review = result.Item;
    const sourceLang = targetLang === 'en' ? 'ja' : 'en';
    const sourceBodyKey = sourceLang === 'en' ? 'bodyEn' : 'bodyJa';
    const targetBodyKey = targetLang === 'en' ? 'bodyEn' : 'bodyJa';
    const sourceBody = review[sourceBodyKey];

    if (!sourceBody) {
      return badRequest(`No ${sourceLang} body available to translate from`);
    }

    // Return cached translation if it already exists
    if (review[targetBodyKey]) {
      return ok({ ...review, translated: false });
    }

    const translated = await translateClient.send(new TranslateTextCommand({
      Text: sourceBody,
      SourceLanguageCode: sourceLang,
      TargetLanguageCode: targetLang,
    }));

    const translatedText = translated.TranslatedText;

    await ddb.send(new UpdateCommand({
      TableName: process.env.REVIEWS_TABLE,
      Key: { titleId, reviewId },
      UpdateExpression: `SET ${targetBodyKey} = :text`,
      ExpressionAttributeValues: { ':text': translatedText },
    }));

    return ok({ ...review, [targetBodyKey]: translatedText, translated: true });
  } catch (err) {
    console.error('TranslateReview error:', err);
    return serverError();
  }
};
