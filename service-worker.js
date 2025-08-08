const CACHE_NAME = 'pilgrimage-map-cache-v1';

// アプリケーションを構成する基本的なファイル（アプシェル）を定義します。
// 外部CDNのファイルもキャッシュ対象に含めます。
const urlsToCache = [
  '/', // ルートパスもキャッシュします
  'index.html',
  'css/style.css',
  'js/main.js',
  'videos/ad_01.mp4',
  'icon-192x192.png',
  'icon-512x512.png',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/t-flick-keyboard@1/dist/css/style.min.css',
  'https://unpkg.com/vue@3/dist/vue.global.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/t-flick-keyboard@1/dist/js/index.min.js'
];

// サービスワーカーのインストール時に、定義したファイルをキャッシュします。
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache and caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

// fetchイベント（ネットワークリクエスト）を捕捉します。
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Google Apps Scriptへのリクエストの場合
  // 常にネットワークから最新のデータを取得し、取得できたらキャッシュも更新します（Stale-While-Revalidate戦略）。
  // オフラインの場合は、古いキャッシュがあればそれを返します。
  if (url.hostname === 'script.google.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return fetch(event.request).then((networkResponse) => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        }).catch(() => {
          return cache.match(event.request);
        });
      })
    );
    return; // ここで処理を終了
  }
  
  // Google Maps APIや関連リソースへのリクエストの場合
  // これらは動的なので、キャッシュせず常にネットワークに接続します。
  if (url.hostname.includes('googleapis.com')) {
    event.respondWith(fetch(event.request));
    return; // ここで処理を終了
  }

  // 上記以外のリクエスト（アプシェルなど）の場合
  // まずキャッシュに存在するか確認し、あればそれを返します（Cache First戦略）。
  // なければネットワークから取得します。
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});

// 古いキャッシュを削除する処理
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});