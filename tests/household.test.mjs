import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../js/storage.js';
import { snapshot, apply, commit } from '../js/household.js';

// Methods live on the prototype so Object.keys(localStorage) is the stored
// keys, which is what deleteProfileData scans for celebration flags.
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

const DAY = 'Sun Oct 04 2026';
const ADA_LOG = { [DAY]: { beans: [0] } };
const ADA_PLAN = { beans: 2 };

function installStorage() {
    globalThis.localStorage = createMemoryStorage();
}

function dumpStorage() {
    const dump = {};
    for (const key of Object.keys(localStorage).sort()) {
        dump[key] = localStorage.getItem(key);
    }
    return dump;
}

function seedHousehold() {
    storage.saveProfiles({
        ada: { name: 'Ada', color: '#38672a', emoji: '🫘' },
        bo: { name: 'Bo', color: '#7c5724' },
    });
    storage.saveDietType('ada', 'vegan');
    storage.saveCustomServings('ada', ADA_PLAN);
    storage.saveData('ada', ADA_LOG);
    storage.saveCurrentProfile('ada');
}

function adaAndBo() {
    return {
        ada: {
            name: 'Ada',
            color: '#38672a',
            emoji: '🫘',
            dietType: 'vegan',
            customServings: { beans: 2 },
            data: { [DAY]: { beans: [0] } },
        },
        bo: {
            name: 'Bo',
            color: '#7c5724',
            emoji: '👤',
            dietType: 'standard',
            customServings: null,
            data: {},
        },
    };
}

beforeEach(() => {
    installStorage();
});

test('snapshot emits a Plan, a null Plan, and an emoji', () => {
    seedHousehold();

    assert.deepEqual(snapshot(), { profiles: adaAndBo() });
});

test('snapshot fills a missing name and color with the default person', () => {
    storage.saveProfiles({ ada: { emoji: '🫘' } });

    const person = snapshot().profiles.ada;
    assert.equal(person.name, 'You');
    assert.equal(person.color, '#38672a');
    assert.equal(person.emoji, '🫘');
    assert.equal(person.customServings, null);
    assert.deepEqual(person.data, {});
});

test('a round trip through apply and commit keeps the Plan and emoji', () => {
    seedHousehold();
    const before = snapshot();
    const stored = dumpStorage();

    const result = apply(before);
    assert.equal(result.applied, true);
    assert.deepEqual(dumpStorage(), stored);

    commit(result);
    assert.deepEqual(snapshot(), before);
    assert.equal(storage.loadCurrentProfile(), 'ada');
});

test('an old record with no emoji and no customServings keeps both', () => {
    seedHousehold();
    const stored = dumpStorage();

    const result = apply({
        profiles: {
            ada: {
                name: 'Ada',
                color: '#38672a',
                dietType: 'vegan',
                data: { [DAY]: { beans: [0] } },
            },
            bo: {
                name: 'Bo',
                color: '#7c5724',
                dietType: 'standard',
                data: {},
            },
        },
    });
    assert.equal(result.applied, true);
    assert.deepEqual(dumpStorage(), stored);

    commit(result);
    const profiles = snapshot().profiles;
    assert.equal(profiles.ada.emoji, '🫘');
    assert.deepEqual(profiles.ada.customServings, { beans: 2 });
    assert.equal(profiles.bo.emoji, '👤');
    assert.equal(profiles.bo.customServings, null);
});

test('null customServings clears the Plan and leaves the Day log', () => {
    seedHousehold();
    storage.saveCurrentProfile('ada');
    localStorage.setItem(storage.getCelebrationKey('ada', DAY), '1');

    const result = apply({
        profiles: {
            ada: {
                name: 'Ada',
                color: '#38672a',
                emoji: '🫘',
                dietType: 'vegan',
                customServings: null,
                data: { [DAY]: { beans: [0] } },
            },
            bo: {
                name: 'Bo',
                color: '#7c5724',
                emoji: '👤',
                dietType: 'standard',
                customServings: null,
                data: {},
            },
        },
    });
    assert.equal(result.applied, true);
    commit(result);

    const ada = snapshot().profiles.ada;
    assert.equal(ada.customServings, null);
    assert.deepEqual(ada.data, { [DAY]: { beans: [0] } });
    assert.equal(ada.dietType, 'vegan');
    assert.equal(localStorage.getItem(storage.getCelebrationKey('ada', DAY)), '1');
});

test('a present Plan and emoji replace what was stored', () => {
    seedHousehold();

    const result = apply({
        profiles: {
            ada: {
                name: 'Ada',
                color: '#38672a',
                emoji: '🦊',
                dietType: 'modified',
                customServings: { beans: 9 },
                data: { [DAY]: { beans: [0] } },
            },
            bo: adaAndBo().bo,
        },
    });
    assert.equal(result.applied, true);
    commit(result);

    const ada = snapshot().profiles.ada;
    assert.equal(ada.emoji, '🦊');
    assert.equal(ada.dietType, 'modified');
    assert.deepEqual(ada.customServings, { beans: 9 });
    assert.deepEqual(ada.data, { [DAY]: { beans: [0] } });
});

test('an absent diet type keeps the stored seed and does not become a Plan', () => {
    seedHousehold();
    const record = structuredClone(snapshot());
    delete record.profiles.ada.dietType;
    delete record.profiles.ada.customServings;

    commit(apply(record));

    const ada = snapshot().profiles.ada;
    assert.equal(ada.dietType, 'vegan');
    assert.deepEqual(ada.customServings, { beans: 2 });
});

test('a new person with no emoji, Plan, or diet type gets the defaults', () => {
    seedHousehold();
    const record = structuredClone(snapshot());
    record.profiles.cy = { name: 'Cy', color: '#3a5f7d' };

    commit(apply(record));

    assert.deepEqual(snapshot().profiles.cy, {
        name: 'Cy',
        color: '#3a5f7d',
        emoji: '👤',
        dietType: 'standard',
        customServings: null,
        data: {},
    });
    assert.deepEqual(snapshot().profiles.ada.customServings, { beans: 2 });
    assert.equal(snapshot().profiles.ada.emoji, '🫘');
});

test('an absent Day log becomes empty', () => {
    seedHousehold();
    const record = structuredClone(snapshot());
    delete record.profiles.ada.data;

    commit(apply(record));

    const ada = snapshot().profiles.ada;
    assert.deepEqual(ada.data, {});
    assert.deepEqual(ada.customServings, { beans: 2 });
});

test('a present Day log is stored as given', () => {
    seedHousehold();
    const given = { 'Not A Day': { beans: [9, 9, 9] }, leftover: true };
    const record = structuredClone(snapshot());
    record.profiles.ada.data = given;

    commit(apply(record));

    assert.deepEqual(snapshot().profiles.ada.data, given);
});

test('a record that drops a person removes that person and a celebration flag', () => {
    seedHousehold();
    storage.saveCustomServings('bo', { greens: 4 });
    storage.saveProfiles({
        ada: { name: 'Ada', color: '#38672a', emoji: '🫘' },
        bo: { name: 'Bo', color: '#7c5724', emoji: '🦊' },
    });
    localStorage.setItem(storage.getCelebrationKey('ada', DAY), '1');
    localStorage.setItem(storage.getCelebrationKey('bo', DAY), '1');

    const result = apply({
        profiles: {
            bo: {
                name: 'Bo',
                color: '#7c5724',
                emoji: '🦊',
                dietType: 'standard',
                customServings: { greens: 4 },
                data: {},
            },
        },
    });
    assert.equal(result.applied, true);
    commit(result);

    assert.equal(snapshot().profiles.ada, undefined);
    assert.equal(storage.loadDietType('ada'), 'standard');
    assert.equal(storage.loadCustomServings('ada'), null);
    assert.deepEqual(storage.loadData('ada'), {});
    assert.equal(localStorage.getItem(storage.getCelebrationKey('ada', DAY)), null);
    assert.equal(localStorage.getItem(storage.getCelebrationKey('bo', DAY)), '1');
    assert.deepEqual(snapshot().profiles.bo.customServings, { greens: 4 });
});

test('a removed selected person becomes the first remaining id', () => {
    seedHousehold();
    storage.saveCurrentProfile('ada');

    commit(apply({
        profiles: {
            bo: {
                name: 'Bo',
                color: '#7c5724',
                emoji: '🦊',
                dietType: 'standard',
                customServings: null,
                data: {},
            },
            cy: {
                name: 'Cy',
                color: '#3a5f7d',
                emoji: '🌿',
                dietType: 'standard',
                customServings: null,
                data: {},
            },
        },
    }));

    assert.equal(storage.loadCurrentProfile(), 'bo');
    assert.equal(snapshot().profiles.user, undefined);
});

test('a selected person who remains stays selected', () => {
    seedHousehold();
    storage.saveCurrentProfile('ada');
    const record = structuredClone(snapshot());
    const profiles = {
        bo: record.profiles.bo,
        ada: record.profiles.ada,
    };

    commit(apply({ profiles }));

    assert.equal(storage.loadCurrentProfile(), 'ada');
});

test('exportDate does not change anyone', () => {
    seedHousehold();
    const before = snapshot();
    const record = structuredClone(before);
    record.exportDate = '2019-05-05T00:00:00.000Z';
    record.extra = true;
    record.profiles.ada.futureField = 'nope';

    const result = apply(record);
    assert.equal(result.applied, true);
    assert.deepEqual(record.profiles.ada.futureField, 'nope');
    commit(result);

    assert.deepEqual(snapshot(), before);
    assert.equal(storage.loadProfiles().ada.futureField, undefined);
    assert.equal(storage.loadCurrentProfile(), 'ada');
});

test('empty, missing, and invalid records are refused and leave storage unchanged', () => {
    seedHousehold();
    localStorage.setItem(storage.getCelebrationKey('ada', DAY), '1');
    const stored = dumpStorage();

    const person = { name: 'Ada', color: '#38672a' };
    const cases = [
        ['missing record', undefined],
        ['null record', null],
        ['array record', []],
        ['string record', 'profiles'],
        ['missing profiles', {}],
        ['null profiles', { profiles: null }],
        ['array profiles', { profiles: [] }],
        ['string profiles', { profiles: 'ada' }],
        ['empty profiles', { profiles: {} }],
        ['person is null', { profiles: { ada: null } }],
        ['person is an array', { profiles: { ada: [] } }],
        ['missing name', { profiles: { ada: { color: '#38672a' } } }],
        ['empty name', { profiles: { ada: { name: '', color: '#38672a' } } }],
        ['numeric name', { profiles: { ada: { name: 1, color: '#38672a' } } }],
        ['missing color', { profiles: { ada: { name: 'Ada' } } }],
        ['empty color', { profiles: { ada: { name: 'Ada', color: '' } } }],
        ['empty emoji', { profiles: { ada: { ...person, emoji: '' } } }],
        ['numeric emoji', { profiles: { ada: { ...person, emoji: 3 } } }],
        ['empty dietType', { profiles: { ada: { ...person, dietType: '' } } }],
        ['numeric dietType', { profiles: { ada: { ...person, dietType: 1 } } }],
        ['array plan', { profiles: { ada: { ...person, customServings: [] } } }],
        ['string plan', { profiles: { ada: { ...person, customServings: 'beans' } } }],
        ['array day log', { profiles: { ada: { ...person, data: [] } } }],
        ['null day log', { profiles: { ada: { ...person, data: null } } }],
        ['one invalid person', {
            profiles: {
                ada: {
                    name: 'Ada',
                    color: '#38672a',
                    emoji: '🫘',
                    dietType: 'vegan',
                    customServings: { beans: 2 },
                    data: { [DAY]: { beans: [0] } },
                },
                bo: { name: 'Bo', color: '#7c5724', customServings: [] },
            },
        }],
    ];

    for (const [label, record] of cases) {
        const result = apply(record);
        assert.deepEqual(result, { applied: false }, label);
        commit(result);
        assert.deepEqual(dumpStorage(), stored, label);
    }
});
