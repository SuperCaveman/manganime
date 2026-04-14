import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Footer() {
  const { t, i18n } = useTranslation();
  const year = new Date().getFullYear();
  const isJa = i18n.language === 'ja';

  return (
    <footer className="border-t border-gray-800 bg-gray-900 mt-16">
      <div className="container mx-auto px-4 max-w-7xl py-10">

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 mb-8">

          {/* Brand */}
          <div>
            <Link to="/" className="text-lg font-bold text-purple-400 hover:text-purple-300 transition-colors">
              MangaCritic
            </Link>
            <p className="text-gray-500 text-sm mt-2 leading-relaxed">
              {isJa
                ? 'アニメ・漫画の評論を集約したレビューサイト。批評家スコアとユーザースコアで作品を評価。'
                : 'The definitive aggregator for anime & manga reviews. Critic scores and user scores in one place.'}
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
              {isJa ? 'ナビゲーション' : 'Navigate'}
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/" className="text-gray-500 hover:text-white transition-colors">{isJa ? 'ホーム' : 'Home'}</Link></li>
              <li><Link to="/post" className="text-gray-500 hover:text-white transition-colors">{isJa ? 'レビューを投稿' : 'Post a Review'}</Link></li>
              <li><Link to="/login" className="text-gray-500 hover:text-white transition-colors">{isJa ? 'ログイン' : 'Log In / Sign Up'}</Link></li>
            </ul>
          </div>

          {/* Score guide */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
              {isJa ? 'スコアガイド' : 'Score Guide'}
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#22C55E' }} />
                <span className="text-gray-500">86–100 — {isJa ? '傑作' : 'Universal Acclaim'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#22C55E' }} />
                <span className="text-gray-500">61–85 — {isJa ? '概ね好評' : 'Generally Favorable'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#FACC15' }} />
                <span className="text-gray-500">40–60 — {isJa ? '普通' : 'Mixed or Average'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#EF4444' }} />
                <span className="text-gray-500">20–39 — {isJa ? '概ね不評' : 'Generally Unfavorable'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: '#EF4444' }} />
                <span className="text-gray-500">0–19 — {isJa ? '酷評' : 'Overwhelming Dislike'}</span>
              </li>
            </ul>
          </div>

        </div>

        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
          <div className="flex items-center gap-3">
            <p>© {year} MangaCritic. {isJa ? '全著作権所有。' : 'All rights reserved.'}</p>
            <Link to="/privacy" className="hover:text-gray-400 transition-colors">
              {isJa ? 'プライバシーポリシー' : 'Privacy Policy'}
            </Link>
          </div>
          <div className="text-right space-y-1">
            <p>
              {isJa
                ? 'ニュース提供: Anime News Network・アニメ！アニメ！　カバー画像提供: AniList'
                : 'News via Anime News Network & アニメ！アニメ！ · Cover images via AniList'}
            </p>
            <p>Release data via Seven Seas · Viz · Yen Press · Kodansha · Crunchyroll · HiDive</p>
          </div>
        </div>

      </div>
    </footer>
  );
}
