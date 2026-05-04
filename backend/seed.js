#!/usr/bin/env node
'use strict';

/**
 * Seed script — 10 titles (anime + manga) with critic AND user reviews.
 *
 * reviewCount is driven by user review count (mirrors recalculateScores.js).
 * Scores are computed from the review arrays before writing so the title
 * record always stays consistent with the review data.
 *
 * Usage:
 *   STACK_NAME=fantachi AWS_REGION=us-east-1 node seed.js
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { randomUUID } = require('crypto');

// ── AniList cover fetch ──────────────────────────────────────────────────────

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

// ── Config ───────────────────────────────────────────────────────────────────

const STACK_NAME = process.env.STACK_NAME || 'fantachi';
const REGION     = process.env.AWS_REGION  || 'us-east-1';

const TITLES_TABLE  = `${STACK_NAME}-titles`;
const REVIEWS_TABLE = `${STACK_NAME}-reviews`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

// ── Score helpers (mirrors recalculateScores.js) ─────────────────────────────

function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

function roundedAvg(nums) {
  const a = avg(nums);
  return a === null ? null : Math.round(a);
}

function computeScores(criticReviews, userReviews) {
  const criticScore = criticReviews.length ? roundedAvg(criticReviews.map((r) => r.score)) : null;
  const userScore   = userReviews.length   ? roundedAvg(userReviews.map((r) => r.score))   : null;
  const reviewCount = userReviews.length; // matches recalculateScores behaviour
  return { criticScore, userScore, reviewCount };
}

// ── Seed data ─────────────────────────────────────────────────────────────────
//
// Each entry has:
//   meta        — title record fields (no scores — computed below)
//   criticRevs  — array of { score, bodyEn, bodyJa }
//   userRevs    — array of { score, bodyEn, bodyJa, displayName }
//
// Score targets after averaging:
//   GREEN  (≥75): FMA Brotherhood, Attack on Titan, Demon Slayer,
//                 Berserk, Vinland Saga, One Piece
//   YELLOW (50–74): Sword Art Online, Tokyo Ghoul, Bleach
//   RED    (<50):  Another

const SEED = [

  // ── GREEN ────────────────────────────────────────────────────────────────

  {
    meta: {
      titleId: 'fullmetal-alchemist-brotherhood',
      titleEn: 'Fullmetal Alchemist: Brotherhood',
      titleJa: '鋼の錬金術師 BROTHERHOOD',
      type: 'anime',
      genres: ['Action', 'Drama', 'Fantasy'],
      studio: 'Bones',
      year: 2009,
    },
    criticRevs: [
      {
        score: 98,
        bodyEn: 'Fullmetal Alchemist: Brotherhood is the rare series that achieves everything it sets out to do — compelling characters, airtight plotting, and an emotional payoff that is genuinely earned.',
        bodyJa: '鋼の錬金術師 BROTHERHOODは設定したすべてを達成する稀なシリーズだ。説得力のあるキャラクター、緻密なプロット、そして本当に価値ある感情的な見返り。',
      },
      {
        score: 96,
        bodyEn: 'A benchmark for the action-adventure genre. Brotherhood weaves philosophy, family, and sacrifice into a narrative that remains deeply satisfying decades later.',
        bodyJa: 'アクションアドベンチャージャンルの基準。BROTHERHOODは哲学、家族、犠牲を、何十年後も深く満足のいく物語に織り込んでいる。',
      },
      {
        score: 95,
        bodyEn: 'Simply one of the greatest animated series ever made. The worldbuilding is extraordinary, and every character arc reaches a fully satisfying conclusion.',
        bodyJa: '端的に言えば、これまでに作られた中で最も偉大なアニメシリーズの一つ。世界観の構築は卓越しており、すべてのキャラクターアークが満足のいく結末を迎える。',
      },
    ],
    userRevs: [
      {
        score: 96,
        bodyEn: 'Rewatched it three times and it keeps getting better. The alchemy system is genius and the villain reveals are perfectly timed.',
        bodyJa: '3回見直したがどんどん良くなる。錬金術システムが天才的で、ヴィランの展開が完璧なタイミングだ。',
        displayName: 'AlchemyFan99',
      },
      {
        score: 92,
        bodyEn: 'Brotherhood fixes every issue with the 2003 adaptation and then some. The ending actually sticks the landing.',
        bodyJa: '2003年版のすべての問題を修正し、それ以上のことをやってのける。エンディングがしっかりと着地している。',
        displayName: 'anime_historian',
      },
      {
        score: 91,
        bodyEn: "There's no filler, no wasted episode — every scene serves the story. One of the tightest-written anime ever.",
        bodyJa: 'フィラーも無駄なエピソードもない。すべてのシーンがストーリーに役立っている。',
        displayName: 'CriticalEye',
      },
    ],
  },

  {
    meta: {
      titleId: 'attack-on-titan',
      titleEn: 'Attack on Titan',
      titleJa: '進撃の巨人',
      type: 'anime',
      genres: ['Action', 'Drama', 'Fantasy'],
      studio: 'MAPPA / Wit Studio',
      year: 2013,
    },
    criticRevs: [
      {
        score: 95,
        bodyEn: 'A masterpiece of modern anime. Attack on Titan delivers an emotionally devastating story with impeccable animation and a plot that constantly subverts expectations.',
        bodyJa: '現代アニメの傑作。進撃の巨人は感情を揺さぶる物語と完璧なアニメーション、常に期待を裏切るプロットを届ける。',
      },
      {
        score: 90,
        bodyEn: 'Few series manage the balancing act of large-scale political intrigue and intimate character moments quite like Attack on Titan.',
        bodyJa: '大規模な政治的陰謀と親密なキャラクターの瞬間のバランスを保つシリーズは少ない。',
      },
      {
        score: 91,
        bodyEn: 'The final arc is bold and divisive, but the ambition behind it is undeniable. A generation-defining achievement.',
        bodyJa: '最終アークは大胆で賛否両論だが、その背後にある野心は否定できない。世代を定義する偉業だ。',
      },
    ],
    userRevs: [
      {
        score: 90,
        bodyEn: 'The story goes places I never expected. The final season hurt me in a way no show has since Game of Thrones.',
        bodyJa: 'ストーリーが予想外の方向へ進む。最終シーズンはゲーム・オブ・スローンズ以来初めて心を痛めた。',
        displayName: 'TitanHunter',
      },
      {
        score: 86,
        bodyEn: 'The animation quality is inconsistent across seasons but the story always drags you back in. An essential watch.',
        bodyJa: 'シーズンによってアニメ品質にばらつきがあるが、ストーリーが常に引き戻してくれる。必見だ。',
        displayName: 'WallRose_fan',
      },
      {
        score: 88,
        bodyEn: 'Season 1 is one of the best single seasons of television ever made. The political complexity that follows rewards patient viewers.',
        bodyJa: 'シーズン1はこれまで作られた中で最高のシーズンの一つだ。その後の政治的複雑さは忍耐強い視聴者に報いる。',
        displayName: 'mikasa_simp',
      },
    ],
  },

  {
    meta: {
      titleId: 'demon-slayer',
      titleEn: 'Demon Slayer: Kimetsu no Yaiba',
      titleJa: '鬼滅の刃',
      type: 'anime',
      genres: ['Action', 'Fantasy', 'Shounen'],
      studio: 'ufotable',
      year: 2019,
    },
    criticRevs: [
      {
        score: 88,
        bodyEn: "Demon Slayer is a visual spectacle unlike anything else in anime. ufotable's animation brings every sword clash to life with breathtaking fluidity.",
        bodyJa: '鬼滅の刃はアニメにおける他に類を見ないビジュアルの壮観だ。ufotableのアニメーションは、すべての剣の衝突を息をのむような流動性で生き生きとさせる。',
      },
      {
        score: 84,
        bodyEn: 'While the story follows a conventional shounen structure, the emotional core of the Kamado siblings keeps it compelling.',
        bodyJa: 'ストーリーは従来の少年漫画の構成に従っているが、竈門兄妹の感情的な核がシリーズを説得力のあるものにしている。',
      },
      {
        score: 92,
        bodyEn: 'The Mugen Train arc set a new benchmark for what theatrical anime can achieve, both artistically and commercially.',
        bodyJa: '無限列車編は、芸術的にも商業的にも、劇場アニメが達成できることの新しい基準を設定した。',
      },
    ],
    userRevs: [
      {
        score: 85,
        bodyEn: 'Absolutely gorgeous animation. Some episodes look better than most feature films. The Mugen Train movie is incredible.',
        bodyJa: '絶対的に美しいアニメーション。一部のエピソードはほとんどの映画よりも見栄えがする。無限列車の映画は素晴らしい。',
        displayName: 'hashira_watcher',
      },
      {
        score: 79,
        bodyEn: 'Tanjiro is a bit too perfect as a protagonist for my taste, but the supporting cast and fights more than make up for it.',
        bodyJa: '炭治郎は私の好みには完璧すぎる主人公だが、サポートキャストと戦闘がそれ以上に補っている。',
        displayName: 'ShonenSkeptic',
      },
      {
        score: 83,
        bodyEn: "The animation budget is clearly enormous and it shows. Even mundane scenes look extraordinary. Zenitsu's fight in episode 17 is a career-defining moment for ufotable.",
        bodyJa: 'アニメーション予算が明らかに膨大で、それが伝わる。17話の善逸の戦いはufotableにとってキャリアを定義する瞬間だ。',
        displayName: 'BreathStyle',
      },
    ],
  },

  {
    meta: {
      titleId: 'berserk',
      titleEn: 'Berserk',
      titleJa: 'ベルセルク',
      type: 'manga',
      genres: ['Action', 'Dark Fantasy', 'Drama', 'Horror'],
      studio: 'Kentaro Miura',
      year: 1989,
    },
    criticRevs: [
      {
        score: 99,
        bodyEn: "Berserk is the gold standard of dark fantasy manga. Miura's artwork is unparalleled, and Guts' odyssey remains one of the most compelling portraits of human endurance ever put to page.",
        bodyJa: 'ベルセルクはダークファンタジー漫画の最高基準だ。三浦の作画は他に類を見ず、ガッツの旅は人間の忍耐力の描写として最も説得力のある作品の一つだ。',
      },
      {
        score: 97,
        bodyEn: 'Few works in any medium match the sheer ambition of Berserk. The Golden Age Arc alone would secure its legacy.',
        bodyJa: 'いかなる媒体においても、ベルセルクの純粋な野心に匹敵する作品はほとんどない。黄金時代編だけでもその遺産を確かなものにする。',
      },
      {
        score: 95,
        bodyEn: 'An unflinching examination of trauma, fate, and the cost of survival. Berserk is difficult to read and impossible to put down.',
        bodyJa: 'トラウマ、運命、生き残ることの代償を臆せず考察する作品。ベルセルクは読むのが辛く、やめられない。',
      },
    ],
    userRevs: [
      {
        score: 97,
        bodyEn: "The Eclipse is the single most impactful chapter in all of manga history. Nothing I've read since has matched the emotional devastation.",
        bodyJa: '蝕は漫画史上最もインパクトのある章だ。それ以来読んだものでその感情的な打撃に匹敵するものはない。',
        displayName: 'GutsFan_DragonSlayer',
      },
      {
        score: 93,
        bodyEn: 'The artwork gets better with every arc. Volume 14 contains some of the most breathtaking panels in the history of the medium.',
        bodyJa: 'アークごとに作画がどんどん良くなる。14巻にはこの媒体の歴史の中で最も息をのむパネルが含まれている。',
        displayName: 'MangaArtCritic',
      },
      {
        score: 95,
        bodyEn: 'Miura is a genius. Tragic that we lost him before the ending, but what exists is a monument to the form.',
        bodyJa: '三浦は天才だ。最後を見届けられなかったのは悲劇的だが、残されたものは漫画という形式へのモニュメントだ。',
        displayName: 'DarkHorse_reader',
      },
    ],
  },

  {
    meta: {
      titleId: 'vinland-saga',
      titleEn: 'Vinland Saga',
      titleJa: 'ヴィンランド・サガ',
      type: 'manga',
      genres: ['Action', 'Drama', 'Historical'],
      studio: 'Makoto Yukimura',
      year: 2005,
    },
    criticRevs: [
      {
        score: 95,
        bodyEn: "Vinland Saga transforms from a revenge epic into one of manga's most profound meditations on war, pacifism, and the nature of a true warrior.",
        bodyJa: 'ヴィンランド・サガは復讐の叙事詩から、戦争、平和主義、そして真の戦士の本質についての漫画で最も深い瞑想の一つへと変貌する。',
      },
      {
        score: 91,
        bodyEn: "Yukimura's historical research gives Vinland Saga an authenticity that grounds its more fantastical moments. Thorfinn's growth is extraordinary.",
        bodyJa: '幸村の歴史的調査がヴィンランド・サガに真正性を与えている。トルフィンの成長は並外れたものだ。',
      },
      {
        score: 93,
        bodyEn: 'The Farm Arc, initially controversial, reveals itself as the spiritual heart of the series — rare manga that grows more compelling the further it strays from action.',
        bodyJa: '当初は物議を醸したファームアークはシリーズの精神的な核心として自らを明らかにする。アクションから離れるほど説得力を増す稀な漫画だ。',
      },
    ],
    userRevs: [
      {
        score: 91,
        bodyEn: 'I went in expecting a Viking action series and got a philosophical masterpiece. The Farm Arc haters are wrong.',
        bodyJa: 'バイキングのアクションシリーズを期待して読み始め、哲学的な傑作を得た。ファームアーク嫌いは間違っている。',
        displayName: 'Thorfinn_Journey',
      },
      {
        score: 87,
        bodyEn: 'The historical setting is used brilliantly. I ended up down a rabbit hole of actual Viking history after reading this.',
        bodyJa: '歴史的な設定が見事に使われている。これを読んだ後、実際のバイキングの歴史を調べることになった。',
        displayName: 'HistoryNerd',
      },
      {
        score: 86,
        bodyEn: "Askeladd is one of the greatest manga characters ever written. His arc alone justifies reading the whole series.",
        bodyJa: 'アシェラッドはこれまで書かれた漫画キャラクターの中でも最高のひとりだ。彼のアークだけで全シリーズを読む価値がある。',
        displayName: 'ComplexVillains',
      },
    ],
  },

  {
    meta: {
      titleId: 'one-piece',
      titleEn: 'One Piece',
      titleJa: 'ワンピース',
      type: 'manga',
      genres: ['Action', 'Adventure', 'Comedy', 'Shounen'],
      studio: 'Eiichiro Oda',
      year: 1997,
    },
    criticRevs: [
      {
        score: 88,
        bodyEn: "One Piece is a once-in-a-generation achievement. Oda's ability to sustain tension, humour, and emotional stakes across hundreds of volumes is unmatched in the medium.",
        bodyJa: 'ワンピースは一世代に一度の偉業だ。何百巻にもわたってテンション、ユーモア、感情的な賭けを維持するODAの能力はこの媒体で他に類を見ない。',
      },
      {
        score: 82,
        bodyEn: 'The pacing in the middle arcs can test patience, but the payoffs — Water 7, Marineford, Wano — are some of the most emotionally resonant in manga history.',
        bodyJa: '中間のアークのペース配分は忍耐が必要だが、ウォーターセブン、マリンフォード、ワノなどの見返りは漫画史上最も感動的なものだ。',
      },
      {
        score: 84,
        bodyEn: 'Nobody world-builds like Oda. Every island is a fully realised ecosystem with its own history, politics, and mythology.',
        bodyJa: 'ODAのような世界観の構築者はいない。すべての島が独自の歴史、政治、神話を持つ完全に実現されたエコシステムだ。',
      },
    ],
    userRevs: [
      {
        score: 90,
        bodyEn: "The Marineford arc is a 10/10. I cried three times. Oda somehow made me care about hundreds of side characters I'd only just met.",
        bodyJa: 'マリンフォードアークは10/10。3回泣いた。Odaは出会ったばかりの何百ものサイドキャラクターを大切に思わせてくれた。',
        displayName: 'LuffyNakama',
      },
      {
        score: 85,
        bodyEn: "I've been reading for 15 years. The slow arcs are worth it. Every clue Oda planted 300 chapters ago eventually pays off.",
        bodyJa: '15年間読み続けている。遅いアークはそれだけの価値がある。300話前にODAが植えたすべての伏線がいずれ回収される。',
        displayName: 'ChronologicalRead',
      },
      {
        score: 88,
        bodyEn: 'Wano is the best arc in the series, period. The character designs, the fights, the emotional beats — all firing on all cylinders.',
        bodyJa: 'ワノはシリーズ最高のアークだ。キャラクターデザイン、戦闘、感情的なビート、すべてが完璧だ。',
        displayName: 'WanoCountry',
      },
    ],
  },

  // ── YELLOW ──────────────────────────────────────────────────────────────────

  {
    meta: {
      titleId: 'sword-art-online',
      titleEn: 'Sword Art Online',
      titleJa: 'ソードアート・オンライン',
      type: 'anime',
      genres: ['Action', 'Fantasy', 'Romance', 'Sci-Fi'],
      studio: 'A-1 Pictures',
      year: 2012,
    },
    criticRevs: [
      {
        score: 55,
        bodyEn: "The Aincrad arc presents a compelling premise that the show never fully capitalises on. Kirito's overpowered wish-fulfilment quickly undercuts any sense of tension.",
        bodyJa: 'アインクラッドアークは説得力のある前提を提示しているが、作品はそれを十分に活かしていない。キリトの無敵感はすぐに緊張感を損なう。',
      },
      {
        score: 62,
        bodyEn: 'Technically competent animation and a fun game-world hook, but SAO squanders its ideas with shallow characters and a second arc that drags interminably.',
        bodyJa: '技術的に有能なアニメーションと楽しいゲームワールドの設定があるが、SSOは浅いキャラクターと延々と続く第二アークで良いアイデアを無駄にしている。',
      },
      {
        score: 58,
        bodyEn: "SAO is a victim of its own ambition. The ideas are there — life-or-death VR, player psychology, the nature of digital existence — but the execution is surface-level.",
        bodyJa: 'SSOは自らの野心の犠牲者だ。アイデアはある。死を賭けたVR、プレイヤーの心理、デジタル存在の本質。しかし実行が表面的だ。',
      },
    ],
    userRevs: [
      {
        score: 74,
        bodyEn: 'Look, the Aincrad arc is genuinely great. The rest varies in quality, but that first cour is why this series became a phenomenon.',
        bodyJa: 'アインクラッドアークは本当に素晴らしい。残りの部分は質が異なるが、最初のクールがこのシリーズが現象になった理由だ。',
        displayName: 'BetaPlayer',
      },
      {
        score: 68,
        bodyEn: 'I enjoy it for what it is — a fun power fantasy with good fight scenes. Stop expecting it to be something it never claimed to be.',
        bodyJa: 'そのまま楽しんでいる。良い戦闘シーンを持つ楽しいパワーファンタジーだ。そもそも主張していないものを期待するのをやめよう。',
        displayName: 'casual_isekai',
      },
      {
        score: 71,
        bodyEn: "The game mechanics in Aincrad are creative and the stakes feel real early on. Alfheim Online drags it down but the newer Alicization arc is genuinely good.",
        bodyJa: 'アインクラッドのゲームメカニクスは創造的で、序盤は賭けが現実的に感じられる。アルヴヘイムオンラインが引き下げるが、アリシゼーションアークは本当に良い。',
        displayName: 'Kirigaya_K',
      },
    ],
  },

  {
    meta: {
      titleId: 'tokyo-ghoul',
      titleEn: 'Tokyo Ghoul',
      titleJa: '東京喰種トーキョーグール',
      type: 'anime',
      genres: ['Action', 'Drama', 'Horror', 'Psychological'],
      studio: 'Pierrot',
      year: 2014,
    },
    criticRevs: [
      {
        score: 70,
        bodyEn: "The first season of Tokyo Ghoul is a tight, genuinely unsettling horror-action series. Ken Kaneki's transformation is one of anime's most memorable character arcs.",
        bodyJa: '東京喰種の第1シーズンは、緊密で本当に不安を誘うホラーアクションシリーズだ。金木研の変貌はアニメで最も記憶に残るキャラクターアークの一つだ。',
      },
      {
        score: 65,
        bodyEn: 'Strong source material and a genuinely haunting aesthetic are let down by rushed pacing and an anime-original ending that abandons the manga\'s logic entirely.',
        bodyJa: '強い原作と本当に不気味な美学が、急いだペース配分と漫画の論理を完全に放棄したアニメオリジナルのエンディングによって台無しにされている。',
      },
      {
        score: 63,
        bodyEn: "Season 2 diverges from the manga so drastically that it becomes a different show. For fans of the manga, it's a painful watch.",
        bodyJa: '第2シーズンは漫画とあまりにも大きく乖離しており、別の作品になっている。漫画ファンにとっては痛々しい視聴体験だ。',
      },
    ],
    userRevs: [
      {
        score: 72,
        bodyEn: 'Season 1 is a horror masterpiece and deserves 90+. The rest drags the average down but that first season is something special.',
        bodyJa: 'シーズン1はホラーの傑作で90+に値する。残りが平均を下げているが、最初のシーズンは特別なものだ。',
        displayName: 'GhoulHunter',
      },
      {
        score: 66,
        bodyEn: "Watched the whole thing. Season 1 goes hard. Season 2 is a mess. :re was fine. Read the manga instead.",
        bodyJa: '全部見た。シーズン1は最高。シーズン2はぐちゃぐちゃ。:reは普通。漫画を読もう。',
        displayName: 'Touka_simp',
      },
      {
        score: 70,
        bodyEn: "The aesthetic is unmatched — the Ghoul world feels genuinely threatening. If only the writing matched the atmosphere in later seasons.",
        bodyJa: '美学は他に類を見ない。食種の世界は本当に脅威的に感じられる。後のシーズンで脚本が雰囲気に合っていれば良かった。',
        displayName: 'CCGInvestigator',
      },
    ],
  },

  {
    meta: {
      titleId: 'bleach',
      titleEn: 'Bleach',
      titleJa: 'ブリーチ',
      type: 'manga',
      genres: ['Action', 'Adventure', 'Shounen', 'Supernatural'],
      studio: 'Tite Kubo',
      year: 2001,
    },
    criticRevs: [
      {
        score: 68,
        bodyEn: "Bleach has some of the best character designs and fight choreography in shounen manga, but Kubo's storytelling becomes increasingly erratic in its second half.",
        bodyJa: 'ブリーチには少年漫画の中で最も優れたキャラクターデザインと戦闘の振り付けがあるが、久保の物語は後半になるにつれてますます不規則になる。',
      },
      {
        score: 62,
        bodyEn: 'The Soul Society arc is a genuine classic — propulsive, inventive, full of memorable reveals. The Hueco Mundo and Fullbring arcs test the patience of even devoted fans.',
        bodyJa: 'ソウルソサエティアークは本物のクラシックだ。躍動感があり、独創的で、記憶に残る展開に満ちている。虚圏とフルブリングアークは熱烈なファンでも忍耐が試される。',
      },
      {
        score: 63,
        bodyEn: "The Thousand-Year Blood War arc redeems much of the later-series weaknesses with spectacular battles, but the pacing issues remain endemic.",
        bodyJa: '千年血戦篇は壮大な戦闘で後半シリーズの多くの弱点を取り戻すが、ペース配分の問題は依然として残っている。',
      },
    ],
    userRevs: [
      {
        score: 73,
        bodyEn: "The Soul Society arc is a genuine 95/100. The whole series averages out lower but that arc alone makes Bleach worth reading.",
        bodyJa: 'ソウルソサエティアークは本物の95/100だ。シリーズ全体の平均は低いが、そのアークだけでブリーチを読む価値がある。',
        displayName: 'Rukia_fan',
      },
      {
        score: 70,
        bodyEn: "TYBW is incredible. I'm glad I stuck with it. Kubo redeemed himself completely in the final arc.",
        bodyJa: '千年血戦篇は素晴らしい。最後まで読み続けて良かった。久保は最終アークで完全に名誉挽回した。',
        displayName: 'BankaiFan',
      },
      {
        score: 69,
        bodyEn: "Aizen is one of the greatest villains in manga history. Everything else is a rollercoaster of quality but he carries the series.",
        bodyJa: '藍染は漫画史上最も偉大な悪役の一人だ。他のすべては品質のジェットコースターだが、彼がシリーズを支えている。',
        displayName: 'AizenDid9_11',
      },
    ],
  },

  // ── RED ─────────────────────────────────────────────────────────────────────

  {
    meta: {
      titleId: 'another',
      titleEn: 'Another',
      titleJa: 'アナザー',
      type: 'anime',
      genres: ['Horror', 'Mystery', 'Thriller'],
      studio: 'P.A. Works',
      year: 2012,
    },
    criticRevs: [
      {
        score: 42,
        bodyEn: "Another squanders a genuinely creepy atmosphere on a plot that collapses under scrutiny. The deaths are inventively gory but the writing treats its characters as little more than bodies-in-waiting.",
        bodyJa: 'アナザーは本当に不気味な雰囲気を、精査に耐えられないプロットで台無しにしている。死に方は独創的にグロテスクだが、脚本はキャラクターを単なる死体待機者として扱っている。',
      },
      {
        score: 48,
        bodyEn: 'Competent J-horror aesthetics and a few genuinely tense sequences, but the mystery unravels incoherently and the finale is unintentionally comedic.',
        bodyJa: '有能なJホラーの美学といくつかの本当に緊張したシーケンスがあるが、謎が支離滅裂に展開し、フィナーレは意図せず喜劇的だ。',
      },
      {
        score: 43,
        bodyEn: "The premise is solid — a cursed class haunted by a dead student — but the rules are invented and discarded at will, and the twist ending feels unearned.",
        bodyJa: '前提は確かだ。死んだ生徒に憑かれた呪われたクラス。しかしルールが都合よく作られ破棄され、どんでん返しのエンディングは報われた感じがしない。',
      },
    ],
    userRevs: [
      {
        score: 52,
        bodyEn: "I watch it every Halloween. It's dumb fun and the umbrella scene is iconic. Stop taking it so seriously.",
        bodyJa: '毎年ハロウィンに見ている。バカバカしい楽しさで、傘のシーンはアイコニックだ。真剣に考えすぎるのをやめよう。',
        displayName: 'SlasherFan',
      },
      {
        score: 44,
        bodyEn: "I wanted to like this so much. The atmosphere is excellent but the mystery makes no logical sense by the end. The characters exist purely to die.",
        bodyJa: 'とても好きになりたかった。雰囲気は素晴らしいが、ミステリーは最終的に論理的な意味をなさない。キャラクターは純粋に死ぬためだけに存在している。',
        displayName: 'Horror_Enjoyer',
      },
      {
        score: 48,
        bodyEn: "The art style and music are genuinely great and create a suffocating dread. Too bad the script lets the whole thing down.",
        bodyJa: 'アートスタイルと音楽は本当に素晴らしく、息が詰まるような恐怖を作り出す。脚本がすべてを台無しにしているのが残念だ。',
        displayName: 'MisakiMei_fan',
      },
    ],
  },

];

// ── Main ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log(`Seeding to stack: ${STACK_NAME} (region: ${REGION})\n`);
  console.log(`Tables: ${TITLES_TABLE}, ${REVIEWS_TABLE}\n`);

  for (const entry of SEED) {
    const { meta, criticRevs, userRevs } = entry;
    const { criticScore, userScore, reviewCount } = computeScores(criticRevs, userRevs);

    // Fetch cover art
    process.stdout.write(`Fetching cover for "${meta.titleEn}"… `);
    const coverImageUrl = await fetchCover(meta.titleEn, meta.type);
    console.log(coverImageUrl ? '✓' : '(not found)');

    // Write title
    await ddb.send(new PutCommand({
      TableName: TITLES_TABLE,
      Item: {
        ...meta,
        coverImageUrl,
        criticScore,
        userScore,
        reviewCount,
        titleEnLower: meta.titleEn.toLowerCase(),
        titleJaLower: (meta.titleJa || '').toLowerCase(),
      },
    }));
    console.log(`✓ Title: ${meta.titleEn} — critic:${criticScore ?? '—'} user:${userScore ?? '—'} reviewCount:${reviewCount}`);

    // Write critic reviews
    for (let i = 0; i < criticRevs.length; i++) {
      const r = criticRevs[i];
      const createdAt = new Date(Date.now() - (i + 1) * 14 * 86_400_000).toISOString();
      await ddb.send(new PutCommand({
        TableName: REVIEWS_TABLE,
        Item: {
          titleId: meta.titleId,
          reviewId: randomUUID(),
          userId: `seed-critic-${i}`,
          source: 'critic',
          granularity: 'series',
          score: r.score,
          bodyEn: r.bodyEn,
          bodyJa: r.bodyJa,
          language: 'en',
          createdAt,
        },
      }));
      console.log(`  ✓ Critic review score=${r.score}`);
    }

    // Write user reviews
    for (let i = 0; i < userRevs.length; i++) {
      const r = userRevs[i];
      const createdAt = new Date(Date.now() - (i + 1) * 5 * 86_400_000).toISOString();
      await ddb.send(new PutCommand({
        TableName: REVIEWS_TABLE,
        Item: {
          titleId: meta.titleId,
          reviewId: randomUUID(),
          userId: `seed-user-${i}`,
          source: 'user',
          granularity: 'series',
          score: r.score,
          bodyEn: r.bodyEn,
          bodyJa: r.bodyJa,
          language: 'en',
          displayName: r.displayName,
          createdAt,
        },
      }));
      console.log(`  ✓ User review score=${r.score} (${r.displayName})`);
    }

    console.log('');
  }

  console.log('Seed complete.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
