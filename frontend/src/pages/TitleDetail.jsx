import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ScoreBadge from '../components/ScoreBadge';
import ReviewCard from '../components/ReviewCard';
import { titles as titlesApi } from '../api/client';
import { useAuth } from '../auth/AuthContext';

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
    return <p className="text-center text-gray-500 py-24">Title not found.</p>;
  }

  const displayTitle = lang === 'ja' && title.titleJa ? title.titleJa : title.titleEn;
  const altTitle = lang === 'ja' ? title.titleEn : title.titleJa;
  const criticReviews = reviews.filter((r) => r.source === 'critic');
  const userReviews = reviews.filter((r) => r.source === 'user');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex gap-6 mb-8">
        <div className="w-36 md:w-44 shrink-0">
          {title.coverImageUrl ? (
            <img
              src={title.coverImageUrl}
              alt={displayTitle}
              className="w-full rounded-xl shadow-xl"
            />
          ) : (
            <div className="w-full aspect-[3/4] bg-gray-800 rounded-xl flex flex-col items-center justify-center gap-3 text-5xl">
              <span>{title.type === 'anime' ? '🎬' : '📖'}</span>
              <button
                onClick={async () => {
                  setFetchingCover(true);
                  try {
                    const res = await titlesApi.fetchCover(titleId);
                    if (res.data.coverImageUrl) {
                      setTitle((t) => ({ ...t, coverImageUrl: res.data.coverImageUrl }));
                    }
                  } catch (err) {
                    console.error(err);
                  } finally {
                    setFetchingCover(false);
                  }
                }}
                disabled={fetchingCover}
                className="text-xs font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {fetchingCover ? 'Fetching…' : 'Fetch Cover'}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                title.type === 'anime'
                  ? 'bg-blue-900 text-blue-200'
                  : 'bg-orange-900 text-orange-200'
              }`}
            >
              {lang === 'ja'
                ? title.type === 'anime' ? 'アニメ' : 'マンガ'
                : title.type?.toUpperCase()}
            </span>
            {title.year && (
              <span className="text-gray-500 text-sm">{title.year}</span>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">{displayTitle}</h1>
          {altTitle && <p className="text-gray-400 mb-1">{altTitle}</p>}
          {title.studio && (
            <p className="text-gray-500 text-sm mb-3">{title.studio}</p>
          )}

          {title.genres?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {title.genres.map((g) => (
                <span
                  key={g}
                  className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full"
                >
                  {g}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-end gap-6">
            <ScoreBadge score={title.criticScore} label={t('scores.critic')} size="lg" />
            <ScoreBadge score={title.userScore} label={t('scores.user')} size="lg" />
            {title.reviewCount > 0 && (
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold text-gray-300 tabular-nums">
                  {title.reviewCount}
                </span>
                <span className="text-xs text-gray-500">{t('scores.reviews')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Per-season / per-volume scores */}
      {granularScores.length > 0 && (
        <section className="mb-6">
          <h2 className="text-base font-bold text-gray-200 mb-3 uppercase tracking-wide">
            {title.type === 'anime' ? t('scores.season_scores') : t('scores.volume_scores')}
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {granularScores.map((row) => {
              const label = title.type === 'anime'
                ? `${t('scores.season')} ${row.seasonNumber}`
                : `${t('scores.volume')} ${row.volumeNumber}`;
              return (
                <div key={row.seasonNumber ?? row.volumeNumber}
                  className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <span className="text-xs text-gray-400 font-medium truncate">{label}</span>
                  <div className="flex gap-1.5 shrink-0">
                    <ScoreBadge score={row.criticScore} size="sm" />
                    <ScoreBadge score={row.userScore} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Submit review CTA */}
      {!user && (
        <div className="mb-6 flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-5 py-4">
          <span className="text-gray-400 text-sm">Want to rate this?</span>
          <a href="/login" className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors">
            Log in to review
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

      {/* Review form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8 space-y-4"
        >
          <h3 className="font-semibold text-lg">{t('review.submit')}</h3>

          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('review.score')}</label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min="0"
                max="100"
                value={form.score}
                onChange={(e) => setForm((f) => ({ ...f, score: e.target.value }))}
                className="flex-1 accent-purple-500"
              />
              <span
                className="font-bold text-xl w-10 text-right tabular-nums"
                style={{
                  color: form.score >= 86 ? '#22C55E' : form.score >= 41 ? '#FACC15' : '#EF4444',
                }}
              >
                {form.score}
              </span>
            </div>
          </div>

          {/* Granularity */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">{t('review.granularity')}</label>
            <div className="flex flex-wrap gap-2">
              {title.type === 'anime'
                ? ['series', 'season', 'episode', 'movie'].map((g) => (
                    <button key={g} type="button"
                      onClick={() => setForm((f) => ({ ...f, granularity: g }))}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${form.granularity === g ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    >
                      {t(`review.gran_${g}`)}
                    </button>
                  ))
                : ['series', 'volume'].map((g) => (
                    <button key={g} type="button"
                      onClick={() => setForm((f) => ({ ...f, granularity: g }))}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${form.granularity === g ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                    >
                      {t(`review.gran_${g}`)}
                    </button>
                  ))
              }
            </div>
            {/* Conditional number inputs */}
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
              required
              rows={4}
              className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none"
            />
          </div>

          {submitError && <p className="text-red-400 text-sm">{submitError}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
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

      {/* Critic reviews */}
      {criticReviews.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-bold text-gray-200 mb-3">{t('review.critic_reviews')}</h2>
          <div className="space-y-3">
            {criticReviews.map((r) => (
              <ReviewCard key={r.reviewId} review={r} titleId={titleId} currentUserId={user?.userId} currentUsername={user?.username} />
            ))}
          </div>
        </section>
      )}

      {/* User reviews */}
      <section>
        <h2 className="text-lg font-bold text-gray-200 mb-3">{t('review.user_reviews')}</h2>
        {userReviews.length === 0 ? (
          <p className="text-gray-500 py-4">{t('review.no_reviews')}</p>
        ) : (
          <div className="space-y-3">
            {userReviews.map((r) => (
              <ReviewCard
                key={r.reviewId}
                review={r}
                titleId={titleId}
                currentUserId={user?.userId}
                currentUsername={user?.username}
                onDeleted={(id) => setReviews((prev) => prev.filter((x) => x.reviewId !== id))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
