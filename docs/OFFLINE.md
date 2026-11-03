# Offline mode

The site is an installable web app (PWA). After one visit online it opens without internet.

- **Saved on the device:** the site files, and the last-seen services, pricing, portfolio, store, tools, news and settings, plus images you viewed.
- **Order tracking:** the last status of orders you tracked on this device is kept (up to 8) and shown with an "Offline" notice.
- **Not available offline:** ordering, payment proof, messages, the admin panel, videos and publisher news images.
- **Install:** browser menu → "Add to Home Screen" / "Install app".
- **Refresh:** when online the network always wins; data is re-saved at most every 6 hours (skipped on data-saver).
- **Release:** bump `?v=` everywhere and `V` in `sw.js`; old caches are removed on activation.
