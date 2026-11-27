// HisabPro desktop (Windows) — Electron main process.
// It runs the same HisabPro server inside the app (MODE=desktop, a SQLite file in the user's AppData folder) on
// 127.0.0.1, opens it in a window, and the built-in sync worker keeps it in step with the cloud whenever online.
const { app, BrowserWindow, ipcMain, Menu, shell, dialog, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');
const crypto = require('crypto');

// tests can point the app at a scratch data folder and keep the window hidden
if (process.env.HP_USER_DATA) app.setPath('userData', process.env.HP_USER_DATA);
if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

const userData = app.getPath('userData');
fs.mkdirSync(userData, { recursive: true });
const dbFile = path.join(userData, 'hisabpro.db');
const secretFile = path.join(userData, 'secret.key');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(48).toString('hex'), { mode: 0o600 });
const conf = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { return {}; } })();

// everything the server reads from the environment, set before it is loaded
process.env.MODE = 'desktop';
process.env.DATABASE_URL = `file:${dbFile.replace(/\\/g, '/')}?connection_limit=1`;
process.env.JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
process.env.HP_SERVER_URL = process.env.HP_SERVER_URL || conf.serverUrl || '';
process.env.HP_SERVER_REPLACES = (conf.replaces || []).join(' '); // old server addresses: activated PCs move to serverUrl
process.env.DESKTOP_OFFLINE_DAYS = String(conf.offlineDays || 7);
process.env.NODE_ENV = 'production';

// inside the installed app, Prisma's SQLite engine sits next to the archive (app.asar.unpacked)
if (app.isPackaged) {
    const dir = path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'generated', 'sqlite');
    const engine = fs.existsSync(dir) && fs.readdirSync(dir).find(f => /query_engine.*\.node$/.test(f) && (process.platform !== 'win32' || /windows/.test(f)));
    if (engine) process.env.PRISMA_QUERY_ENGINE_LIBRARY = path.join(dir, engine);
}

const freePort = () => new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

let win = null;
async function boot() {
    const port = Number(process.env.HP_PORT) || await freePort();
    try {
        const { startServer } = require(path.join(__dirname, '..', 'server.js'));
        await startServer(port);
    } catch (e) {
        dialog.showErrorBox('HisabPro could not start', String(e && e.stack || e));
        app.quit();
        return;
    }
    win = new BrowserWindow({
        width: 1440, height: 900, minWidth: 1100, minHeight: 700, show: false, title: 'HisabPro', backgroundColor: '#fafafa',
        icon: path.join(__dirname, 'icon.png'),
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.once('ready-to-show', () => { if (process.env.HP_HIDDEN) return; win.maximize(); win.show(); });
    // links to other sites open in the normal browser, never inside the app; whatsapp: links open WhatsApp Desktop
    // (chosen in the WhatsApp dialog as "WhatsApp app")
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?|whatsapp):/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    // compared by origin: a prefix test would let http://127.0.0.1:<port>@other.site or port <port>5 load inside the app
    const own = `http://127.0.0.1:${port}`;
    const originOf = u => { try { return new URL(u).origin; } catch { return ''; } };
    win.webContents.on('will-navigate', (e, url) => { if (originOf(url) !== own) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
    await win.loadURL(`http://127.0.0.1:${port}/`);
    // a quiet look for a new version a little after start, then every 6 hours
    if (app.isPackaged && !process.env.HP_HIDDEN) {
        setTimeout(() => checkForUpdates().catch(() => {}), 20000);
        setInterval(() => { if (['idle', 'latest', 'error'].includes(update.status)) checkForUpdates().catch(() => {}); }, 6 * 3600000);
    }
}

// silent printing (Receipt & POS → Auto-Print on Save): straight to the default printer, no dialog
ipcMain.handle('print-silent', event => new Promise(resolve => {
    event.sender.print({ silent: true, printBackground: true }, (ok, reason) => resolve({ ok, reason }));
}));
ipcMain.handle('app-info', () => ({ version: app.getVersion(), dataFolder: userData }));
// a bill slip picture onto the Windows clipboard (then Ctrl+V in the WhatsApp chat pastes it)
ipcMain.handle('copy-image', (event, dataUrl) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > 15e6) return { ok: false };
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img.isEmpty()) return { ok: false };
    clipboard.writeImage(img);
    return { ok: true };
});

// ── app updates (Settings → App update) ──
// New versions are published as GitHub releases (see docs/DEV.md). The app checks quietly on start and every 6 hours;
// downloading and installing happen only when the user clicks. The shop's data (AppData\HisabPro) is never touched by an
// update, and a newer app adds any new database columns itself when it starts.
let updater = null;
let update = { status: 'idle', current: app.getVersion(), version: '', notes: '', percent: 0, error: '', checkedAt: null };
function setUpdate(patch) {
    update = { ...update, ...patch };
    if (win && !win.isDestroyed()) win.webContents.send('update-state', update);
}
function getUpdater() {
    if (updater) return updater;
    if (!app.isPackaged) return null; // only an installed app can update itself
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false;          // the user decides when (downloads can be large on a slow line)
    autoUpdater.autoInstallOnAppQuit = true;   // a downloaded update also goes in the next time the app is closed
    autoUpdater.on('checking-for-update', () => setUpdate({ status: 'checking', error: '' }));
    autoUpdater.on('update-available', i => setUpdate({ status: 'available', version: i.version, notes: typeof i.releaseNotes === 'string' ? i.releaseNotes.replace(/<[^>]+>/g, '').slice(0, 2000) : '', checkedAt: new Date().toISOString() }));
    autoUpdater.on('update-not-available', () => setUpdate({ status: 'latest', version: '', checkedAt: new Date().toISOString() }));
    autoUpdater.on('download-progress', p => setUpdate({ status: 'downloading', percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', i => setUpdate({ status: 'ready', version: i.version, percent: 100 }));
    autoUpdater.on('error', e => setUpdate({ status: 'error', error: String((e && e.message) || e).split('\n')[0].slice(0, 300) }));
    updater = autoUpdater;
    return updater;
}
const offline = () => setUpdate({ status: 'error', error: 'Could not reach the update server. Check the internet connection and try again.' });
async function checkForUpdates() {
    const u = getUpdater();
    if (!u) { setUpdate({ status: 'dev', error: 'Updates work in the installed app only.' }); return update; }
    if (['checking', 'downloading', 'ready'].includes(update.status)) return update;
    try { await u.checkForUpdates(); } catch { if (update.status === 'checking') offline(); }
    return update;
}
ipcMain.handle('update-state', () => update);
ipcMain.handle('update-check', () => checkForUpdates());
ipcMain.handle('update-download', async () => {
    const u = getUpdater();
    if (!u || update.status !== 'available') return update;
    setUpdate({ status: 'downloading', percent: 0, error: '' });
    u.downloadUpdate().catch(() => { if (update.status === 'downloading') offline(); });
    return update;
});
ipcMain.handle('update-install', () => {
    const u = getUpdater();
    if (!u || update.status !== 'ready') return update;
    // close and run the new installer silently; it starts HisabPro again when done
    setImmediate(() => u.quitAndInstall(true, true));
    return { ...update, status: 'installing' };
});

Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'HisabPro', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { type: 'separator' }, { label: 'Open data folder', click: () => shell.openPath(userData) }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }])] },
]));

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(boot);
app.on('window-all-closed', () => app.quit());
