import { useState, useCallback, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ScoreBadge from '../components/ScoreBadge';
import ReviewCard from '../components/ReviewCard';
import { titles as titlesApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';

// ── Score helpers ─────────────────────────────────────────────────────────────

function roundedAvg(nums) {
  if (!nums.length) return null;
  return Math.round(nums.reduce((s, x) => s + x, 0) / nums.length);
}

function partitionBySrc(reviews) {
  return {
    critics: reviews.filter((r) => r.source === 'critic' || r.source === 'critic-external'),
    users:   reviews.filter((r) => r.source === 'user'),
  };
}

function aggregateScores(reviews) {
  const { critics, users } = partitionBySrc(reviews);
  return {
    criticScore: roundedAvg(critics.map((r) => r.score)),
    userScore:   roundedAvg(users.map((r) => r.score)),
    criticCount: critics.length,
    userCount:   users.length,
  };
}

// ── MiniScoreRow ──────────────────────────────────────────────────────────────

function MiniScoreRow({ criticScore, userScore, criticCount, userCount }) {
  const { t } = useTranslation();
  if (!criticCount && !userCount) return null;
  return (
    <div className="flex items-end gap-4 mb-5">
      {criticCount > 0 && (
        <div className="flex flex-col items-center gap-1">
          <ScoreBadge score={criticScore} nullLabel="NR" />
          <span className="text-xs text-gray-500">{t('scores.critic')}</span>
          <span className="text-xs text-gray-600">
            {t('scores.based_on', { count: criticCount })}
          </span>
        </div>
      )}
      {userCount > 0 && (
        <div className="flex flex-col items-center gap-1">
          <ScoreBadge score={userScore} nullLabel="NR" />
          <span className="text-xs text-gray-500">{t('scores.user')}</span>
          <span className="text-xs text-gray-600">
            {t('scores.based_on', { count: userCount })}
          </span>
        </div>
      )}
    </div>
  );
}

// ── ReviewList — flat critic + user cards ─────────────────────────────────────

function ReviewList({ reviews, titleId, currentUserId, currentUsername, onDeleted }) {
  const { t } = useTranslation();
  const { critics, users } = partitionBySrc(reviews);
  if (!reviews.length) return null;
  return (
    <div className="space-y-5">
      {critics.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t('review.critic_reviews')}
          </p>
          <div className="space-y-3">
            {critics.map((r) => (
              <ReviewCard
                key={r.reviewId}
                review={r}
                titleId={titleId}
                currentUserId={currentUserId}
                currentUsername={currentUsername}
                onDeleted={onDeleted}
              />
            ))}
          </div>
          {critics.some((r) => r.source === 'critic-external') && (
            <p className="mt-3 text-xs text-gray-600 italic">
              {t('review.critic_disclaimer')}
            </p>
          )}
        </div>
      )}
      {users.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t('review.user_reviews')}
          </p>
          <div className="space-y-3">
            {users.map((r) => (
              <ReviewCard
                key={r.reviewId}
                review={r}
                titleId={titleId}
                currentUserId={currentUserId}
                currentUsername={currentUsername}
                onDeleted={onDeleted}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CollapsibleGroup — accordion row ─────────────────────────────────────────

function CollapsibleGroup({ label, criticScore, userScore, totalCount, reviews, titleId, currentUserId, currentUsername, onDeleted, defaultOpen = false }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-gray-900 hover:bg-gray-800/70 transition-colors text-left"
      >
        <span className="font-medium text-gray-200 text-sm">{label}</span>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex gap-1.5">
            {criticScore != null && <ScoreBadge score={criticScore} size="sm" />}
            {userScore != null && <ScoreBadge score={userScore} size="sm" />}
          </div>
          {totalCount > 0 && (
            <span className="text-xs text-gray-500 tabular-nums">
              {totalCount} {t('scores.reviews')}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="px-4 py-4 border-t border-gray-800 bg-gray-900/40">
          <ReviewList
            reviews={reviews}
            titleId={titleId}
            currentUserId={currentUserId}
            currentUsername={currentUsername}
            onDeleted={onDeleted}
          />
        </div>
      )}
    </div>
  );
}

// ── ReviewsSection — tabbed reviews ──────────────────────────────────────────

function ReviewsSection({ title, reviews, granularScores, titleId, currentUserId, currentUsername, onDeleted }) {
  const { t } = useTranslation();

  const gran = (r) => r.granularity || 'series';

  const seriesRevs  = reviews.filter((r) => gran(r) === 'series' || gran(r) === 'movie');
  const volumeRevs  = reviews.filter((r) => gran(r) === 'volume');
  const seasonRevs  = reviews.filter((r) => gran(r) === 'season');
  const episodeRevs = reviews.filter((r) => gran(r) === 'episode');

  // Build tab list — only include tabs that have reviews
  const tabs = ['series'];
  if (title.type === 'manga' && volumeRevs.length > 0)  tabs.push('volume');
  if (title.type === 'anime' && seasonRevs.length > 0)  tabs.push('season');
  if (title.type === 'anime' && episodeRevs.length > 0) tabs.push('episode');

  const [activeTab, setActiveTab] = useState('series');

  // If the active tab got removed (shouldn't happen but be safe), reset
  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab('series');
  }, [tabs.join(',')]); // eslint-disable-line

  const tabLabel = {
    series:  t('review.tab_series'),
    volume:  t('review.tab_volume'),
    season:  t('review.tab_season'),
    episode: t('review.tab_episode'),
  };

  // Scores for the active tab's header
  const tabAgg = {
    series:  aggregateScores(seriesRevs),
    volume:  aggregateScores(volumeRevs),
    season:  aggregateScores(seasonRevs),
    episode: aggregateScores(episodeRevs),
  };

  // ── group helpers ──────────────────────────────────────────────────────────

  function groupSortedBy(arr, key) {
    const map = new Map();
    for (const item of arr) {
      const k = item[key] ?? 0;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(item);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }

  // ── content per tab ────────────────────────────────────────────────────────

  function renderSeries() {
    if (!reviews.length) {
      return <p className="text-gray-500 py-4 text-sm">{t('review.no_reviews')}</p>;
    }
    return (
      <ReviewList
        reviews={seriesRevs}
        titleId={titleId}
        currentUserId={currentUserId}
        currentUsername={currentUsername}
        onDeleted={onDeleted}
      />
    );
  }

  function renderVolume() {
    const byVolume = groupSortedBy(volumeRevs, 'volumeNumber');
    return (
      <div className="space-y-2">
        {byVolume.map(([volNum, revs]) => {
          const precomp = granularScores.find((s) => s.volumeNumber === volNum);
          const scores = precomp ?? aggregateScores(revs);
          return (
            <CollapsibleGroup
              key={volNum}
              label={`${t('review.volume_label')} ${volNum}`}
              criticScore={scores.criticScore}
              userScore={scores.userScore}
              totalCount={revs.length}
              reviews={revs}
              titleId={titleId}
              currentUserId={currentUserId}
              currentUsername={currentUsername}
              onDeleted={onDeleted}
            />
          );
        })}
      </div>
    );
  }

  function renderSeason() {
    const bySeason = groupSortedBy(seasonRevs, 'seasonNumber');
    return (
      <div className="space-y-2">
        {bySeason.map(([snNum, revs]) => {
          const precomp = granularScores.find((s) => s.seasonNumber === snNum);
          const scores = precomp ?? aggregateScores(revs);
          return (
            <CollapsibleGroup
              key={snNum}
              label={`${t('review.season_label')} ${snNum}`}
              criticScore={scores.criticScore}
              userScore={scores.userScore}
              totalCount={revs.length}
              reviews={revs}
              titleId={titleId}
              currentUserId={currentUserId}
              currentUsername={currentUsername}
              onDeleted={onDeleted}
            />
          );
        })}
      </div>
    );
  }

  function renderEpisode() {
    // Group by season first, then by episode within each season
    const bySeason = groupSortedBy(episodeRevs, 'seasonNumber');
    return (
      <div className="space-y-4">
        {bySeason.map(([snNum, snRevs]) => {
          const byEpisode = groupSortedBy(snRevs, 'episodeNumber');
          return (
            <div key={snNum}>
              {/* Season divider header */}
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">
                {t('review.season_label')} {snNum}
              </p>
              <div className="space-y-2">
                {byEpisode.map(([epNum, epRevs]) => {
                  const { criticScore, userScore } = aggregateScores(epRevs);
                  return (
                    <CollapsibleGroup
                      key={epNum}
                      label={`${t('review.season_label')} ${snNum} ${t('review.episode_label')} ${epNum}`}
                      criticScore={criticScore}
                      userScore={userScore}
                      totalCount={epRevs.length}
                      reviews={epRevs}
                      titleId={titleId}
                      currentUserId={currentUserId}
                      currentUsername={currentUsername}
                      onDeleted={onDeleted}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const CONTENT = { series: renderSeries, volume: renderVolume, season: renderSeason, episode: renderEpisode };
  const agg = tabAgg[activeTab];

  return (
    <div>
      {/* Tab bar */}
      {tabs.length > 1 && (
        <div className="flex gap-1 mb-6 border-b border-gray-800">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-purple-500 text-white'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {tabLabel[tab]}
            </button>
          ))}
        </div>
      )}

      {/* Tab-level aggregate scores */}
      <MiniScoreRow
        criticScore={agg.criticScore}
        userScore={agg.userScore}
        criticCount={agg.criticCount}
        userCount={agg.userCount}
      />

      {/* Tab content */}
      {CONTENT[activeTab]?.()}
    </div>
  );
}

// ── TitleDetail ───────────────────────────────────────────────────────────────

export default function TitleDetail() {
  const { titleId } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [title, setTitle] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [granularScores, setGranularScores] = useState([]);
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    score: 70, body: '', language: lang,
    granularity: 'series', seasonNumber: '', episodeNumber: '', volumeNumber: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [fetchingCover, setFetchingCover] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    Promise.all([
      titlesApi.get(titleId),
      titlesApi.getReviews(titleId, { lang }),
      titlesApi.getSeasonScores(titleId),
      titlesApi.getVolumeScores(titleId),
    ])
      .then(([titleRes, reviewsRes, seasonRes, volumeRes]) => {
        const t = titleRes.data;
        setTitle(t);
        setReviews(reviewsRes.data.items || []);
        if (t.type === 'anime') setGranularScores(seasonRes.data.items || []);
        else if (t.type === 'manga') setGranularScores(volumeRes.data.items || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [titleId, lang]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);
    try {
      const bodyField = form.language === 'en' ? { bodyEn: form.body } : { bodyJa: form.body };
      const gran = form.granularity;
      await titlesApi.submitReview(titleId, {
        score: parseInt(form.score, 10),
        language: form.language,
        displayName: user?.username,
        granularity: gran,
        ...(form.seasonNumber && (gran === 'season' || gran === 'episode') && { seasonNumber: parseInt(form.seasonNumber, 10) }),
        ...(form.episodeNumber && gran === 'episode' && { episodeNumber: parseInt(form.episodeNumber, 10) }),
        ...(form.volumeNumber && gran === 'volume' && { volumeNumber: parseInt(form.volumeNumber, 10) }),
        ...bodyField,
      });
      setShowForm(false);
      setForm({ score: 70, body: '', language: lang, granularity: 'series', seasonNumber: '', episodeNumber: '', volumeNumber: '' });
      fetchData();
    } catch (err) {
      console.error(err);
      setSubmitError(t('errors.submit'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse space-y-6">
        <div className="flex gap-6">
          <div className="w-40 aspect-[3/4] bg-gray-800 rounded-xl" />
          <div className="flex-1 space-y-3">
            <div className="h-6 bg-gray-800 rounded w-2/3" />
            <div className="h-4 bg-gray-800 rounded w-1/3" />
            <div className="h-4 bg-gray-800 rounded w-1/4" />
          </div>
        </div>
        <div className="h-48 bg-gray-800 rounded-xl" />
      </div>
    );
  }

  if (!title) {
    return <p className="text-center text-gray-500 py-24">{t('title.not_found')}</p>;
  }

  const displayTitle = lang === 'ja' && title.titleJa ? title.titleJa : title.titleEn;
  const altTitle = lang === 'ja' ? title.titleEn : title.titleJa;
  const criticReviews = reviews.filter((r) => r.source === 'critic');
  const userReviews   = reviews.filter((r) => r.source === 'user');

  return (
    <div className="max-w-4xl mx-auto">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex gap-6 mb-8">
        <div className="w-36 md:w-44 shrink-0">
          {title.coverImageUrl ? (
            <img src={title.coverImageUrl} alt={displayTitle} className="w-full rounded-xl shadow-xl" />
          ) : (
            <div className="w-full aspect-[3/4] bg-gray-800 rounded-xl flex flex-col items-center justify-center gap-3 text-5xl">
              <span>{title.type === 'anime' ? '🎬' : '📖'}</span>
              <button
                onClick={async () => {
                  setFetchingCover(true);
                  try {
                    const res = await titlesApi.fetchCover(titleId);
                    if (res.data.coverImageUrl) setTitle((t) => ({ ...t, coverImageUrl: res.data.coverImageUrl }));
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setFetchingCover(false);
                  }
                }}
                disabled={fetchingCover}
                className="text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {fetchingCover ? t('title.fetching') : t('title.fetch_cover')}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              title.type === 'anime' ? 'bg-blue-900 text-blue-200' : 'bg-orange-900 text-orange-200'
            }`}>
              {lang === 'ja' ? (title.type === 'anime' ? 'アニメ' : 'マンガ') : title.type?.toUpperCase()}
            </span>
            {title.year && <span className="text-gray-500 text-sm">{title.year}</span>}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">{displayTitle}</h1>
          {altTitle && <p className="text-gray-400 mb-1">{altTitle}</p>}
          {title.studio && <p className="text-gray-500 text-sm mb-3">{title.studio}</p>}

          {title.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {title.genres.map((g) => (
                <span key={g} className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full">{g}</span>
              ))}
            </div>
          )}

          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center gap-1">
              <ScoreBadge score={title.criticScore} size="lg" nullLabel="NR" />
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{t('scores.critic_score')}</span>
              <span className="text-xs text-gray-500">
                {criticReviews.length > 0 ? t('scores.based_on', { count: criticReviews.length }) : t('scores.not_rated')}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <ScoreBadge score={title.userScore} size="lg" nullLabel="NR" />
              <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">{t('scores.audience_score')}</span>
              <span className="text-xs text-gray-500">
                {userReviews.length > 0 ? t('scores.based_on', { count: userReviews.length }) : t('scores.not_rated')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Amazon affiliate link ────────────────────────────────── */}
      {(() => {
        const q = encodeURIComponent(title.type === 'anime' ? `${title.titleEn} anime blu-ray` : `${title.titleEn} manga`);
        const href = `https://www.amazon.com/s?k=${q}&tag=${import.meta.env.VITE_AFFILIATE_TAG || 'thunderwolfdr-20'}`;
        const label = title.type === 'anime' ? t('title.buy_stream_amazon') : t('title.buy_manga_amazon');
        return (
          <div className="mb-6">
            <a href={href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 hover:bg-gray-800 border border-gray-700 hover:border-[#FF9900] text-gray-300 hover:text-[#FF9900] text-sm font-medium rounded-lg transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-[#FF9900] shrink-0">
                <path d="M13.958 10.09c0 1.232.029 2.256-.59 3.351-.502.891-1.301 1.438-2.186 1.438-1.214 0-1.922-.924-1.922-2.292 0-2.692 2.415-3.182 4.698-3.182v.685zm3.186 7.705c-.209.189-.512.201-.745.076C15.254 16.86 14.9 16.12 14.9 14.9c-1.23 1.25-2.098 1.626-3.697 1.626-1.886 0-3.355-1.164-3.355-3.494 0-1.82.983-3.056 2.384-3.66 1.216-.537 2.913-.633 4.222-.78V8.19c0-.55.043-1.2-.28-1.676-.285-.427-.826-.603-1.302-.603-.884 0-1.673.454-1.867 1.393-.04.208-.194.413-.405.424l-2.265-.244c-.19-.043-.402-.197-.347-.489C8.58 4.79 10.72 4 12.68 4c1.003 0 2.313.267 3.102 1.026C16.786 6.03 16.7 7.4 16.7 8.89v3.755c0 1.129.468 1.625.908 2.234.155.218.19.479-.01.64-.493.412-1.368 1.176-1.851 1.604l-.003-.002v-.326zM20.898 19.5c-2.023 1.498-4.957 2.295-7.484 2.295-3.541 0-6.73-1.31-9.143-3.49-.19-.171-.02-.405.208-.271 2.604 1.515 5.824 2.426 9.15 2.426 2.244 0 4.708-.465 6.978-1.429.342-.147.629.224.291.469z"/>
              </svg>
              {label}
            </a>
          </div>
        );
      })()}

      {/* ── Submit review CTA / form ─────────────────────────────── */}
      {!user && (
        <div className="mb-6 flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <span className="text-gray-400 text-sm">{t('title.want_to_rate')}</span>
          <a href="/login" className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
            {t('title.login_to_review')}
          </a>
        </div>
      )}
      {user && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="mb-6 bg-purple-600 hover:bg-purple-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
        >
          {t('review.submit')}
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 space-y-4">
          <h3 className="font-semibold text-lg">{t('review.submit')}</h3>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('review.score')}</label>
            <div className="flex items-center gap-4">
              <input
                type="range" min="0" max="100"
                value={form.score}
                onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                className="flex-1 accent-purple-500"
              />
              <span
                className="font-bold text-xl w-10 text-right tabular-nums"
                style={{ color: form.score >= 75 ? '#22C55E' : form.score >= 50 ? '#FACC15' : '#EF4444' }}
              >
                {form.score}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('review.granularity')}</label>
            <div className="flex flex-wrap gap-2">
              {(title.type === 'anime'
                ? ['series', 'season', 'episode', 'movie']
                : ['series', 'volume']
              ).map((g) => (
                <button key={g} type="button"
                  onClick={() => setForm((f) => ({ ...f, granularity: g }))}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    form.granularity === g ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {t(`review.gran_${g}`)}
                </button>
              ))}
            </div>
            {(form.granularity === 'season' || form.granularity === 'episode') && (
              <div className="flex gap-3 mt-2">
                <input
                  type="number" min="1" placeholder={t('review.season_number')}
                  value={form.seasonNumber}
                  onChange={(e) => setForm((f) => ({ ...f, seasonNumber: e.target.value }))}
                  required
                  className="w-36 bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                />
                {form.granularity === 'episode' && (
                  <input
                    type="number" min="1" placeholder={t('review.episode_number')}
                    value={form.episodeNumber}
                    onChange={(e) => setForm((f) => ({ ...f, episodeNumber: e.target.value }))}
                    required
                    className="w-36 bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
                  />
                )}
              </div>
            )}
            {form.granularity === 'volume' && (
              <input
                type="number" min="1" placeholder={t('review.volume_number')}
                value={form.volumeNumber}
                onChange={(e) => setForm((f) => ({ ...f, volumeNumber: e.target.value }))}
                required
                className="mt-2 w-36 bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
              />
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('review.language')}</label>
            <select
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              className="bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500"
            >
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('review.body')}</label>
            <textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              required rows={4}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          {submitError && <p className="text-red-400 text-sm">{submitError}</p>}

          <div className="flex gap-3">
            <button
              type="submit" disabled={submitting}
              className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-6 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? '…' : t('review.submit_btn')}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setSubmitError(''); }}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-6 py-2 rounded-lg transition-colors"
            >
              {t('review.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* ── Reviews section (tabbed) ─────────────────────────────── */}
      <ReviewsSection
        title={title}
        reviews={reviews}
        granularScores={granularScores}
        titleId={titleId}
        currentUserId={user?.userId}
        currentUsername={user?.username}
        onDeleted={(id) => setReviews((prev) => prev.filter((x) => x.reviewId !== id))}
      />

    </div>
  );
}
