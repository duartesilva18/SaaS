'use client';

import useSWR from 'swr';
import api, { fetcher } from './api';
import { useUser } from './UserContext';
import { DEMO_CATEGORIES } from './mockData';

export function useCategories() {
  const { user } = useUser();
  const { data, error, isLoading, mutate } = useSWR('/categories/', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });

  const hasActiveSub = user?.subscription_status === 'active';
  // Se não for Pro e não houver dados, retorna Mock Categories
  const categories = !hasActiveSub && (!data || data.length === 0) ? DEMO_CATEGORIES : data || [];

  return {
    categories,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useTransactions() {
  const { data, error, isLoading, mutate } = useSWR('/transactions/', fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 10000,
  });

  return {
    transactions: data || [],
    isLoading,
    isError: error,
    mutate,
  };
}

export function useZenInsights() {
  const { data, error, isLoading, mutate } = useSWR('/insights/', fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 10000,
  });

  return {
    data,
    isLoading,
    isError: error,
    mutate,
  };
}

export function useInsights() {
  const { data, error, isLoading, mutate } = useSWR('/insights/composite', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });

  return {
    insights: data,
    isLoading,
    isError: error,
    mutate,
  };
}

