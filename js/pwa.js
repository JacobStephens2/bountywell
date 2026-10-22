// PWA management: service worker, installation

import { STORAGE_KEYS } from './storage.js';

const APP_VERSION = 'v2.1.4';

export class PwaManager {
    constructor() {
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        this.isIOSStandalone = window.navigator.standalone === true;
        this.isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
        this.deferredPrompt = null;
        this.installDismissedKey = STORAGE_KEYS.INSTALL_DISMISSED;
    }

    init() {
        this.registerServiceWorker();
        this.setupPWAInstallation();
    }

    registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;

        navigator.serviceWorker.register('sw.js?v=2.1.4')
            .then(registration => {

                // Periodically check for SW updates
                const updateInterval = this.isIOS ? 60000 : 300000;
                setInterval(() => registration.update(), updateInterval);
                registration.update();

                if (this.isIOS) {
                    document.addEventListener('visibilitychange', () => {
                        if (!document.hidden) registration.update();
                    });
                }
            })
            .catch(error => {
            });

        // Auto-reload when a new service worker takes over
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
        });
    }

    showVersionInfo() {
        const versionModal = document.createElement('div');
        versionModal.className = 'version-modal';
        versionModal.innerHTML = `
            <div class="modal-content version-modal-content">
                <h3>App Version</h3>
                <div class="version-details">
                    <div class="version-detail">
                        <strong>Version:</strong> ${APP_VERSION}
                    </div>
                    <div class="version-detail">
                        <strong>Installation:</strong>
                        ${this.isStandalone || this.isIOSStandalone
                            ? 'Installed as PWA'
                            : 'Running in browser'}
                    </div>
                </div>
                <button class="close-modal" onclick="this.closest('.version-modal').remove()">Close</button>
            </div>
        `;

        document.body.appendChild(versionModal);

        versionModal.addEventListener('click', (e) => {
            if (e.target === versionModal) versionModal.remove();
        });

        const escHandler = (e) => {
            if (e.key === 'Escape') {
                versionModal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    // --- Installation ---

    setupPWAInstallation() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.syncFooterInstallButton();
        });

        window.addEventListener('appinstalled', () => {
            this.hideInstallButton();
            this.showInstallationSuccess();
            this.syncFooterInstallButton();
        });

        this.syncFooterInstallButton();
    }

    syncFooterInstallButton() {
        const footerInstallBtn = document.getElementById('footer-install-btn');
        if (!footerInstallBtn) return;

        if (this.isStandalone || this.isIOSStandalone) {
            footerInstallBtn.hidden = true;
            return;
        }

        footerInstallBtn.hidden = false;
        footerInstallBtn.textContent = this.deferredPrompt
            ? '📱 Install App'
            : '📱 Show Installation Instructions';
    }

    showInstallButton() {
        if (this.hasUserDismissedInstall()) return;
        this.hideInstallButton();

        const installButton = document.createElement('div');
        installButton.className = 'install-prompt';
        installButton.innerHTML = `
            <div class="install-content">
                <div class="install-icon">📱</div>
                <div class="install-text">
                    <h4>Install Bountywell</h4>
                    <p>Add to your home screen for quick access and offline use</p>
                </div>
                <button class="install-btn" onclick="window.bountywellTracker.installApp()">
                    Install App
                </button>
                <button class="dismiss-install-btn" onclick="window.bountywellTracker.dismissInstallPrompt()">
                    ✕
                </button>
            </div>
        `;

        document.body.appendChild(installButton);
    }

    hideInstallButton() {
        const existingButton = document.querySelector('.install-prompt');
        if (existingButton) existingButton.remove();
    }

    dismissInstallPrompt() {
        this.hideInstallButton();
        this.saveInstallDismissed();
    }

    dismissManualInstallPrompt() {
        const existingButton = document.querySelector('.manual-install-prompt');
        if (existingButton) existingButton.remove();
        this.saveInstallDismissed();
    }

    hasUserDismissedInstall() {
        try {
            return localStorage.getItem(this.installDismissedKey) === 'true';
        } catch {
            return false;
        }
    }

    saveInstallDismissed() {
        try {
            localStorage.setItem(this.installDismissedKey, 'true');
        } catch { /* ignore */ }
    }

    resetInstallDismissed() {
        try {
            localStorage.removeItem(this.installDismissedKey);
        } catch { /* ignore */ }
    }

    installApp() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            this.deferredPrompt.userChoice.then(() => {
                this.deferredPrompt = null;
                this.syncFooterInstallButton();
            });
        } else {
            this.showManualInstallInstructions();
        }
    }

    showInstallationSuccess() {
        const successDiv = document.createElement('div');
        successDiv.className = 'installation-success';
        successDiv.innerHTML = `
            <div class="success-content">
                <div class="success-icon">✅</div>
                <h4>Successfully Installed!</h4>
                <p>Bountywell is now available on your home screen</p>
                <button onclick="this.parentElement.parentElement.remove()" class="close-success-btn">
                    Great!
                </button>
            </div>
        `;

        document.body.appendChild(successDiv);

        setTimeout(() => {
            if (successDiv.parentNode) successDiv.remove();
        }, 5000);
    }

    checkAndShowManualInstall() {
        if (this.hasUserDismissedInstall()) return;
        if (this.isPWAReady()) {
            setTimeout(() => this.showManualInstallButton(), 3000);
        }
    }

    isPWAReady() {
        if (!('serviceWorker' in navigator)) return false;
        if (!document.querySelector('link[rel="manifest"]')) return false;
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') return false;
        return true;
    }

    showManualInstallButton() {
        if (this.hasUserDismissedInstall()) return;
        if (this.isStandalone || this.isIOSStandalone) return;

        const manualButton = document.createElement('div');
        manualButton.className = 'manual-install-prompt';
        manualButton.innerHTML = `
            <div class="manual-install-content">
                <div class="manual-install-icon">📱</div>
                <div class="manual-install-text">
                    <h4>Install Bountywell</h4>
                    <p>Get quick access and offline functionality</p>
                </div>
                <button class="manual-install-btn" onclick="window.bountywellTracker.showManualInstallInstructions()">
                    How to Install
                </button>
                <button class="dismiss-manual-btn" onclick="window.bountywellTracker.dismissManualInstallPrompt()">
                    Maybe Later
                </button>
            </div>
        `;

        document.body.appendChild(manualButton);
    }

    showManualInstallInstructions() {
        const instructionsDiv = document.createElement('div');
        instructionsDiv.className = 'install-instructions-modal';
        instructionsDiv.innerHTML = `
            <div class="instructions-content">
                <div class="instructions-header">
                    <h3>📱 Install Bountywell</h3>
                    <button class="close-instructions" onclick="this.parentElement.parentElement.parentElement.remove()">✕</button>
                </div>
                <div class="instructions-body">
                    <div class="browser-instructions">
                        <h4>Chrome / Edge / Brave:</h4>
                        <ol>
                            <li>Click the <strong>⋮</strong> menu in the top-right corner</li>
                            <li>Select <strong>"Install Bountywell"</strong> or <strong>"Add to Home screen"</strong></li>
                            <li>Click <strong>"Install"</strong> when prompted</li>
                        </ol>

                        <h4>Safari (iPhone/iPad):</h4>
                        <ol>
                            <li>Tap the <strong>Share</strong> button <strong>⎋</strong></li>
                            <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                            <li>Tap <strong>"Add"</strong> to confirm</li>
                        </ol>

                        <h4>Firefox:</h4>
                        <ol>
                            <li>Click the <strong>⋮</strong> menu in the top-right corner</li>
                            <li>Select <strong>"Install App"</strong> or <strong>"Add to Home Screen"</strong></li>
                            <li>Click <strong>"Install"</strong> when prompted</li>
                        </ol>

                        <h4>Android Chrome:</h4>
                        <ol>
                            <li>Tap the <strong>⋮</strong> menu in the top-right corner</li>
                            <li>Select <strong>"Add to Home screen"</strong></li>
                            <li>Tap <strong>"Add"</strong> to confirm</li>
                        </ol>
                    </div>

                    <div class="install-benefits">
                        <h4>Benefits of Installing:</h4>
                        <ul>
                            <li>✅ Quick access from your home screen</li>
                            <li>✅ Works offline</li>
                            <li>✅ Faster loading times</li>
                            <li>✅ App-like experience</li>
                            <li>✅ No need to remember the website URL</li>
                        </ul>
                    </div>

                    <div class="install-actions">
                        <button class="reset-install-dismissed-btn" onclick="window.bountywellTracker.resetInstallDismissed(); this.parentElement.parentElement.parentElement.remove();">
                            Reset Install Prompts
                        </button>
                        <p class="reset-install-note">Click this if you want to see the automatic install prompts again</p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(instructionsDiv);
    }
}
