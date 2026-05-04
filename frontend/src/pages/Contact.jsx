import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { contact as contactApi } from '../api/client';

export default function Contact() {
  const { i18n } = useTranslation();
  const isJa = i18n.language === 'ja';

  const [form, setForm]       = useState({ name: '', email: '', message: '' });
  const [status, setStatus]   = useState('idle'); // idle | sending | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus('sending');
    setErrorMsg('');
    try {
      await contactApi.send(form);
      setStatus('success');
      setForm({ name: '', email: '', message: '' });
    } catch (err) {
      setStatus('error');
      setErrorMsg(
        err?.response?.data?.message ||
        (isJa ? '送信に失敗しました。もう一度お試しください。' : 'Failed to send. Please try again.')
      );
    }
  };

  const inputClass =
    'w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 transition-colors text-sm placeholder-gray-600';

  return (
    <div className="max-w-xl mx-auto py-4">
      <Helmet>
        <title>{isJa ? 'お問い合わせ — Fantachi' : 'Contact — Fantachi'}</title>
      </Helmet>

      <Link to="/" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">
        ← {isJa ? 'ホームへ戻る' : 'Back to Home'}
      </Link>

      <h1 className="text-3xl font-bold text-white mt-6 mb-2">
        {isJa ? 'お問い合わせ' : 'Contact'}
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {isJa
          ? 'ご質問・ご意見・不具合報告などはこちらからどうぞ。'
          : 'Questions, feedback, or bug reports — we read everything.'}
      </p>

      {status === 'success' ? (
        <div className="bg-gray-900 border border-green-800 rounded-2xl p-8 text-center space-y-3">
          <div className="text-4xl">✓</div>
          <p className="text-green-400 font-semibold text-lg">
            {isJa ? '送信しました！' : 'Message sent!'}
          </p>
          <p className="text-gray-400 text-sm">
            {isJa ? 'お問い合わせありがとうございます。' : "Thanks for reaching out. We'll get back to you soon."}
          </p>
          <button
            onClick={() => setStatus('idle')}
            className="mt-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            {isJa ? '別のメッセージを送る' : 'Send another message'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {isJa ? 'お名前' : 'Name'}
            </label>
            <input
              type="text"
              value={form.name}
              onChange={set('name')}
              required
              maxLength={100}
              placeholder={isJa ? '山田 太郎' : 'Your name'}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {isJa ? 'メールアドレス' : 'Email'}
            </label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              required
              maxLength={254}
              placeholder={isJa ? 'example@email.com' : 'you@example.com'}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
              {isJa ? 'メッセージ' : 'Message'}
            </label>
            <textarea
              value={form.message}
              onChange={set('message')}
              required
              minLength={5}
              maxLength={2000}
              rows={6}
              placeholder={isJa ? 'ご質問・ご意見をご記入ください。' : 'What\'s on your mind?'}
              className={`${inputClass} resize-none`}
            />
            <p className="text-xs text-gray-600 mt-1 text-right">
              {form.message.length} / 2000
            </p>
          </div>

          {status === 'error' && (
            <p className="text-sm text-red-400">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={status === 'sending'}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            {status === 'sending'
              ? (isJa ? '送信中…' : 'Sending…')
              : (isJa ? '送信する' : 'Send Message')}
          </button>
        </form>
      )}
    </div>
  );
}
