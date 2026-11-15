# Bountywell

**Daily nourishment, gratefully tracked.**

Bountywell is an offline-first food and wellness checklist with customizable plans, optional cloud synchronization, and a Catholic approach to gratitude, stewardship, and temperance.

Use it at [bountywell.com](https://bountywell.com) or [bountywell.app](https://bountywell.app).

> Bountywell ships with a checklist based on the twelve food groups popularized by Dr. Michael Greger's Daily Dozen ([NutritionFacts.org](https://nutritionfacts.org/daily-dozen/)), used with Dr. Greger's written permission (granted 2026-08-07). It is not affiliated with or endorsed by Dr. Greger or NutritionFacts.org.

## Features

- Track daily servings across food, water, exercise, and custom categories.
- Start with the Daily Dozen–inspired plan or customize every target.
- Keep working offline with local-first storage and an installable PWA.
- Track for one person by default, and add more people as needed - each with their own name, icon, plan, and history.
- Optionally create an account to synchronize data across devices.
- Review progress by day and export or import a portable JSON backup.
- Pause for an optional meal blessing and gratitude prompt.

## Default plan

The Daily Dozen–inspired plan includes:

1. Beans — 3 servings
2. Berries — 1 serving
3. Other fruits — 3 servings
4. Greens — 2 servings
5. Cruciferous vegetables — 1 serving
6. Other vegetables — 2 servings
7. Flaxseed — 1 serving
8. Nuts and seeds — 1 serving
9. Herbs and spices — 1 serving
10. Whole grains — 3 servings
11. Beverages — 5 servings
12. Exercise — 1 serving

These targets are editable from **Customize Categories**. Additional presets include protein and other adjustments.

## Install

Open either live address in a modern browser. Bountywell works immediately without installation.

- On Chrome, Edge, or Brave, choose **Install Bountywell** from the browser menu.
- On iPhone or iPad, use **Share → Add to Home Screen**.
- On Android, use **Install app** or **Add to Home screen**.

Once installed, Bountywell launches like a native app and keeps its core tracking features available offline.

## Run locally

Requirements: Node.js 22 or 26 (both tested in CI).

```bash
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

Run `npm ci --engine-strict --no-audit --no-fund` and `npm test` to match CI.
There is no build step; the server and client run directly from source.
After switching Node versions, run `npm ci` again to install the matching
`better-sqlite3` native addon.

The application uses vanilla JavaScript, HTML, and CSS on the client; Express and SQLite provide optional account and synchronization APIs. The main PWA files are `index.html`, `styles.css`, `app.js`, `manifest.json`, and `sw.js`. The Android Trusted Web Activity wrapper lives in `android-twa/`.

## Privacy

- Tracking data is stored locally by default.
- Cloud synchronization is optional and requires an account.
- The app contains no advertising.
- Google Analytics is used for aggregate site traffic measurement.
- The source is public under the MIT License.

## Catholic principles

Bountywell is designed around gratitude for food as a gift, responsible stewardship of health, moderation rather than obsession, and respect for the dignity of the human person. Its meal blessing and faith framing are optional; its tracking plans are fully customizable.

## Disclaimer

Bountywell is for educational and tracking purposes only. It is not a substitute for professional medical advice. Consult a qualified healthcare professional for personalized nutrition or health guidance.

The reference to Dr. Greger's Daily Dozen is descriptive and used with his written permission (granted 2026-08-07). Bountywell does not use NutritionFacts.org branding and does not claim sponsorship, affiliation, or endorsement.

---

*“Do you not know that your body is a temple of the Holy Spirit within you, which you have from God, and that you are not your own?” — 1 Corinthians 6:19*
