// Service worker: push notifikace + offline.
//
// Strategie záměrně dvojí:
//  - navigace (HTML) jde nejdřív na síť, ať se nová verze projeví hned;
//    offline spadne na uloženou stránku,
//  - ostatní statika je stale-while-revalidate: odpoví se hned z cache
//    (takže offline a rychlý start), ale na pozadí se stáhne čerstvá verze
//    pro příští načtení. Čistě cache-first se neosvědčilo — změna v CSS bez
//    ručního zvýšení ?v=N se k vracejícímu se hráči nikdy nedostala.
//  - /api/*, /u/* a /prihlaseni se necachují vůbec.

const CACHE = 'slov2000-v18';
const SHELL = [
    '/',
    '/style.css?v=11',
    '/designs/kostky.css?v=13',
    '/fonts/SlovkaOne-Regular.woff2',
    '/words.js?v=4',
    '/game.js?v=14',
    '/manifest.webmanifest',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-touch-icon.png',
    '/icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            // addAll je vše-nebo-nic; jeden chybějící soubor by shodil celou
            // instalaci, proto se ukládá po jednom a výpadky se ignorují.
            .then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {}))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

const nikdyNecachovat = (url) =>
    url.pathname.startsWith('/api/') || url.pathname.startsWith('/u/') || url.pathname === '/prihlaseni';

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin === location.origin && nikdyNecachovat(url)) return;

    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then(res => {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put('/', copy)).catch(() => {});
                    return res;
                })
                .catch(() => caches.match('/').then(r => r || Response.error()))
        );
        return;
    }

    event.respondWith(
        caches.match(req).then(hit => {
            // Uloží se jen povedené odpovědi. Google Fonts chodí s CORS
            // hlavičkami (type 'cors'), takže se uložit dají — bez toho by
            // hra offline naskočila v systémovém fontu místo vlastního.
            const cerstve = fetch(req).then(res => {
                if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
                    const copy = res.clone();
                    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
                }
                return res;
            }).catch(() => hit);
            return hit || cerstve;
        })
    );
});

self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch (e) {}
    const title = data.title || '20 slov';
    event.waitUntil(self.registration.showNotification(title, {
        body: data.body || 'Dnešní slovo na tebe čeká!',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        data: { url: data.url || './' },
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || './';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if ('focus' in client) return client.focus();
            }
            return clients.openWindow(url);
        })
    );
});
