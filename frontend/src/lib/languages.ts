/**
 * Configuração dinâmica de idiomas suportados
 * Para adicionar um novo idioma:
 * 1. Adicione o código do idioma aqui
 * 2. Adicione as traduções em translations.ts
 * 3. O sistema irá automaticamente reconhecê-lo
 */

export interface LanguageConfig {
  code: string; // Código ISO 639-1 (pt, en, fr, es, etc.)
  name: string; // Nome do idioma no próprio idioma
  nativeName: string; // Nome nativo do idioma
  locale: string; // Locale para formatação (pt-PT, en-US, fr-FR, etc.)
  flag: string; // Emoji da bandeira
  currency: string; // Moeda padrão para este idioma
}

export const SUPPORTED_LANGUAGES: Record<string, LanguageConfig> = {
  pt: {
    code: 'pt',
    name: 'Português',
    nativeName: 'Português',
    locale: 'pt-PT',
    flag: '🇵🇹',
    currency: 'EUR',
  },
  en: {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    locale: 'en-US',
    flag: '🇬🇧',
    currency: 'USD',
  },
  // Adicione novos idiomas aqui seguindo este padrão:
  // Para ativar um idioma, descomente o bloco correspondente E adicione as traduções em translations.ts
  // fr: {
  //   code: 'fr',
  //   name: 'French',
  //   nativeName: 'Français',
  //   locale: 'fr-FR',
  //   flag: '🇫🇷',
  //   currency: 'EUR',
  // },
  // es: {
  //   code: 'es',
  //   name: 'Spanish',
  //   nativeName: 'Español',
  //   locale: 'es-ES',
  //   flag: '🇪🇸',
  //   currency: 'EUR',
  // },
  // Exemplo para adicionar mais idiomas:
  // de: {
  //   code: 'de',
  //   name: 'German',
  //   nativeName: 'Deutsch',
  //   locale: 'de-DE',
  //   flag: '🇩🇪',
  //   currency: 'EUR',
  // },
  // it: {
  //   code: 'it',
  //   name: 'Italian',
  //   nativeName: 'Italiano',
  //   locale: 'it-IT',
  //   flag: '🇮🇹',
  //   currency: 'EUR',
  // },
};

export const DEFAULT_LANGUAGE = 'pt';

export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'BRL'] as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

/**
 * Obtém a configuração de um idioma
 */
export function getLanguageConfig(code: string): LanguageConfig | undefined {
  return SUPPORTED_LANGUAGES[code];
}

/**
 * Obtém o idioma padrão baseado no browser
 */
export function getBrowserLanguage(): LanguageCode {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
  
  const browserLang = navigator.language.toLowerCase();
  
  // Verifica se o idioma do browser está suportado
  for (const [code, config] of Object.entries(SUPPORTED_LANGUAGES)) {
    if (browserLang.startsWith(code)) {
      return code as LanguageCode;
    }
  }
  
  // Fallback para idioma padrão
  return DEFAULT_LANGUAGE;
}

/**
 * Obtém todos os idiomas suportados como array
 */
export function getSupportedLanguages(): LanguageConfig[] {
  return Object.values(SUPPORTED_LANGUAGES);
}

/**
 * Verifica se um idioma está suportado
 */
export function isLanguageSupported(code: string): code is LanguageCode {
  return code in SUPPORTED_LANGUAGES;
}

