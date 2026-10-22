import { test } from 'node:test';
import assert from 'node:assert/strict';

// Methods live on the prototype so Object.keys(localStorage) is the stored
// keys, matching the stand-in the Household tests use.
function createMemoryStorage() {
    const storage = Object.create({
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(this, key) ? this[key] : null;
        },
        setItem(key, value) {
            this[key] = String(value);
        },
        removeItem(key) {
            delete this[key];
        },
    });
    return storage;
}

function installBrowser() {
    globalThis.localStorage = createMemoryStorage();
    globalThis.sessionStorage = createMemoryStorage();
    globalThis.window = {
        location: { search: '', pathname: '/' },
        history: { replaceState() {} },
    };
    globalThis.document = {
        getElementById() { return null; },
        querySelector() { return null; },
        addEventListener() {},
        removeEventListener() {},
    };
}

const SECRET = 'AdaSecret';
const DAY = 'Sun Oct 04 2026';

async function loadAuth() {
    const storage = await import('../js/storage.js');
    const { AuthManager } = await import('../js/auth.js');
    return { storage, AuthManager };
}

function seedLocal(storage) {
    localStorage.setItem('dailyDozenAuthToken', 'token-a');
    localStorage.setItem('dailyDozenAuthEmail', 'a@example.com');
    localStorage.setItem('dailyDozenLastSync', '2020-01-01T00:00:00');
    storage.saveProfiles({ ada: { name: SECRET, color: '#38672a', emoji: '🫘' } });
    storage.saveDietType('ada', 'standard');
    storage.saveData('ada', { [DAY]: { beans: [0] } });
}

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    };
}

test('a refused server household is not uploaded by the next push', async (t) => {
    installBrowser();
    const puts = [];
    globalThis.fetch = async (_url, options = {}) => {
        if (options.method === 'PUT') {
            puts.push(String(options.body));
            return jsonResponse({ updatedAt: '2026-10-22T00:00:01' });
        }
        return jsonResponse({
            data: { profiles: {} },
            updatedAt: '2026-10-22T00:00:00',
        });
    };

    const { storage, AuthManager } = await loadAuth();
    seedLocal(storage);
    const auth = new AuthManager({ refreshAfterSync() {} });

    await auth.sync();
    assert.equal(puts.length, 0);
    assert.equal(storage.loadProfiles().ada.name, SECRET);

    await auth.pushData();
    assert.equal(puts.some((body) => body.includes(SECRET)), false);

    t.mock.timers.enable({ apis: ['setTimeout'] });
    auth.schedulePush();
    t.mock.timers.tick(3000);
    await Promise.resolve();
    assert.equal(puts.some((body) => body.includes(SECRET)), false);

    // A later readable pull clears the block, so this device can push again.
    globalThis.fetch = async (_url, options = {}) => {
        if (options.method === 'PUT') {
            puts.push(String(options.body));
            return jsonResponse({ updatedAt: '2026-10-22T00:00:03' });
        }
        return jsonResponse({
            data: {
                profiles: {
                    ada: {
                        name: 'Ada',
                        color: '#38672a',
                        emoji: '🫘',
                        dietType: 'standard',
                        customServings: null,
                        data: {},
                    },
                },
            },
            updatedAt: '2026-10-22T00:00:02',
        });
    };
    await auth.sync();
    puts.length = 0;
    await auth.pushData();
    assert.equal(puts.length, 1);
    assert.equal(puts.some((body) => body.includes(SECRET)), false);
    assert.equal(puts.some((body) => body.includes('"name":"Ada"')), true);
});

test('a null server household can still be replaced by a push', async () => {
    installBrowser();
    const puts = [];
    globalThis.fetch = async (_url, options = {}) => {
        if (options.method === 'PUT') {
            puts.push(String(options.body));
            return jsonResponse({ updatedAt: '2026-10-22T00:00:01' });
        }
        return jsonResponse({ data: null, updatedAt: null });
    };

    const { storage, AuthManager } = await loadAuth();
    seedLocal(storage);
    const auth = new AuthManager({ refreshAfterSync() {} });

    await auth.sync();
    assert.equal(puts.some((body) => body.includes(SECRET)), true);
});
