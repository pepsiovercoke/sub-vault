'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams, useParams } from 'next/navigation';
import { useAuth } from '@/app/components/auth/useAuth';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const { handleOAuthCallback } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(true);

  const provider = typeof params.provider === 'string' ? params.provider : Array.isArray(params.provider) ? params.provider[0] : undefined;
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');
  const state = searchParams.get('state');

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Check for OAuth provider errors
        if (errorParam) {
          setError(`Authorization failed: ${errorParam}`);
          setIsProcessing(false);
          return;
        }

        // Check for authorization code
        if (!code) {
          setError('No authorization code received');
          setIsProcessing(false);
          return;
        }

        // Handle the OAuth callback
        await handleOAuthCallback(provider, code, state || '');

        // Redirect to dashboard on success
        router.push('/dashboard');
      } catch (err) {
        setError(err.message || 'OAuth callback failed. Please try again.');
        setIsProcessing(false);
      }
    };

    if (provider && code) {
      processCallback();
    } else if (!provider) {
      setError('Invalid provider');
      setIsProcessing(false);
    }
  }, [provider, code, state, handleOAuthCallback, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            {isProcessing ? (
              <>
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <h1 className="text-xl font-semibold text-gray-900 mb-2">Completing Sign In</h1>
                <p className="text-gray-600">Please wait while we process your {provider} login...</p>
              </>
            ) : error ? (
              <>
                <div className="text-red-600 text-4xl mb-4">✕</div>
                <h1 className="text-xl font-semibold text-gray-900 mb-2">Sign In Failed</h1>
                <p className="text-gray-600 mb-6">{error}</p>
                <a
                  href="/auth/login"
                  className="inline-block px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                >
                  Back to Login
                </a>
              </>
            ) : (
              <>
                <div className="text-green-600 text-4xl mb-4">✓</div>
                <h1 className="text-xl font-semibold text-gray-900">Sign In Successful</h1>
                <p className="text-gray-600">Redirecting to dashboard...</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
