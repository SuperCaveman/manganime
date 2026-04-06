import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function Privacy() {
  const { i18n } = useTranslation();
  const isJa = i18n.language === 'ja';

  return (
    <div className="max-w-3xl mx-auto py-4">
      <Helmet>
        <title>{isJa ? 'プライバシーポリシー — MangaCritic' : 'Privacy Policy — MangaCritic'}</title>
      </Helmet>

      <Link to="/" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
        ← {isJa ? 'ホームへ戻る' : 'Back to Home'}
      </Link>

      <h1 className="text-3xl font-bold text-white mt-6 mb-2">
        {isJa ? 'プライバシーポリシー' : 'Privacy Policy'}
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {isJa ? '最終更新日：2026年4月6日' : 'Last updated: April 6, 2026'}
      </p>

      <div className="space-y-8 text-gray-300 leading-relaxed">

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '1. 収集する情報' : '1. Information We Collect'}
          </h2>
          <p className="text-sm mb-2">
            {isJa
              ? 'MangaCriticは、以下の情報を収集することがあります。'
              : 'MangaCritic may collect the following information:'}
          </p>
          <ul className="text-sm space-y-1.5 list-disc list-inside text-gray-400">
            <li>{isJa ? 'アカウント登録時のメールアドレスとユーザー名' : 'Email address and username when you create an account'}</li>
            <li>{isJa ? 'レビューおよびコメントの内容' : 'Review and comment content you submit'}</li>
            <li>{isJa ? 'ページビュー、クリック等の利用状況データ（匿名）' : 'Anonymous usage data such as page views and clicks'}</li>
            <li>{isJa ? '言語設定などのユーザー設定（ローカルストレージ）' : 'Preferences such as language setting, stored locally in your browser'}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '2. 情報の使用方法' : '2. How We Use Your Information'}
          </h2>
          <ul className="text-sm space-y-1.5 list-disc list-inside text-gray-400">
            <li>{isJa ? 'アカウントの作成・認証' : 'Creating and authenticating your account'}</li>
            <li>{isJa ? 'レビューやコメントの表示' : 'Displaying your reviews and comments'}</li>
            <li>{isJa ? 'サービスの改善' : 'Improving the service'}</li>
            <li>{isJa ? '通知の送信（設定した場合）' : 'Sending notifications you have opted into'}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '3. 第三者サービス' : '3. Third-Party Services'}
          </h2>
          <p className="text-sm mb-3 text-gray-400">
            {isJa
              ? 'MangaCriticは以下の第三者サービスを利用しています。これらのサービスはそれぞれ独自のプライバシーポリシーを持っています。'
              : 'MangaCritic uses the following third-party services, each with their own privacy policy:'}
          </p>
          <ul className="text-sm space-y-1.5 list-disc list-inside text-gray-400">
            <li><span className="text-gray-300">Amazon Web Services (AWS Cognito)</span> — {isJa ? 'ユーザー認証' : 'user authentication'}</li>
            <li><span className="text-gray-300">MyAnimeList / Jikan API</span> — {isJa ? 'アニメ・漫画データの取得' : 'anime and manga data'}</li>
            <li><span className="text-gray-300">AniList</span> — {isJa ? 'カバー画像の取得' : 'cover images'}</li>
            <li><span className="text-gray-300">Anime News Network</span> — {isJa ? 'ニュースフィード' : 'news feed'}</li>
            <li><span className="text-gray-300">YouTube</span> — {isJa ? 'トレーラー動画の埋め込み' : 'embedded trailer videos'}</li>
            <li><span className="text-gray-300">Amazon Associates</span> — {isJa ? '商品リンク（アフィリエイト）' : 'affiliate product links'}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '4. クッキーとローカルストレージ' : '4. Cookies & Local Storage'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'MangaCriticは、ログイン状態の維持および言語設定の保存のためにブラウザのローカルストレージを使用します。第三者の広告クッキーは現在使用していません。'
              : 'MangaCritic uses browser local storage to maintain your login session and language preference. We do not currently use third-party advertising cookies.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '5. データの保持' : '5. Data Retention'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'アカウントを削除した場合、メールアドレスおよびアカウント情報は速やかに削除されます。投稿したレビューやコメントはサービスの整合性維持のため匿名化して保持される場合があります。'
              : 'If you delete your account, your email address and credentials are promptly removed. Reviews and comments you submitted may be retained in anonymized form to preserve the integrity of the service.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '6. お問い合わせ' : '6. Contact'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'プライバシーに関するお問い合わせは、GitHubのIssueにてご連絡ください。'
              : 'For privacy-related questions, please open an issue on our GitHub repository.'}
          </p>
        </section>

      </div>
    </div>
  );
}
