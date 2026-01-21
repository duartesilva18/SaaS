'use client';

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import api from './api';

interface User {
  id: string;
  email: string;
  full_name?: string;
  phone_number?: string;
  currency: string;
  gender?: string;
  is_active: boolean;
  is_admin: boolean;
  is_email_verified: boolean;
  is_onboarded: boolean;
  marketing_opt_in: boolean;
  subscription_status?: string;
  created_at: string;
}

interface UserContextType {
  user: User | null;
  loading: boolean;
  refreshUser: () => Promise<void>;
  isPro: boolean;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch (err) {
      // Token inválido ou expirado
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const isPro = user?.subscription_status === 'active';

  return (
    <UserContext.Provider value={{ user, loading, refreshUser: fetchUser, isPro }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

