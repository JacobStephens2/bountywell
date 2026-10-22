// One Person's Plan. A stored servings map wins. A missing map or a stored
// null seeds from the diet-type preset and does not write either key.

import * as storage from './storage.js';
import { getAllCategories } from './categories.js';

const PRESETS = {
    standard: {
        name: 'Daily Dozen–inspired',
        servings: { beans: 3, protein: 0, berries: 1, 'other-fruits': 3, greens: 2, cruciferous: 1, 'other-vegetables': 2, flaxseed: 1, 'nuts-seeds': 1, 'herbs-spices': 1, 'whole-grains': 3, beverages: 5, exercise: 1 },
    },
    modified: {
        name: 'Modified',
        servings: { beans: 0, protein: 2, berries: 1, 'other-fruits': 3, greens: 2, cruciferous: 1, 'other-vegetables': 2, flaxseed: 0, 'nuts-seeds': 1, 'herbs-spices': 1, 'whole-grains': 3, beverages: 5, exercise: 1 },
    },
    'one-bean': {
        name: 'One Bean',
        servings: { beans: 1, protein: 1, berries: 1, 'other-fruits': 3, greens: 2, cruciferous: 1, 'other-vegetables': 2, flaxseed: 0, 'nuts-seeds': 1, 'herbs-spices': 1, 'whole-grains': 3, beverages: 5, exercise: 1 },
    },
    'one-bean-two-protein': {
        name: 'One Bean + Two Protein',
        servings: { beans: 1, protein: 2, berries: 1, 'other-fruits': 3, greens: 2, cruciferous: 1, 'other-vegetables': 2, flaxseed: 0, 'nuts-seeds': 1, 'herbs-spices': 1, 'whole-grains': 3, beverages: 5, exercise: 1 },
    },
    'one-bean-two-protein-one-flax': {
        name: 'One Bean + Two Protein + Flax',
        servings: { beans: 1, protein: 2, berries: 1, 'other-fruits': 3, greens: 2, cruciferous: 1, 'other-vegetables': 2, flaxseed: 1, 'nuts-seeds': 1, 'herbs-spices': 1, 'whole-grains': 3, beverages: 5, exercise: 1 },
    },
};

function activeCategories(servings) {
    return getAllCategories()
        .filter(cat => (servings[cat.id] || 0) > 0)
        .map(cat => ({ ...cat, servings: servings[cat.id] }));
}

function seedServings(personId) {
    const dietType = storage.loadDietType(personId);
    const preset = PRESETS[dietType] || PRESETS.standard;
    return { ...preset.servings };
}

export function resolve(personId) {
    const stored = storage.loadCustomServings(personId);
    const servings = stored ? { ...stored } : seedServings(personId);
    return { servings, categories: activeCategories(servings) };
}

export function presets() {
    return Object.entries(PRESETS).map(([id, preset]) => ({
        id,
        name: preset.name,
        servings: { ...preset.servings },
    }));
}
