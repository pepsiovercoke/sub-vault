'use client';

import Link from 'next/link';
import { RegisterForm } from '@/app/components/auth/RegisterForm';
import { OAuthButton } from '@/app/components/auth/OAuthButton';
import { AuthLayout } from '@/app/components/auth/AuthLayout';

export default function RegisterPage() {
  return (
    <AuthLayout title="Create account" subtitle="Join SubVault today">
      <div className="space-y-6">
        <RegisterForm />

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-900">Or sign up with</span>
          </div>
        </div>

        <div className="space-y-3">
          <OAuthButton provider="google" />
          <OAuthButton provider="github" />
        </div>

        <p className="text-center text-sm text-gray-900">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-blue-600 hover:text-blue-700">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}
