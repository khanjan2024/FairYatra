import {
  createContext, useContext, useState, useEffect, useCallback,
  type ReactNode,
} from 'react';
import { supabase } from './supabase';
import { fetchProfile, logOut as authLogOut } from './auth';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  logOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null, isAdmin: false,
  refresh: async () => {}, logOut: async () => {},
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { setUser(null); return; }
    const profile = await fetchProfile(session.user.id);
    if (profile) setUser({ ...profile, email: session.user.email ?? '' });
    else setUser(null);
  }, []);

  useEffect(() => {
    // Restore session on mount
    refresh().finally(() => setLoading(false));

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (!session?.user) { setUser(null); return; }
        const profile = await fetchProfile(session.user.id);
        if (profile) setUser({ ...profile, email: session.user.email ?? '' });
        else setUser(null);
      },
    );
    return () => subscription.unsubscribe();
  }, [refresh]);

  const logOut = useCallback(async () => {
    await authLogOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAdmin: user?.role === 'admin',
      refresh,
      logOut,
      loading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
