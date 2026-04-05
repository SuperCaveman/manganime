import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TitleListItem from '../components/TitleListItem';
import ScoreBadge from '../components/ScoreBadge';
import { titles as titlesApi, news as newsApi, releases as releasesApi } from '../api/client';

function stripHtml(str) {
  return str ? str.replace(/<[^>]*>/g, '') : str;
}

// ── Section wrapper ──────────────────────────────────────────────────────────

function SectionHeader({ title, to }) {
  return (
    <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
      <h2 className="text-lg font-bold tracking-wide text-white uppercase">{title}</h2>
      {to && (
        <Link
          to={to}
          className="text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors uppercase tracking-wide"
        >
          See All →
        </Link>
      )}
    </div>
  );
}

// ── Skeletons ────────────────────────────────────────────────────────────────

function CardSkeleton() {
  return (
    <div className="w-44 shrink-0 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 animate-pulse">
      <div className="aspect-[3/4] bg-gray-800" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-gray-800 rounded w-3/4" />
        <div className="h-3 bg-gray-800 rounded w-1/2" />
      </div>
    </div>
  );
}

function ListSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 bg-gray-900 rounded-xl border border-gray-800 animate-pulse" />
      ))}
    </div>
  );
}

// ── Latest Trailers ───────────────────────────────────────────────────────────

const TRAILER_CACHE_KEY = 'mc_featured_trailer';
const TRAILER_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

function extractYoutubeId(trailer) {
  if (!trailer) return null;
  if (trailer.youtube_id) return trailer.youtube_id;
  const m = trailer.embed_url?.match(/embed\/([^?]+)/);
  return m ? m[1] : null;
}

function LatestTrailers() {
  const { t, i18n } = useTranslation();
  const isJa = i18n.language === 'ja';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Serve from cache if fresh (< 24 h)
    try {
      const cached = JSON.parse(localStorage.getItem(TRAILER_CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.fetchedAt < TRAILER_CACHE_TTL) {
        setData(cached.data);
        setLoading(false);
        return;
      }
    } catch {}

    async function load() {
      try {
        // Walk pages until we find a result with a trailer embed
        for (let page = 1; page <= 3; page++) {
          const res = await fetch(
            `https://api.jikan.moe/v4/anime?status=airing&order_by=popularity&sort=desc&limit=10&sfw&page=${page}`
          );
          const json = await res.json();
          for (const item of json.data || []) {
            const youtubeId = extractYoutubeId(item.trailer);
            if (!youtubeId) continue;
            const found = {
              youtubeId,
              titleEn: item.title_english || item.title,
              titleJa: item.title_japanese || '',
              studio: item.studios?.[0]?.name || '',
              synopsis: item.synopsis || '',
            };
            localStorage.setItem(TRAILER_CACHE_KEY, JSON.stringify({ data: found, fetchedAt: Date.now() }));
            setData(found);
            return;
          }
        }
      } catch (err) {
        console.error('Failed to fetch featured trailer:', err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const displayTitle = isJa && data?.titleJa ? data.titleJa : data?.titleEn;
  const synopsis = data?.synopsis?.length > 220
    ? data.synopsis.slice(0, 217) + '…'
    : data?.synopsis;

  return (
    <section>
      <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
        <h2 className="text-lg font-bold tracking-wide text-white uppercase">
          {t('home.trailers_title')}
        </h2>
      </div>

      {loading ? (
        <>
          <div className="w-full aspect-video bg-gray-900 rounded-xl border border-gray-800 animate-pulse" />
          <div className="mt-4 space-y-2">
            <div className="h-5 bg-gray-800 rounded w-2/5 animate-pulse" />
            <div className="h-3.5 bg-gray-800 rounded w-1/4 animate-pulse" />
            <div className="h-3.5 bg-gray-800 rounded w-3/4 animate-pulse" />
            <div className="h-3.5 bg-gray-800 rounded w-2/3 animate-pulse" />
          </div>
        </>
      ) : data ? (
        <>
          <div className="w-full aspect-video rounded-xl overflow-hidden bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${data.youtubeId}`}
              title={displayTitle}
              allow="encrypted-media; fullscreen"
              allowFullScreen
              className="w-full h-full border-0"
            />
          </div>
          <div className="mt-4">
            <h3 className="text-xl font-bold text-white leading-tight">{displayTitle}</h3>
            {data.studio && (
              <p className="text-sm text-purple-400 mt-1">{data.studio}</p>
            )}
            {synopsis && (
              <p className="text-sm text-gray-400 mt-2 leading-relaxed">{synopsis}</p>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

// ── Release Calendar ─────────────────────────────────────────────────────────

function ReleaseCardSkeleton() {
  return (
    <div className="w-36 shrink-0 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 animate-pulse">
      <div className="aspect-[3/4] bg-gray-800" />
      <div className="p-2 space-y-1.5">
        <div className="h-3 bg-gray-800 rounded w-3/4" />
        <div className="h-3 bg-gray-800 rounded w-1/2" />
      </div>
    </div>
  );
}

function AnimeEpisodeCard({ item, isJa, navigate, allTitles }) {
  const displayTitle = isJa && item.titleJa ? item.titleJa : item.titleEn;
  const matched = allTitles?.find((t) => t.malId === item.malId);
  const showReviewBadge = !matched || (matched.reviewCount || 0) === 0;

  const findOrCreate = async () => {
    const res = await titlesApi.create({
      titleEn: item.titleEn,
      titleJa: item.titleJa || '',
      type: 'anime',
      malId: item.malId,
      coverImageUrl: item.coverImageUrl || '',
    });
    return res.data;
  };

  const handleClick = async () => {
    try {
      const title = await findOrCreate();
      navigate(`/title/${title.titleId}`);
    } catch { /* ignore */ }
  };

  const handleReviewClick = async (e) => {
    e.stopPropagation();
    try {
      const title = await findOrCreate();
      navigate('/post-review', { state: { preselectedTitle: title } });
    } catch {
      if (matched) navigate('/post-review', { state: { preselectedTitle: matched } });
    }
  };

  return (
    <button
      onClick={handleClick}
      className="w-36 shrink-0 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-purple-600 transition-colors group text-left"
    >
      <div className="relative aspect-[3/4] bg-gray-800 overflow-hidden">
        {item.coverImageUrl ? (
          <img
            src={item.coverImageUrl}
            alt={displayTitle}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl text-gray-600">🎬</div>
        )}
        <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1 pt-4">
          {item.episodeNumber && (
            <span className="text-xs text-purple-300 font-semibold">Ep {item.episodeNumber}</span>
          )}
        </span>
      </div>
      <div className="p-2">
        <h4 className="text-xs font-semibold text-white truncate leading-tight">{displayTitle}</h4>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {new Date(item.releaseDate + 'T00:00:00Z').toLocaleDateString(isJa ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric' })}
          {' · '}{item.platform || 'Streaming'}
        </p>
        {showReviewBadge && (
          <button
            onClick={handleReviewClick}
            className="mt-1.5 w-full text-center text-xs py-0.5 bg-purple-700/80 hover:bg-purple-600 text-purple-100 rounded font-medium transition-colors"
          >
            ✍ Be first to review
          </button>
        )}
      </div>
    </button>
  );
}

async function fetchMangaCoverUrl(titleEn) {
  const jikanImg = (json) =>
    json.data?.[0]?.images?.jpg?.large_image_url || json.data?.[0]?.images?.jpg?.image_url || '';

  // 1. Jikan /manga full title
  try {
    const r = await fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(titleEn)}&limit=1`);
    const j = await r.json();
    const url = jikanImg(j);
    if (url) return url;
  } catch {}

  // 2. Jikan /manga shortened title (strip subtitle after : or —)
  const short = titleEn.replace(/\s*[:–—-]\s*.+$/, '').trim();
  if (short && short !== titleEn) {
    try {
      const r = await fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(short)}&limit=1`);
      const j = await r.json();
      const url = jikanImg(j);
      if (url) return url;
    } catch {}
  }

  // 3. Jikan /anime (light novel adaptations etc.)
  try {
    const r = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(titleEn)}&limit=1`);
    const j = await r.json();
    const url = jikanImg(j);
    if (url) return url;
  } catch {}

  // 4. MangaDex (better Seven Seas coverage)
  try {
    const r = await fetch(
      `https://api.mangadex.org/manga?title=${encodeURIComponent(titleEn)}&limit=1&includes%5B%5D=cover_art`
    );
    const j = await r.json();
    const manga = j.data?.[0];
    if (manga) {
      const coverRel = manga.relationships?.find((rel) => rel.type === 'cover_art');
      if (coverRel?.attributes?.fileName) {
        return `https://uploads.mangadex.org/covers/${manga.id}/${coverRel.attributes.fileName}.512.jpg`;
      }
    }
  } catch {}

  return '';
}

function MangaVolumeCard({ item, isJa, navigate, allTitles }) {
  const displayTitle = isJa && item.titleJa ? item.titleJa : item.titleEn;
  const [coverUrl, setCoverUrl] = useState(item.coverImageUrl || '');
  const [imgFailed, setImgFailed] = useState(false);
  const matched = allTitles?.find((t) => t.titleEn?.toLowerCase() === item.titleEn?.toLowerCase());
  const showReviewBadge = !matched || (matched.reviewCount || 0) === 0;

  useEffect(() => {
    if (item.coverImageUrl) { setCoverUrl(item.coverImageUrl); return; }
    let cancelled = false;
    fetchMangaCoverUrl(item.titleEn).then((url) => {
      if (!cancelled && url) setCoverUrl(url);
    });
    return () => { cancelled = true; };
  }, [item.titleEn, item.coverImageUrl]);

  const handleReviewClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await titlesApi.create({
        titleEn: item.titleEn,
        titleJa: item.titleJa || '',
        type: 'manga',
        coverImageUrl: coverUrl || '',
        publisher: item.publisher || '',
      });
      navigate('/post-review', { state: { preselectedTitle: res.data } });
    } catch {
      if (matched) navigate('/post-review', { state: { preselectedTitle: matched } });
    }
  };

  return (
    <a
      href={item.amazonSearchUrl || '#'}
      target="_blank"
      rel="noopener noreferrer"
      className="w-36 shrink-0 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-purple-600 transition-colors group text-left block"
    >
      <div className="aspect-[3/4] bg-gray-800 flex items-center justify-center overflow-hidden relative">
        {coverUrl && !imgFailed ? (
          <img
            src={coverUrl}
            alt={displayTitle}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-3">
            <span className="text-2xl text-gray-500">📖</span>
            {item.publisher && (
              <span className="text-xs text-gray-400 text-center font-medium leading-tight">{item.publisher}</span>
            )}
          </div>
        )}
      </div>
      <div className="p-2">
        <h4 className="text-xs font-semibold text-white truncate leading-tight">{displayTitle}</h4>
        <p className="text-xs text-gray-500 mt-0.5 truncate">
          {item.volumeNumber ? `Vol. ${item.volumeNumber}` : ''}
          {item.volumeNumber && item.publisher ? ' · ' : ''}
          {item.publisher || ''}
        </p>
        <p className="text-xs text-gray-600 mt-0.5">
          {new Date(item.releaseDate + 'T00:00:00Z').toLocaleDateString(isJa ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric' })}
        </p>
        {showReviewBadge && (
          <button
            onClick={handleReviewClick}
            className="mt-1.5 w-full text-center text-xs py-0.5 bg-purple-700/80 hover:bg-purple-600 text-purple-100 rounded font-medium transition-colors"
          >
            ✍ Be first to review
          </button>
        )}
      </div>
    </a>
  );
}

function ReleaseRow({ label, items, emptyLabel, renderCard }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-4">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">{label}</h3>
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
        {items.map((item, i) => (
          <div key={item.releaseId || i}>{renderCard(item)}</div>
        ))}
      </div>
    </div>
  );
}

function ReleaseCalendarSection({ week, allTitles }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isJa = i18n.language === 'ja';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    releasesApi
      .get(week)
      .then((res) => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [week]);

  const sectionTitle = week === 'current' ? t('calendar.this_week') : t('calendar.next_week');
  const hasContent = data && (
    (data.animeEpisodes?.length > 0) ||
    (data.mangaVolumes?.length > 0)
  );

  return (
    <section>
      <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-3">
        <h2 className="text-lg font-bold tracking-wide text-white uppercase">{sectionTitle}</h2>
        {data?.weekStart && (
          <span className="text-xs text-gray-500">
            {new Date(data.weekStart + 'T00:00:00Z').toLocaleDateString(isJa ? 'ja-JP' : 'en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1].map((r) => (
            <div key={r}>
              <div className="h-3 bg-gray-800 rounded w-32 mb-2 animate-pulse" />
              <div className="flex gap-3">
                {Array.from({ length: 5 }).map((_, i) => <ReleaseCardSkeleton key={i} />)}
              </div>
            </div>
          ))}
        </div>
      ) : !hasContent ? (
        <p className="text-gray-500 text-sm py-4">{t('calendar.empty')}</p>
      ) : (
        <>
          <ReleaseRow
            label={t('calendar.anime_episodes')}
            items={data.animeEpisodes}
            renderCard={(item) => (
              <AnimeEpisodeCard item={item} isJa={isJa} navigate={navigate} allTitles={allTitles} />
            )}
          />
          <ReleaseRow
            label={t('calendar.manga_volumes')}
            items={data.mangaVolumes.filter((item) => item.coverImageUrl)}
            renderCard={(item) => (
              <MangaVolumeCard item={item} isJa={isJa} navigate={navigate} allTitles={allTitles} />
            )}
          />
          {data.animePhysical?.length > 0 && (
            <ReleaseRow
              label={t('calendar.bluray_dvd')}
              items={data.animePhysical}
              renderCard={(item) => (
                <MangaVolumeCard item={item} isJa={isJa} navigate={navigate} allTitles={allTitles} />
              )}
            />
          )}
        </>
      )}
    </section>
  );
}

// ── 90s Spotlight ────────────────────────────────────────────────────────────

function mapJikan(item, type) {
  return {
    malId: item.mal_id,
    type,
    titleEn: item.title_english || item.title,
    titleJa: item.title_japanese || '',
    year: type === 'anime'
      ? (item.year || item.aired?.prop?.from?.year || null)
      : (item.published?.prop?.from?.year || null),
    genres: item.genres?.map((g) => g.name) || [],
    studio: type === 'anime'
      ? (item.studios?.[0]?.name || '')
      : (item.authors?.[0]?.name || ''),
    coverImageUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
    trailerYoutubeId: type === 'anime' ? (() => { const t = item.trailer; const m = t?.embed_url?.match(/embed\/([^?]+)/); return t?.youtube_id || (m ? m[1] : null); })() : null,
    malScore: item.score ?? null,
  };
}

function NinetiesSpotlight() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isJa = i18n.language === 'ja';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(null);

  useEffect(() => {
    const params = 'start_date=1990-01-01&end_date=1999-12-31&order_by=score&sort=desc&limit=3&sfw';
    Promise.all([
      fetch(`https://api.jikan.moe/v4/anime?${params}`)
        .then((r) => r.json()).then((d) => (d.data || []).map((i) => mapJikan(i, 'anime'))).catch(() => []),
      fetch(`https://api.jikan.moe/v4/manga?${params}`)
        .then((r) => r.json()).then((d) => (d.data || []).map((i) => mapJikan(i, 'manga'))).catch(() => []),
    ])
      .then(([anime, manga]) => setItems([...anime, ...manga]))
      .finally(() => setLoading(false));
  }, []);

  const handleClick = async (jikanTitle) => {
    if (selecting !== null) return;
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
      navigate(`/title/${res.data.titleId}`);
    } catch (err) {
      console.error(err);
      setSelecting(null);
    }
  };

  return (
    <section>
      <div className="flex flex-col mb-4 border-b border-gray-800 pb-3">
        <h2 className="text-lg font-bold tracking-wide text-white uppercase">
          {t('home.nineties_title')}
        </h2>
        <p className="text-xs text-gray-500 mt-0.5">{t('home.nineties_subtitle')}</p>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
          : items.map((title) => {
              const displayTitle = isJa && title.titleJa ? title.titleJa : title.titleEn;
              const score = title.malScore != null ? Math.round(title.malScore * 10) : null;
              const isLoading = selecting === title.malId;
              return (
                <button
                  key={`${title.type}-${title.malId}`}
                  onClick={() => handleClick(title)}
                  disabled={selecting !== null}
                  className="w-44 shrink-0 bg-gray-900 rounded-xl overflow-hidden border border-gray-800 hover:border-purple-600 transition-colors group text-left disabled:opacity-60"
                >
                  <div className="relative aspect-[3/4] bg-gray-800 overflow-hidden">
                    {title.coverImageUrl ? (
                      <img
                        src={title.coverImageUrl}
                        alt={displayTitle}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-3xl text-gray-600">
                        {title.type === 'anime' ? '🎬' : '📖'}
                      </div>
                    )}
                    <span className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      title.type === 'anime' ? 'bg-blue-900/90 text-blue-200' : 'bg-orange-900/90 text-orange-200'
                    }`}>
                      {isJa ? (title.type === 'anime' ? 'アニメ' : 'マンガ') : title.type.toUpperCase()}
                    </span>
                    {isLoading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="w-6 h-6 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-white truncate mb-2">{displayTitle}</h3>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">{title.year || '—'}</span>
                      <ScoreBadge score={score} />
                    </div>
                  </div>
                </button>
              );
            })}
      </div>
    </section>
  );
}

// ── Home ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const { t, i18n } = useTranslation();
  const [allTitles, setAllTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsSource, setNewsSource] = useState('');

  useEffect(() => {
    titlesApi
      .list({ limit: 100 })
      .then((res) => setAllTitles(res.data.items || []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setNewsLoading(true);
    newsApi
      .get({ limit: 9, lang: i18n.language === 'ja' ? 'ja' : 'en' })
      .then((res) => { setNewsItems(res.data.items || []); setNewsSource(res.data.source || ''); })
      .catch(() => {})
      .finally(() => setNewsLoading(false));
  }, [i18n.language]);

  const reviewed = allTitles.filter((t) => (t.reviewCount || 0) > 0);

  // Type splits — highest critic score first within each
  const anime = reviewed
    .filter((t) => t.type === 'anime')
    .sort((a, b) => (b.criticScore || 0) - (a.criticScore || 0));

  const manga = reviewed
    .filter((t) => t.type === 'manga')
    .sort((a, b) => (b.criticScore || 0) - (a.criticScore || 0));

  if (error) {
    return (
      <p className="text-center text-red-400 py-24">{t('errors.loading')}</p>
    );
  }

  return (
    <div className="space-y-10">

      {/* ── Release Calendar: This Week ──────────────────────────── */}
      <ReleaseCalendarSection week="current" allTitles={allTitles} />

      {/* ── Release Calendar: Next Week ──────────────────────────── */}
      <ReleaseCalendarSection week="next" allTitles={allTitles} />

      {/* ── Anime | Manga side-by-side columns ───────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        {/* Anime */}
        <section>
          <SectionHeader
            title={i18n.language === 'ja' ? 'アニメ' : 'Anime'}
          />
          {loading ? (
            <ListSkeleton rows={3} />
          ) : anime.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">{t('home.empty')}</p>
          ) : (
            <div className="space-y-2">
              {anime.map((title, i) => (
                <TitleListItem key={title.titleId} title={title} rank={i + 1} />
              ))}
            </div>
          )}
        </section>

        {/* Manga */}
        <section>
          <SectionHeader
            title={i18n.language === 'ja' ? 'マンガ' : 'Manga'}
          />
          {loading ? (
            <ListSkeleton rows={3} />
          ) : manga.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">{t('home.empty')}</p>
          ) : (
            <div className="space-y-2">
              {manga.map((title, i) => (
                <TitleListItem key={title.titleId} title={title} rank={i + 1} />
              ))}
            </div>
          )}
        </section>

      </div>

      {/* ── Latest News ──────────────────────────────────────────── */}
      <section>
        <SectionHeader title="Latest Anime & Manga News" />
        {newsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-gray-900 rounded-xl border border-gray-800 animate-pulse h-32" />
            ))}
          </div>
        ) : newsItems.length === 0 ? (
          <p className="text-gray-500 text-sm py-4">No news available.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {newsItems.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 bg-gray-900 border border-gray-800 rounded-xl p-3 hover:border-purple-700 transition-colors group"
              >
                {item.thumbnail && (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="w-20 h-20 object-cover rounded-lg shrink-0"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white group-hover:text-purple-300 transition-colors line-clamp-2 leading-snug">
                    {stripHtml(item.title)}
                  </p>
                  {item.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-snug">
                      {stripHtml(item.description)}
                    </p>
                  )}
                  {item.pubDate && (
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(item.pubDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </a>
            ))}
          </div>
        )}
        {newsSource && <p className="text-xs text-gray-600 mt-3 text-right">Source: {newsSource}</p>}
      </section>

      {/* ── 90s Spotlight ────────────────────────────────────────── */}
      <NinetiesSpotlight />

      {/* ── Latest Trailers ──────────────────────────────────────── */}
      <LatestTrailers />

    </div>
  );
}
