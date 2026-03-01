'use client';

import React, { createContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth as apiAuth } from '@/api-client';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize auth from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('subvault_token');
        if (token) {
          // Validate token with backend
          const response = await apiAuth.me();
          setUser(response);
        }
      } catch (err) {
        // Token invalid or expired, clear it
        localStorage.removeItem('subvault_token');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email, password) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiAuth.login(email, password);
      localStorage.setItem('subvault_token', response.token);
      setUser(response.user);
      return response;
    } catch (err: any) {
      const errorMsg = err?.message || 'Login failed. Please check your credentials.';
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email, password, name) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiAuth.register(email, password, name);
      localStorage.setItem('subvault_token', response.token);
      setUser(response.user);
      return response;
    } catch (err: any) {
      const errorMsg = err?.message || 'Registration failed. Please try again.';
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('subvault_token');
    setUser(null);
    setError(null);
    router.push('/auth/login');
  };

  const startOAuthFlow = (provider) => {
    // Determine the OAuth URL based on provider
    let oauthUrl = '';
    const redirectUri = `${window.location.origin}/auth/${provider}/callback`;
    const state = Math.random().toString(36).substring(7);
    localStorage.setItem(`oauth_state_${provider}`, state);

    if (provider === 'google') {
      const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
      }).toString()}`;
    } else if (provider === 'github') {
      const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
      oauthUrl = `https://github.com/login/oauth/authorize?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: 'user:email',
        state,
      }).toString()}`;
    }

    if (oauthUrl) {
      window.location.href = oauthUrl;
    }
  };

  const handleOAuthCallback = async (provider, code, state) => {
    setIsLoading(true);
    setError(null);
    try {
      // Verify state parameter
      const savedState = localStorage.getItem(`oauth_state_${provider}`);
      if (savedState !== state) {
        throw new Error('State mismatch - possible CSRF attack');
      }

      const redirectUri = `${window.location.origin}/auth/${provider}/callback`;
      const response = await apiAuth.oauthCallback(provider, code, redirectUri);

      localStorage.setItem('subvault_token', response.token);
      setUser(response.user);
      localStorage.removeItem(`oauth_state_${provider}`);
      return response;
    } catch (err: any) {
      const errorMsg = err?.message || `${provider} authentication failed. Please try again.`;
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const value = {
    user,
    isLoading,
    error,
    login,
    register,
    logout,
    startOAuthFlow,
    handleOAuthCallback,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
