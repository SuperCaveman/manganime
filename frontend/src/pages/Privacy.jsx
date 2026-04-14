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
        {isJa ? '最終更新日：2026年4月13日' : 'Last updated: April 13, 2026'}
      </p>

      <div className="space-y-8 text-gray-300 leading-relaxed">

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '1. 収集する情報' : '1. Information We Collect'}
          </h2>
          <p className="text-sm mb-2 text-gray-400">
            {isJa
              ? 'MangaCriticは、以下の情報を収集することがあります。'
              : 'MangaCritic may collect the following information:'}
          </p>
          <ul className="text-sm space-y-1.5 list-disc list-inside text-gray-400">
            <li>
              {isJa
                ? 'アカウント登録時のメールアドレスとユーザー名（AWS Cognitoにより管理）'
                : 'Email address and username when you create an account (managed by AWS Cognito)'}
            </li>
            <li>
              {isJa
                ? '投稿したレビューおよびコメントの内容（DynamoDBに保存）'
                : 'Review and comment content you submit (stored in DynamoDB)'}
            </li>
            <li>
              {isJa
                ? '言語設定などのブラウザ設定（ローカルストレージ）'
                : 'Browser preferences such as language setting (stored in local storage)'}
            </li>
            <li>
              {isJa
                ? 'ログイン状態を維持するためのセッションクッキー'
                : 'Session cookies to maintain your login state'}
            </li>
          </ul>
          <p className="text-sm mt-3 text-gray-400">
            {isJa
              ? 'MangaCriticは現在、第三者の広告クッキーや追跡ピクセルを使用していません。'
              : 'MangaCritic does not currently use third-party advertising cookies or tracking pixels.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '2. 情報の使用方法' : '2. How We Use Your Information'}
          </h2>
          <ul className="text-sm space-y-1.5 list-disc list-inside text-gray-400">
            <li>{isJa ? 'アカウントの作成・認証' : 'Creating and authenticating your account'}</li>
            <li>{isJa ? 'レビューやコメントの表示' : 'Displaying your reviews and comments'}</li>
            <li>{isJa ? 'スコア集計の算出' : 'Computing aggregated scores'}</li>
            <li>{isJa ? '通知の送信（設定した場合）' : 'Sending notifications you have opted into'}</li>
            <li>{isJa ? 'サービスの改善' : 'Improving the service'}</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '3. Amazonアソシエイト（アフィリエイト）開示' : '3. Amazon Associates Affiliate Disclosure'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'MangaCriticはAmazonアソシエイト・プログラムの参加者です。amazon.com上の対象製品へのリンクを掲載しており、該当リンクを経由して購入が行われた場合、MangaCriticはアフィリエイト手数料を受け取ることがあります（アフィリエイトタグ：thunderwolfdr-20）。Amazonのプライバシーポリシーはamazon.comに準じます。'
              : 'MangaCritic is a participant in the Amazon Associates Program. We include links to qualifying products on amazon.com and may earn an affiliate commission when a purchase is made through those links (affiliate tag: thunderwolfdr-20). Amazon\'s privacy practices are governed by amazon.com\'s own privacy policy.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '4. 第三者データソース' : '4. Third-Party Data Sources'}
          </h2>
          <p className="text-sm mb-3 text-gray-400">
            {isJa
              ? 'MangaCriticは以下の外部サービスからデータを取得・表示しています。各サービスはそれぞれ独自のプライバシーポリシーを有します。'
              : 'MangaCritic fetches and displays data from the following external services. Each service has its own privacy policy.'}
          </p>
          <ul className="text-sm space-y-2 list-disc list-inside text-gray-400">
            <li><span className="text-gray-300">Anime News Network (ANN)</span> — {isJa ? 'ニュースフィード' : 'news feed'}</li>
            <li><span className="text-gray-300">Jikan API / MyAnimeList (MAL)</span> — {isJa ? 'アニメ・マンガのメタデータおよびカバー画像' : 'anime and manga metadata and cover images'}</li>
            <li><span className="text-gray-300">AniList</span> — {isJa ? 'カバー画像の補完' : 'supplemental cover images'}</li>
            <li><span className="text-gray-300">Crunchyroll</span> — {isJa ? '放送スケジュールデータ' : 'simulcast schedule data'}</li>
            <li><span className="text-gray-300">HiDive</span> — {isJa ? '放送スケジュールデータ' : 'streaming schedule data'}</li>
            <li><span className="text-gray-300">Seven Seas Entertainment</span> — {isJa ? 'マンガリリース情報' : 'manga release data'}</li>
            <li><span className="text-gray-300">Viz Media</span> — {isJa ? 'マンガリリース情報' : 'manga release data'}</li>
            <li><span className="text-gray-300">Yen Press</span> — {isJa ? 'マンガ・ライトノベルリリース情報' : 'manga and light novel release data'}</li>
            <li><span className="text-gray-300">Kodansha</span> — {isJa ? 'マンガリリース情報' : 'manga release data'}</li>
            <li><span className="text-gray-300">YouTube</span> — {isJa ? 'トレーラー動画の埋め込み（Googleのプライバシーポリシーが適用されます）' : 'embedded trailer videos (Google\'s privacy policy applies)'}</li>
            <li><span className="text-gray-300">Google Books</span> — {isJa ? '書籍メタデータ' : 'book metadata'}</li>
          </ul>
          <p className="text-sm mt-3 text-gray-400">
            {isJa
              ? 'これらのサービスとのデータのやり取りは、MangaCriticのサーバーを介して行われるか、またはブラウザから直接行われる場合があります。第三者のプライバシーポリシーについては各サービスのウェブサイトをご確認ください。'
              : 'Interactions with these services may occur server-side through MangaCritic or directly from your browser. Please review each service\'s privacy policy on their respective websites.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '5. クッキーとローカルストレージ' : '5. Cookies & Local Storage'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'MangaCriticは、ログイン状態の維持のためにセッションクッキーを使用し、言語設定の保存のためにブラウザのローカルストレージを使用します。これらはサービスの動作に必要なものであり、第三者の広告クッキーは使用していません。'
              : 'MangaCritic uses session cookies to maintain your login state and browser local storage to save your language preference. These are necessary for the service to function. We do not use third-party advertising cookies.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '6. データの保持' : '6. Data Retention'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'アカウントを削除した場合、メールアドレスおよびアカウント情報は速やかに削除されます。投稿したレビューやコメントはサービスの整合性維持のため匿名化して保持される場合があります。'
              : 'If you delete your account, your email address and credentials are promptly removed from AWS Cognito. Reviews and comments you submitted may be retained in anonymized form to preserve the integrity of the aggregate scores.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '7. お問い合わせ' : '7. Contact'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa ? (
              <>
                プライバシーに関するお問い合わせは、<Link to="/contact" className="text-purple-400 hover:text-purple-300 underline">お問い合わせフォーム</Link>よりご連絡ください。
              </>
            ) : (
              <>
                For privacy-related questions, please use our <Link to="/contact" className="text-purple-400 hover:text-purple-300 underline">contact form</Link>.
              </>
            )}
          </p>
        </section>

      </div>
    </div>
  );
}
