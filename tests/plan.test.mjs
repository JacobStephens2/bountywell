import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Methods live on the prototype so Object.keys(localStorage) is the stored
// keys, the same stand-in the Household tests use.
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

globalThis.localStorage = createMemoryStorage();

const storage = await import('../js/storage.js');
const { resolve, presets } = await import('../js/plan.js');

const STANDARD = {
    beans: 3,
    protein: 0,
    berries: 1,
    'other-fruits': 3,
    greens: 2,
    cruciferous: 1,
    'other-vegetables': 2,
    flaxseed: 1,
    'nuts-seeds': 1,
    'herbs-spices': 1,
    'whole-grains': 3,
    beverages: 5,
    exercise: 1,
};

const MODIFIED = {
    beans: 0,
    protein: 2,
    berries: 1,
    'other-fruits': 3,
    greens: 2,
    cruciferous: 1,
    'other-vegetables': 2,
    flaxseed: 0,
    'nuts-seeds': 1,
    'herbs-spices': 1,
    'whole-grains': 3,
    beverages: 5,
    exercise: 1,
};

const ONE_BEAN = {
    beans: 1,
    protein: 1,
    berries: 1,
    'other-fruits': 3,
    greens: 2,
    cruciferous: 1,
    'other-vegetables': 2,
    flaxseed: 0,
    'nuts-seeds': 1,
    'herbs-spices': 1,
    'whole-grains': 3,
    beverages: 5,
    exercise: 1,
};

const ONE_BEAN_TWO_PROTEIN = {
    beans: 1,
    protein: 2,
    berries: 1,
    'other-fruits': 3,
    greens: 2,
    cruciferous: 1,
    'other-vegetables': 2,
    flaxseed: 0,
    'nuts-seeds': 1,
    'herbs-spices': 1,
    'whole-grains': 3,
    beverages: 5,
    exercise: 1,
};

const ONE_BEAN_TWO_PROTEIN_ONE_FLAX = {
    beans: 1,
    protein: 2,
    berries: 1,
    'other-fruits': 3,
    greens: 2,
    cruciferous: 1,
    'other-vegetables': 2,
    flaxseed: 1,
    'nuts-seeds': 1,
    'herbs-spices': 1,
    'whole-grains': 3,
    beverages: 5,
    exercise: 1,
};

function dumpStorage() {
    const dump = {};
    for (const key of Object.keys(localStorage).sort()) {
        dump[key] = localStorage.getItem(key);
    }
    return dump;
}

beforeEach(() => {
    globalThis.localStorage = createMemoryStorage();
});

test('a stored map wins, including a partial map and a count of 12', () => {
    storage.saveDietType('ada', 'modified');
    storage.saveCustomServings('ada', { berries: 12, beans: 0 });

    const result = resolve('ada');

    assert.deepEqual(result.servings, { berries: 12, beans: 0 });
    assert.deepEqual(
        result.categories.map(cat => ({ id: cat.id, servings: cat.servings })),
        [{ id: 'berries', servings: 12 }],
    );
    assert.equal(storage.loadDietType('ada'), 'modified');
});

test('a stored null seeds from the diet type and does not write', () => {
    storage.saveDietType('ada', 'modified');
    storage.saveCustomServings('ada', null);
    const before = dumpStorage();

    const result = resolve('ada');

    assert.deepEqual(result.servings, MODIFIED);
    assert.deepEqual(dumpStorage(), before);
    assert.equal(storage.loadCustomServings('ada'), null);
});

test('a missing map seeds from the diet type and does not write', () => {
    storage.saveDietType('ada', 'modified');
    const before = dumpStorage();

    const result = resolve('ada');

    assert.deepEqual(result.servings, MODIFIED);
    assert.deepEqual(dumpStorage(), before);
    assert.equal(localStorage.getItem('dailyDozenCustomServings_ada'), null);
});

test('an empty map does not seed', () => {
    storage.saveDietType('ada', 'modified');
    storage.saveCustomServings('ada', {});
    const before = dumpStorage();

    const result = resolve('ada');

    assert.deepEqual(result.servings, {});
    assert.deepEqual(result.categories, []);
    assert.deepEqual(dumpStorage(), before);
});

test('an unknown seed such as vegan uses standard', () => {
    storage.saveDietType('ada', 'vegan');
    const before = dumpStorage();

    const result = resolve('ada');

    assert.deepEqual(result.servings, STANDARD);
    assert.deepEqual(dumpStorage(), before);
    assert.equal(storage.loadDietType('ada'), 'vegan');
});

test('a known seed such as modified uses that preset', () => {
    storage.saveDietType('ada', 'modified');

    const result = resolve('ada');

    assert.deepEqual(result.servings, MODIFIED);
    assert.deepEqual(
        result.categories.map(cat => ({ id: cat.id, servings: cat.servings })),
        [
            { id: 'protein', servings: 2 },
            { id: 'berries', servings: 1 },
            { id: 'other-fruits', servings: 3 },
            { id: 'greens', servings: 2 },
            { id: 'cruciferous', servings: 1 },
            { id: 'other-vegetables', servings: 2 },
            { id: 'nuts-seeds', servings: 1 },
            { id: 'herbs-spices', servings: 1 },
            { id: 'whole-grains', servings: 3 },
            { id: 'beverages', servings: 5 },
            { id: 'exercise', servings: 1 },
        ],
    );
});

test('a missing diet type uses standard', () => {
    const before = dumpStorage();

    const result = resolve('ada');

    assert.deepEqual(result.servings, STANDARD);
    assert.deepEqual(dumpStorage(), before);
    assert.equal(localStorage.getItem('dailyDozenDietType_ada'), null);
    assert.equal(localStorage.getItem('dailyDozenCustomServings_ada'), null);
});

test('Categories come back in catalog order with zeros omitted', () => {
    storage.saveCustomServings('ada', { exercise: 2, beans: 0, greens: 12, berries: 1 });

    const result = resolve('ada');

    assert.deepEqual(result.servings, { exercise: 2, beans: 0, greens: 12, berries: 1 });
    assert.deepEqual(
        result.categories.map(cat => ({ id: cat.id, name: cat.name, servings: cat.servings })),
        [
            { id: 'berries', name: 'Berries', servings: 1 },
            { id: 'greens', name: 'Greens', servings: 12 },
            { id: 'exercise', name: 'Exercise', servings: 2 },
        ],
    );
});

test('a mutated returned map does not change the next resolve or presets', () => {
    storage.saveCustomServings('ada', { beans: 12 });
    const stored = resolve('ada');
    stored.servings.beans = 1;

    storage.saveDietType('bo', 'modified');
    const seeded = resolve('bo');
    seeded.servings.protein = 9;
    seeded.servings.beans = 4;

    const listed = presets();
    listed.find(preset => preset.id === 'standard').servings.beans = 8;
    listed.find(preset => preset.id === 'modified').servings.protein = 7;

    assert.deepEqual(resolve('ada').servings, { beans: 12 });
    assert.equal(resolve('bo').servings.protein, 2);
    assert.equal(resolve('bo').servings.beans, 0);
    assert.equal(presets().find(preset => preset.id === 'standard').servings.beans, 3);
    assert.equal(presets().find(preset => preset.id === 'modified').servings.protein, 2);
});

test('presets lists the five ids in table order', () => {
    const before = dumpStorage();

    assert.deepEqual(presets(), [
        { id: 'standard', name: 'Daily Dozen–inspired', servings: STANDARD },
        { id: 'modified', name: 'Modified', servings: MODIFIED },
        { id: 'one-bean', name: 'One Bean', servings: ONE_BEAN },
        { id: 'one-bean-two-protein', name: 'One Bean + Two Protein', servings: ONE_BEAN_TWO_PROTEIN },
        { id: 'one-bean-two-protein-one-flax', name: 'One Bean + Two Protein + Flax', servings: ONE_BEAN_TWO_PROTEIN_ONE_FLAX },
    ]);
    assert.deepEqual(dumpStorage(), before);
});
