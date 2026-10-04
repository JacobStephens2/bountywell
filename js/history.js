// History view: calendar, streaks, and day-detail drill-down

import * as storage from './storage.js';
import * as dayLog from './day-log.js';
import { getActiveCategories } from './categories.js';
import { trapFocus } from './focus-trap.js';

export class HistoryView {
    constructor(app) {
        this.app = app;
        this.viewDate = new Date();
        this._escHandler = null;
        this._releaseFocus = null;
    }

    open() {
        this.viewDate = new Date();
        this.render();
    }

    close() {
        const modal = document.querySelector('.history-modal');
        if (modal) modal.remove();
        if (this._releaseFocus) { this._releaseFocus(); this._releaseFocus = null; }
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    }

    getCategories() {
        return this.app.categories;
    }

    render() {
        this.close();

        const data = storage.loadData(this.app.currentProfile);
        const categories = this.getCategories();

        const year = this.viewDate.getFullYear();
        const month = this.viewDate.getMonth();
        const monthName = this.viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Monthly stats
        let daysTracked = 0;
        let perfectDays = 0;

        // Build calendar cells
        let calendarHtml = '';
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(day => {
            calendarHtml += `<div class="history-day-header">${day}</div>`;
        });

        for (let i = 0; i < startDayOfWeek; i++) {
            calendarHtml += `<div class="history-day empty"></div>`;
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dateKey = dayLog.dayKey(date);
            const isFuture = date > today;
            const isToday = dateKey === dayLog.dayKey(today);

            const { done, total } = dayLog.dayProgress(data, date, categories);
            const tracked = done > 0;
            if (tracked) {
                daysTracked++;
                if (done >= total) perfectDays++;
            }

            const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
            let colorClass = 'history-day-none';
            if (!isFuture && tracked) {
                if (percentage >= 100) colorClass = 'history-day-full';
                else if (percentage >= 75) colorClass = 'history-day-high';
                else if (percentage >= 50) colorClass = 'history-day-mid';
                else if (percentage > 0) colorClass = 'history-day-low';
            }

            const futureClass = isFuture ? 'future' : '';
            const todayClass = isToday ? 'today' : '';
            const hasData = tracked && !isFuture ? 'has-data' : '';
            const clickable = !isFuture ? 'clickable' : '';

            calendarHtml += `
                <div class="history-day ${colorClass} ${futureClass} ${todayClass} ${hasData} ${clickable}"
                     data-date="${dateKey}"
                     ${hasData ? `title="${percentage}% complete — click to edit"` : !isFuture ? 'title="Click to edit"' : ''}>
                    <span class="history-day-number">${day}</span>
                    ${!isFuture && tracked ? `<span class="history-day-pct">${percentage}%</span>` : ''}
                </div>
            `;
        }

        const streak = dayLog.streak(data, categories, today);

        // Don't allow navigating past current month
        const isCurrentMonth = year === today.getFullYear() && month === today.getMonth();

        const modal = document.createElement('div');
        modal.className = 'history-modal';
        modal.innerHTML = `
            <div class="history-content">
                <div class="history-header">
                    <h3>History</h3>
                    <button class="history-close-btn" aria-label="Close history">&times;</button>
                </div>

                <div class="history-stats">
                    <div class="history-stat">
                        <span class="history-stat-value">${streak}</span>
                        <span class="history-stat-label">Day Streak</span>
                    </div>
                    <div class="history-stat">
                        <span class="history-stat-value">${perfectDays}</span>
                        <span class="history-stat-label">Perfect Days</span>
                    </div>
                    <div class="history-stat">
                        <span class="history-stat-value">${daysTracked}</span>
                        <span class="history-stat-label">Days Tracked</span>
                    </div>
                </div>

                <div class="history-nav">
                    <button class="history-nav-btn history-prev" aria-label="Previous month">&larr;</button>
                    <span class="history-month-label">${monthName}</span>
                    <button class="history-nav-btn history-next ${isCurrentMonth ? 'disabled' : ''}"
                            aria-label="Next month"
                            ${isCurrentMonth ? 'disabled' : ''}>&rarr;</button>
                </div>

                <div class="history-calendar">
                    ${calendarHtml}
                </div>

                <div class="history-legend">
                    <span class="history-legend-item"><span class="history-legend-color history-day-none"></span> No data</span>
                    <span class="history-legend-item"><span class="history-legend-color history-day-low"></span> &lt;50%</span>
                    <span class="history-legend-item"><span class="history-legend-color history-day-mid"></span> 50-74%</span>
                    <span class="history-legend-item"><span class="history-legend-color history-day-high"></span> 75-99%</span>
                    <span class="history-legend-item"><span class="history-legend-color history-day-full"></span> 100%</span>
                </div>

                <p class="history-hint">Tap a day to edit its entries</p>
            </div>
        `;

        document.body.appendChild(modal);

        // Animate in
        requestAnimationFrame(() => modal.classList.add('show'));
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        this._releaseFocus = trapFocus(modal);

        // Event listeners
        modal.querySelector('.history-close-btn').addEventListener('click', () => this.close());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });

        modal.querySelector('.history-prev').addEventListener('click', () => {
            this.viewDate.setMonth(this.viewDate.getMonth() - 1);
            this.render();
        });

        if (!isCurrentMonth) {
            modal.querySelector('.history-next').addEventListener('click', () => {
                this.viewDate.setMonth(this.viewDate.getMonth() + 1);
                this.render();
            });
        }

        modal.querySelectorAll('.history-day.clickable').forEach(cell => {
            cell.addEventListener('click', () => {
                const date = new Date(cell.dataset.date);
                this.close();
                this.app.navigateToDate(date);
            });
        });

        this._escHandler = (e) => {
            if (e.key === 'Escape') this.close();
        };
        document.addEventListener('keydown', this._escHandler);
    }
}
