import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ScoreBadge from './ScoreBadge';

export default function TitleListItem({ title, rank }) {
  const { i18n } = useTranslation();
  const isJa = i18n.language === 'ja';
  const displayTitle = isJa && title.titleJa ? title.titleJa : title.titleEn;

  return (
    <Link
      to={`/title/${title.titleId}`}
      className="flex items-center gap-3 p-3 bg-gray-900 hover:bg-gray-800 rounded-xl border border-gray-800 hover:border-purple-700 transition-colors group"
    >
      {/* Rank */}
      <span className="w-5 shrink-0 text-center text-sm font-bold text-gray-600">{rank}</span>

      {/* Thumbnail */}
      <div className="w-10 h-[3.75rem] shrink-0 rounded overflow-hidden bg-gray-800">
        {title.coverImageUrl ? (
          <img
            src={title.coverImageUrl}
            alt={displayTitle}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg text-gray-600">
            {title.type === 'anime' ? '🎬' : '📖'}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate group-hover:text-purple-300 transition-colors">
          {displayTitle}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {[title.studio, title.year].filter(Boolean).join(' · ')}
        </p>
        {title.genres?.length > 0 && (
          <p className="text-xs text-gray-600 truncate mt-0.5">
            {title.genres.slice(0, 3).join(', ')}
          </p>
        )}
      </div>

      <div className="shrink-0">
        <ScoreBadge
          score={title.criticScore ?? title.userScore ?? null}
        />
      </div>
    </Link>
  );
}
