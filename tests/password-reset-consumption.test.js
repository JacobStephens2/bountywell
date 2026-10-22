const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bountywell-password-reset-'));
const dbPath = path.join(dbDir, 'accounts.db');

process.env.JWT_SECRET = 'password-reset-consumption-test-secret';
process.env.BOUNTYWELL_DB_PATH = dbPath;

const app = require('../server');
const { db } = require('../db');

function request(port, urlPath, body) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(JSON.stringify(body));
        const req = http.request({
            host: '127.0.0.1',
            port,
            method: 'POST',
            path: urlPath,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': payload.length,
            },
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
        req.write(payload);
        req.end();
    });
}

function insertAccount(email, password) {
    const inserted = db.prepare(
        'INSERT INTO users (email, password_hash) VALUES (?, ?)'
    ).run(email, bcrypt.hashSync(password, 10));
    return Number(inserted.lastInsertRowid);
}

function insertReset(userId, token, modifier) {
    db.prepare(
        "INSERT INTO password_resets (user_id, token, expires_at, used) VALUES (?, ?, datetime('now', ?), 0)"
    ).run(userId, token, modifier);
}

describe('password reset consumption', () => {
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

    it('marks every other unused reset for that account used, including one that had already expired, and replaces the password', async () => {
        const userId = insertAccount('reset-owner@example.com', 'original-password');
        const otherUserId = insertAccount('other-owner@example.com', 'other-original');
        insertReset(userId, 'consumed-reset', '+1 hour');
        insertReset(userId, 'other-unused-reset', '+1 hour');
        insertReset(userId, 'expired-unused-reset', '-1 hour');
        insertReset(otherUserId, 'other-account-reset', '+1 hour');

        const consumed = await request(port, '/api/reset-password', {
            token: 'consumed-reset',
            password: 'replaced-password',
        });
        assert.equal(consumed.status, 200, consumed.body);

        const otherUnused = await request(port, '/api/reset-password', {
            token: 'other-unused-reset',
            password: 'should-not-apply',
        });
        assert.equal(otherUnused.status, 400, otherUnused.body);
        assert.equal(
            JSON.parse(otherUnused.body).error,
            'Invalid or expired reset link. Please request a new one.'
        );

        db.prepare(
            "UPDATE password_resets SET expires_at = datetime('now', '+1 hour') WHERE token = ?"
        ).run('expired-unused-reset');
        const expiredUnused = await request(port, '/api/reset-password', {
            token: 'expired-unused-reset',
            password: 'should-not-apply-either',
        });
        assert.equal(expiredUnused.status, 400, expiredUnused.body);
        assert.equal(
            JSON.parse(expiredUnused.body).error,
            'Invalid or expired reset link. Please request a new one.'
        );

        const newPassword = await request(port, '/api/login', {
            email: 'reset-owner@example.com',
            password: 'replaced-password',
        });
        assert.equal(newPassword.status, 200, newPassword.body);
        assert.equal(JSON.parse(newPassword.body).email, 'reset-owner@example.com');

        const oldPassword = await request(port, '/api/login', {
            email: 'reset-owner@example.com',
            password: 'original-password',
        });
        assert.equal(oldPassword.status, 401, oldPassword.body);

        const otherAccount = await request(port, '/api/reset-password', {
            token: 'other-account-reset',
            password: 'other-replaced-password',
        });
        assert.equal(otherAccount.status, 200, otherAccount.body);
    });

    it('rolls back the password update when marking unused resets fails', async () => {
        const userId = insertAccount('atomic-owner@example.com', 'original-password');
        insertReset(userId, 'atomic-consumed-reset', '+1 hour');
        insertReset(userId, 'atomic-other-reset', '+1 hour');
        db.exec(`
            CREATE TABLE write_log (
                users_updated INTEGER NOT NULL DEFAULT 0,
                resets_updated INTEGER NOT NULL DEFAULT 0
            );
            INSERT INTO write_log (users_updated, resets_updated) VALUES (0, 0);

            CREATE TRIGGER note_password_replaced
            AFTER UPDATE OF password_hash ON users
            BEGIN
                UPDATE write_log SET users_updated = 1;
            END;

            CREATE TRIGGER note_resets_used
            AFTER UPDATE OF used ON password_resets
            BEGIN
                UPDATE write_log SET resets_updated = 1;
            END;

            CREATE TRIGGER abort_password_after_resets
            BEFORE UPDATE OF password_hash ON users
            WHEN (SELECT resets_updated FROM write_log) = 1
            BEGIN
                SELECT RAISE(ABORT, 'second write');
            END;

            CREATE TRIGGER abort_resets_after_password
            BEFORE UPDATE OF used ON password_resets
            WHEN (SELECT users_updated FROM write_log) = 1
            BEGIN
                SELECT RAISE(ABORT, 'second write');
            END;
        `);

        try {
            const consumed = await request(port, '/api/reset-password', {
                token: 'atomic-consumed-reset',
                password: 'replaced-password',
            });
            assert.equal(consumed.status, 500, consumed.body);
        } finally {
            if (db.inTransaction) {
                db.exec('ROLLBACK');
            }
            db.exec(`
                DROP TRIGGER IF EXISTS abort_password_after_resets;
                DROP TRIGGER IF EXISTS abort_resets_after_password;
                DROP TRIGGER IF EXISTS note_password_replaced;
                DROP TRIGGER IF EXISTS note_resets_used;
                DROP TABLE IF EXISTS write_log;
            `);
        }

        const oldPassword = await request(port, '/api/login', {
            email: 'atomic-owner@example.com',
            password: 'original-password',
        });
        assert.equal(oldPassword.status, 200, oldPassword.body);

        const otherUnused = await request(port, '/api/reset-password', {
            token: 'atomic-other-reset',
            password: 'other-replaced-password',
        });
        assert.equal(otherUnused.status, 200, otherUnused.body);
    });
});
