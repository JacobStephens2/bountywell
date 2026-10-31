const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// A regression test points this at a temporary file so stored accounts stay untouched.
const db = new Database(process.env.BOUNTYWELL_DB_PATH || path.join(DATA_DIR, 'daily_dozen.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        password_replaced_at TEXT
    );

    CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS user_data (
        user_id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
    );
`);

// Accounts already stored predate this column. Adding it leaves their time empty.
const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((column) => column.name === 'password_replaced_at')) {
    db.exec('ALTER TABLE users ADD COLUMN password_replaced_at TEXT');
}

const stmts = {
    createUser: db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)'),
    getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    getUserById: db.prepare('SELECT id, email, created_at, password_replaced_at FROM users WHERE id = ?'),
    getData: db.prepare('SELECT data, updated_at FROM user_data WHERE user_id = ?'),
    createReset: db.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, datetime(\'now\', \'+1 hour\'))'),
    getValidReset: db.prepare('SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > datetime(\'now\')'),
    markUnusedResetsUsed: db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0'),
    updatePassword: db.prepare('UPDATE users SET password_hash = ?, password_replaced_at = datetime(\'now\') WHERE id = ?'),
    upsertData: db.prepare(`
        INSERT INTO user_data (user_id, data, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = datetime('now')
    `),
};

module.exports = { db, stmts };
