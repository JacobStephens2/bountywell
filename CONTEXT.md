# Bountywell domain terms

The words below mean one thing each in code, issues and reviews. Where the UI and the stored data use different names, both are listed.

**Person** - someone whose servings are tracked. The UI says "person"; storage, `app.js` and the sync payload say "profile" (`dailyDozenProfiles`, `currentProfile`). Each Person has their own Plan and Day log.

**Category** - one row on the tracker screen, such as Beans or Exercise. Defined in `js/categories.js` with an `id`, a name, an icon and the number of servings the current Plan asks for.

**Serving** - one checkbox in a Category. Servings are counted, not individually identified: a Category with 2 of 3 Servings done shows its first two boxes checked.

**Plan** - how many Servings each Category asks for, for one Person. Edited in Customize and stored as `dailyDozenCustomServings_<profileId>`. Replaces the legacy "diet type" preset (`dailyDozenDietType_<profileId>`), which is now only read to seed a Plan for a Person who never customized one.

**Day log** - a Person's record of Servings done, per Category, per day. `js/day-log.js` owns its rules; `storage.loadData`/`saveData` only persist it. Stored as `{ [Day key]: { [categoryId]: number[] } }`, where each array holds the checked Serving indices. Writes store the prefix `[0 .. done-1]` and drop empty Categories and empty days. Reads count the distinct indices below the Category's current Serving count, so indices left over from a larger Plan are ignored.

**Day key** - `Date.toDateString()` of a local date, for example `"Sun Oct 04 2026"`. Only `dayKey()` in `js/day-log.js` builds one.

**Complete day** - a day where Servings done is at least the total Servings in the Person's current Plan (`done >= total`). Past days are judged against the current Plan, because historic Plans are not stored.

**Streak** - the number of consecutive Complete days ending yesterday, plus today if today is already complete. An incomplete today does not break the Streak.
