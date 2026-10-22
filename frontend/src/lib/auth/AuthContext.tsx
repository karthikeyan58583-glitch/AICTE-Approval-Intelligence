'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { AppRole, UserProfile } from '@/types/auth';

interface AuthContextType {
  user: UserProfile | null;
  authUser: User | null;
  role: AppRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  isConfigured: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  authUser: null,
  role: 'applicant_institution_representative',
  isLoading: false,
  isAuthenticated: false,
  isConfigured: false,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [configured] = useState<boolean>(() => isSupabaseConfigured());
  const [user, setUser] = useState<UserProfile | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [role, setRole] = useState<AppRole>('applicant_institution_representative');
  // If not configured, loading is false immediately. If configured, loading remains true until session check completes.
  const [isLoading, setIsLoading] = useState<boolean>(() => isSupabaseConfigured());

  const fetchProfile = useCallback(async (supabaseUser: User | null) => {
    if (!supabaseUser) {
      setUser(null);
      setAuthUser(null);
      setRole('applicant_institution_representative');
      return;
    }

    setAuthUser(supabaseUser);
    const supabase = createClient();

    try {
      const { data: profile, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();

      if (profile && !error) {
        const mappedProfile: UserProfile = {
          id: profile.id,
          email: profile.email,
          fullName: profile.full_name,
          role: profile.role,
          institutionName: profile.institution_name,
          regionalOffice: profile.regional_office,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        };
        setUser(mappedProfile);
        setRole(mappedProfile.role);
      } else {
        // Fallback profile if record is still being created by trigger
        const fallback: UserProfile = {
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          fullName: (supabaseUser.user_metadata?.full_name as string) || 'Institution Representative',
          role: 'applicant_institution_representative',
          institutionName: (supabaseUser.user_metadata?.institution_name as string) || null,
          regionalOffice: null,
          createdAt: supabaseUser.created_at,
          updatedAt: supabaseUser.created_at,
        };
        setUser(fallback);
        setRole('applicant_institution_representative');
      }
    } catch {
      // Graceful fallback
    }
  }, []);

  useEffect(() => {
    if (!configured) {
      return;
    }

    const supabase = createClient();

    // Check active session on initial load asynchronously
    supabase.auth.getUser().then((res: { data: { user: User | null } }) => {
      fetchProfile(res.data.user).finally(() => {
        setIsLoading(false);
      });
    });

    // Subscribe to auth state changes (sign in, sign out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event: AuthChangeEvent, session: Session | null) => {
      await fetchProfile(session?.user || null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [configured, fetchProfile]);

  const signOut = async () => {
    if (configured) {
      const supabase = createClient();
      await supabase.auth.signOut();
    }
    setUser(null);
    setAuthUser(null);
    setRole('applicant_institution_representative');
    router.push('/login');
    router.refresh();
  };

  const refreshProfile = async () => {
    if (authUser) {
      await fetchProfile(authUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        authUser,
        role,
        isLoading,
        isAuthenticated: Boolean(user),
        isConfigured: configured,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
