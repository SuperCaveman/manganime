import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect, useCallback } from 'react';
import LocaleToggle from './LocaleToggle';
import SearchBar from './SearchBar';
import { useAuth } from '../auth/AuthContext';
import { signOut } from '../auth/cognito';
import { notifications as notificationsApi } from '../api/client';

function NotificationBell({ user }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const fetchNotifications = useCallback(() => {
    notificationsApi.get()
      .then((res) => setItems(res.data.items || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleClick = async (n) => {
    setOpen(false);
    try {
      await notificationsApi.markRead([n.notificationId]);
      setItems((prev) => prev.filter((x) => x.notificationId !== n.notificationId));
    } catch (err) {
      console.error(err);
    }
    navigate(`/title/${n.titleId}`);
  };

  const lang = i18n.language;
  const unread = items.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-1.5 text-gray-400 hover:text-white transition-colors"
        title={t('notifications.title')}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0 1 18 14.158V11a6.002 6.002 0 0 0-4-5.659V5a2 2 0 1 0-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{t('notifications.title')}</p>
            {unread > 0 && (
              <span className="text-xs text-gray-500">{unread} {t('notifications.unread')}</span>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-5 text-sm text-gray-500 text-center">{t('notifications.empty')}</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto divide-y divide-gray-800">
              {items.map((n) => (
                <li key={n.notificationId}>
                  <button
                    onClick={() => handleClick(n)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-800 transition-colors"
                  >
                    <p className="text-xs text-gray-300 leading-snug">
                      <span className="font-semibold text-white">{n.fromUsername}</span>
                      {' '}{t('notifications.commented')}
                    </p>
                    {n.preview && (
                      <p className="text-xs text-gray-500 mt-0.5 truncate">"{n.preview}"</p>
                    )}
                    <p className="text-xs text-gray-600 mt-1">
                      {new Date(n.createdAt).toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US')}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function UserMenu({ user, onLogout }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const displayName = user?.username || 'User';
  const email = user?.email || '';
  const initial = displayName[0]?.toUpperCase() || 'U';

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 group"
        title={email}
      >
        <span className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-white text-sm font-bold group-hover:bg-purple-500 transition-colors">
          {initial}
        </span>
        <span className="hidden sm:block text-sm text-gray-300 group-hover:text-white transition-colors max-w-[120px] truncate">
          {displayName}
        </span>
        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <p className="text-xs text-gray-500 truncate">{email}</p>
          </div>
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
            </svg>
            {t('nav.profile')}
          </Link>
          <Link
            to="/post"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {t('nav.post_review')}
          </Link>
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors border-t border-gray-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();

  const handleLogout = () => {
    signOut();
    refresh();
    navigate('/');
  };

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Top row — logo + (desktop search) + actions */}
        <div className="h-14 flex items-center gap-4">
          <Link
            to="/"
            className="text-xl font-bold tracking-tight text-purple-400 hover:text-purple-300 transition-colors shrink-0"
          >
            Fantachi
          </Link>

          {/* Search bar — hidden on mobile, shown sm+ */}
          <div className="hidden sm:flex flex-1 justify-center px-4">
            <SearchBar />
          </div>

          <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
            <LocaleToggle />
            {user === undefined ? null : user ? (
              <>
                <NotificationBell user={user} />
                <UserMenu user={user} onLogout={handleLogout} />
              </>
            ) : (
              <Link
                to="/login"
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg transition-colors"
              >
                {t('nav.login')}
              </Link>
            )}
          </div>
        </div>

        {/* Mobile-only search row — full width below the logo row */}
        <div className="sm:hidden pb-3">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}
