/* Card Usage Manager / PWA app-shell cache v0.3.0.
 * IndexedDBやPIN情報、バックアップはキャッシュしない。
 * バージョン変更時は CACHE_NAME を更新すること。
 */
'use strict';
const CACHE_PREFIX = 'credit-card-usage-static-';
const CACHE_NAME = CACHE_PREFIX + 'v0.3.0';
const APP_FILES = ['index.html', 'manifest.json', 'icons/icon-192.png', 'icons/icon-512.png'];
const APP_URLS = APP_FILES.map(path => new URL(path, self.registration.scope).href);
const ALLOWED_URLS = new Set(APP_URLS);

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        // 配信元からのみ取得し、インストールが全件成功した場合だけ新SWを有効化する。
        await cache.addAll(APP_URLS.map(url => new Request(url, { cache: 'reload', credentials: 'same-origin' })));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map(key => caches.delete(key)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET' || !ALLOWED_URLS.has(event.request.url))
        return; // 対象は同一オリジンの固定アプリ資産だけ。その他の通信は代行しない。
    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(event.request);
        if (cached)
            return cached;
        return fetch(event.request); // キャッシュ消失時のみ、同一配信元へフォールバック。
    })());
});
