import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { titles as titlesApi } from '../api/client';
import { getCurrentUser } from '../auth/cognito';
import ScoreBadge from '../components/ScoreBadge';

const GENRES = ['Action', 'Drama', 'Fantasy', 'Historical', 'Horror', 'Romance', 'Sci-Fi', 'Shounen', 'Slice of Life', 'Thriller'];

function scoreColor(s) {
  if (s >= 61) return '#22C55E';
  if (s >= 40) return '#FACC15';
  return '#EF4444';
}

// ── Jikan helpers ─────────────────────────────────────────────────────────────

function mapAnime(item) {
  return {
    malId: item.mal_id,
    titleEn: item.title_english || item.title,
    titleJa: item.title_japanese || '',
    type: 'anime',
    year: item.year || item.aired?.prop?.from?.year || null,
    genres: item.genres?.map((g) => g.name) || [],
    studio: item.studios?.[0]?.name || '',
    coverImageUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
    trailerYoutubeId: (() => { const t = item.trailer; const m = t?.embed_url?.match(/embed\/([^?]+)/); return t?.youtube_id || (m ? m[1] : null); })(),
    episodes: item.episodes || null,
    status: item.status || '',
  };
}

function mapManga(item) {
  return {
    malId: item.mal_id,
    titleEn: item.title_english || item.title,
    titleJa: item.title_japanese || '',
    type: 'manga',
    year: item.published?.prop?.from?.year || null,
    genres: item.genres?.map((g) => g.name) || [],
    studio: item.authors?.[0]?.name || '',
    coverImageUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
    volumes: item.volumes || null,
    status: item.status || '',
  };
}

// ── Step 1: search ────────────────────────────────────────────────────────────

function SearchStep({ onSelect, onCreateNew, initialQuery = '' }) {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language === 'ja';
  const [query, setQuery] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState('all');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selecting, setSelecting] = useState(null); // malId currently being loaded
  const timerRef = useRef(null);

  const runSearch = useCallback(async (q, type) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const fetches = [];
      if (type === 'all' || type === 'anime') {
        fetches.push(
          fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=10&sfw`)
            .then((r) => r.json()).then((d) => (d.data || []).map(mapAnime)).catch(() => [])
        );
      }
      if (type === 'all' || type === 'manga') {
        fetches.push(
          fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(q)}&limit=10&sfw`)
            .then((r) => r.json()).then((d) => (d.data || []).map(mapManga)).catch(() => [])
        );
      }
      const arrays = await Promise.all(fetches);
      setResults(arrays.flat());
    } catch (err) {
      console.error('Jikan search error:', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q, typeFilter), 400);
  };

  const handleTypeChange = (type) => {
    setTypeFilter(type);
    if (query.trim()) runSearch(query, type);
  };

  const handleSelect = async (jikanTitle) => {
    setSelecting(jikanTitle.malId);
    try {
      const res = await titlesApi.create({
        titleEn: jikanTitle.titleEn,
        titleJa: jikanTitle.titleJa,
        type: jikanTitle.type,
        genres: jikanTitle.genres,
        studio: jikanTitle.studio,
        year: jikanTitle.year,
        coverImageUrl: jikanTitle.coverImageUrl,
        malId: jikanTitle.malId,
        ...(jikanTitle.trailerYoutubeId && { trailerYoutubeId: jikanTitle.trailerYoutubeId }),
      });
      onSelect(res.data);
    } catch (err) {
      console.error('Find-or-create failed:', err);
      setSelecting(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <input
          autoFocus
          type="text"
          value={query}
          onChange={handleChange}
          placeholder={t('review.search_placeholder')}
          className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500 text-base pr-10"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Type filter */}
      <div className="flex gap-2">
        {['all', 'anime', 'manga'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => handleTypeChange(t)}
            className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-colors ${
              typeFilter === t ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {results.map((title) => {
            const displayTitle = isJa && title.titleJa ? title.titleJa : title.titleEn;
            const meta = [
              title.type === 'anime'
                ? `<span class="text-blue-400">ANIME</span>`
                : `<span class="text-orange-400">MANGA</span>`,
              title.year,
              title.studio,
              title.episodes ? `${title.episodes} ep` : null,
              title.volumes ? `${title.volumes} vol` : null,
            ].filter(Boolean);
            const isLoading = selecting === title.malId;
            return (
              <button
                key={`${title.type}-${title.malId}`}
                onClick={() => handleSelect(title)}
                disabled={selecting !== null}
                className="w-full flex items-center gap-3 p-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-purple-600 rounded-xl transition-colors text-left disabled:opacity-60"
              >
                <div className="w-10 h-14 shrink-0 rounded overflow-hidden bg-gray-800">
                  {title.coverImageUrl ? (
                    <img src={title.coverImageUrl} alt={displayTitle} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-lg">
                      {title.type === 'anime' ? '🎬' : '📖'}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{displayTitle}</p>
                  {isJa && title.titleEn && (
                    <p className="text-xs text-gray-600 truncate">{title.titleEn}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-0.5">
                    <span className={`text-xs font-semibold ${title.type === 'anime' ? 'text-blue-400' : 'text-orange-400'}`}>
                      {title.type.toUpperCase()}
                    </span>
                    {title.year && <span className="text-xs text-gray-500">· {title.year}</span>}
                    {title.studio && <span className="text-xs text-gray-500">· {title.studio}</span>}
                    {title.episodes && <span className="text-xs text-gray-600">· {title.episodes} ep</span>}
                    {title.volumes && <span className="text-xs text-gray-600">· {title.volumes} vol</span>}
                  </div>
                </div>
                {isLoading && (
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* No results */}
      {query.trim().length > 1 && !searching && results.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center space-y-3">
          <p className="text-gray-400 text-sm">
            {t('review.no_results', { query })}
          </p>
          <button
            onClick={() => onCreateNew(query)}
            className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
          >
            + {t('review.add_title', { query })}
          </button>
        </div>
      )}

      {/* Add option when results exist but title isn't listed */}
      {query.trim().length > 1 && !searching && results.length > 0 && (
        <div className="flex items-center justify-between pt-1 px-1">
          <p className="text-xs text-gray-600">{t('review.not_listed')}</p>
          <button
            onClick={() => onCreateNew(query)}
            className="text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
          >
            + {t('review.add_manually', { query })}
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
          {t('review.change_title')}
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
          placeholder={t('review.body')}
          className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 border border-gray-700 focus:outline-none focus:border-purple-500 resize-none"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {submitting ? t('review.submitting') : t('review.submit_btn')}
      </button>
    </form>
  );
}

// ── Step 3: create new title + review ────────────────────────────────────────

function CreateTitleForm({ initialName, onBack, onTitleCreated }) {
  const { t, i18n } = useTranslation();
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
      setError(t('errors.create_title'));
    } finally {
      setCreating(false);
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-gray-800">
        <button type="button" onClick={onBack} className="text-gray-500 hover:text-gray-300 text-sm">{t('review.back')}</button>
        <h3 className="font-bold text-white">{t('review.add_new_title')}</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t('review.label_english_title')} *</label>
          <input
            value={form.titleEn}
            onChange={set('titleEn')}
            required
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t('review.label_japanese_title')}</label>
          <input
            value={form.titleJa}
            onChange={set('titleJa')}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t('review.label_studio')}</label>
          <input
            value={form.studio}
            onChange={set('studio')}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">{t('review.label_year')}</label>
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
        <label className="block text-xs text-gray-400 mb-2">{t('review.label_type')} *</label>
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
        <label className="block text-xs text-gray-400 mb-2">{t('review.label_genres')}</label>
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

      <p className="text-xs text-gray-500">{t('review.cover_help')}</p>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={creating}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 rounded-xl transition-colors disabled:opacity-50"
      >
        {creating ? t('review.submitting') : t('review.create_continue')}
      </button>
    </form>
  );
}

// ── Success ───────────────────────────────────────────────────────────────────

function SuccessScreen({ titleId, onAnother, onView }) {
  const { t } = useTranslation();
  return (
    <div className="text-center py-10 space-y-4">
      <div className="text-5xl">🎉</div>
      <h3 className="text-xl font-bold text-white">{t('review.success_title')}</h3>
      <p className="text-gray-400 text-sm">{t('review.success_body')}</p>
      <div className="flex justify-center gap-3 pt-2">
        <button
          onClick={onView}
          className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-5 py-2 rounded-lg transition-colors text-sm"
        >
          {t('review.view_title')}
        </button>
        <button
          onClick={onAnother}
          className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-5 py-2 rounded-lg transition-colors text-sm"
        >
          {t('review.post_another')}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PostReview() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const preselected = location.state?.preselectedTitle ?? null;
  // pendingTitle: raw calendar item not yet in DynamoDB — created after auth confirms
  const pending = location.state?.pendingTitle ?? null;

  // step: 'search' | 'loading' | 'review' | 'create' | 'done'
  const [step, setStep] = useState(() => {
    if (preselected) return 'review';
    if (pending) return 'loading';
    return 'search';
  });
  const [selectedTitle, setSelectedTitle] = useState(preselected);
  const [initialName, setInitialName] = useState('');
  const [doneTitleId, setDoneTitleId] = useState(null);
  const [pendingError, setPendingError] = useState('');

  useEffect(() => {
    getCurrentUser()
      .then((u) => { setUser(u); setAuthChecked(true); })
      .catch(() => setAuthChecked(true));
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (authChecked && !user) navigate('/login');
  }, [authChecked, user, navigate]);

  // Once auth confirmed, ingest the pending calendar title via find-or-create
  useEffect(() => {
    if (!authChecked || !user || !pending || preselected) return;
    titlesApi.create({
      titleEn: pending.titleEn,
      titleJa: pending.titleJa || '',
      type: pending.type || 'anime',
      ...(pending.malId && { malId: pending.malId }),
      ...(pending.coverImageUrl && { coverImageUrl: pending.coverImageUrl }),
    })
      .then((res) => {
        setSelectedTitle(res.data);
        setStep('review');
      })
      .catch(() => {
        // Creation failed — fall back to search pre-filled with the title name
        setInitialName(pending.titleEn || '');
        setPendingError(t('errors.create_title'));
        setStep('search');
      });
  }, [authChecked, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!authChecked) return null;

  const reset = () => {
    setStep('search');
    setSelectedTitle(null);
    setInitialName('');
    setDoneTitleId(null);
    setPendingError('');
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">{t('review.page_title')}</h1>
        <p className="text-gray-400 text-sm">{t('review.page_subtitle')}</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        {step === 'loading' && (
          <div className="flex flex-col items-center gap-4 py-10">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400">{t('review.submitting')}</p>
          </div>
        )}

        {step === 'search' && (
          <>
            {pendingError && (
              <p className="text-red-400 text-sm mb-4">{pendingError}</p>
            )}
            <SearchStep
              initialQuery={initialName}
              onSelect={(title) => { setSelectedTitle(title); setStep('review'); }}
              onCreateNew={(name) => { setInitialName(name); setStep('create'); }}
            />
          </>
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
