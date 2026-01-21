'use client';

import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { translations } from './translations';

type Language = 'pt' | 'en';
type Currency = 'EUR' | 'USD' | 'BRL';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  currency: Currency;
  setCurrency: (curr: Currency) => void;
  t: typeof translations.pt;
  formatCurrency: (amount: number) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('pt');
  const [currency, setCurrencyState] = useState<Currency>('EUR');

  useEffect(() => {
    const savedLang = localStorage.getItem('language');
    const savedCurrency = localStorage.getItem('currency');

    if (savedLang && (savedLang === 'pt' || savedLang === 'en')) {
      setLanguageState(savedLang);
    } else {
      const browserLang = navigator.language.toLowerCase();
      const defaultLang = browserLang.startsWith('pt') ? 'pt' : 'en';
      setLanguageState(defaultLang);
      localStorage.setItem('language', defaultLang);
    }

    if (savedCurrency && (savedCurrency === 'EUR' || savedCurrency === 'USD' || savedCurrency === 'BRL')) {
      setCurrencyState(savedCurrency);
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  }, []);

  const setCurrency = useCallback((curr: Currency) => {
    setCurrencyState(curr);
    localStorage.setItem('currency', curr);
  }, []);

  const formatCurrency = useCallback((amount: number) => {
    const locale = language === 'pt' ? 'pt-PT' : 'en-US';
    // Para Real, usamos pt-BR para garantir o símbolo R$ e formatação brasileira
    const finalLocale = currency === 'BRL' ? 'pt-BR' : locale;
    return new Intl.NumberFormat(finalLocale, {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }, [language, currency]);

  const t = useMemo(() => translations[language], [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, currency, setCurrency, t, formatCurrency }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
}
