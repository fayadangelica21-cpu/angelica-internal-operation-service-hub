import React, { FormEvent, useState } from 'react';
import { useAuth } from './auth';

export function AuthScreen() {
  const { signIn, signUp, logout, error: authError } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (mode === 'signup' && name.trim().length < 2) {
      setError('Enter a name with at least 2 non-space characters.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(name.trim(), email.trim(), password);
      else await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-shell auth-shell">
      <section className="panel auth-panel">
        <p className="eyebrow auth-brand">Internal Operations Service Hub</p>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your employee account'}</h1>
        <p className="auth-intro">
          {mode === 'login' ? 'Sign in with your Firebase account to continue.' : 'Employee accounts can sign up here. Staff access is assigned separately.'}
        </p>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <div className="field-group">
              <label className="field-label" htmlFor="signup-name">Full name</label>
              <input id="signup-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required />
            </div>
          )}
          <div className="field-group">
            <label className="field-label" htmlFor="auth-email">Email</label>
            <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="field-group">
            <label className="field-label" htmlFor="auth-password">Password</label>
            <input id="auth-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
            {mode === 'signup' && <span className="field-hint">Use at least 6 characters.</span>}
          </div>
          {(error || authError) && <div role="alert" className="error-box">{error || authError}</div>}
          {authError && <button className="btn btn-secondary" type="button" onClick={() => void logout()}>Sign out and retry</button>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create employee account'}
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'login' ? 'New employee?' : 'Already have an account?'}{' '}
          <button type="button" className="text-button" onClick={() => { setError(''); setMode(mode === 'login' ? 'signup' : 'login'); }}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </p>
      </section>
    </main>
  );
}
