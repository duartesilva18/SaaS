// Service Worker para PWA
const CACHE_NAME = 'finanzen-v1';
const RUNTIME_CACHE = 'finanzen-runtime-v1';

// Assets para cachear imediatamente
const STATIC_ASSETS = [
  '/',
  '/dashboard',
  '/transactions',
  '/analytics',
  '/manifest.json'
];

// Instalação do Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Ativação do Service Worker
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== RUNTIME_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  return self.clients.claim();
});

// Estratégia: Network First, fallback para Cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests não-GET
  if (request.method !== 'GET') {
    return;
  }

  // Ignorar requests para APIs externas (Stripe, etc)
  if (url.origin !== self.location.origin && !url.pathname.startsWith('/api')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clonar a resposta para cachear
        const responseToCache = response.clone();
        
        // Cachear apenas respostas válidas
        if (response.status === 200) {
          caches.open(RUNTIME_CACHE).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Fallback para cache se a rede falhar
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Se for uma página, retornar a página inicial
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});

