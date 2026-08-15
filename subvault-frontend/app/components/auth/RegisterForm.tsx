'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './useAuth';

const mono: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

export function RegisterForm() {
  const router = useRouter();
  const { register, error: authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setIsLoading(true);

    try {
      await register(email, password, name);
      router.push('/dashboard');
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error && err.message
          ? err.message
          : 'Registration failed. Please try again.';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 24 }}>
      {(error || authError) && (
        <div
          style={{
            ...mono,
            fontSize: 11,
            color: '#c00',
            padding: '12px 16px',
            border: '1px solid #f5c6cb',
            background: '#ffeaea',
          }}
        >
          {error || authError}
        </div>
      )}

      <div>
        <div
          style={{
            ...mono,
            fontSize: 10,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#444',
            marginBottom: 4,
          }}
        >
          Full Name
        </div>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="auth-input"
          placeholder="John Doe"
        />
      </div>

      <div>
        <div
          style={{
            ...mono,
            fontSize: 10,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#444',
            marginBottom: 4,
          }}
        >
          Email
        </div>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="auth-input"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <div
          style={{
            ...mono,
            fontSize: 10,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: '#444',
            marginBottom: 4,
          }}
        >
          Password
        </div>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="auth-input"
          placeholder="••••••••"
        />
        <div style={{ ...mono, fontSize: 10, color: '#444', marginTop: 6 }}>
          At least 6 characters
        </div>
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="auth-btn auth-btn-filled"
        style={{ width: '100%', padding: '14px 0', marginTop: 4 }}
      >
        <span>{isLoading ? 'Creating account…' : 'Create account'}</span>
      </button>
    </form>
  );
}
