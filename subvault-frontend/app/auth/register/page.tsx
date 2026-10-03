'use client';

import Link from 'next/link';
import { RegisterForm } from '@/app/components/auth/RegisterForm';
import { OAuthButton } from '@/app/components/auth/OAuthButton';
import { AuthLayout } from '@/app/components/auth/AuthLayout';

const mono: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

export default function RegisterPage() {
  return (
    <AuthLayout title="Create account" subtitle="Join SubVault today">
      <div style={{ display: 'grid', gap: 28 }}>
        <RegisterForm />

        <div style={{ position: 'relative', textAlign: 'center' }}>
          <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, borderTop: '1px solid #eee' }} />
          <span
            style={{
              ...mono,
              position: 'relative',
              fontSize: 10,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: '#444',
              background: '#fff',
              padding: '0 16px',
            }}
          >
            Or sign up with
          </span>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          <OAuthButton provider="google" />
          <OAuthButton provider="github" />
        </div>

        <p
          style={{
            textAlign: 'center',
            fontSize: 13,
            color: '#444',
            margin: 0,
          }}
        >
          Already have an account?{' '}
          <Link
            href="/auth/login"
            style={{
              color: '#000',
              fontWeight: 600,
              textDecoration: 'none',
              borderBottom: '1px solid #000',
              paddingBottom: 1,
            }}
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
