import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function Contact() {
  const { i18n } = useTranslation();
  const isJa = i18n.language === 'ja';

  return (
    <div className="max-w-3xl mx-auto py-4">
      <Helmet>
        <title>{isJa ? 'お問い合わせ — MangaCritic' : 'Contact — MangaCritic'}</title>
      </Helmet>

      <Link to="/" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
        ← {isJa ? 'ホームへ戻る' : 'Back to Home'}
      </Link>

      <h1 className="text-3xl font-bold text-white mt-6 mb-6">
        {isJa ? 'お問い合わせ' : 'Contact'}
      </h1>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
        <p className="text-gray-400 text-lg">
          {isJa ? 'お問い合わせフォームは近日公開予定です。' : 'Contact form coming soon.'}
        </p>
      </div>
    </div>
  );
}
