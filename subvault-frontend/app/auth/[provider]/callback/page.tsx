'use client';
import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { auth as apiAuth } from '@/api-client';
import { useAuth } from '@/app/components/auth/useAuth';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const params = useParams();
  const { refreshAuth } = useAuth();

  const provider = typeof params.provider === 'string' ? params.provider : Array.isArray(params.provider) ? params.provider[0] : undefined;

  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      try {
        if (!provider) {
          setError('Invalid provider');
          setIsProcessing(false);
          return;
        }

        // Parse tokens directly from the URL hash
        const hash = window.location.hash.substring(1);
        const hashParams = new URLSearchParams(hash);

        // Check for errors in hash or query
        const hashError = hashParams.get('error');
        if (hashError) {
          setError(hashParams.get('error_description') || `Authorization failed: ${hashError}`);
          setIsProcessing(false);
          return;
        }

        const queryError = new URLSearchParams(window.location.search).get('error');
        if (queryError) {
          setError(new URLSearchParams(window.location.search).get('error_description') || `Authorization failed: ${queryError}`);
          setIsProcessing(false);
          return;
        }

        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (!accessToken) {
          setError('No access token received. Please try again.');
          setIsProcessing(false);
          return;
        }

        // Set the session manually
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken || '',
        });

        if (sessionError) {
          setError(`Session error: ${sessionError.message}`);
          setIsProcessing(false);
          return;
        }

        if (!data.session) {
          setError('No session returned. Please try again.');
          setIsProcessing(false);
          return;
        }

        // Sync with backend — get our own JWT
        const response = await apiAuth.supabaseSync(data.session.access_token);
        localStorage.setItem('subvault_token', response.token);

        // Refresh the AuthContext so user state is set BEFORE navigating
        await refreshAuth();

        setIsProcessing(false);
        router.push('/dashboard');
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Authentication failed. Please try again.';
        console.error('OAuth callback error:', err);
        setError(message);
        setIsProcessing(false);
      }
    };

    processCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const mono: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#FAFAF8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <link
        href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <div
        style={{
          width: '100%',
          maxWidth: 480,
          background: '#fff',
          border: '1px solid #000',
          padding: '48px 44px',
          textAlign: 'center',
        }}
      >
        {isProcessing ? (
          <>
            <div
              style={{
                width: 32,
                height: 32,
                border: '2px solid #eee',
                borderTopColor: '#000',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 20px',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h1
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.5px',
                marginBottom: 8,
              }}
            >
              Completing Sign In
            </h1>
            <p style={{ ...mono, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#444' }}>
              Processing your {provider} login…
            </p>
          </>
        ) : error ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 16, color: '#c00' }}>✕</div>
            <h1
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.5px',
                marginBottom: 8,
              }}
            >
              Sign In Failed
            </h1>
            <p style={{ ...mono, fontSize: 11, color: '#444', marginBottom: 24 }}>{error}</p>
            <button
              onClick={() => router.push('/auth/login')}
              style={{
                padding: '12px 28px',
                border: '1px solid #000',
                background: '#000',
                color: '#fff',
                cursor: 'pointer',
                ...mono,
                fontSize: 10,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              Back to Login
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 16, color: '#1a7f37' }}>✓</div>
            <h1
              style={{
                fontFamily: "'Outfit', sans-serif",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.5px',
              }}
            >
              Sign In Successful
            </h1>
            <p style={{ ...mono, fontSize: 11, color: '#444', letterSpacing: 2, textTransform: 'uppercase' }}>
              Redirecting to dashboard…
            </p>
          </>
        )}
      </div>
    </div>
  );
}