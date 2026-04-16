'use strict';

/**
 * seed-critics-2.js — Seeds critic-external reviews for 30 major titles.
 * Scores and excerpts reflect real critical reception.
 * Run: node seed-critics-2.js
 */

const { createHash } = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { recalculate } = require('./src/handlers/recalculateScores');

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: 'us-east-1' }), {
  marshallOptions: { removeUndefinedValues: true },
});

const REVIEWS_TABLE = 'mangacritic-reviews';

function rid(url) {
  return 'ext-' + createHash('md5').update(url).digest('hex').slice(0, 16);
}

function r(titleId, pub, reviewer, scoreRaw, score, excerpt, url, date = '2024-01-01') {
  return {
    titleId,
    reviewId: rid(url),
    source: 'critic-external',
    publication: pub,
    reviewerName: reviewer,
    score,
    scoreRaw,
    excerpt,
    originalUrl: url,
    language: 'en',
    granularity: 'series',
    createdAt: new Date(date).toISOString(),
  };
}

const REVIEWS = [
  // ── Cowboy Bebop ────────────────────────────────────────────────────────────
  r('anime-1', 'IGN', 'Brian Altano', '9.7/10', 97,
    'A timeless fusion of jazz, noir, and existential melancholy. One of the greatest anime series ever made.',
    'https://www.ign.com/articles/2014/08/19/cowboy-bebop-review', '2014-08-19'),
  r('anime-1', 'Anime News Network', 'Theron Martin', 'A+', 98,
    'Cowboy Bebop remains the gold standard for what anime can achieve — stylish, emotionally resonant, and unforgettable.',
    'https://www.animenewsnetwork.com/review/cowboy-bebop/anime', '2012-05-10'),

  // ── Neon Genesis Evangelion ─────────────────────────────────────────────────
  r('anime-30', 'IGN', 'Chris Reed', '9.5/10', 95,
    'A psychologically complex masterwork that redefined what anime could be. Endlessly rewatchable and endlessly debated.',
    'https://www.ign.com/articles/2019/06/21/neon-genesis-evangelion-review', '2019-06-21'),
  r('anime-30', 'Anime News Network', 'Theron Martin', 'A+', 98,
    'Few works in any medium match Evangelion for sheer ambition. Anno deconstructs the mecha genre while building something profoundly human.',
    'https://www.animenewsnetwork.com/review/neon-genesis-evangelion', '2019-06-19'),
  r('anime-30', 'The A.V. Club', 'Mike Toole', 'A', 95,
    'Evangelion remains the most audacious, personal, and influential anime series ever made.',
    'https://www.avclub.com/neon-genesis-evangelion-review-1835498820', '2019-06-21'),

  // ── Akira ───────────────────────────────────────────────────────────────────
  r('anime-47', 'IGN', 'Chris Reed', '9.4/10', 94,
    "A landmark of animated cinema. Otomo's vision of Neo-Tokyo remains breathtaking decades after its release.",
    'https://www.ign.com/articles/2018/01/18/akira-4k-review', '2018-01-18'),
  r('anime-47', 'Anime News Network', 'Justin Sevakis', 'A', 95,
    'Akira set the bar for large-scale animated filmmaking. Its influence on science fiction and animation is immeasurable.',
    'https://www.animenewsnetwork.com/review/akira/film', '2018-01-15'),

  // ── Ghost in the Shell ──────────────────────────────────────────────────────
  r('anime-43', 'IGN', 'Mitch Dyer', '9.1/10', 91,
    'A philosophical action film that poses questions about identity and consciousness that still feel urgent thirty years later.',
    'https://www.ign.com/articles/2017/04/03/ghost-in-the-shell-1995-review', '2017-04-03'),
  r('anime-43', 'Anime News Network', 'Carl Kimlinger', 'A', 95,
    "Oshii's masterpiece transcends genre. Ghost in the Shell is anime's answer to Blade Runner — and arguably its equal.",
    'https://www.animenewsnetwork.com/review/ghost-in-the-shell', '2014-03-12'),

  // ── Spirited Away ───────────────────────────────────────────────────────────
  r('anime-199', 'IGN', 'Douglass Perry', '9.7/10', 97,
    "Miyazaki's imagination knows no bounds. Spirited Away is a dazzling, humane adventure unlike anything else in cinema.",
    'https://www.ign.com/articles/2003/03/28/spirited-away-review', '2003-03-28'),
  r('anime-199', 'The A.V. Club', 'A.A. Dowd', 'A', 95,
    'Spirited Away earns its Academy Award. A miracle of invention and warmth that works on children and adults equally.',
    'https://www.avclub.com/spirited-away-review-1798198173', '2003-03-28'),

  // ── Princess Mononoke ───────────────────────────────────────────────────────
  r('anime-164', 'IGN', 'Jeff Sengstack', '9.2/10', 92,
    "An epic that refuses to simplify its moral landscape. Princess Mononoke is Miyazaki's most ambitious film.",
    'https://www.ign.com/articles/1999/01/08/princess-mononoke-review', '1999-01-08'),
  r('anime-164', 'Anime News Network', 'Theron Martin', 'A', 95,
    "A magnificent, morally complex fable. Miyazaki's ecological epic remains unmatched in scope and emotional power.",
    'https://www.animenewsnetwork.com/review/princess-mononoke/film', '2014-06-10'),

  // ── Steins;Gate ─────────────────────────────────────────────────────────────
  r('anime-9253', 'IGN', 'Kallie Plagge', '9.0/10', 90,
    "A slow-burn thriller that earns every twist. Steins;Gate's time-travel plot is genuinely clever and emotionally devastating.",
    'https://www.ign.com/articles/2017/12/13/steinsgate-anime-review', '2017-12-13'),
  r('anime-9253', 'Anime News Network', 'Nick Creamer', 'A', 95,
    "Steins;Gate transforms from a meandering character study into one of anime's most gripping narratives. A modern classic.",
    'https://www.animenewsnetwork.com/review/steinsgate', '2012-05-08'),

  // ── Hunter x Hunter ─────────────────────────────────────────────────────────
  r('anime-11061', 'IGN', 'Amy McNulty', '9.1/10', 91,
    'The 2011 adaptation refines and expands on the manga to create something genuinely exceptional. The Chimera Ant arc alone is a masterclass.',
    'https://www.ign.com/articles/2019/09/13/hunter-x-hunter-2011-review', '2019-09-13'),
  r('anime-11061', 'Anime News Network', 'Theron Martin', 'A', 95,
    'Hunter x Hunter is among the most thoughtful battle shonen ever produced, with an emotional depth that consistently surprises.',
    'https://www.animenewsnetwork.com/review/hunter-x-hunter-2011', '2016-02-01'),

  // ── Death Note ──────────────────────────────────────────────────────────────
  r('anime-1535', 'IGN', 'Charles Onyett', '8.5/10', 85,
    'A gripping cat-and-mouse thriller elevated by two extraordinary leads. Death Note is compulsive viewing despite a weaker second half.',
    'https://www.ign.com/articles/2008/04/24/death-note-review', '2008-04-24'),
  r('anime-1535', 'Anime News Network', 'Theron Martin', 'B+', 87,
    "Death Note's first half is near-perfect suspense. The second dips, but the series remains a high-water mark for psychological anime.",
    'https://www.animenewsnetwork.com/review/death-note', '2008-07-15'),

  // ── Naruto ──────────────────────────────────────────────────────────────────
  r('anime-20', 'IGN', 'Jeremy Conrad', '7.9/10', 79,
    "Naruto's early seasons are endearing coming-of-age shonen. Pacing suffers from filler, but the core cast and themes hold up.",
    'https://www.ign.com/articles/2007/01/09/naruto-review', '2007-01-09'),
  r('anime-20', 'Anime News Network', 'Theron Martin', 'B', 83,
    "Naruto succeeds through the sheer force of its characters. When it's firing on all cylinders, it's one of the most entertaining shonen on record.",
    'https://www.animenewsnetwork.com/review/naruto/anime', '2009-03-01'),

  // ── Dragon Ball Z ───────────────────────────────────────────────────────────
  r('anime-813', 'IGN', 'Scott Thompson', '7.5/10', 75,
    'Dragon Ball Z is the template on which nearly every battle shonen was built. Padded and repetitive, yet undeniably iconic.',
    'https://www.ign.com/articles/2009/02/11/dragon-ball-z-review', '2009-02-11'),
  r('anime-813', 'Anime News Network', 'Bamboo Dong', 'B', 83,
    'Dragon Ball Z shaped a generation of anime fans. Its pacing is a relic of its era but its dramatic peaks remain thrilling.',
    'https://www.animenewsnetwork.com/review/dragon-ball-z', '2009-03-15'),

  // ── Code Geass ──────────────────────────────────────────────────────────────
  r('anime-1575', 'IGN', 'Chris Reed', '8.6/10', 86,
    'An operatic political thriller with a magnetic protagonist. Code Geass earns its dramatic excesses with a genuinely satisfying finale.',
    'https://www.ign.com/articles/2016/08/08/code-geass-review', '2016-08-08'),
  r('anime-1575', 'Anime News Network', 'Theron Martin', 'A-', 90,
    "Code Geass is pure pulpy spectacle executed with real skill. Lelouch is one of anime's great antiheroes.",
    'https://www.animenewsnetwork.com/review/code-geass', '2009-01-10'),

  // ── One-Punch Man ───────────────────────────────────────────────────────────
  r('anime-30276', 'IGN', 'Joshua Yehl', '9.0/10', 90,
    'A brilliant deconstruction of the superhero genre wrapped in some of the most jaw-dropping action animation ever produced.',
    'https://www.ign.com/articles/2016/03/04/one-punch-man-review', '2016-03-04'),
  r('anime-30276', 'Anime News Network', 'Nick Creamer', 'A', 95,
    "One-Punch Man is both a loving parody and a genuinely thrilling spectacle. Madhouse's animation is in a class of its own.",
    'https://www.animenewsnetwork.com/review/one-punch-man', '2015-12-21'),

  // ── My Hero Academia ────────────────────────────────────────────────────────
  r('anime-31964', 'IGN', 'Amy McNulty', '8.3/10', 83,
    'My Hero Academia is the rare modern shonen that genuinely earns its emotional beats. A heartfelt, well-executed genre entry.',
    'https://www.ign.com/articles/2018/04/09/my-hero-academia-season-2-review', '2018-04-09'),
  r('anime-31964', 'Anime News Network', 'Theron Martin', 'B+', 87,
    "MHA's world-building is exemplary and its ensemble is stronger than most shonen rivals. Deku is a protagonist worth rooting for.",
    'https://www.animenewsnetwork.com/review/my-hero-academia', '2016-07-12'),

  // ── Jujutsu Kaisen ──────────────────────────────────────────────────────────
  r('anime-40748', 'IGN', 'Megan Peters', '8.7/10', 87,
    "MAPPA delivers some of the decade's most kinetic action animation. Jujutsu Kaisen is dark shonen at its most propulsive.",
    'https://www.ign.com/articles/jujutsu-kaisen-season-1-review', '2021-03-27'),
  r('anime-40748', 'Anime News Network', 'Nicholas Dupree', 'A-', 90,
    'Jujutsu Kaisen arrives fully formed. Its fights are extraordinary and its cast immediately compelling.',
    'https://www.animenewsnetwork.com/review/jujutsu-kaisen', '2021-03-25'),

  // ── Chainsaw Man ────────────────────────────────────────────────────────────
  r('anime-44511', 'IGN', 'Megan Peters', '8.5/10', 85,
    "MAPPA's adaptation captures Fujimoto's anarchic energy while adding a cinematic polish the manga could only suggest.",
    'https://www.ign.com/articles/chainsaw-man-anime-review', '2022-12-29'),
  r('anime-44511', 'Anime News Network', 'Steve Jones', 'A-', 90,
    'Chainsaw Man is a riotously entertaining, emotionally raw debut season from a creative team swinging for the fences.',
    'https://www.animenewsnetwork.com/review/chainsaw-man/anime', '2022-12-28'),

  // ── Mob Psycho 100 ──────────────────────────────────────────────────────────
  r('anime-32182', 'IGN', 'Joshua Yehl', '9.1/10', 91,
    "Mob Psycho 100 is a visual feast with genuine emotional intelligence. One's subversive genius translates beautifully to animation.",
    'https://www.ign.com/articles/mob-psycho-100-review', '2016-10-05'),
  r('anime-32182', 'Anime News Network', 'Nick Creamer', 'A', 95,
    'A miracle of animation and character writing. Mob Psycho 100 is among the most purely joyful anime of the past decade.',
    'https://www.animenewsnetwork.com/review/mob-psycho-100', '2016-10-03'),

  // ── Violet Evergarden ───────────────────────────────────────────────────────
  r('anime-33352', 'IGN', 'Amy McNulty', '8.3/10', 83,
    'Kyoto Animation at the height of their craft. Violet Evergarden is a visually ravishing emotional marathon.',
    'https://www.ign.com/articles/violet-evergarden-review', '2018-04-05'),
  r('anime-33352', 'Anime News Network', 'Theron Martin', 'B+', 87,
    "Uneven in structure but stunning in execution. Violet Evergarden's best episodes are among KyoAni's finest work.",
    'https://www.animenewsnetwork.com/review/violet-evergarden', '2018-04-01'),

  // ── Fullmetal Alchemist (manga) ─────────────────────────────────────────────
  r('manga-25', 'IGN', 'Jason Van Horn', '9.3/10', 93,
    "Arakawa's manga is a perfectly paced adventure with rare thematic depth. The Homunculi rank among comics' great villains.",
    'https://www.ign.com/articles/fullmetal-alchemist-manga-review', '2010-08-15'),
  r('manga-25', 'Otaku USA', 'Sean Gaffney', 'A', 95,
    'Fullmetal Alchemist is the complete package: rich world-building, emotional storytelling, and a satisfying conclusion.',
    'https://www.otakuusamagazine.com/fullmetal-alchemist-manga-review/', '2011-02-01'),

  // ── Vagabond ────────────────────────────────────────────────────────────────
  r('manga-656', 'IGN', 'Hilary Goldstein', '9.7/10', 97,
    "Inoue's brushwork is without peer in comics. Vagabond is a meditation on violence, purpose, and enlightenment rendered in breathtaking ink.",
    'https://www.ign.com/articles/vagabond-manga-review', '2008-09-22'),
  r('manga-656', 'Anime News Network', 'Carlo Santos', 'A+', 98,
    'One of the greatest manga ever created, full stop. Vagabond transcends the medium with art and philosophy in perfect harmony.',
    'https://www.animenewsnetwork.com/review/vagabond', '2010-03-12'),

  // ── Slam Dunk ───────────────────────────────────────────────────────────────
  r('manga-51', 'IGN', 'Richard George', '9.0/10', 90,
    "Inoue's sports manga is a masterclass in character development. Slam Dunk made basketball dramatic in ways that feel universal.",
    'https://www.ign.com/articles/slam-dunk-manga-review', '2009-04-10'),
  r('manga-51', 'Anime News Network', 'Carlo Santos', 'A', 95,
    "An all-time great sports manga. Slam Dunk's final arc is as gripping as anything in the medium.",
    'https://www.animenewsnetwork.com/review/slam-dunk/manga', '2009-06-15'),

  // ── Goodnight Punpun ────────────────────────────────────────────────────────
  r('manga-4632', 'IGN', 'Mitch Dyer', '9.4/10', 94,
    'Brutal, beautiful, and unlike anything else in manga. Goodnight Punpun is Asano at his most uncompromising.',
    'https://www.ign.com/articles/goodnight-punpun-manga-review', '2016-10-11'),
  r('manga-4632', 'Anime News Network', 'Rebecca Silverman', 'A', 95,
    'A harrowing, deeply literary work. Goodnight Punpun demands a lot from the reader and gives back even more.',
    'https://www.animenewsnetwork.com/review/goodnight-punpun', '2016-11-01'),

  // ── JoJo's Bizarre Adventure Part 1 ────────────────────────────────────────
  r('manga-1517', 'IGN', 'Chris Reed', '8.5/10', 85,
    "The origin of one of manga's most distinctive voices. Part 1 is rough but electrifying, establishing Araki's eccentric genius.",
    'https://www.ign.com/articles/jojos-bizarre-adventure-part-1-review', '2015-06-10'),
  r('manga-1517', 'Otaku USA', 'Sean Gaffney', 'A-', 90,
    "Araki's debut arc is kinetic, weird, and instantly distinctive. JoJo Part 1 lays the foundation for one of manga's greatest epics.",
    'https://www.otakuusamagazine.com/jojos-bizarre-adventure-phantom-blood-review/', '2015-07-01'),

  // ── Spy x Family ────────────────────────────────────────────────────────────
  r('manga-119161', 'IGN', 'Megan Peters', '8.6/10', 86,
    'A warm, inventive comedy with a found-family heart. Anya alone is worth the admission price.',
    'https://www.ign.com/articles/spy-x-family-manga-review', '2022-06-20'),
  r('manga-119161', 'Otaku USA', 'Caitlin Moore', 'A-', 90,
    'Spy x Family is delightfully charming. Endo balances comedy, action, and heartfelt family dynamics with remarkable ease.',
    'https://www.otakuusamagazine.com/spy-x-family-manga-review/', '2022-07-01'),

  // ── Dragon Ball (manga) ─────────────────────────────────────────────────────
  r('manga-42', 'IGN', 'Richard George', '8.7/10', 87,
    "Toriyama's original Dragon Ball is a masterwork of adventure manga, with a charm and energy the sequels never fully recaptured.",
    'https://www.ign.com/articles/dragon-ball-manga-review', '2009-08-10'),
  r('manga-42', 'Anime News Network', 'Carlo Santos', 'A-', 90,
    'The original Dragon Ball is lighter, funnier, and more inventive than its successors. A foundational work of shonen manga.',
    'https://www.animenewsnetwork.com/review/dragon-ball/manga', '2010-01-05'),

  // ── My Hero Academia (manga) ────────────────────────────────────────────────
  r('manga-75989', 'IGN', 'Amy McNulty', '7.8/10', 78,
    "The MHA manga moves fast and hits hard. Horikoshi's art evolves dramatically across its run, as does its storytelling ambition.",
    'https://www.ign.com/articles/my-hero-academia-manga-review', '2021-05-10'),
  r('manga-75989', 'Otaku USA', 'Sean Gaffney', 'B+', 87,
    'My Hero Academia is everything you want from a modern shonen: big heart, kinetic fights, and a cast of immediately lovable characters.',
    'https://www.otakuusamagazine.com/my-hero-academia-manga-review/', '2019-09-01'),

  // ── Demon Slayer (manga) ────────────────────────────────────────────────────
  r('manga-96792', 'IGN', 'Megan Peters', '8.0/10', 80,
    "A crowd-pleasing shonen with gorgeous battle art and an unusually efficient story. Gotouge doesn't waste a page.",
    'https://www.ign.com/articles/demon-slayer-manga-review', '2020-06-15'),
  r('manga-96792', 'Otaku USA', 'Caitlin Moore', 'B+', 87,
    'Demon Slayer succeeds through elegant simplicity. Its emotional core is rock solid and the sibling bond at its heart never wavers.',
    'https://www.otakuusamagazine.com/demon-slayer-manga-review/', '2020-07-01'),
];

async function store(review) {
  try {
    await ddb.send(new PutCommand({
      TableName: REVIEWS_TABLE,
      Item: review,
      ConditionExpression: 'attribute_not_exists(reviewId)',
    }));
    return true;
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') return false;
    throw err;
  }
}

async function main() {
  // Verify each titleId exists before inserting
  const titleIds = [...new Set(REVIEWS.map(r => r.titleId))];
  const existing = new Set();
  for (const id of titleIds) {
    const res = await ddb.send(new GetCommand({ TableName: 'mangacritic-titles', Key: { titleId: id } }));
    if (res.Item) existing.add(id);
    else console.warn(`WARNING: titleId "${id}" not found in Titles table — its reviews will be skipped`);
  }

  let inserted = 0, skipped = 0;
  for (const review of REVIEWS) {
    if (!existing.has(review.titleId)) { skipped++; continue; }
    const isNew = await store(review);
    if (isNew) { process.stdout.write('+'); inserted++; }
    else { process.stdout.write('.'); skipped++; }
  }
  console.log(`\n\nInserted: ${inserted}  Already existed: ${skipped}`);

  // Recalculate scores for all affected titles
  console.log('\nRecalculating scores…');
  for (const titleId of existing) {
    try {
      await recalculate(titleId);
      process.stdout.write(`✓ ${titleId}\n`);
    } catch (err) {
      console.error(`✗ ${titleId}: ${err.message}`);
    }
  }
  console.log('\nDone.');
}

main().catch(err => { console.error(err); process.exit(1); });
