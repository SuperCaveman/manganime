import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { titles as titlesApi } from '../api/client';

export default function SearchBar() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const isJa = i18n.language === 'ja';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const timerRef = useRef(null);
  const containerRef = useRef(null);

  const runSearch = useCallback((q) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setSearching(true);
    titlesApi.search(q)
      .then((res) => {
        const items = res.data.items || [];
        setResults(items);
        setOpen(items.length > 0);
      })
      .catch(() => {})
      .finally(() => setSearching(false));
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q), 300);
  };

  const handleSelect = (title) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    navigate(`/title/${title.titleId}`);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (results.length > 0) handleSelect(results[0]);
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showDropdown = open && results.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <form onSubmit={handleSubmit}>
        <div className="relative">
          {/* Search icon */}
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
            fill="none" stroke="currentColor" strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>

          <input
            type="text"
            value={query}
            onChange={handleChange}
            onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true); }}
            placeholder={isJa ? 'アニメ・漫画を検索…' : 'Search anime & manga…'}
            className="w-full bg-gray-800 text-white text-sm rounded-lg pl-9 pr-8 py-2 border border-gray-700 focus:outline-none focus:border-purple-500 placeholder-gray-500 transition-colors"
          />

          {/* Spinner / clear */}
          {searching ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          ) : query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); setResults([]); setOpen(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>
      </form>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute top-full mt-2 w-full bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          {results.slice(0, 8).map((title) => {
            const displayTitle = isJa && title.titleJa ? title.titleJa : title.titleEn;
            const score = title.criticScore ?? title.userScore ?? null;
            return (
              <button
                key={title.titleId}
                onMouseDown={() => handleSelect(title)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-800 transition-colors text-left border-b border-gray-800 last:border-0"
              >
                {/* Thumbnail */}
                <div className="w-8 h-11 shrink-0 rounded overflow-hidden bg-gray-800">
                  {title.coverImageUrl ? (
                    <img src={title.coverImageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
                      {title.type === 'anime' ? '▶' : '📖'}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{displayTitle}</p>
                  <p className="text-xs text-gray-500 capitalize">{title.type}{title.year ? ` · ${title.year}` : ''}</p>
                </div>

                {/* Score */}
                {score != null && (
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded shrink-0"
                    style={
                      score >= 86 ? { background: '#22C55E', color: '#fff' } :
                      score >= 41 ? { background: '#FACC15', color: '#111827' } :
                                    { background: '#EF4444', color: '#fff' }
                    }
                  >
                    {score}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
