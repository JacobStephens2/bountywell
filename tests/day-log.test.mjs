import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    dayKey,
    servingsDone,
    tapServing,
    clearDay,
    dayProgress,
    streak,
} from '../js/day-log.js';

const day = new Date(2026, 9, 4);
const key = dayKey(day);

function daysBefore(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() - n);
    return d;
}

function prefix(n) {
    return Array.from({ length: n }, (_, i) => i);
}

// The tap rule from the issue, stated independently of the module.
function expectedAfterTap(done, index) {
    if (index >= done) return index + 1;
    if (index === 0 || index === done - 1) return 0;
    return index + 1;
}

test('dayKey is Date.toDateString()', () => {
    assert.equal(dayKey(day), 'Sun Oct 04 2026');
});

test('tapServing follows the tap rule for every plan of 1-9 servings', () => {
    for (let servings = 1; servings <= 9; servings++) {
        const category = { id: 'beans', servings };
        for (let done = 0; done <= servings; done++) {
            const log = done > 0 ? { [key]: { beans: prefix(done) } } : {};
            for (let index = 0; index < servings; index++) {
                const next = tapServing(log, day, category, index);
                const expected = expectedAfterTap(done, index);
                assert.equal(
                    servingsDone(next, day, category),
                    expected,
                    `servings=${servings} done=${done} tap=${index}`,
                );
                if (expected > 0) {
                    assert.deepEqual(next[key].beans, prefix(expected));
                } else {
                    assert.equal(next[key], undefined);
                }
            }
        }
    }
});

test('tapServing does not mutate its input', () => {
    const log = { [key]: { beans: [0] } };
    const snapshot = structuredClone(log);
    tapServing(log, day, { id: 'beans', servings: 3 }, 2);
    assert.deepEqual(log, snapshot);
});

test('tapServing leaves other days and categories alone', () => {
    const other = dayKey(daysBefore(day, 1));
    const log = { [other]: { beans: [0, 1, 2] }, [key]: { greens: [0] } };
    const next = tapServing(log, day, { id: 'beans', servings: 3 }, 1);
    assert.deepEqual(next, {
        [other]: { beans: [0, 1, 2] },
        [key]: { greens: [0], beans: [0, 1] },
    });
});

test('servingsDone ignores indices above a shrunk plan', () => {
    const log = { [key]: { beans: [0, 1, 2] } };
    assert.equal(servingsDone(log, day, { id: 'beans', servings: 2 }), 2);
    assert.deepEqual(
        dayProgress(log, day, [{ id: 'beans', servings: 2 }]),
        { done: 2, total: 2 },
    );
});

test('growing the plan back restores untouched stale indices', () => {
    const log = { [key]: { beans: [0, 1, 2] } };
    assert.equal(servingsDone(log, day, { id: 'beans', servings: 3 }), 3);
});

test('servingsDone counts distinct indices of legacy non-prefix data', () => {
    const category = { id: 'beans', servings: 3 };
    assert.equal(servingsDone({ [key]: { beans: [0, 2] } }, day, category), 2);
    assert.equal(servingsDone({ [key]: { beans: [2, 2, 0] } }, day, category), 2);
});

test('tapping legacy non-prefix data rewrites it as a prefix', () => {
    const category = { id: 'beans', servings: 3 };
    const log = { [key]: { beans: [0, 2] } };
    const next = tapServing(log, day, category, 2);
    assert.deepEqual(next[key].beans, [0, 1, 2]);
});

test('servingsDone is 0 for a missing day or category', () => {
    const category = { id: 'beans', servings: 3 };
    assert.equal(servingsDone({}, day, category), 0);
    assert.equal(servingsDone({ [key]: { greens: [0] } }, day, category), 0);
});

test('a write that empties a category removes its key', () => {
    const log = { [key]: { beans: [0], greens: [0] } };
    const next = tapServing(log, day, { id: 'beans', servings: 3 }, 0);
    assert.deepEqual(next[key], { greens: [0] });
});

test('a write that empties the day removes the day key', () => {
    const log = { [key]: { beans: [0] } };
    const next = tapServing(log, day, { id: 'beans', servings: 3 }, 0);
    assert.deepEqual(next, {});
});

test('a write drops leftover empty categories from the day', () => {
    const log = { [key]: { beans: [0], greens: [] } };
    const next = tapServing(log, day, { id: 'beans', servings: 3 }, 0);
    assert.deepEqual(next, {});
});

test('clearDay removes only that day and does not mutate', () => {
    const other = dayKey(daysBefore(day, 1));
    const log = { [key]: { beans: [0] }, [other]: { beans: [0] } };
    const snapshot = structuredClone(log);
    assert.deepEqual(clearDay(log, day), { [other]: { beans: [0] } });
    assert.deepEqual(log, snapshot);
    assert.deepEqual(clearDay({}, day), {});
});

test('dayProgress sums done and total across categories', () => {
    const categories = [
        { id: 'beans', servings: 3 },
        { id: 'greens', servings: 2 },
    ];
    const log = { [key]: { beans: [0, 1], greens: [0, 1], retired: [0] } };
    assert.deepEqual(dayProgress(log, day, categories), { done: 4, total: 5 });
    assert.deepEqual(dayProgress({}, day, categories), { done: 0, total: 5 });
});

test('an emptied legacy day has no servings done', () => {
    const categories = [{ id: 'beans', servings: 3 }];
    assert.equal(dayProgress({ [key]: {} }, day, categories).done, 0);
    assert.equal(dayProgress({ [key]: { beans: [] } }, day, categories).done, 0);
});

test('streak', async (t) => {
    const categories = [{ id: 'beans', servings: 2 }];
    const full = { beans: [0, 1] };
    const partial = { beans: [0] };
    const on = (n) => dayKey(daysBefore(day, n));

    await t.test('is 0 for an empty log', () => {
        assert.equal(streak({}, categories, day), 0);
    });

    await t.test('counts today when today is complete', () => {
        const log = { [on(0)]: full, [on(1)]: full };
        assert.equal(streak(log, categories, day), 2);
    });

    await t.test('skips an incomplete today and counts from yesterday', () => {
        const log = { [on(0)]: partial, [on(1)]: full, [on(2)]: full };
        assert.equal(streak(log, categories, day), 2);
    });

    await t.test('stops at a gap', () => {
        const log = { [on(0)]: full, [on(1)]: full, [on(3)]: full };
        assert.equal(streak(log, categories, day), 2);
    });

    await t.test('stops at an incomplete day', () => {
        const log = { [on(1)]: full, [on(2)]: partial, [on(3)]: full };
        assert.equal(streak(log, categories, day), 1);
    });

    await t.test('counts a long run of complete days', () => {
        const log = {};
        for (let n = 0; n < 40; n++) log[on(n)] = full;
        assert.equal(streak(log, categories, day), 40);
    });

    await t.test('judges past days against the current plan', () => {
        const log = { [on(0)]: { beans: [0, 1, 2] }, [on(1)]: full };
        assert.equal(streak(log, [{ id: 'beans', servings: 3 }], day), 1);
    });

    await t.test('ignores the time of day on today', () => {
        const evening = new Date(day);
        evening.setHours(23, 59);
        const log = { [on(0)]: full, [on(1)]: full };
        assert.equal(streak(log, categories, evening), 2);
    });

    await t.test('is 0 when the plan has no servings', () => {
        const log = { [on(0)]: full };
        assert.equal(streak(log, [], day), 0);
    });
});
