// Settings from the environment. The desktop app sets MODE=desktop and DATABASE_URL (a SQLite file) before requiring this.
require('dotenv').config({ quiet: true });

const MODE = process.env.MODE === 'desktop' ? 'desktop' : 'cloud';

module.exports = {
    MODE,
    isDesktop: MODE === 'desktop',
    PORT: Number(process.env.PORT) || 3001,
    JWT_SECRET: process.env.JWT_SECRET || '',
    APP_NAME: 'HisabPro',
    OFFLINE_DAYS: Number(process.env.DESKTOP_OFFLINE_DAYS) || 7,
    TRUST_PROXY_HOPS: Number(process.env.TRUST_PROXY_HOPS) || 0,
};
