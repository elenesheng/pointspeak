'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { LogIn, LogOut, CheckCircle, AlertCircle } from 'lucide-react';

export const AuthButton: React.FC = () => {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg text-xs text-slate-400">
        <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
        Checking...
      </div>
    );
  }

  if (session) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-900/30 border border-emerald-700/50 rounded-lg text-xs text-emerald-400">
          <CheckCircle className="w-3 h-3" />
          Imagen Ready
        </div>
        <button
          onClick={() => signOut()}
          className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs text-slate-400 transition-colors"
          title="Sign out"
        >
          <LogOut className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn('google')}
      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs text-white font-medium transition-colors"
    >
      <LogIn className="w-3.5 h-3.5" />
      Sign in for Imagen
    </button>
  );
};

