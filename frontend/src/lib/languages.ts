// Tipos de idiomas e moedas suportados
export type LanguageCode = 'pt' | 'en' | 'es';
export type CurrencyCode = 'EUR' | 'USD' | 'BRL' | 'GBP';

// Idiomas suportados
export const SUPPORTED_LANGUAGES: LanguageCode[] = ['pt', 'en', 'es'];

// Moedas suportadas
export const SUPPORTED_CURRENCIES: CurrencyCode[] = ['EUR', 'USD', 'BRL', 'GBP'];

// Idioma padrão
export const DEFAULT_LANGUAGE: LanguageCode = 'pt';

// Configuração de idiomas
export interface LanguageConfig {
  code: LanguageCode;
  name: string;
  locale: string;
  currency: CurrencyCode;
}

export const LANGUAGE_CONFIGS: Record<LanguageCode, LanguageConfig> = {
  pt: {
    code: 'pt',
    name: 'Português',
    locale: 'pt-PT',
    currency: 'EUR',
  },
  en: {
    code: 'en',
    name: 'English',
    locale: 'en-US',
    currency: 'USD',
  },
  es: {
    code: 'es',
    name: 'Español',
    locale: 'es-ES',
    currency: 'EUR',
  },
};

// Detectar idioma do browser
export function getBrowserLanguage(): LanguageCode {
  if (typeof window === 'undefined') {
    return DEFAULT_LANGUAGE;
  }

  const browserLang = navigator.language || (navigator as any).userLanguage;
  
  // Extrair código de idioma (ex: 'pt-PT' -> 'pt')
  const langCode = browserLang.split('-')[0].toLowerCase() as LanguageCode;
  
  // Verificar se é suportado
  if (isLanguageSupported(langCode)) {
    return langCode;
  }
  
  // Fallback para idioma padrão
  return DEFAULT_LANGUAGE;
}

// Verificar se idioma é suportado
export function isLanguageSupported(lang: string): lang is LanguageCode {
  return SUPPORTED_LANGUAGES.includes(lang as LanguageCode);
}

// Obter configuração de idioma
export function getLanguageConfig(lang: LanguageCode): LanguageConfig | undefined {
  return LANGUAGE_CONFIGS[lang];
}

