import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ja from './locales/ja.json';

export const LOCALE_KEY = 'fantachi_locale';

function getSavedLocale() {
  // Migrate old key on first read
  const legacy = localStorage.getItem('locale');
  if (legacy) {
    localStorage.setItem(LOCALE_KEY, legacy);
    localStorage.removeItem('locale');
    return legacy;
  }
  return localStorage.getItem(LOCALE_KEY);
}

function isBrowserJapanese() {
  const langs = [navigator.language, ...(navigator.languages || [])];
  return langs.some((l) => l?.startsWith('ja'));
}

const saved = getSavedLocale();
const syncLocale = saved ?? (isBrowserJapanese() ? 'ja' : 'en');

if (!saved) {
  // Persist the sync-detected value so the geo check only runs once
  // (will be overwritten by geo result below if needed)
  localStorage.setItem(LOCALE_KEY, syncLocale);
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
    },
    lng: syncLocale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

// Only hit the geo API when there's no saved pref AND browser isn't Japanese
if (!saved && !isBrowserJapanese()) {
  fetch('https://ipapi.co/json/')
    .then((r) => r.json())
    .then((data) => {
      if (data.country_code === 'JP') {
        i18n.changeLanguage('ja');
        localStorage.setItem(LOCALE_KEY, 'ja');
      }
      // EN is already set; no action needed
    })
    .catch(() => {});
}

export default i18n;
