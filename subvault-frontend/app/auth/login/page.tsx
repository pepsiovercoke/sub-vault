'use client';

import Link from 'next/link';
import { LoginForm } from '@/app/components/auth/LoginForm';
import { OAuthButton } from '@/app/components/auth/OAuthButton';
import { AuthLayout } from '@/app/components/auth/AuthLayout';

export default function LoginPage() {
  return (
    <AuthLayout title="SubVault" subtitle="Welcome back">
      <div className="space-y-6">
        <LoginForm />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-900">Or continue with</span>
          </div>
        </div>

        <div className="space-y-3">
          <OAuthButton provider="google" />
          <OAuthButton provider="github" />
        </div>

        <p className="text-center text-sm text-gray-900">
          Don't have an account?{' '}
          <Link href="/auth/register" className="font-medium text-blue-600 hover:text-blue-700">
            Sign up
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
