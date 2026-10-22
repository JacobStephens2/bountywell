const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const fileName = 'not-served.txt';
const secret = 'bountywell-data-dir-must-not-be-served';
const secretPath = path.join(root, 'data', fileName);
const linkPath = path.join(__dirname, 'data-dir-regression-link.txt');

const pathsThatResolveInsideData = [
    `/data/${fileName}`,
    '/./data/daily_dozen.db',
    '/./data/.jwt-secret',
    `/./data/${fileName}`,
    `//data/${fileName}`,
    `/%2e/data/${fileName}`,
    `/%64ata/${fileName}`,
    `/data%2f${fileName}`,
    `/css/../data/${fileName}`,
    `/assets/icons/../../data/${fileName}`,
    `/.%2fdata/${fileName}`,
    `/foo/..%2fdata/${fileName}`,
    `/js/%2e%2e/data/${fileName}`,
    `/./data/${fileName}?v=1`,
    '/./data/',
    '/tests/data-dir-regression-link.txt',
];

function request(port, urlPath, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            method,
            path: urlPath,
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
        req.end();
    });
}

describe('static file handler', () => {
    let server;
    let port;

    before(async () => {
        fs.mkdirSync(path.dirname(secretPath), { recursive: true });
        fs.writeFileSync(secretPath, secret);
        fs.rmSync(linkPath, { force: true });
        fs.symlinkSync(path.join('..', 'data', fileName), linkPath);
        const app = require('../server');
        server = await new Promise((resolve) => {
            const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
        });
        port = server.address().port;
    });

    after(() => new Promise((resolve, reject) => {
        fs.rmSync(secretPath, { force: true });
        fs.rmSync(linkPath, { force: true });
        if (!server) {
            resolve();
            return;
        }
        server.close((err) => err ? reject(err) : resolve());
    }));

    it('does not serve a file whose resolved path is inside the data directory', async () => {
        for (const urlPath of pathsThatResolveInsideData) {
            const res = await request(port, urlPath);
            assert.equal(res.status, 404, urlPath);
            assert.equal(res.body.includes(secret), false, urlPath);
        }

        const head = await request(port, `/./data/${fileName}`, 'HEAD');
        assert.equal(head.status, 404);
        assert.equal(head.body.includes(secret), false);
    });

    it('still serves a static file outside the data directory', async () => {
        const res = await request(port, '/styles.css');
        assert.equal(res.status, 200);
        assert.equal(res.body.includes('Modern Apothecary'), true);
    });

    it('still serves the app shell for a client route', async () => {
        const res = await request(port, '/history');
        assert.equal(res.status, 200);
        assert.equal(res.body.includes('Bountywell'), true);
    });

    it('still refuses an unauthenticated read of synced data', async () => {
        const res = await request(port, '/api/data');
        assert.equal(res.status, 401);
        assert.equal(res.body.includes(secret), false);
    });
});
