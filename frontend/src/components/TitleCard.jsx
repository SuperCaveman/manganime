import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ScoreBadge from './ScoreBadge';

export default function TitleCard({ title }) {
  const { i18n, t } = useTranslation();
  const isJa = i18n.language === 'ja';
  const displayTitle = isJa && title.titleJa ? title.titleJa : title.titleEn;

  return (
    <Link to={`/title/${title.titleId}`} className="group block">
      <div className="bg-gray-900 rounded-xl overflow-hidden border border-gray-800 group-hover:border-purple-600 transition-colors duration-200">
        {/* Cover */}
        <div className="relative aspect-[3/4] bg-gray-800 overflow-hidden">
          {title.coverImageUrl ? (
            <img
              src={title.coverImageUrl}
              alt={displayTitle}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-600">
              <span className="text-3xl">{title.type === 'anime' ? '🎬' : '📖'}</span>
              <span className="text-xs px-2 text-center leading-tight">{displayTitle}</span>
            </div>
          )}

          {/* Type pill — top left */}
          <span
            className={`absolute top-2 left-2 text-xs font-semibold px-2 py-0.5 rounded-full ${
              title.type === 'anime'
                ? 'bg-blue-900/90 text-blue-200'
                : 'bg-orange-900/90 text-orange-200'
            }`}
          >
            {isJa
              ? title.type === 'anime' ? 'アニメ' : 'マンガ'
              : title.type?.toUpperCase()}
          </span>

        </div>

        {/* Info */}
        <div className="p-3">
          <h3 className="text-sm font-semibold text-white truncate mb-2">{displayTitle}</h3>
          <div className="flex items-center gap-2">
            <ScoreBadge
              score={title.criticScore ?? title.userScore ?? null}
              label={title.criticScore != null ? t('scores.critic') : title.userScore != null ? t('scores.user') : null}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
