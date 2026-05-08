import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { signIn, signUp, confirmSignUp, forgotPassword, confirmForgotPassword } from '../auth/cognito';
import { useAuth } from '../auth/AuthContext';

// mode: 'login' | 'signup' | 'confirm' | 'forgot' | 'reset'
export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next) => { setMode(next); setError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await signIn(email, password);
        await refresh();
        navigate('/');
      } else if (mode === 'signup') {
        await signUp(email, password, i18n.language, username);
        switchMode('confirm');
      } else if (mode === 'confirm') {
        await confirmSignUp(email, code);
        await signIn(email, password);
        await refresh();
        navigate('/');
      } else if (mode === 'forgot') {
        await forgotPassword(email);
        switchMode('reset');
      } else if (mode === 'reset') {
        await confirmForgotPassword(email, code, newPassword);
        await signIn(email, newPassword);
        await refresh();
        navigate('/');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const title = {
    login: t('auth.login'),
    signup: t('auth.signup'),
    confirm: t('auth.confirm'),
    forgot: t('auth.forgot'),
    reset: t('auth.reset'),
  }[mode];

  return (
    <div className="max-w-sm mx-auto mt-12">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-center mb-6">{title}</h2>

        {mode === 'confirm' && (
          <p className="text-sm text-gray-400 text-center mb-4">{t('auth.check_email')}</p>
        )}
        {mode === 'forgot' && (
          <p className="text-sm text-gray-400 text-center mb-4">{t('auth.forgot_hint')}</p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
            <>
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{t('auth.username')}</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    maxLength={30}
                    placeholder="e.g. animefan42"
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 placeholder-gray-600"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('auth.email')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500"
                />
              </div>
              {(mode === 'login' || mode === 'signup') && (
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-sm text-gray-400">{t('auth.password')}</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs text-purple-400 hover:text-purple-300"
                      >
                        {t('auth.forgot_password')}
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}
            </>
          )}

          {(mode === 'confirm' || mode === 'reset') && (
            <>
              {mode === 'reset' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{t('auth.email')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-400 mb-1">{t('auth.confirm_code')}</label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  inputMode="numeric"
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500 tracking-widest text-center text-lg"
                />
              </div>
              {mode === 'reset' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">{t('auth.new_password')}</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 border border-gray-700 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}
            </>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? '…' : {
              login: t('auth.login'),
              signup: t('auth.signup'),
              confirm: t('auth.confirm_btn'),
              forgot: t('auth.send_code'),
              reset: t('auth.reset_btn'),
            }[mode]}
          </button>
        </form>

        {(mode === 'login' || mode === 'signup') && (
          <p className="text-center text-sm text-gray-500 mt-4">
            {mode === 'login' ? t('auth.no_account') : t('auth.have_account')}{' '}
            <button
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="text-purple-400 hover:text-purple-300 font-medium"
            >
              {mode === 'login' ? t('auth.signup') : t('auth.login')}
            </button>
          </p>
        )}

        {(mode === 'forgot' || mode === 'reset') && (
          <p className="text-center text-sm text-gray-500 mt-4">
            <button
              onClick={() => switchMode('login')}
              className="text-purple-400 hover:text-purple-300 font-medium"
            >
              {t('auth.back_to_login')}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
