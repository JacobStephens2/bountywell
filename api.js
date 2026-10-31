const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { db, stmts } = require('./db');

const router = express.Router();

// --- JWT secret ---

function getJwtSecret() {
    const secretPath = path.join(__dirname, 'data', '.jwt-secret');
    try {
        return fs.readFileSync(secretPath, 'utf8').trim();
    } catch {
        const secret = crypto.randomBytes(64).toString('hex');
        fs.writeFileSync(secretPath, secret);
        return secret;
    }
}

const JWT_SECRET = process.env.JWT_SECRET || getJwtSecret();
const TOKEN_EXPIRY = '30d';

function signToken(user) {
    return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

// password_replaced_at is UTC 'YYYY-MM-DD HH:MM:SS' from SQLite datetime().
// JWT iat is unix seconds. Equal timestamps are not earlier, so a token issued
// in the same second as the replacement still counts as current.
function tokenIssuedBeforePasswordReplacement(issuedAtSeconds, passwordReplacedAt) {
    if (passwordReplacedAt == null) {
        return false;
    }
    if (typeof issuedAtSeconds !== 'number' || !Number.isFinite(issuedAtSeconds)) {
        return false;
    }
    const issuedAtUtc = new Date(Math.floor(issuedAtSeconds) * 1000)
        .toISOString()
        .slice(0, 19)
        .replace('T', ' ');
    return issuedAtUtc < passwordReplacedAt;
}

// --- Auth middleware ---

function authenticate(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    let decoded;
    try {
        decoded = jwt.verify(header.slice(7), JWT_SECRET);
    } catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    const account = stmts.getUserById.get(decoded.userId);
    if (account && tokenIssuedBeforePasswordReplacement(decoded.iat, account.password_replaced_at)) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
}

// --- Rate limiting ---

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    message: { error: 'Too many attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5,
    message: { error: 'Too many accounts created. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- Validation ---

function validateEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const trimmed = email.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 254;
}

function normalizeEmail(email) {
    return email.trim().toLowerCase();
}

// --- Routes ---

router.post('/register', registerLimiter, authLimiter, (req, res) => {
    const { email, password } = req.body || {};

    if (!validateEmail(email)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const normalizedEmail = normalizeEmail(email);

    const existing = stmts.getUserByEmail.get(normalizedEmail);
    if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hash = bcrypt.hashSync(password, 10);
    const result = stmts.createUser.run(normalizedEmail, hash);
    const user = { id: result.lastInsertRowid, email: normalizedEmail };
    const token = signToken(user);

    const transport = getMailTransport();
    if (transport) {
        const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER;
        const ua = (req.headers['user-agent'] || 'unknown').toString().slice(0, 1024);
        transport.sendMail({
            from: fromAddr,
            to: 'jacob@stephens.page',
            subject: 'Bountywell — New Account Created',
            text: `A new account was created on Bountywell.\n\nEmail: ${normalizedEmail}\nDate: ${new Date().toISOString()}\nDevice: ${ua}`,
        }).catch(err => {
            console.log('Failed to send admin notification:', err.message);
        });
    }

    res.status(201).json({ token, email: user.email });
});

router.post('/login', authLimiter, (req, res) => {
    const { email, password } = req.body || {};

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = stmts.getUserByEmail.get(normalizedEmail);

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ token, email: user.email });
});

router.post('/refresh-token', authenticate, (req, res) => {
    const user = stmts.getUserById.get(req.user.userId);
    if (!user) {
        return res.status(401).json({ error: 'Account not found' });
    }
    const token = signToken(user);
    res.json({ token, email: user.email });
});

router.get('/data', authenticate, (req, res) => {
    const row = stmts.getData.get(req.user.userId);
    if (!row) {
        return res.json({ data: null, updatedAt: null });
    }
    res.json({ data: JSON.parse(row.data), updatedAt: row.updated_at });
});

router.put('/data', authenticate, (req, res) => {
    const { data } = req.body || {};
    if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Invalid data payload' });
    }

    stmts.upsertData.run(req.user.userId, JSON.stringify(data));
    const row = stmts.getData.get(req.user.userId);
    res.json({ success: true, updatedAt: row.updated_at });
});

// --- Password reset ---

function getMailTransport() {
    if (!process.env.SMTP_HOST) return null;
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

router.post('/forgot-password', authLimiter, (req, res) => {
    const { email } = req.body || {};
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = stmts.getUserByEmail.get(normalizedEmail);

    // Always return success to prevent email enumeration
    if (!user) {
        return res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    stmts.createReset.run(user.id, token);

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetLink = `${appUrl}?reset=${token}`;

    const transport = getMailTransport();
    if (transport) {
        const fromAddr = process.env.SMTP_FROM || process.env.SMTP_USER;
        transport.sendMail({
            from: fromAddr,
            to: normalizedEmail,
            subject: 'Bountywell — Password Reset',
            text: `Reset your password by visiting this link (expires in 1 hour):\n\n${resetLink}\n\nIf you did not request this, you can ignore this email.`,
            html: `<p>Reset your password by clicking the link below (expires in 1 hour):</p><p><a href="${resetLink}">${resetLink}</a></p><p>If you did not request this, you can ignore this email.</p>`,
        }).catch(err => {
            console.log('Failed to send reset email:', err.message);
        });
    } else {
        console.log(`Password reset link for ${normalizedEmail}: ${resetLink}`);
    }

    res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
});

// One write: a failure while marking resets rolls the password change back.
const consumePasswordReset = db.transaction((userId, passwordHash) => {
    stmts.updatePassword.run(passwordHash, userId);
    stmts.markUnusedResetsUsed.run(userId);
});

router.post('/reset-password', authLimiter, (req, res) => {
    const { token, password } = req.body || {};

    if (!token) {
        return res.status(400).json({ error: 'Reset token is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const resetRow = stmts.getValidReset.get(token);
    if (!resetRow) {
        return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    consumePasswordReset(resetRow.user_id, hash);

    res.json({ message: 'Password has been reset. You can now sign in.' });
});

module.exports = router;
