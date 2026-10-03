'use client';

import React, { createContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth as apiAuth } from '@/api-client';
import { supabase } from '@/lib/supabase';

interface AuthUser {
  id?: string | number;
  email?: string;
  name?: string;
  // Allow extra fields from backend without strict typing
  [key: string]: unknown;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<unknown>;
  register: (email: string, password: string, name: string) => Promise<unknown>;
  logout: () => void;
  startOAuthFlow: (provider: string) => Promise<void>;
  handleOAuthCallback: (provider: string, code: string) => Promise<unknown>;
  updateProfile: (data: Partial<AuthUser>) => Promise<AuthUser>;
  refreshAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

type AuthProviderProps = {
  children: React.ReactNode;
};

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthContextType['user']>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth from localStorage
  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('subvault_token');
        if (token) {
          // Validate token with backend and normalize shape
          const response = await apiAuth.me();
          const normalizedUser: AuthUser =
            (response && (response.user as AuthUser)) || (response as AuthUser);
          setUser(normalizedUser);
        }
      } catch {
        // Token invalid or expired, clear it
        localStorage.removeItem('subvault_token');
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiAuth.login(email, password);
      localStorage.setItem('subvault_token', response.token);
      const normalizedUser: AuthUser =
        (response && (response.user as AuthUser)) || (response as AuthUser);
      setUser(normalizedUser);
      return response;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error && err.message
          ? err.message
          : 'Login failed. Please check your credentials.';
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, name: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiAuth.register(email, password, name);
      localStorage.setItem('subvault_token', response.token);
      const normalizedUser: AuthUser =
        (response && (response.user as AuthUser)) || (response as AuthUser);
      setUser(normalizedUser);
      return response;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error && err.message
          ? err.message
          : 'Registration failed. Please try again.';
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

  const refreshAuth = async () => {
    try {
      const token = localStorage.getItem('subvault_token');
      if (token) {
        const response = await apiAuth.me();
        const normalizedUser: AuthUser =
          (response && (response.user as AuthUser)) || (response as AuthUser);
        setUser(normalizedUser);
      }
    } catch {
      localStorage.removeItem('subvault_token');
      setUser(null);
    }
  };

  const startOAuthFlow = async (provider: string) => {
    if (provider === 'google') {
      const redirectTo = `${window.location.origin}/auth/google/callback`;
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    }
  };

  const handleOAuthCallback = async (provider: string, code: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(code);
      if (sessionError || !data.session) throw new Error('Failed to complete authentication');

      const response = await apiAuth.supabaseSync(data.session.access_token);
      localStorage.setItem('subvault_token', response.token);
      const normalizedUser: AuthUser =
        (response && (response.user as AuthUser)) || (response as AuthUser);
      setUser(normalizedUser);
      return response;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error && err.message
          ? err.message
          : `${provider} authentication failed. Please try again.`;
      setError(errorMsg);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (data: Partial<AuthUser>) => {
    const response = await apiAuth.updateProfile(data);
    const normalizedUser: AuthUser =
      (response && (response.user as AuthUser)) || (response as AuthUser);
    setUser(normalizedUser);
    return normalizedUser;
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
    updateProfile,
    refreshAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
