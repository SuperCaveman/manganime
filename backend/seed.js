#!/usr/bin/env node
'use strict';

/**
 * Seed script — populates 5 titles + 3 critic reviews each.
 *
 * Usage:
 *   STACK_NAME=mangacritic AWS_REGION=us-east-1 node seed.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

// ── AniList cover fetch (no API key required) ────────────────────────────────

const ANILIST_QUERY = `
  query ($search: String, $type: MediaType) {
    Media(search: $search, type: $type, sort: SEARCH_MATCH) {
      coverImage { extraLarge large }
    }
  }
`;

async function fetchCover(titleEn, type) {
  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: ANILIST_QUERY,
        variables: { search: titleEn, type: type === 'anime' ? 'ANIME' : 'MANGA' },
      }),
    });
    const json = await res.json();
    const cover = json?.data?.Media?.coverImage;
    return cover?.extraLarge || cover?.large || '';
  } catch (err) {
    console.warn(`  ! Cover fetch failed for "${titleEn}": ${err.message}`);
    return '';
  }
}

const STACK_NAME = process.env.STACK_NAME || 'mangacritic';
const REGION = process.env.AWS_REGION || 'us-east-1';

const TITLES_TABLE = `${STACK_NAME}-titles`;
const REVIEWS_TABLE = `${STACK_NAME}-reviews`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Titles ──────────────────────────────────────────────────────────────────

const TITLES = [
  {
    titleId: 'attack-on-titan',
    titleEn: 'Attack on Titan',
    titleJa: '進撃の巨人',
    type: 'anime',
    genres: ['Action', 'Drama', 'Fantasy'],
    studio: 'MAPPA / Wit Studio',
    year: 2013,
    criticScore: 92,
    userScore: null,
    reviewCount: 0,
  },
  {
    titleId: 'demon-slayer',
    titleEn: 'Demon Slayer',
    titleJa: '鬼滅の刃',
    type: 'anime',
    genres: ['Action', 'Fantasy', 'Shounen'],
    studio: 'ufotable',
    year: 2019,
    criticScore: 88,
    userScore: null,
    reviewCount: 0,
  },
  {
    titleId: 'fullmetal-alchemist-brotherhood',
    titleEn: 'Fullmetal Alchemist: Brotherhood',
    titleJa: '鋼の錬金術師 BROTHERHOOD',
    type: 'anime',
    genres: ['Action', 'Drama', 'Fantasy'],
    studio: 'Bones',
    year: 2009,
    criticScore: 96,
    userScore: null,
    reviewCount: 0,
  },
  {
    titleId: 'berserk',
    titleEn: 'Berserk',
    titleJa: 'ベルセルク',
    type: 'manga',
    genres: ['Action', 'Drama', 'Horror', 'Fantasy'],
    studio: 'Kentaro Miura',
    year: 1989,
    criticScore: 97,
    userScore: null,
    reviewCount: 0,
  },
  {
    titleId: 'vinland-saga',
    titleEn: 'Vinland Saga',
    titleJa: 'ヴィンランド・サガ',
    type: 'manga',
    genres: ['Action', 'Drama', 'Historical'],
    studio: 'Makoto Yukimura',
    year: 2005,
    criticScore: 93,
    userScore: null,
    reviewCount: 0,
  },
];

// ── Reviews ─────────────────────────────────────────────────────────────────

const REVIEWS = {
  'attack-on-titan': [
    {
      score: 95,
      bodyEn: 'A masterpiece of modern anime. Attack on Titan delivers an emotionally devastating story with impeccable animation and a plot that constantly subverts expectations.',
      bodyJa: '現代アニメの傑作。進撃の巨人は感情を揺さぶる物語と完璧なアニメーション、常に期待を裏切るプロットを持つ。',
    },
    {
      score: 90,
      bodyEn: 'Few series manage the balancing act of large-scale political intrigue and intimate character moments quite like Attack on Titan. A genre-defining achievement.',
      bodyJa: '大規模な政治的陰謀と親密なキャラクターの瞬間のバランスを保つシリーズは少ない。ジャンルを定義する偉業だ。',
    },
    {
      score: 91,
      bodyEn: 'The final arc is bold and divisive, but the ambition behind it is undeniable. Attack on Titan stands as one of the most important anime series of its generation.',
      bodyJa: '最終アークは大胆で賛否両論だが、その背後にある野心は否定できない。その世代で最も重要なアニメシリーズの一つだ。',
    },
  ],
  'demon-slayer': [
    {
      score: 88,
      bodyEn: "Demon Slayer is a visual spectacle unlike anything else in anime. ufotable's animation brings every sword clash to life with breathtaking fluidity.",
      bodyJa: '鬼滅の刃はアニメにおける他に類を見ないビジュアルの壮観だ。ufotableのアニメーションは、すべての剣の衝突を息をのむような流動性で生き生きとさせる。',
    },
    {
      score: 84,
      bodyEn: 'While the story follows a fairly conventional shounen structure, the emotional core of the Kamado siblings keeps the series grounded and deeply compelling.',
      bodyJa: 'ストーリーはかなり従来の少年漫画の構成に従っているが、竈門兄妹の感情的な核がシリーズを地に足のついた説得力のあるものにしている。',
    },
    {
      score: 92,
      bodyEn: 'The Mugen Train arc set a new benchmark for what theatrical anime can achieve, both artistically and commercially.',
      bodyJa: '無限列車編は、芸術的にも商業的にも、劇場アニメが達成できることの新しい基準を設定した。',
    },
  ],
  'fullmetal-alchemist-brotherhood': [
    {
      score: 98,
      bodyEn: 'Fullmetal Alchemist: Brotherhood is the rare series that achieves everything it sets out to do — compelling characters, airtight plotting, and an emotional payoff that is genuinely earned.',
      bodyJa: '鋼の錬金術師 BROTHERHOODは、設定したすべてを達成する稀なシリーズだ。説得力のあるキャラクター、緻密なプロット、そして本当に価値ある感情的な見返り。',
    },
    {
      score: 96,
      bodyEn: 'A benchmark for the action-adventure genre. Brotherhood weaves philosophy, family, and sacrifice into a narrative that remains deeply satisfying decades later.',
      bodyJa: 'アクションアドベンチャージャンルの基準。BROTHERHOODは哲学、家族、犠牲を、何十年後も深く満足のいく物語に織り込んでいる。',
    },
    {
      score: 95,
      bodyEn: 'Simply put, one of the greatest animated series ever made. The worldbuilding is extraordinary, and every character arc reaches a satisfying conclusion.',
      bodyJa: '端的に言えば、これまでに作られた中で最も偉大なアニメシリーズの一つ。世界観の構築は卓越しており、すべてのキャラクターアークが満足のいく結末を迎える。',
    },
  ],
  'berserk': [
    {
      score: 99,
      bodyEn: "Berserk is the gold standard of dark fantasy manga. Miura's artwork is unparalleled, and Guts' odyssey remains one of literature's most compelling portraits of human endurance.",
      bodyJa: 'ベルセルクはダークファンタジー漫画の最高基準だ。三浦の作画は他に類を見ず、ガッツの旅は人間の忍耐力の描写として文学で最も説得力のある作品の一つだ。',
    },
    {
      score: 97,
      bodyEn: 'Few works in any medium match the sheer ambition of Berserk. The Golden Age Arc alone would secure its legacy, but Miura kept pushing into ever darker territory.',
      bodyJa: 'いかなる媒体においても、ベルセルクの純粋な野心に匹敵する作品はほとんどない。黄金時代編だけでもその遺産を確かなものにするが、三浦はさらに暗い領域へと押し進め続けた。',
    },
    {
      score: 95,
      bodyEn: 'An unflinching examination of trauma, fate, and the cost of survival. Berserk is difficult to read and impossible to put down.',
      bodyJa: 'トラウマ、運命、生き残ることの代償を臆せず考察する作品。ベルセルクは読むのが辛く、やめられない。',
    },
  ],
  'vinland-saga': [
    {
      score: 95,
      bodyEn: "Vinland Saga transforms from a revenge epic into one of manga's most profound meditations on war, pacifism, and the nature of a true warrior.",
      bodyJa: 'ヴィンランド・サガは復讐の叙事詩から、戦争、平和主義、そして真の戦士の本質についての漫画で最も深い瞑想の一つへと変貌する。',
    },
    {
      score: 91,
      bodyEn: "Yukimura's historical research gives Vinland Saga an authenticity that grounds its more fantastical moments. Thorfinn's growth across decades is extraordinary.",
      bodyJa: '幸村の歴史的調査がヴィンランド・サガに真正性を与えている。数十年にわたるトルフィンの成長は並外れたものだ。',
    },
    {
      score: 93,
      bodyEn: 'The Farm Arc, initially controversial, reveals itself as the spiritual heart of the series — rare manga that grows more compelling the further it strays from action.',
      bodyJa: '当初は物議を醸したファームアークはシリーズの精神的な核心として自らを明らかにする。アクションから離れれば離れるほど説得力を増す稀な漫画だ。',
    },
  ],
};

// ── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`Seeding to stack: ${STACK_NAME} (region: ${REGION})\n`);

  for (const title of TITLES) {
    process.stdout.write(`Fetching cover for "${title.titleEn}"… `);
    const coverImageUrl = await fetchCover(title.titleEn, title.type);
    if (coverImageUrl) console.log('✓');
    else console.log('(not found, leaving blank)');

    await ddb.send(new PutCommand({
      TableName: TITLES_TABLE,
      Item: {
        ...title,
        coverImageUrl,
        titleEnLower: title.titleEn.toLowerCase(),
        titleJaLower: (title.titleJa || '').toLowerCase(),
      },
    }));
    console.log(`✓ Title: ${title.titleEn} (${title.titleJa})`);

    const reviews = REVIEWS[title.titleId] || [];
    for (let i = 0; i < reviews.length; i++) {
      const r = reviews[i];
      const daysAgo = (i + 1) * 7; // staggered dates
      const createdAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();

      await ddb.send(new PutCommand({
        TableName: REVIEWS_TABLE,
        Item: {
          titleId: title.titleId,
          reviewId: randomUUID(),
          userId: `seed-critic-${i}`,
          source: 'critic',
          score: r.score,
          bodyEn: r.bodyEn,
          bodyJa: r.bodyJa,
          language: 'en',
          createdAt,
        },
      }));
      console.log(`  ✓ Review score=${r.score}`);
    }
  }

  console.log('\nDone! Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
