// Talking to the server. Money is paisa both ways. A 401 signs the user out; any error throws an Error with the server's message.
(function () {
    'use strict';
    const KEY = 'hp.token';
    const token = () => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } };
    const setToken = t => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { } };

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
                if (HP.app) HP.app.signedOut(err.message);
            }
            throw err;
        }
        return data;
    }

    // download a file (CSV, backup) with the token
    async function download(path, filename) {
        const res = await fetch(path, { headers: { Authorization: 'Bearer ' + token() } });
        if (!res.ok) { let m = 'Download failed.'; try { m = (await res.json()).error || m; } catch { } throw new Error(m); }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename || (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'download';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }

    // query string from an object (skips empty values)
    const qs = o => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== '' && v !== undefined && v !== null) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };

    HP.api = {
        get: (p, q) => req('GET', p + (q ? qs(q) : '')), post: (p, b) => req('POST', p, b ?? {}), put: (p, b) => req('PUT', p, b ?? {}),
        patch: (p, b) => req('PATCH', p, b ?? {}), del: p => req('DELETE', p), download, qs, token, setToken,
    };
})();
