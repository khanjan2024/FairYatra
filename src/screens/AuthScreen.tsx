import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail, Lock, User as UserIcon, Eye, EyeOff,
  AlertCircle, LogIn, UserPlus,
} from 'lucide-react';
import { signUp, logIn } from '../lib/auth';
import { useAuth } from '../lib/AuthContext';

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-3 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors';

function InputField({
  id, label, type, value, onChange, icon: Icon, error, placeholder, rightSlot,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; icon: React.ElementType;
  error?: string; placeholder?: string; rightSlot?: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <Icon size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          aria-hidden="true" />
        <input id={id} type={type} value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${inputClass} ${error ? 'border-red-400 focus:ring-red-400' : ''}`}
          aria-describedby={error ? `${id}-err` : undefined}
          aria-invalid={!!error} />
        {rightSlot && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</div>
        )}
      </div>
      {error && (
        <p id={`${id}-err`} className="text-xs text-red-600 mt-1 flex items-center gap-1">
          <AlertCircle size={11} aria-hidden="true" />{error}
        </p>
      )}
    </div>
  );
}

export default function AuthScreen() {
  const navigate    = useNavigate();
  const { refresh } = useAuth();
  const [mode,  setMode]  = useState<'login' | 'signup'>('login');
  const [name,  setName]  = useState('');
  const [email, setEmail] = useState('');
  const [pw,    setPw]    = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    const result = mode === 'signup'
      ? await signUp(name, email, pw)
      : await logIn(email, pw);

    setLoading(false);

    if ('error' in result) {
      const { field, message } = result.error;
      setErrors({ [field ?? 'general']: message });
      return;
    }

    refresh();
    navigate('/', { replace: true });
  };

  const switchMode = () => {
    setMode((m) => m === 'login' ? 'signup' : 'login');
    setErrors({});
    setName(''); setEmail(''); setPw('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-blue-700
      flex flex-col items-center justify-center px-4 py-12">
      {/* Logo + brand */}
      <div className="flex flex-col items-center gap-3 mb-8">
        <img src="/logo.png" alt="FairYatra" className="w-16 h-16 rounded-2xl shadow-lg" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white tracking-tight">FairYatra</h1>
          <p className="text-blue-200 text-sm">Fair fares for North East India</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-5">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {mode === 'login'
              ? 'Sign in to submit reports and help other travellers.'
              : 'Join the community to report fares and share tips.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {mode === 'signup' && (
            <InputField id="name" label="Full Name" type="text" value={name}
              onChange={setName} icon={UserIcon} placeholder="Your name"
              error={errors.name} />
          )}

          <InputField id="email" label="Email" type="email" value={email}
            onChange={setEmail} icon={Mail} placeholder="you@example.com"
            error={errors.email} />

          <InputField id="password" label="Password" type={showPw ? 'text' : 'password'}
            value={pw} onChange={setPw} icon={Lock}
            placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
            error={errors.password}
            rightSlot={
              <button type="button" onClick={() => setShowPw((v) => !v)}
                className="text-slate-400 hover:text-slate-600 focus:outline-none"
                aria-label={showPw ? 'Hide password' : 'Show password'}>
                {showPw
                  ? <EyeOff size={15} aria-hidden="true" />
                  : <Eye    size={15} aria-hidden="true" />}
              </button>
            } />

          {errors.general && (
            <div role="alert"
              className="flex items-start gap-2 text-sm text-red-700 bg-red-50
                border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-500" aria-hidden="true" />
              {errors.general}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-700
              hover:bg-blue-800 disabled:opacity-60 text-white font-semibold py-3
              rounded-xl transition-colors focus:outline-none focus:ring-2
              focus:ring-blue-500 focus:ring-offset-2">
            {loading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent
                rounded-full animate-spin" aria-hidden="true" />
            ) : mode === 'login' ? (
              <><LogIn size={16} aria-hidden="true" /> Sign In</>
            ) : (
              <><UserPlus size={16} aria-hidden="true" /> Create Account</>
            )}
          </button>
        </form>

        {/* Switch mode */}
        <p className="text-center text-sm text-slate-500">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={switchMode}
            className="text-blue-600 hover:text-blue-800 font-semibold
              focus:outline-none focus:underline">
            {mode === 'login' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
