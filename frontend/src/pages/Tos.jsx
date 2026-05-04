import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function Tos() {
  const { i18n } = useTranslation();
  const isJa = i18n.language === 'ja';

  return (
    <div className="max-w-3xl mx-auto py-4">
      <Helmet>
        <title>{isJa ? '利用規約 — Fantachi' : 'Terms of Service — Fantachi'}</title>
      </Helmet>

      <Link to="/" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
        ← {isJa ? 'ホームへ戻る' : 'Back to Home'}
      </Link>

      <h1 className="text-3xl font-bold text-white mt-6 mb-2">
        {isJa ? '利用規約' : 'Terms of Service'}
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {isJa ? '最終更新日：2026年4月13日' : 'Last updated: April 13, 2026'}
      </p>

      <div className="space-y-8 text-gray-300 leading-relaxed">

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '1. 利用規約への同意' : '1. Acceptance of Terms'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'Fantachi（以下「当サービス」）をご利用いただくことにより、本利用規約に同意したものとみなします。本規約に同意されない場合は、当サービスのご利用をお控えください。'
              : 'By accessing or using Fantachi (the "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '2. ユーザーアカウント' : '2. User Accounts'}
          </h2>
          <p className="text-sm text-gray-400 mb-2">
            {isJa
              ? 'アカウントを作成する場合、以下の責任を負うものとします。'
              : 'If you create an account, you are responsible for:'}
          </p>
          <ul className="text-sm space-y-1.5 list-disc list-inside text-gray-400">
            <li>
              {isJa
                ? 'アカウントの安全な管理およびパスワードの秘密保持'
                : 'Maintaining the security of your account and keeping your password confidential'}
            </li>
            <li>
              {isJa
                ? 'アカウントを通じて行われるすべての活動'
                : 'All activity that occurs under your account'}
            </li>
            <li>
              {isJa
                ? '正確かつ最新の情報の提供'
                : 'Providing accurate and up-to-date information'}
            </li>
          </ul>
          <p className="text-sm mt-3 text-gray-400">
            {isJa
              ? 'アカウントへの不正アクセスや不審な活動に気づいた場合は、速やかにご連絡ください。'
              : 'Please notify us immediately if you become aware of any unauthorized access to or suspicious activity on your account.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '3. ユーザーコンテンツ' : '3. User Content'}
          </h2>
          <p className="text-sm text-gray-400 mb-2">
            {isJa
              ? 'レビューやコメントを投稿することにより、Fantachiに対して、当サービス上でそのコンテンツを表示・配布するための非独占的、無償、全世界的なライセンスを付与するものとします。'
              : 'By submitting reviews or comments, you grant Fantachi a non-exclusive, royalty-free, worldwide license to display and distribute that content on the Service.'}
          </p>
          <p className="text-sm text-gray-400">
            {isJa
              ? '投稿するコンテンツが他者の著作権を侵害しておらず、有害な素材を含まないことを保証する責任はお客様にあります。Fantachiは投稿されたコンテンツについて一切の責任を負いません。'
              : 'You are solely responsible for ensuring that content you submit does not infringe third-party copyrights or contain harmful material. Fantachi assumes no liability for user-submitted content.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '4. 禁止コンテンツ' : '4. Prohibited Content'}
          </h2>
          <p className="text-sm text-gray-400 mb-2">
            {isJa
              ? '以下のコンテンツの投稿は禁止されています。'
              : 'The following types of content are strictly prohibited:'}
          </p>
          <ul className="text-sm space-y-1.5 list-disc list-inside text-gray-400">
            <li>{isJa ? 'スパムや繰り返しの無意味な投稿' : 'Spam or repetitive low-effort submissions'}</li>
            <li>{isJa ? '他のユーザーへのハラスメントや脅迫' : 'Harassment or threats directed at other users'}</li>
            <li>{isJa ? '他のユーザーや著名人へのなりすまし' : 'Impersonation of other users or public figures'}</li>
            <li>{isJa ? '違法なコンテンツや著作権を侵害するコンテンツ' : 'Illegal content or content that infringes intellectual property rights'}</li>
            <li>{isJa ? '虚偽または恣意的に操作されたレビュー' : 'Fake or artificially manipulated reviews'}</li>
            <li>{isJa ? 'ヘイトスピーチや差別的な表現' : 'Hate speech or discriminatory language'}</li>
          </ul>
          <p className="text-sm mt-3 text-gray-400">
            {isJa
              ? 'Fantachiは、本規約に違反するコンテンツを予告なく削除し、違反したアカウントを停止または終了する権利を留保します。'
              : 'Fantachi reserves the right to remove content that violates these terms and to suspend or terminate accounts of users who violate them, without prior notice.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '5. アフィリエイト開示' : '5. Affiliate Disclosure'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'FantachiはAmazonアソシエイト・プログラムの参加者です。amazon.comへのリンクを経由して購入が行われた場合、Fantachiはアフィリエイト手数料を受け取ることがあります（アフィリエイトタグ：thunderwolfdr-20）。これによりお客様への追加費用は一切発生しません。'
              : 'Fantachi participates in the Amazon Associates Program. When a purchase is made through links to amazon.com on this site, Fantachi may earn an affiliate commission (affiliate tag: thunderwolfdr-20). This comes at no additional cost to you.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '6. 第三者コンテンツ' : '6. Third-Party Content'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'Fantachiに表示されるスコアおよびデータは、Anime News Network、Jikan/MyAnimeList、AniList、IGN、Otaku USA、ComicBookRoundup、Polygon、The A.V. Clubなどの第三者ソースから出典付きで集約されたものです。Fantachiは第三者コンテンツの正確性、完全性、または適法性について責任を負いません。各ソースはそれぞれ独自の利用規約を有します。'
              : 'Scores and data displayed on Fantachi are aggregated from third-party sources including Anime News Network, Jikan/MyAnimeList, AniList, IGN, Otaku USA, ComicBookRoundup, Polygon, and The A.V. Club, with attribution provided. Fantachi is not responsible for the accuracy, completeness, or legality of third-party content. Each source is subject to its own terms of service.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '7. 免責事項' : '7. Disclaimer'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'Fantachiに掲載されているスコアおよびレビューはすべて意見であり、事実の陳述ではありません。Fantachiは、スコア、レビュー、またはその他のコンテンツの正確性、信頼性、または完全性について、明示的または黙示的を問わず、いかなる保証も行いません。当サービスは現状有姿で提供されます。'
              : 'All scores and reviews on Fantachi represent opinions, not statements of fact. Fantachi makes no warranties, express or implied, regarding the accuracy, reliability, or completeness of any scores, reviews, or other content. The Service is provided "as is."'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '8. 規約の変更' : '8. Changes to These Terms'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa
              ? 'Fantachiは、本利用規約をいつでも更新する権利を留保します。変更があった場合は、本ページ上部の「最終更新日」を更新します。変更後も当サービスを継続してご利用いただいた場合、改定された規約に同意したものとみなします。重要な変更については、可能な限り事前にお知らせするよう努めます。'
              : 'Fantachi reserves the right to update these Terms of Service at any time. When changes are made, the "Last updated" date at the top of this page will be revised. Your continued use of the Service after changes take effect constitutes acceptance of the revised terms. We will endeavor to provide advance notice of material changes where possible.'}
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-white mb-3">
            {isJa ? '9. お問い合わせ' : '9. Contact'}
          </h2>
          <p className="text-sm text-gray-400">
            {isJa ? (
              <>
                本規約に関するご質問は、<Link to="/contact" className="text-purple-400 hover:text-purple-300 underline">お問い合わせフォーム</Link>よりご連絡ください。
              </>
            ) : (
              <>
                For questions about these Terms, please use our <Link to="/contact" className="text-purple-400 hover:text-purple-300 underline">contact form</Link>.
              </>
            )}
          </p>
        </section>

      </div>
    </div>
  );
}
