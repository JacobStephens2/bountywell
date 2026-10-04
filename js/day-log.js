// Day log: which servings a person checked, per category, per day.
//
// Stored shape (synced, exported and read by older cached builds, so it
// must not change): { [Date.toDateString()]: { [categoryId]: number[] } }.
// A category's state is a count of servings done; writes store it as the
// index prefix [0 .. done-1]. Counts are clamped to the current Plan, so
// indices left over from a larger Plan are ignored until the next write.
//
// Pure functions only: callers load and save the log through storage.js.

export function dayKey(date) {
    return date.toDateString();
}

export function servingsDone(log, date, category) {
    const stored = log[dayKey(date)]?.[category.id];
    if (!Array.isArray(stored)) return 0;
    const inPlan = stored.filter(i => Number.isInteger(i) && i >= 0 && i < category.servings);
    return new Set(inPlan).size;
}

// With c servings done and box `index` tapped: tapping at or beyond the
// done count fills up to that box; tapping the first or last done box
// clears the category; tapping a box in the middle trims back to it.
export function tapServing(log, date, category, index) {
    const done = servingsDone(log, date, category);
    let next;
    if (index >= done) next = index + 1;
    else if (index === 0 || index === done - 1) next = 0;
    else next = index + 1;
    return writeServings(log, date, category.id, Math.min(next, category.servings));
}

export function clearDay(log, date) {
    const { [dayKey(date)]: _cleared, ...rest } = log;
    return rest;
}

export function dayProgress(log, date, categories) {
    let done = 0;
    let total = 0;
    for (const category of categories) {
        done += servingsDone(log, date, category);
        total += category.servings;
    }
    return { done, total };
}

// Consecutive Complete days ending yesterday, plus today if today is
// already complete. An incomplete today does not break the streak.
export function streak(log, categories, today) {
    let count = isComplete(log, today, categories) ? 1 : 0;
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    while (isComplete(log, d, categories)) {
        count++;
        d.setDate(d.getDate() - 1);
    }
    return count;
}

function isComplete(log, date, categories) {
    const { done, total } = dayProgress(log, date, categories);
    return total > 0 && done >= total;
}

function writeServings(log, date, categoryId, done) {
    const key = dayKey(date);
    const day = { ...log[key], [categoryId]: Array.from({ length: done }, (_, i) => i) };
    for (const id of Object.keys(day)) {
        if (!Array.isArray(day[id]) || day[id].length === 0) delete day[id];
    }

    const { [key]: _old, ...rest } = log;
    return Object.keys(day).length > 0 ? { ...rest, [key]: day } : rest;
}
