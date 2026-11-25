// Talking to the server. Money is paisa both ways. A 401 signs the user out; any error throws an Error with the server's message.
(function () {
    'use strict';
    const KEY = 'hp.token';
    const token = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
    const setToken = t => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { } forget(); }; // another user: nothing kept carries over

    async function req(method, path, body) {
        let res;
        try {
            res = await fetch(path, {
                method,
                headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch {
            throw Object.assign(new Error('Cannot reach the server. Check the connection and try again.'), { network: true });
        }
        let data = null;
        const text = await res.text();
        try { data = text ? JSON.parse(text) : null; } catch { data = null; }
        if (!res.ok) {
            const err = Object.assign(new Error((data && data.error) || `Request failed (${res.status}).`), { status: res.status, data });
            if (res.status === 401 && !path.startsWith('/api/auth/login') && !path.startsWith('/api/desktop/')) {
                setToken('');
                forget();
                if (HP.app) HP.app.signedOut(err.message);
            }
            throw err;
        }
        if (method !== 'GET') forget(); // something changed: every screen reads fresh data from now on
        return data;
    }

    // ── remembered answers (web and phone) ──
    // A screen opened in the last FRESH ms opens again at once from the answer kept here, and two parts of a screen asking
    // for the same thing share one request. Anything saved from this device (POST / PUT / PATCH / DELETE) forgets all of
    // them, so your own changes always show; changes made on another device show after FRESH or on a page refresh.
    // The desktop app reads its own database on the PC (fast), so it always asks.
    const FRESH = 30000;
    const ALWAYS_ASK = /^\/api\/(auth|desktop|sync|health|updates|backup|admin\/(storage|maintenance))/;
    const kept = new Map(); // url → { at, promise }
    const copy = d => (d && typeof d === 'object' ? structuredClone(d) : d); // a screen may sort or change what it gets
    function forget() { kept.clear(); }
    function get(url, { fresh = false } = {}) {
        if (fresh || window.hpDesktop || HP.isDesktop || ALWAYS_ASK.test(url)) return req('GET', url);
        const hit = kept.get(url);
        if (hit && Date.now() - hit.at < FRESH) return hit.promise.then(copy);
        const promise = req('GET', url);
        kept.set(url, { at: Date.now(), promise });
        promise.catch(() => kept.delete(url));
        return promise.then(copy);
    }
    // fetch in the background what the next screen will need, so it opens at once (errors are ignored)
    const prefetch = urls => urls.forEach(u => get(u).catch(() => { }));

    // download a file (CSV, backup) with the token
    async function download(path, filename) {
        const res = await fetch(path, { headers: { Authorization: 'Bearer ' + token() } });
        if (!res.ok) { let m = 'Download failed.'; try { m = (await res.json()).error || m; } catch { } throw new Error(m); }
        const blob = await res.blob();
        HP.ui.saveBlob(blob, filename || (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'download');
    }

    // query string from an object (skips empty values)
    const qs = o => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== '' && v !== undefined && v !== null) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };

    HP.api = {
        get: (p, q, o) => get(p + (q ? qs(q) : ''), o), post: (p, b) => req('POST', p, b ?? {}), put: (p, b) => req('PUT', p, b ?? {}),
        patch: (p, b) => req('PATCH', p, b ?? {}), del: p => req('DELETE', p), download, qs, token, setToken, forget, prefetch: list => prefetch(list.map(([p, q]) => p + (q ? qs(q) : ''))),
    };
})();
