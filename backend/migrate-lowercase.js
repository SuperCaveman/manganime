#!/usr/bin/env node
'use strict';

/**
 * Backfills titleEnLower and titleJaLower on all existing Title records.
 *
 * Usage:
 *   STACK_NAME=mangacritic AWS_REGION=us-east-1 node migrate-lowercase.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const STACK_NAME = process.env.STACK_NAME || 'mangacritic';
const REGION = process.env.AWS_REGION || 'us-east-1';
const TITLES_TABLE = `${STACK_NAME}-titles`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function migrate() {
  console.log(`Backfilling lowercase fields in: ${TITLES_TABLE}\n`);

  const items = [];
  let lastKey;
  do {
    const params = { TableName: TITLES_TABLE };
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const res = await ddb.send(new ScanCommand(params));
    items.push(...(res.Items || []));
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  console.log(`Found ${items.length} title(s) to update.\n`);

  for (const item of items) {
    const enLower = (item.titleEn || '').toLowerCase();
    const jaLower = (item.titleJa || '').toLowerCase();
    await ddb.send(new UpdateCommand({
      TableName: TITLES_TABLE,
      Key: { titleId: item.titleId },
      UpdateExpression: 'SET titleEnLower = :enl, titleJaLower = :jal',
      ExpressionAttributeValues: { ':enl': enLower, ':jal': jaLower },
    }));
    console.log(`✓ ${item.titleId}`);
    console.log(`  titleEnLower: "${enLower}"`);
    if (jaLower) console.log(`  titleJaLower: "${jaLower}"`);
  }

  console.log('\nMigration complete.');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
