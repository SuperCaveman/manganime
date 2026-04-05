import { useTranslation } from 'react-i18next';

export default function LocaleToggle() {
  const { i18n } = useTranslation();
  const current = i18n.language;

  const toggle = () => {
    const next = current === 'en' ? 'ja' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('locale', next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Toggle language"
      className="flex items-center gap-1 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-full text-xs font-semibold tracking-wide transition-colors"
    >
      <span className={current === 'en' ? 'text-white' : 'text-gray-500'}>EN</span>
      <span className="text-gray-600">|</span>
      <span className={current === 'ja' ? 'text-white' : 'text-gray-500'}>JA</span>
    </button>
  );
}
