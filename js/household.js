// Household: every person on this install, as one record for export, import and sync.
//
// Keys stay name, color, emoji, dietType, customServings and data. emoji and
// customServings were added after the first export, so a missing key keeps the
// stored value. A present null Plan clears only the Plan. exportDate is not
// part of the record; callers add it and apply ignores it.

import * as storage from './storage.js';

const DEFAULT_NAME = 'You';
const DEFAULT_COLOR = '#38672a';
const DEFAULT_EMOJI = '👤';

function isPlainObject(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function refused() {
    return { applied: false };
}

function storedEmoji(profiles, id) {
    const emoji = profiles[id] && profiles[id].emoji;
    return isNonEmptyString(emoji) ? emoji : DEFAULT_EMOJI;
}

export function snapshot() {
    const profiles = storage.loadProfiles();
    const out = {};
    for (const id of Object.keys(profiles)) {
        const person = isPlainObject(profiles[id]) ? profiles[id] : {};
        const plan = storage.loadCustomServings(id);
        out[id] = {
            name: isNonEmptyString(person.name) ? person.name : DEFAULT_NAME,
            color: isNonEmptyString(person.color) ? person.color : DEFAULT_COLOR,
            emoji: isNonEmptyString(person.emoji) ? person.emoji : DEFAULT_EMOJI,
            dietType: storage.loadDietType(id),
            customServings: plan === null ? null : structuredClone(plan),
            data: structuredClone(storage.loadData(id)),
        };
    }
    return { profiles: out };
}

export function apply(record) {
    if (!isPlainObject(record) || !isPlainObject(record.profiles)) return refused();

    const ids = Object.keys(record.profiles);
    if (ids.length === 0) return refused();

    const storedProfiles = storage.loadProfiles();
    const people = {};
    const plans = {};
    const dayLogs = {};

    for (const id of ids) {
        const person = record.profiles[id];
        if (!isPlainObject(person)) return refused();
        if (!isNonEmptyString(person.name) || !isNonEmptyString(person.color)) return refused();

        let emoji;
        if (!hasOwn(person, 'emoji')) {
            emoji = storedEmoji(storedProfiles, id);
        } else if (isNonEmptyString(person.emoji)) {
            emoji = person.emoji;
        } else {
            return refused();
        }

        let dietType;
        if (!hasOwn(person, 'dietType')) {
            dietType = storage.loadDietType(id);
        } else if (isNonEmptyString(person.dietType)) {
            dietType = person.dietType;
        } else {
            return refused();
        }

        let plan;
        if (!hasOwn(person, 'customServings')) {
            plan = storage.loadCustomServings(id);
        } else if (person.customServings === null) {
            plan = null;
        } else if (isPlainObject(person.customServings)) {
            plan = person.customServings;
        } else {
            return refused();
        }

        let dayLog;
        if (!hasOwn(person, 'data')) {
            dayLog = {};
        } else if (isPlainObject(person.data)) {
            dayLog = person.data;
        } else {
            return refused();
        }

        people[id] = { name: person.name, color: person.color, emoji, dietType };
        plans[id] = plan === null ? null : structuredClone(plan);
        dayLogs[id] = structuredClone(dayLog);
    }

    const removedIds = Object.keys(storedProfiles).filter(id => !hasOwn(people, id));
    const storedSelected = storage.loadCurrentProfile();
    const selectedId = hasOwn(people, storedSelected) ? storedSelected : ids[0];

    return { applied: true, people, plans, dayLogs, removedIds, selectedId };
}

export function commit(result) {
    if (!result || result.applied !== true) return;

    const profiles = {};
    for (const id of Object.keys(result.people)) {
        const person = result.people[id];
        storage.saveDietType(id, person.dietType);
        storage.saveCustomServings(id, result.plans[id]);
        storage.saveData(id, result.dayLogs[id]);
        profiles[id] = { name: person.name, color: person.color, emoji: person.emoji };
    }
    storage.saveProfiles(profiles);

    for (const id of result.removedIds) {
        storage.deleteProfileData(id);
    }

    storage.saveCurrentProfile(result.selectedId);
}
