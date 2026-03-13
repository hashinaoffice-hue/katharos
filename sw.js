self.addEventListener('install', (e) => {
    console.log('[Service Worker] Install');
});

self.addEventListener('fetch', (e) => {
    // 오프라인 캐싱 최소 조건 충족용
    e.respondWith(fetch(e.request).catch(() => new Response('오프라인 상태입니다.')));
});