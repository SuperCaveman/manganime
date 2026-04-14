function scoreStyle(score) {
  if (score == null) return { background: '#374151', color: '#9CA3AF' };
  if (score >= 86)   return { background: '#22C55E', color: '#fff' };
  if (score >= 40)   return { background: '#FACC15', color: '#111827' };
  return               { background: '#EF4444',  color: '#fff' };
}

export default function ScoreBadge({ score, label, size = 'md', nullLabel = '—' }) {
  const style = scoreStyle(score);
  const sizeClass = size === 'lg'
    ? 'w-16 h-16 text-2xl font-bold'
    : size === 'sm'
    ? 'w-8 h-8 text-xs font-bold'
    : 'w-10 h-10 text-sm font-bold';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`${sizeClass} rounded-lg flex items-center justify-center`}
        style={style}
      >
        {score ?? nullLabel}
      </div>
      {label && <span className="text-xs text-gray-400">{label}</span>}
    </div>
  );
}
