'use client';

import { useEffect } from 'react';
import { useAuth } from '@/app/components/auth/useAuth';

export default function LogoutPage() {
  const { logout } = useAuth();

  useEffect(() => {
    // Perform logout and redirect
    logout();
  }, [logout]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Logging out</h1>
          <p className="text-gray-600">Please wait...</p>
        </div>
      </div>
    </div>
  );
}
