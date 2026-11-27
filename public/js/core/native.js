// The HisabPro Android app (mobile/, Capacitor — see docs/ANDROID.md). The app shows this same web app from the live
// server and Capacitor injects window.Capacitor; native helpers are called with Capacitor.nativePromise(plugin, method):
//   CapacitorBarcodeScanner.scanBarcode   camera barcode scanning
//   HpNative.listPrinters / print         Bluetooth thermal receipt printer (ESC/POS picture of the receipt)
//   HpNative.systemPrint                  Android print dialog (A4 invoices, reports, labels, Save as PDF)
//   HpNative.shareFile                    files made in the page (CSV, backups) → Android share sheet
//   App.getInfo                           installed app version (for "a new version is available")
// On the web and in the Windows app everything here is inert: isApp() is false.
(function () {
    'use strict';
    const { html, icon, t, ui } = HP;

    // the app adds "HisabProApp/<version>" to its user agent (capacitor.config.json → android.appendUserAgent)
    const isApp = () => /HisabProApp\//.test(navigator.userAgent);
    async function call(plugin, method, options) {
        // Capacitor's bridge may arrive a moment after the page starts
        for (let i = 0; i < 40 && !(window.Capacitor && window.Capacitor.nativePromise); i++) await new Promise(r => setTimeout(r, 100));
        if (!(window.Capacitor && window.Capacitor.nativePromise)) throw new Error('This works in the HisabPro Android app only.');
        try { return await window.Capacitor.nativePromise(plugin, method, options || {}); }
        catch (e) { throw new Error((e && e.message) || String(e)); }
    }
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
        set(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { } },
    };

    // ── camera barcode scanning ──
    // resolves with the code, or null when the user closed the scanner
    async function scan() {
        try {
            const r = await call('CapacitorBarcodeScanner', 'scanBarcode', { hint: 17, scanInstructions: t('Point the camera at the barcode'), scanButton: false, android: { scanningLibrary: 'mlkit' } });
            return (r && r.ScanResult ? String(r.ScanResult).trim() : '') || null;
        } catch (e) {
            if (/cancel/i.test(e.message)) return null;
            throw e;
        }
    }

    // ── Bluetooth receipt printer (saved on this phone) ──
    const KEY_PRINTER = 'hp.btPrinter', KEY_WIDTH = 'hp.btPaper';
    const printer = () => store.get(KEY_PRINTER, null);
    const shopWidth = () => (((HP.session && HP.session.settings && HP.session.settings.receipt) || {}).width === '80' ? '80' : '58');
    const paper = () => store.get(KEY_WIDTH, null) || shopWidth();

    // the receipt's own design, drawn as a picture at the printer's width (Urdu, logo, barcode and QR print as on screen)
    const MONO = '"Roboto Mono", "Droid Sans Mono", "DejaVu Sans Mono", "Courier New", monospace';
    // the app's base styles count padding inside widths (border-box) and start with no default margins: the same here,
    // or the picture comes out wider than the paper and the right edge is cut
    const RECEIPT_CSS = `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}img,svg{vertical-align:middle}
        .receipt{font-family:${MONO};color:#000;background:#fff;font-size:12px;line-height:1.35;font-weight:500}
        .receipt.w58{width:54mm}.receipt.w80{width:72mm}.receipt hr{border:0;border-top:1px dashed #000;margin:6px 0}
        .receipt table{border-collapse:collapse;width:100%}.receipt td{padding:0}.receipt img{max-width:100%}`;
    async function receiptPicture(el, dots) {
        const { g, H } = await receiptCanvas(el, dots);
        return EscPos.trim(EscPos.toMono(g.getImageData(0, 0, dots, H).data, dots, H));
    }
    // the receipt drawn on a white canvas `dots` wide (its height follows the receipt)
    async function receiptCanvas(el, dots) {
        const box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:-20000px;top:0;background:#fff;pointer-events:none';
        const clone = el.cloneNode(true);
        clone.style.fontFamily = MONO; clone.style.fontWeight = String(Math.max(500, Number(clone.style.fontWeight) || 400));
        box.appendChild(clone); document.body.appendChild(box);
        try {
            const w = Math.max(1, clone.offsetWidth);
            const h = Math.ceil(clone.offsetHeight * 1.08) + 24; // a little extra; blank rows are trimmed afterwards
            const scale = dots / w, H = Math.ceil(h * scale);
            const body = new XMLSerializer().serializeToString(clone);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dots}" height="${H}" viewBox="0 0 ${w} ${h}"><foreignObject x="0" y="0" width="${w}" height="${h}"><div xmlns="http://www.w3.org/1999/xhtml" style="background:#fff"><style>${RECEIPT_CSS}</style>${body}</div></foreignObject></svg>`;
            const img = new Image();
            await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('The receipt could not be drawn for the printer.')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
            const c = document.createElement('canvas'); c.width = dots; c.height = H;
            const g = c.getContext('2d');
            g.fillStyle = '#fff'; g.fillRect(0, 0, dots, H);
            g.drawImage(img, 0, 0, dots, H);
            return { c, g, H };
        } finally { box.remove(); }
    }
    // a receipt as a PNG picture (to share on WhatsApp): sharp at 576 px wide, blank paper below the last line cut off
    async function receiptImage(el) {
        const dots = 576;
        const { c, g, H } = await receiptCanvas(el, dots);
        const used = EscPos.trim(EscPos.toMono(g.getImageData(0, 0, dots, H).data, dots, H), 16).height;
        const out = document.createElement('canvas'); out.width = dots + 32; out.height = Math.min(H, used) + 16;
        const o = out.getContext('2d');
        o.fillStyle = '#fff'; o.fillRect(0, 0, out.width, out.height);
        o.drawImage(c, 0, 0, dots, out.height - 16, 16, 16, dots, out.height - 16);
        return new Promise((res, rej) => out.toBlob(b => (b ? res(b) : rej(new Error('The picture could not be made.'))), 'image/png'));
    }
    // share a receipt picture: the Android app → share sheet (choose WhatsApp); a phone browser → its share sheet;
    // a computer → copied, to paste (Ctrl+V) into the WhatsApp chat, or saved as a file when copying is not allowed
    async function shareReceipt(el, name) {
        const blob = await receiptImage(el);
        const filename = `${String(name || 'bill').replace(/[^\w.-]+/g, '-')}.png`;
        if (isApp()) return shareBlob(blob, filename);
        const file = typeof File === 'function' ? new File([blob], filename, { type: 'image/png' }) : null;
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title: name || 'Bill' }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
        }
        try {
            await copyImage(blob);
            ui.toast(t('Bill picture copied. Open the WhatsApp chat and paste it (Ctrl+V).'));
        } catch {
            ui.saveBlob(blob, filename);
            ui.toast(t('Bill picture saved. Attach it in the WhatsApp chat.'));
        }
    }
    // a picture onto the clipboard: the Windows app through its own bridge (works even when the page is not focused),
    // a browser through the Clipboard API. Throws when neither can.
    async function copyImage(blob) {
        if (window.hpDesktop && window.hpDesktop.copyImage) {
            const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
            const r = await window.hpDesktop.copyImage(dataUrl);
            if (r && r.ok) return;
        }
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    }

    async function printToBluetooth(receipts, p) {
        const dots = EscPos.DOTS[paper()] || 384;
        const pictures = [];
        for (const r of receipts) pictures.push(await receiptPicture(r, dots));
        const bytes = EscPos.job(pictures);
        await call('HpNative', 'print', { address: p.address, data: EscPos.toBase64(bytes) });
    }

    // choose a paired printer: resolves { name, address }, 'SYSTEM' (use Android print instead) or null
    async function choosePrinter({ offerSystem = false } = {}) {
        let list;
        try { list = ((await call('HpNative', 'listPrinters')) || {}).printers || []; }
        catch (e) { ui.fail(e); return offerSystem ? 'SYSTEM' : null; }
        list.sort((a, b) => (b.printerLike ? 1 : 0) - (a.printerLike ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
        const cur = printer();
        return new Promise(resolve => {
            let result = null;
            const m = ui.modal({
                title: t('Receipt printer'), width: 440,
                body: html`<p class="text-sm text-muted">${t('Switch the printer on and pair it once in Android Settings → Bluetooth (PIN is usually 0000 or 1234). Then choose it here.')}</p>
                  <div class="mt-4 space-y-2">${list.length ? list.map(d => html`<button type="button" class="flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-start ${cur && cur.address === d.address ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}" data-pick="${d.address}">
                      ${icon('printer', 'w-5 h-5 text-muted')}<span class="flex-1"><span class="block font-medium">${d.name}</span><span class="block text-xs text-muted">${d.address}${d.printerLike ? ' · ' + t('printer') : ''}</span></span></button>`)
                    : html`<div class="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">${t('No paired Bluetooth devices. Pair the printer in Android Settings first.')}</div>`}</div>
                  <div class="mt-5"><div class="label">${t('Paper width')}</div>${ui.seg('btpaper', [['58', '58 mm'], ['80', '80 mm']], paper())}</div>`,
                footer: html`${offerSystem ? html`<button class="btn btn-outline me-auto" data-system>${t('Android print')}</button>` : ''}<button class="btn btn-outline" data-close>${t('Cancel')}</button>`,
                onClose: () => resolve(result),
            });
            ui.on(m.el, 'click', '[data-seg="btpaper"] [data-v]', (e, b) => { store.set(KEY_WIDTH, b.dataset.v); b.parentElement.querySelectorAll('[data-v]').forEach(x => x.classList.toggle('on', x === b)); });
            ui.on(m.el, 'click', '[data-pick]', (e, b) => {
                const d = list.find(x => x.address === b.dataset.pick);
                result = { name: d.name, address: d.address };
                store.set(KEY_PRINTER, result);
                m.close();
            });
            const sys = m.el.querySelector('[data-system]');
            if (sys) sys.addEventListener('click', () => { result = 'SYSTEM'; m.close(); });
        });
    }

    async function testPrint() {
        const p = printer() || await choosePrinter();
        if (!p || p === 'SYSTEM') return;
        const shop = (HP.session && HP.session.tenant && HP.session.tenant.name) || 'HisabPro';
        const box = document.createElement('div');
        box.innerHTML = String(html`<div class="receipt w${paper()}" style="padding:4px;text-align:center"><div style="font-weight:700;font-size:14px">${shop}</div><div>HisabPro · ${t('Test print')}</div><hr>
            <div>${t('Printer')}: ${p.name}</div><div>${paper()} mm</div><div style="direction:rtl;font-size:14px">پرنٹر ٹھیک کام کر رہا ہے ✓</div><hr><div>${new Date().toLocaleString()}</div></div>`);
        try { await printToBluetooth([box.firstElementChild], p); ui.toast(t('Test page sent to the printer')); }
        catch (e) { ui.fail(e); }
    }

    // called by HP.ui.print in the app: thermal receipts → Bluetooth printer; everything else → Android print dialog
    async function print(root) {
        const receipts = [...root.querySelectorAll('.receipt')];
        const thermal = receipts.length > 0 && receipts.every(r => r.classList.contains('w58') || r.classList.contains('w80'));
        if (!thermal) return systemPrint();
        let p = printer();
        if (!p) {
            p = await choosePrinter({ offerSystem: true });
            if (p === 'SYSTEM') return systemPrint();
            if (!p) return;
        }
        try {
            ui.toast(t('Printing…'), 'info');
            await printToBluetooth(receipts, p);
        } catch (e) {
            const m = ui.modal({
                title: t('Could not print'), width: 440,
                body: html`<p class="text-sm">${e.message}</p><p class="mt-2 text-sm text-muted">${t('Printer')}: ${p.name}</p>`,
                footer: html`<button class="btn btn-outline me-auto" data-system>${t('Android print')}</button><button class="btn btn-outline" data-choose>${t('Choose printer')}</button><button class="btn btn-primary" data-retry>${t('Try again')}</button>`,
            });
            m.el.querySelector('[data-system]').addEventListener('click', () => { m.close(); systemPrint(); });
            m.el.querySelector('[data-choose]').addEventListener('click', async () => { m.close(); const np = await choosePrinter({ offerSystem: true }); if (np === 'SYSTEM') systemPrint(); else if (np) print(root); });
            m.el.querySelector('[data-retry]').addEventListener('click', () => { m.close(); print(root); });
        }
    }
    function systemPrint() {
        return call('HpNative', 'systemPrint', { name: `HisabPro ${new Date().toISOString().slice(0, 10)}` }).catch(e => ui.fail(e));
    }

    // ── files (CSV, backup, documents): WebViews cannot download, so they go to Android's share sheet ──
    async function shareBlob(blob, filename) {
        const buf = new Uint8Array(await blob.arrayBuffer());
        await call('HpNative', 'shareFile', { name: filename || 'file', mime: blob.type || 'application/octet-stream', data: EscPos.toBase64(buf) });
    }

    // ── app version and updates (mobile/release.json on the server says which APK is the newest) ──
    async function versions() {
        const [info, rel] = await Promise.all([call('App', 'getInfo'), fetch('/api/mobile/android').then(r => (r.ok ? r.json() : {})).catch(() => ({}))]);
        const installedCode = Number(info && info.build) || 0;
        return { installed: (info && info.version) || '', installedCode, latest: rel.version || '', latestCode: Number(rel.versionCode) || 0, url: rel.url || '', notes: rel.notes || '', newer: !!(rel.url && Number(rel.versionCode) > installedCode) };
    }
    function openExternal(url) { window.open(url, '_blank'); } // the app opens other sites in the phone's browser

    // Settings → Phone app
    function settingsCard(box) {
        const draw = v => {
            const p = printer();
            ui.mount(box, html`<div class="text-lg font-semibold">${t('Phone app')}</div>
              <p class="mt-1 text-sm text-muted">${t('Settings for this phone only: the Bluetooth receipt printer and the app version.')}</p>
              <div class="mt-6 rounded-xl border border-line p-5">
                <div class="font-semibold">${t('Receipt printer')}</div>
                <div class="mt-1 text-sm text-muted">${p ? html`${p.name} · ${paper()} mm` : t('No printer chosen yet. Receipts open Android printing until you choose one.')}</div>
                <div class="mt-4 flex flex-wrap gap-2"><button class="btn btn-primary" data-np="choose">${icon('printer')}${p ? t('Change printer') : t('Choose printer')}</button>
                  ${p ? html`<button class="btn btn-outline" data-np="test">${t('Test print')}</button><button class="btn btn-ghost" data-np="forget">${t('Forget printer')}</button>` : ''}</div></div>
              <div class="mt-4 rounded-xl border border-line p-5" data-alerts><div class="font-semibold">${t('Payment alerts')}</div>
                <div class="mt-1 text-sm text-muted">${t('A notification with sound on the day a vendor must be paid.')}</div>
                <button type="button" class="btn btn-outline mt-3" data-np="alerts">${icon('bell')}${t('Check alerts')}</button></div>
              <div class="mt-4 rounded-xl border border-line p-5">
                <div class="flex flex-wrap items-center justify-between gap-3"><div><div class="text-xs text-muted">${t('Installed version')}</div><div class="text-xl font-bold">${v ? v.installed || '—' : '…'}</div></div>
                  ${v ? (v.newer ? ui.badge(t('Update available'), 'warn') : ui.badge(t('Up to date'), 'good')) : ''}</div>
                ${v && v.newer ? html`<p class="mt-3 text-sm">${t('New version')} <b>${v.latest}</b>. ${t('Download it and open the file to install over this app — your login and settings stay.')}</p>${v.notes ? html`<pre class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-3 text-xs text-muted">${v.notes}</pre>` : ''}
                  <button class="btn btn-primary mt-4" data-np="download">${icon('download')}${t('Download update')}</button>` : ''}
                <p class="mt-3 text-xs text-muted">${t('Screens and features update by themselves from the HisabPro server; a new app download is needed only for phone features such as printing and scanning.')}</p></div>`);
        };
        let v = null;
        draw(null);
        versions().then(x => { v = x; draw(v); }).catch(() => draw({ installed: '', newer: false }));
        ui.on(box, 'click', '[data-np]', async (e, b) => {
            const act = b.dataset.np;
            if (act === 'choose') { await choosePrinter(); draw(v); }
            else if (act === 'test') testPrint();
            else if (act === 'forget') { store.set(KEY_PRINTER, null); draw(v); }
            else if (act === 'download' && v && v.url) openExternal(v.url);
            else if (act === 'alerts') {
                try { const n = await refreshAlarms(true, true); ui.toast(`${t('Payment alerts are on')}${n ? ` · ${n} ${t('set')}` : ''}`); }
                catch (err) { ui.fail(err); }
            }
        });
    }

    // ── payment alarms: on a vendor's pay-by day the phone shows a notification with sound at 10:00, even when the app
    // is closed (Capacitor LocalNotifications; scheduled on the phone from the open dues, cancelled when paid) ──
    // Remembered per due: { id, at } of the alarm set for it. An alarm that has rung (or is about to) is never set again,
    // never cancelled and never cleared from the tray; only alarms of dues that are no longer open are cancelled.
    const KEY_ALARMS = 'hp.alarms';
    const alarmId = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return (Math.abs(h) % 2000000000) + 1; };
    async function alarmsAllowed(ask) {
        const p = await call('LocalNotifications', 'checkPermissions');
        if (p.display === 'granted') return true;
        if (!ask || p.display === 'denied') return false;
        return (await call('LocalNotifications', 'requestPermissions')).display === 'granted';
    }
    // rows: open dues; complete: false when the server cut the list (then nothing is cancelled); ask: may show the
    // Android permission prompt (only after something the owner did); strict: errors are thrown, not just logged
    async function syncAlarms(rows, { complete = true, ask = false, strict = false } = {}) {
        if (!isApp() || !Array.isArray(rows)) return 0;
        try {
            if (!(await alarmsAllowed(ask))) { if (strict) throw new Error(t('Alerts are off. Allow notifications for HisabPro in Android Settings → Apps → HisabPro.')); return 0; }
            const now = Date.now(), todayYmd = HP.fmt.ymd(new Date());
            const prev = store.get(KEY_ALARMS, {});
            const next = {}, schedule = [];
            const note = (d, at) => ({ id: alarmId(d.id), title: `${t('Payment due')}: ${d.name}`, body: `${t('Pay')} ${HP.fmt.money(d.amount)} · ${d.dueDate === todayYmd ? t('today') : HP.fmt.date(d.dueDate)} · ادائیگی`,
                schedule: { at: new Date(at).toISOString(), allowWhileIdle: true }, isExactNotification: false, extra: { path: '/m/reminders?view=vendors' } });
            for (const d of rows) {
                if (!['PENDING', 'OVERDUE'].includes(d.status)) continue;
                const [y, m, dd] = d.dueDate.split('-').map(Number);
                const target = new Date(y, m - 1, dd, 10, 0, 0).getTime(); // 10:00 on the phone's clock
                const had = prev[d.id];
                if (target > now) {
                    next[d.id] = { id: alarmId(d.id), at: target };
                    if (!had || had.at !== target) schedule.push(note(d, target)); // new, or the date was moved
                } else if (had && (had.at <= now || new Date(had.at).toDateString() === new Date(now).toDateString())) {
                    next[d.id] = had; // it has rung, or today's catch-up rings in a moment: leave it alone
                } else if (d.dueDate === todayYmd) { // set or moved to today after 10:00 (an alarm for a later day is replaced)
                    const at = now + 60000; // due today, set after 10:00: once, in a minute
                    next[d.id] = { id: alarmId(d.id), at };
                    schedule.push(note(d, at));
                } // late dues that never had an alarm: no sound — they are on the Reminders screen
            }
            // alarms of dues that are no longer open (paid, removed, cancelled, or a late due whose alarm was for a later
            // day) — only when the list is complete, else a due left out of it would lose its alarm
            const drop = complete ? Object.keys(prev).filter(k => !next[k]).map(k => prev[k].id) : [];
            if (!complete) for (const k of Object.keys(prev)) if (!next[k]) next[k] = prev[k];
            if (drop.length) await call('LocalNotifications', 'cancel', { notifications: drop.map(id => ({ id })) });
            if (schedule.length) await call('LocalNotifications', 'schedule', { notifications: schedule });
            store.set(KEY_ALARMS, next);
            return Object.keys(next).length;
        } catch (e) { if (strict) throw e; console.warn('payment alarms:', e.message); return 0; }
    }
    // fetch the open dues and schedule their alarms (at most once a minute, unless something was just changed)
    let lastAlarmSync = 0;
    // force: something was just changed by the owner (may ask for permission); strict: errors reach the caller
    async function refreshAlarms(force, strict) {
        if (!isApp() || (!force && Date.now() - lastAlarmSync < 60000)) return 0;
        lastAlarmSync = Date.now();
        try {
            const r = await HP.api.get('/api/khata/dues', { view: 'pending' });
            return await syncAlarms(r.rows, { complete: r.complete !== false, ask: !!force, strict });
        } catch (e) { if (strict) throw e; return 0; }
    }
    // tapping a payment alert opens the vendors to pay (Capacitor keeps the event until a listener is added)
    let pendingPath = null;
    function listenForAlertTaps() {
        call('LocalNotifications', 'checkPermissions').then(() => {
            window.Capacitor.nativeCallback('LocalNotifications', 'addListener', { eventName: 'localNotificationActionPerformed' }, ev => {
                const path = ev && ev.notification && ev.notification.extra && ev.notification.extra.path;
                if (!path || !/^\/m(\/|$)/.test(path)) return;
                pendingPath = path;
                const tryGo = (n = 0) => { if (HP.session && HP.router) { HP.router.navigate(pendingPath); pendingPath = null; } else if (n < 50) setTimeout(() => tryGo(n + 1), 200); };
                tryGo();
            });
        }).catch(() => {});
    }

    // one notice per new APK version
    async function checkForUpdate() {
        try {
            const v = await versions();
            if (!v.newer || store.get('hp.apkTold', '') === v.latest || !HP.session) return;
            store.set('hp.apkTold', v.latest);
            const owner = HP.shell && HP.shell.can && HP.shell.can('settings.manage');
            ui.toast(owner ? `${t('HisabPro app')} ${v.latest} ${t('is available — Settings → Phone app')}` : `${t('HisabPro app')} ${v.latest} ${t('is available. Ask the shop owner for the update.')}`, 'info');
        } catch { }
    }

    function init() {
        if (!isApp()) return;
        document.documentElement.classList.add('hp-app');
        listenForAlertTaps();
        setTimeout(checkForUpdate, 15000);
    }

    // the phone app shows the owner's ledger screens only (pages/mobile.js). Developers can preview them in a browser:
    // localStorage.setItem('hp.mobileMode', '1') and reload (remove it to go back)
    const forced = () => { try { return localStorage.getItem('hp.mobileMode') === '1'; } catch { return false; } };
    HP.mobile = { on: () => isApp() || forced() };

    HP.native = { isApp, scan, choosePrinter, testPrint, print, systemPrint, shareBlob, receiptImage, shareReceipt, copyImage, versions, settingsCard, printer, paper, syncAlarms, refreshAlarms };
    document.addEventListener('DOMContentLoaded', init);
})();
