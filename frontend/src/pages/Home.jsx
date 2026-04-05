import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import TitleCard from '../components/TitleCard';
import TitleListItem from '../components/TitleListItem';
import { titles as titlesApi, news as newsApi } from '../api/client';

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

  // New Releases — newest year first
  const newReleases = [...allTitles].sort((a, b) => (b.year || 0) - (a.year || 0));

  // Type splits — highest critic score first within each
  const anime = allTitles
    .filter((t) => t.type === 'anime')
    .sort((a, b) => (b.criticScore || 0) - (a.criticScore || 0));

  const manga = allTitles
    .filter((t) => t.type === 'manga')
    .sort((a, b) => (b.criticScore || 0) - (a.criticScore || 0));

  if (error) {
    return (
      <p className="text-center text-red-400 py-24">{t('errors.loading')}</p>
    );
  }

  return (
    <div className="space-y-10">

      {/* ── New Releases — horizontal scroll row ─────────────────── */}
      <section>
        <SectionHeader title="New Releases" />
        <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-2">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)
            : newReleases.map((title) => (
                <div key={title.titleId} className="w-44 shrink-0">
                  <TitleCard title={title} />
                </div>
              ))}
        </div>
      </section>

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
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-snug">
                      {item.description}
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

    </div>
  );
}
