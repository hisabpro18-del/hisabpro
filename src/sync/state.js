// What this process knows about itself as a desktop PC (empty in the cloud). Filled by src/sync/client.js.
const s = { device: null, online: false, lastSyncAt: null, pending: 0, error: '' };

module.exports = {
    get: () => s,
    set: patch => Object.assign(s, patch),
    deviceCode: () => (s.device && s.device.code) || null,
    deviceId: () => (s.device && s.device.id) || null,
};
