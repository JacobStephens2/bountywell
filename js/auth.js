// Account management: login, register, sync

import * as household from './household.js';
import { trapFocus } from './focus-trap.js';

const TOKEN_KEY = 'dailyDozenAuthToken';
const EMAIL_KEY = 'dailyDozenAuthEmail';
const SYNC_TS_KEY = 'dailyDozenLastSync';

export class AuthManager {
    constructor(app) {
        this.app = app;
        this.token = localStorage.getItem(TOKEN_KEY);
        this.email = localStorage.getItem(EMAIL_KEY);
        this._syncTimer = null;
        this.checkForResetToken();
    }

    checkForResetToken() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('reset');
        if (token) {
            // Clean the URL
            window.history.replaceState({}, '', window.location.pathname);
            this.showResetPasswordModal(token);
        }
    }

    get isLoggedIn() {
        return !!this.token;
    }

    // --- Token management ---

    saveAuth(token, email) {
        this.token = token;
        this.email = email;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(EMAIL_KEY, email);
    }

    clearAuth() {
        this.token = null;
        this.email = null;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(EMAIL_KEY);
        localStorage.removeItem(SYNC_TS_KEY);
    }

    // --- Token refresh ---

    async refreshTokenIfNeeded() {
        if (!this.token) return;
        try {
            // Decode JWT payload (base64) to check expiry
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            const expiresIn = payload.exp * 1000 - Date.now();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (expiresIn < sevenDays) {
                const result = await this.apiFetch('/refresh-token', { method: 'POST' });
                this.saveAuth(result.token, result.email);
            }
        } catch {
            // Token decode failed or refresh failed — will be caught on next API call
        }
    }

    // --- API helpers ---

    async apiFetch(path, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...options.headers };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        const res = await fetch(`/api${path}`, { ...options, headers });
        const body = await res.json();
        if (!res.ok) {
            if (res.status === 401 && this.token) {
                this.clearAuth();
                this.updateUI();
            }
            throw new Error(body.error || 'Request failed');
        }
        return body;
    }

    // --- Auth actions ---

    async register(email, password) {
        const result = await this.apiFetch('/register', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        this.saveAuth(result.token, result.email);
        // Push local data to server on registration
        await this.pushData();
        this.updateUI();
        return result;
    }

    async login(email, password) {
        const result = await this.apiFetch('/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
        });
        this.saveAuth(result.token, result.email);
        // Pull server data if it exists
        await this.pullData();
        this.updateUI();
        return result;
    }

    logout() {
        this.clearAuth();
        this.updateUI();
    }

    // --- Sync ---

    async pushData() {
        if (!this.isLoggedIn) return;
        const data = household.snapshot();
        const result = await this.apiFetch('/data', {
            method: 'PUT',
            body: JSON.stringify({ data }),
        });
        localStorage.setItem(SYNC_TS_KEY, result.updatedAt);
        return result;
    }

    async pullData() {
        if (!this.isLoggedIn) return;
        const result = await this.apiFetch('/data');
        if (!result.data) return;

        const applied = household.apply(result.data);
        if (!applied.applied) return;

        household.commit(applied);
        localStorage.setItem(SYNC_TS_KEY, result.updatedAt);
        this.app.refreshAfterSync();
    }

    async sync() {
        if (!this.isLoggedIn) return;
        try {
            const serverResult = await this.apiFetch('/data');
            const localTs = localStorage.getItem(SYNC_TS_KEY);
            const serverTs = serverResult.updatedAt;

            if (serverResult.data && serverTs && (!localTs || serverTs > localTs)) {
                const applied = household.apply(serverResult.data);
                // A blob this client cannot read must not be replaced by a push
                // on the same attempt, or the refusal deletes the only copy.
                if (!applied.applied) return;
                household.commit(applied);
                localStorage.setItem(SYNC_TS_KEY, serverTs);
                this.app.refreshAfterSync();
            } else {
                await this.pushData();
            }
        } catch (e) {
            console.log('Sync failed:', e.message);
        }
    }

    // Debounced sync: call this after any data change
    schedulePush() {
        if (!this.isLoggedIn) return;
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => {
            this.pushData().catch(e => console.log('Auto-sync failed:', e.message));
        }, 3000);
    }

    // --- UI ---

    updateUI() {
        const accountBtn = document.getElementById('account-btn');
        if (accountBtn) {
            accountBtn.textContent = this.isLoggedIn ? `👤 ${this.email}` : '👤 Sign In';
        }
        const signInBanner = document.getElementById('sign-in-banner');
        if (signInBanner) {
            if (this.isLoggedIn) {
                signInBanner.classList.add('hidden');
            } else {
                const dismissed = sessionStorage.getItem('sign-in-banner-dismissed');
                if (!dismissed) {
                    signInBanner.classList.remove('hidden');
                }
            }
        }
    }

    showAccountModal() {
        // Remove any existing modal
        const existing = document.querySelector('.auth-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'auth-modal';

        if (this.isLoggedIn) {
            // Logged-in view
            const lastSync = localStorage.getItem(SYNC_TS_KEY);
            const syncText = lastSync ? new Date(lastSync + 'Z').toLocaleString() : 'Never';

            modal.innerHTML = `
                <div class="auth-content">
                    <div class="auth-header">
                        <h3>Account</h3>
                        <button class="auth-close-btn">&times;</button>
                    </div>
                    <div class="auth-account-info">
                        <p class="auth-email">${this.email}</p>
                        <p class="auth-sync-status">Last synced: ${syncText}</p>
                    </div>
                    <div class="auth-actions">
                        <button class="auth-sync-btn" id="auth-sync-btn">Sync Now</button>
                        <button class="auth-logout-btn" id="auth-logout-btn">Sign Out</button>
                    </div>
                    <p class="auth-status" id="auth-status"></p>
                </div>
            `;

            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('show'));
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        trapFocus(modal);

            modal.querySelector('#auth-sync-btn').addEventListener('click', async () => {
                const status = document.getElementById('auth-status');
                const syncBtn = document.getElementById('auth-sync-btn');
                syncBtn.disabled = true;
                syncBtn.textContent = 'Syncing...';
                status.textContent = '';
                try {
                    await this.sync();
                    status.textContent = 'Synced successfully';
                    status.className = 'auth-status success';
                    // Update the last synced display
                    const newSync = localStorage.getItem(SYNC_TS_KEY);
                    if (newSync) {
                        modal.querySelector('.auth-sync-status').textContent =
                            'Last synced: ' + new Date(newSync + 'Z').toLocaleString();
                    }
                } catch (e) {
                    status.textContent = e.message;
                    status.className = 'auth-status error';
                }
                syncBtn.disabled = false;
                syncBtn.textContent = 'Sync Now';
            });

            modal.querySelector('#auth-logout-btn').addEventListener('click', () => {
                this.logout();
                modal.remove();
            });
        } else {
            // Login/Register view
            modal.innerHTML = `
                <div class="auth-content">
                    <div class="auth-header">
                        <h3>Sign In</h3>
                        <button class="auth-close-btn">&times;</button>
                    </div>
                    <form class="auth-form" id="auth-form">
                        <input type="email" id="auth-email" placeholder="Email" required autocomplete="email">
                        <input type="password" id="auth-password" placeholder="Password (8+ characters)" required minlength="8" autocomplete="current-password">
                        <button type="submit" class="auth-submit-btn" id="auth-submit-btn">Sign In</button>
                    </form>
                    <p class="auth-toggle">
                        Don't have an account?
                        <button class="auth-toggle-btn" id="auth-toggle-btn">Create one</button>
                    </p>
                    <p class="auth-forgot">
                        <button class="auth-toggle-btn" id="auth-forgot-btn">Forgot password?</button>
                    </p>
                    <p class="auth-status" id="auth-status"></p>
                </div>
            `;

            document.body.appendChild(modal);
            requestAnimationFrame(() => modal.classList.add('show'));
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        trapFocus(modal);

            let isRegister = false;
            const toggleBtn = modal.querySelector('#auth-toggle-btn');
            const submitBtn = modal.querySelector('#auth-submit-btn');
            const heading = modal.querySelector('h3');
            const toggleText = modal.querySelector('.auth-toggle');

            toggleBtn.addEventListener('click', () => {
                isRegister = !isRegister;
                heading.textContent = isRegister ? 'Create Account' : 'Sign In';
                submitBtn.textContent = isRegister ? 'Create Account' : 'Sign In';
                toggleText.firstChild.textContent = isRegister
                    ? 'Already have an account? '
                    : "Don't have an account? ";
                toggleBtn.textContent = isRegister ? 'Sign in' : 'Create one';
            });

            modal.querySelector('#auth-forgot-btn').addEventListener('click', () => {
                modal.remove();
                this.showForgotPasswordModal();
            });

            modal.querySelector('#auth-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const email = document.getElementById('auth-email').value;
                const password = document.getElementById('auth-password').value;
                const status = document.getElementById('auth-status');

                submitBtn.disabled = true;
                submitBtn.textContent = isRegister ? 'Creating...' : 'Signing in...';
                status.textContent = '';

                try {
                    if (isRegister) {
                        await this.register(email, password);
                    } else {
                        await this.login(email, password);
                    }
                    modal.remove();
                } catch (err) {
                    status.textContent = err.message;
                    status.className = 'auth-status error';
                    submitBtn.disabled = false;
                    submitBtn.textContent = isRegister ? 'Create Account' : 'Sign In';
                }
            });
        }

        // Close handlers
        modal.querySelector('.auth-close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    showForgotPasswordModal() {
        const existing = document.querySelector('.auth-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'auth-modal';
        modal.innerHTML = `
            <div class="auth-content">
                <div class="auth-header">
                    <h3>Reset Password</h3>
                    <button class="auth-close-btn">&times;</button>
                </div>
                <p class="auth-forgot-desc">Enter your email and we'll send you a link to reset your password.</p>
                <form class="auth-form" id="auth-forgot-form">
                    <input type="email" id="auth-forgot-email" placeholder="Email" required autocomplete="email">
                    <button type="submit" class="auth-submit-btn" id="auth-forgot-submit">Send Reset Link</button>
                </form>
                <p class="auth-toggle">
                    <button class="auth-toggle-btn" id="auth-back-to-login">Back to Sign In</button>
                </p>
                <p class="auth-status" id="auth-status"></p>
            </div>
        `;

        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('show'));
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        trapFocus(modal);

        modal.querySelector('#auth-back-to-login').addEventListener('click', () => {
            modal.remove();
            this.showAccountModal();
        });

        modal.querySelector('#auth-forgot-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('auth-forgot-email').value;
            const status = document.getElementById('auth-status');
            const btn = document.getElementById('auth-forgot-submit');

            btn.disabled = true;
            btn.textContent = 'Sending...';
            status.textContent = '';

            try {
                const result = await this.apiFetch('/forgot-password', {
                    method: 'POST',
                    body: JSON.stringify({ email }),
                });
                status.textContent = result.message;
                status.className = 'auth-status success';
                btn.textContent = 'Sent';
            } catch (err) {
                status.textContent = err.message;
                status.className = 'auth-status error';
                btn.disabled = false;
                btn.textContent = 'Send Reset Link';
            }
        });

        modal.querySelector('.auth-close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }

    showResetPasswordModal(token) {
        const existing = document.querySelector('.auth-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'auth-modal';
        modal.innerHTML = `
            <div class="auth-content">
                <div class="auth-header">
                    <h3>Set New Password</h3>
                    <button class="auth-close-btn">&times;</button>
                </div>
                <form class="auth-form" id="auth-reset-form">
                    <input type="password" id="auth-new-password" placeholder="New password (8+ characters)" required minlength="8" autocomplete="new-password">
                    <input type="password" id="auth-confirm-password" placeholder="Confirm new password" required minlength="8" autocomplete="new-password">
                    <button type="submit" class="auth-submit-btn" id="auth-reset-submit">Reset Password</button>
                </form>
                <p class="auth-status" id="auth-status"></p>
            </div>
        `;

        document.body.appendChild(modal);
        requestAnimationFrame(() => modal.classList.add('show'));
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        trapFocus(modal);

        modal.querySelector('#auth-reset-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('auth-new-password').value;
            const confirm = document.getElementById('auth-confirm-password').value;
            const status = document.getElementById('auth-status');
            const btn = document.getElementById('auth-reset-submit');

            if (password !== confirm) {
                status.textContent = 'Passwords do not match';
                status.className = 'auth-status error';
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Resetting...';
            status.textContent = '';

            try {
                const result = await this.apiFetch('/reset-password', {
                    method: 'POST',
                    body: JSON.stringify({ token, password }),
                });
                status.textContent = result.message;
                status.className = 'auth-status success';
                btn.textContent = 'Done';
                setTimeout(() => {
                    modal.remove();
                    this.showAccountModal();
                }, 2000);
            } catch (err) {
                status.textContent = err.message;
                status.className = 'auth-status error';
                btn.disabled = false;
                btn.textContent = 'Reset Password';
            }
        });

        modal.querySelector('.auth-close-btn').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    }
}
