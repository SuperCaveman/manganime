import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { titles as titlesApi } from '../api/client';
import { getCurrentUser } from '../auth/cognito';
import ScoreBadge from '../components/ScoreBadge';

const GENRES = ['Action', 'Drama', 'Fantasy', 'Historical', 'Horror', 'Romance', 'Sci-Fi', 'Shounen', 'Slice of Life', 'Thriller'];

function scoreColor(s) {
  if (s >= 86) return '#22C55E';
  if (s >= 41) return '#FACC15';
  return '#EF4444';
}

// ── Step 1: search ────────────────────────────────────────────────────────────

function SearchStep({ onSelect, onCreateNew }) {
  const { i18n } = useTranslation();
  const isJa = i18n.language === 'ja';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);

  const runSearch = useCallback((q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    titlesApi.search(q)
      .then((res) => setResults(res.data.items || []))
      .catch(console.error)
      .finally(() => setSearching(false));
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q), 300);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={handleChange}
          placeholder="Search anime or manga title…"
          className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500 text-base pr-10"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {results.map((title) => {
            const displayTitle = isJa && title.titleJa ? title.titleJa : title.titleEn;
            return (
              <button
                key={title.titleId}
                onClick={() => onSelect(title)}
                className="w-full flex items-center gap-3 p-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-purple-600 rounded-xl transition-colors text-left"
              >
                <div className="w-10 h-14 shrink-0 rounded overflow-hidden bg-gray-800">
                  {title.coverImageUrl ? (
                    <img src={title.coverImageUrl} alt={displayTitle} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600">
                      {title.type === 'anime' ? '🎬' : '📖'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{displayTitle}</p>
                  <p className="text-xs text-gray-500">
                    {title.type?.toUpperCase()} · {title.year || '—'}
                  </p>
                </div>
                <ScoreBadge score={title.criticScore} />
              </button>
            );
          })}
        </div>
      )}

      {/* No results prompt */}
      {query.trim().length > 1 && !searching && results.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center space-y-3">
          <p className="text-gray-400 text-sm">
            No results for <span className="text-white font-semibold">"{query}"</span>
          </p>
          <button
            onClick={() => onCreateNew(query)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
          >
            + Add "{query}" to MangaCritic
          </button>
        </div>
      )}
    </div>
  );
}

// ── Step 2: write review ──────────────────────────────────────────────────────

function ReviewForm({ title, user, onBack, onDone }) {
  const { i18n, t } = useTranslation();
  const isJa = i18n.language === 'ja';
  const displayTitle = isJa && title.titleJa ? title.titleJa : title.titleEn;
  const [score, setScore] = useState(70);
  const [body, setBody] = useState('');
  const [language, setLanguage] = useState(i18n.language === 'ja' ? 'ja' : 'en');
  const [granularity, setGranularity] = useState('series');
  const [seasonNumber, setSeasonNumber] = useState('');
  const [episodeNumber, setEpisodeNumber] = useState('');
  const [volumeNumber, setVolumeNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const bodyField = language === 'en' ? { bodyEn: body } : { bodyJa: body };
      await titlesApi.submitReview(title.titleId, {
        score: parseInt(score, 10),
        language,
        displayName: user?.username,
        granularity,
        ...(seasonNumber && (granularity === 'season' || granularity === 'episode') && { seasonNumber: parseInt(seasonNumber, 10) }),
        ...(episodeNumber && granularity === 'episode' && { episodeNumber: parseInt(episodeNumber, 10) }),
        ...(volumeNumber && granularity === 'volume' && { volumeNumber: parseInt(volumeNumber, 10) }),
        ...bodyField,
      });
      onDone(title.titleId);
    } catch (err) {
      console.error(err);
      setError(t('errors.submit'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Title header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-800">
        {title.coverImageUrl && (
          <img src={title.coverImageUrl} alt={displayTitle} className="w-10 h-14 object-cover rounded-lg shrink-0" />
        )}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{title.type}</p>
          <p className="font-bold text-white">{displayTitle}</p>
          {title.year && <p className="text-xs text-gray-500">{title.year}</p>}
        </div>
        <button type="button" onClick={onBack} className="ml-auto text-xs text-gray-500 hover:text-gray-300">
          ← Change
        </button>
      </div>

      {/* Score slider */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">{t('review.score')}</label>
        <div className="flex items-center gap-4">
          <input
            type="range" min="0" max="100"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="flex-1 accent-purple-500"
          />
          <span
            className="text-2xl font-bold w-12 text-right tabular-nums"
            style={{ color: scoreColor(parseInt(score)) }}
          >
            {score}
          </span>
        </div>
      </div>

      {/* Language */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">{t('review.language')}</label>
        <div className="flex gap-2">
          {['en', 'ja'].map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLanguage(l)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                language === l ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {l === 'en' ? 'English' : '日本語'}
            </button>
          ))}
        </div>
      </div>

      {/* Granularity */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">{t('review.granularity')}</label>
        <div className="flex flex-wrap gap-2">
          {(title.type === 'anime' ? ['series', 'season', 'episode', 'movie'] : ['series', 'volume']).map((g) => (
            <button key={g} type="button"
              onClick={() => setGranularity(g)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${granularity === g ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
            >
              {t(`review.gran_${g}`)}
            </button>
          ))}
        </div>
        {(granularity === 'season' || granularity === 'episode') && (
          <div className="flex gap-3 mt-2">
            <input type="number" min="1" placeholder={t('review.season_number')}
              value={seasonNumber} onChange={(e) => setSeasonNumber(e.target.value)} required
              className="w-36 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
            />
            {granularity === 'episode' && (
              <input type="number" min="1" placeholder={t('review.episode_number')}
                value={episodeNumber} onChange={(e) => setEpisodeNumber(e.target.value)} required
                className="w-36 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
              />
            )}
          </div>
        )}
        {granularity === 'volume' && (
          <input type="number" min="1" placeholder={t('review.volume_number')}
            value={volumeNumber} onChange={(e) => setVolumeNumber(e.target.value)} required
            className="mt-2 w-36 bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
          />
        )}
      </div>

      {/* Body */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">{t('review.body')}</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={5}
          placeholder={language === 'en' ? 'Write your review…' : 'レビューを書いてください…'}
          className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : t('review.submit_btn')}
      </button>
    </form>
  );
}

// ── Step 3: create new title + review ────────────────────────────────────────

function CreateTitleForm({ initialName, onBack, onTitleCreated }) {
  const { i18n } = useTranslation();
  const [form, setForm] = useState({
    titleEn: initialName || '',
    titleJa: '',
    type: 'anime',
    studio: '',
    year: '',
    genres: [],
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const toggleGenre = (g) =>
    setForm((f) => ({
      ...f,
      genres: f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g],
    }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const res = await titlesApi.create({
        ...form,
        year: form.year ? parseInt(form.year, 10) : null,
      });
      onTitleCreated(res.data);
    } catch (err) {
      console.error(err);
      setError('Failed to create title. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-800">
        <button type="button" onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">← Back</button>
        <h3 className="font-bold text-white">Add New Title</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">English Title *</label>
          <input
            value={form.titleEn}
            onChange={set('titleEn')}
            required
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Japanese Title</label>
          <input
            value={form.titleJa}
            onChange={set('titleJa')}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Studio / Author</label>
          <input
            value={form.studio}
            onChange={set('studio')}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Year</label>
          <input
            type="number"
            value={form.year}
            onChange={set('year')}
            min="1900"
            max={new Date().getFullYear()}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
          />
        </div>
      </div>

      {/* Type */}
      <div>
        <label className="block text-xs text-gray-400 mb-2">Type *</label>
        <div className="flex gap-2">
          {['anime', 'manga'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: t }))}
              className={`px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors ${
                form.type === t ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Genres */}
      <div>
        <label className="block text-xs text-gray-400 mb-2">Genres</label>
        <div className="flex flex-wrap gap-2">
          {GENRES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => toggleGenre(g)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                form.genres.includes(g)
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-500">Cover art will be fetched automatically from AniList.</p>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={creating}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {creating ? 'Creating…' : 'Create Title & Continue →'}
      </button>
    </form>
  );
}

// ── Success ───────────────────────────────────────────────────────────────────

function SuccessScreen({ titleId, onAnother, onView }) {
  return (
    <div className="text-center py-10 space-y-4">
      <div className="text-5xl">🎉</div>
      <h3 className="text-xl font-bold text-white">Review posted!</h3>
      <p className="text-gray-400 text-sm">Your score has been added to the aggregate.</p>
      <div className="flex justify-center gap-3 pt-2">
        <button
          onClick={onView}
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
        >
          View Title
        </button>
        <button
          onClick={onAnother}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-5 py-2 rounded-lg transition-colors text-sm"
        >
          Post Another
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PostReview() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // step: 'search' | 'review' | 'create' | 'done'
  const [step, setStep] = useState('search');
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [initialName, setInitialName] = useState('');
  const [doneTitleId, setDoneTitleId] = useState(null);

  useEffect(() => {
    getCurrentUser()
      .then((u) => { setUser(u); setAuthChecked(true); })
      .catch(() => setAuthChecked(true));
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (authChecked && !user) navigate('/login');
  }, [authChecked, user, navigate]);

  if (!authChecked) return null;

  const reset = () => {
    setStep('search');
    setSelectedTitle(null);
    setInitialName('');
    setDoneTitleId(null);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Post a Review</h1>
        <p className="text-gray-400 text-sm">
          Rate an existing title or add a new one to MangaCritic.
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        {step === 'search' && (
          <SearchStep
            onSelect={(title) => { setSelectedTitle(title); setStep('review'); }}
            onCreateNew={(name) => { setInitialName(name); setStep('create'); }}
          />
        )}

        {step === 'review' && selectedTitle && (
          <ReviewForm
            title={selectedTitle}
            user={user}
            onBack={() => setStep('search')}
            onDone={(titleId) => { setDoneTitleId(titleId); setStep('done'); }}
          />
        )}

        {step === 'create' && (
          <CreateTitleForm
            initialName={initialName}
            onBack={() => setStep('search')}
            onTitleCreated={(title) => { setSelectedTitle(title); setStep('review'); }}
          />
        )}

        {step === 'done' && (
          <SuccessScreen
            titleId={doneTitleId}
            onAnother={reset}
            onView={() => navigate(`/title/${doneTitleId}`)}
          />
        )}
      </div>
    </div>
  );
}
