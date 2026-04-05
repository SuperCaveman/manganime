import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { updateUsername } from '../auth/cognito';
import { me as meApi, titles as titlesApi, reviews as reviewsApi } from '../api/client';

function scoreColor(score) {
  if (score >= 86) return '#22C55E';
  if (score >= 41) return '#FACC15';
  return '#EF4444';
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { user, refresh, setUser } = useAuth();

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [reviews, setReviews] = useState([]);
  const [titlesMap, setTitlesMap] = useState({});
  const [loadingReviews, setLoadingReviews] = useState(true);

  // Redirect if not logged in
  useEffect(() => {
    if (user === null) navigate('/login');
  }, [user, navigate]);

  // Load user's reviews + all titles (for name lookup)
  useEffect(() => {
    if (!user) return;
    setLoadingReviews(true);
    Promise.all([
      meApi.getReviews(),
      titlesApi.list({ limit: 100 }),
    ])
      .then(([reviewsRes, titlesRes]) => {
        setReviews(reviewsRes.data.items || []);
        const map = {};
        (titlesRes.data.items || []).forEach((t) => { map[t.titleId] = t; });
        setTitlesMap(map);
      })
      .catch(console.error)
      .finally(() => setLoadingReviews(false));
  }, [user]);

  if (user === undefined || user === null) return null;

  const initial = user.username[0]?.toUpperCase() || 'U';

  const handleSaveName = async () => {
    if (!nameInput.trim()) return;
    setNameSaving(true);
    try {
      await updateUsername(nameInput.trim());
      setUser((prev) => ({ ...prev, username: nameInput.trim() }));
      setNameSaved(true);
      setEditingName(false);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (err) {
      console.error('Failed to update username:', err);
    } finally {
      setNameSaving(false);
    }
  };

  const handleDeleteReview = async (reviewId, titleId) => {
    try {
      await reviewsApi.remove(titleId, reviewId);
      setReviews((prev) => prev.filter((r) => r.reviewId !== reviewId));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const lang = i18n.language;

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* ── Profile header ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-center gap-5">
        <div className="w-16 h-16 rounded-full bg-purple-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                maxLength={30}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                className="bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-purple-500 text-sm"
              />
              <button
                onClick={handleSaveName}
                disabled={nameSaving}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {nameSaving ? '…' : t('profile.save')}
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="text-gray-500 hover:text-gray-300 text-sm px-2"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-white truncate">{user.username}</h1>
              {nameSaved && <span className="text-xs text-green-400">{t('profile.saved')}</span>}
              <button
                onClick={() => { setNameInput(user.username); setEditingName(true); }}
                className="text-gray-500 hover:text-purple-400 transition-colors"
                title={t('profile.edit_username')}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>
        </div>
      </div>

      {/* ── My Reviews ── */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">
          {t('profile.my_reviews')}
          {reviews.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-500">({reviews.length})</span>
          )}
        </h2>

        {loadingReviews ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-gray-900 border border-gray-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center">
            <p className="text-gray-500 text-sm mb-3">{t('profile.no_reviews')}</p>
            <Link
              to="/post"
              className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              {t('nav.post_review')}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => {
              const title = titlesMap[review.titleId];
              const displayTitle = lang === 'ja' && title?.titleJa ? title.titleJa : (title?.titleEn || review.titleId);
              const body = lang === 'ja'
                ? (review.bodyJa || review.bodyEn)
                : (review.bodyEn || review.bodyJa);
              return (
                <div key={review.reviewId} className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex gap-4">
                  {/* Cover */}
                  {title?.coverImageUrl && (
                    <img
                      src={title.coverImageUrl}
                      alt={displayTitle}
                      className="w-10 h-14 object-cover rounded-lg shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <Link
                        to={`/title/${review.titleId}`}
                        className="text-sm font-semibold text-white hover:text-purple-300 transition-colors truncate"
                      >
                        {displayTitle}
                      </Link>
                      <span
                        className="text-sm font-bold tabular-nums shrink-0"
                        style={{ color: scoreColor(review.score) }}
                      >
                        {review.score}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed mb-2">{body}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-600">
                        {new Date(review.createdAt).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US')}
                      </span>
                      <button
                        onClick={() => handleDeleteReview(review.reviewId, review.titleId)}
                        className="text-xs text-gray-600 hover:text-red-400 transition-colors"
                      >
                        {t('review.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Notifications ── */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">{t('profile.notifications')}</h2>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center shrink-0 text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">{t('profile.notifications_soon')}</p>
        </div>
      </section>

    </div>
  );
}
