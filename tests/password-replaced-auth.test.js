const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const JWT_SECRET = 'password-replaced-at-test-secret';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bountywell-password-replaced-'));
const dbPath = path.join(dbDir, 'accounts.db');
const email = 'stored@example.com';

process.env.JWT_SECRET = JWT_SECRET;
process.env.BOUNTYWELL_DB_PATH = dbPath;

const setup = new Database(dbPath);
setup.exec(`
    CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    );
`);
const columnsBeforeApp = setup.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
assert.equal(columnsBeforeApp.includes('password_replaced_at'), false);
const inserted = setup.prepare(
    'INSERT INTO users (email, password_hash) VALUES (?, ?)'
).run(email, bcrypt.hashSync('original-password', 10));
const userId = Number(inserted.lastInsertRowid);
setup.close();

const app = require('../server');
const { db } = require('../db');

function signToken(issuedAtSeconds) {
    return jwt.sign(
        { userId, email, iat: issuedAtSeconds },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
}

function request(port, urlPath, { method = 'GET', token, body } = {}) {
    return new Promise((resolve, reject) => {
        const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
        const headers = {};
        if (payload) {
            headers['Content-Type'] = 'application/json';
            headers['Content-Length'] = payload.length;
        }
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }
        const req = http.request({
            host: '127.0.0.1',
            port,
            method,
            path: urlPath,
            headers,
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
        });
        req.on('error', reject);
        if (payload) {
            req.write(payload);
        }
        req.end();
    });
}

describe('password replacement and auth tokens', () => {
    let server;
    let port;

    before(async () => {
        server = await new Promise((resolve) => {
            const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
        });
        port = server.address().port;
    });

    after(() => new Promise((resolve, reject) => {
        const cleanup = () => {
            db.close();
            fs.rmSync(dbDir, { recursive: true, force: true });
            resolve();
        };
        if (!server) {
            cleanup();
            return;
        }
        server.close((err) => err ? reject(err) : cleanup());
    }));

    it('accepts a token when the password has not been replaced, rejects one issued earlier than that time, and accepts one issued after it', async () => {
        const earlierIat = Math.floor(Date.now() / 1000) - (24 * 60 * 60);
        const earlierToken = signToken(earlierIat);
        assert.equal(jwt.verify(earlierToken, JWT_SECRET).iat, earlierIat);

        const emptyTime = await request(port, '/api/data', { token: earlierToken });
        assert.equal(emptyTime.status, 200, 'empty replacement time');

        db.prepare(
            "INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, datetime('now', '+1 hour'))"
        ).run(userId, 'reset-token-for-stored-account');
        const reset = await request(port, '/api/reset-password', {
            method: 'POST',
            body: { token: 'reset-token-for-stored-account', password: 'replaced-password' },
        });
        assert.equal(reset.status, 200, reset.body);

        const issuedEarlier = await request(port, '/api/data', { token: earlierToken });
        assert.equal(issuedEarlier.status, 401, 'issued earlier than the replacement time');

        const laterIat = Math.floor(Date.now() / 1000) + 120;
        const laterToken = signToken(laterIat);
        assert.equal(jwt.verify(laterToken, JWT_SECRET).iat, laterIat);

        const issuedAfter = await request(port, '/api/data', { token: laterToken });
        assert.equal(issuedAfter.status, 200, 'issued after the replacement time');

        const refreshEarlier = await request(port, '/api/refresh-token', {
            method: 'POST',
            token: earlierToken,
        });
        assert.equal(refreshEarlier.status, 401, 'refresh of a token issued earlier');

        const refreshLater = await request(port, '/api/refresh-token', {
            method: 'POST',
            token: laterToken,
        });
        assert.equal(refreshLater.status, 200, 'refresh of a token issued after');
        assert.equal(JSON.parse(refreshLater.body).email, email);
    });
});
