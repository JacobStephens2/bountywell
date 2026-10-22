// Category definitions

// Master list of all possible categories
export function getAllCategories() {
    return [
        { id: 'beans', name: 'Beans', icon: '🫘', description: '½ c. cooked beans, ¼\u00a0c.\u00a0hummus', examples: ['Black beans', 'Chickpeas', 'Lentils', 'Hummus', 'Edamame'] },
        { id: 'protein', name: 'Protein', icon: '🥩', description: '3 oz lean meat, 1 egg, ½\u00a0c.\u00a0beans', examples: ['Chicken breast', 'Fish', 'Eggs', 'Lean beef', 'Tofu'] },
        { id: 'berries', name: 'Berries', icon: '🫐', description: '½ c. fresh or frozen, ¼ c. dried', examples: ['Blueberries', 'Strawberries', 'Raspberries', 'Blackberries', 'Cranberries'] },
        { id: 'other-fruits', name: 'Other Fruits', icon: '🍎', description: '1 medium fruit, ¼\u00a0c.\u00a0dried\u00a0fruit', examples: ['Apples', 'Bananas', 'Oranges', 'Grapes', 'Pineapple'] },
        { id: 'greens', name: 'Greens', icon: '🥬', description: '1 c. raw, ½ c. cooked', examples: ['Spinach', 'Kale', 'Arugula', 'Swiss chard', 'Collard greens'] },
        { id: 'cruciferous', name: 'Cruciferous Vegetables', icon: '🥦', description: '½ c. chopped, 1\u00a0tbsp\u00a0horseradish', examples: ['Broccoli', 'Cauliflower', 'Brussels sprouts', 'Cabbage', 'Kale'] },
        { id: 'other-vegetables', name: 'Other Vegetables', icon: '🥕', description: '½ c. nonleafy vegetables', examples: ['Carrots', 'Bell peppers', 'Tomatoes', 'Cucumber', 'Zucchini'] },
        { id: 'flaxseed', name: 'Flaxseed', icon: '🌾', description: '1 tbsp ground', examples: ['Ground flaxseed', 'Flaxseed oil'] },
        { id: 'nuts-seeds', name: 'Nuts and Seeds', icon: '🥜', description: '¼ c. nuts, 2 tbsp nut butter', examples: ['Almonds', 'Walnuts', 'Chia seeds', 'Pumpkin seeds', 'Peanut butter'] },
        { id: 'herbs-spices', name: 'Herbs and Spices', icon: '🌿', description: '¼ tsp turmeric', examples: ['Turmeric', 'Cinnamon', 'Ginger', 'Garlic', 'Basil'] },
        { id: 'whole-grains', name: 'Whole Grains', icon: '🌾', description: '½ c. hot cereal, 1 slice of bread', examples: ['Oatmeal', 'Brown rice', 'Quinoa', 'Whole wheat bread', 'Barley'] },
        { id: 'beverages', name: 'Beverages', icon: '💧', description: '60\u00a0oz\u00a0per\u00a0day', examples: ['Water', 'Green tea', 'Hibiscus tea', 'Herbal tea'] },
        { id: 'exercise', name: 'Exercise', icon: '🏃', description: '90 min. moderate or 40 min. vigorous', examples: ['Walking', 'Running', 'Cycling', 'Swimming', 'Yoga'] },
    ];
}

// Map category IDs to NutritionFacts.org link URLs. Used with the written
// permission of Dr. Michael Greger, granted 2026-08-07.
const CATEGORY_LINKS = {
    'beans': { url: 'https://nutritionfacts.org/topics/beans/', label: null },
    'berries': { url: 'https://nutritionfacts.org/topics/berries/', label: null },
    'other-fruits': { url: 'https://nutritionfacts.org/topics/fruit/', label: null },
    'greens': { url: 'https://nutritionfacts.org/topics/greens/', label: null },
    'cruciferous': { url: 'https://nutritionfacts.org/topics/cruciferous-vegetables/', label: null },
    'other-vegetables': { url: 'https://nutritionfacts.org/topics/vegetables/', label: null },
    'flaxseed': { url: 'https://nutritionfacts.org/topics/flax-seeds/', label: null },
    'whole-grains': { url: 'https://nutritionfacts.org/topics/grains/', label: null },
    'beverages': { url: 'https://nutritionfacts.org/topics/beverages/', label: null },
    'exercise': { url: 'https://nutritionfacts.org/topics/exercise/', label: null },
    'protein': { url: 'https://nutritionfacts.org/topics/protein/', label: null },
    'nuts-seeds': {
        parts: [
            { url: 'https://nutritionfacts.org/topics/nuts/', label: 'Nuts' },
            { url: 'https://nutritionfacts.org/topics/seeds/', label: 'Seeds' }
        ]
    },
    'herbs-spices': {
        parts: [
            { url: 'https://nutritionfacts.org/topics/herbs/', label: 'Herbs' },
            { url: 'https://nutritionfacts.org/topics/spices/', label: 'Spices' }
        ]
    }
};

export function getCategoryNameHtml(category) {
    const linkInfo = CATEGORY_LINKS[category.id];
    if (!linkInfo) return category.name;

    if (linkInfo.parts) {
        return linkInfo.parts
            .map(p => `<a href="${p.url}" target="_blank" rel="noopener noreferrer">${p.label}</a>`)
            .join(' and ');
    }

    return `<a href="${linkInfo.url}" target="_blank" rel="noopener noreferrer">${category.name}</a>`;
}
