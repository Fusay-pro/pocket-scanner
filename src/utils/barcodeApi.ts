const OFF_CATEGORY_MAP: Record<string, string> = {
  'en:beverages':        'Drinks',
  'en:drinks':           'Drinks',
  'en:dairy':            'Dairy',
  'en:milk':             'Dairy',
  'en:cheeses':          'Dairy',
  'en:meats':            'Meat',
  'en:fresh-meats':      'Meat',
  'en:seafood':          'Seafood',
  'en:fish':             'Seafood',
  'en:fruits':           'Produce',
  'en:vegetables':       'Produce',
  'en:fresh-vegetables': 'Produce',
  'en:frozen-foods':     'Frozen',
  'en:snacks':           'Snacks',
  'en:biscuits-and-cakes': 'Snacks',
  'en:confectioneries':  'Snacks',
  'en:cereals':          'Dry Goods',
  'en:pasta':            'Dry Goods',
  'en:rice':             'Dry Goods',
  'en:breads':           'Bakery',
  'en:condiments':       'Condiments',
  'en:sauces':           'Condiments',
  'en:cleaning-products':'Household',
  'en:personal-care':    'Personal Care',
};

// barcode.monster keyword → app category
const MONSTER_KEYWORD_MAP: [string, string][] = [
  ['tea', 'Drinks'], ['coffee', 'Drinks'], ['juice', 'Drinks'],
  ['water', 'Drinks'], ['drink', 'Drinks'], ['soda', 'Drinks'],
  ['milk', 'Dairy'], ['cheese', 'Dairy'], ['yogurt', 'Dairy'],
  ['butter', 'Dairy'],
  ['chicken', 'Meat'], ['beef', 'Meat'], ['pork', 'Meat'],
  ['fish', 'Seafood'], ['shrimp', 'Seafood'], ['tuna', 'Seafood'],
  ['rice', 'Dry Goods'], ['pasta', 'Dry Goods'], ['noodle', 'Dry Goods'],
  ['cereal', 'Dry Goods'], ['flour', 'Dry Goods'],
  ['bread', 'Bakery'], ['cake', 'Bakery'], ['cookie', 'Snacks'],
  ['chip', 'Snacks'], ['snack', 'Snacks'], ['candy', 'Snacks'],
  ['chocolate', 'Snacks'], ['biscuit', 'Snacks'],
  ['sauce', 'Condiments'], ['ketchup', 'Condiments'],
  ['detergent', 'Household'], ['cleaning', 'Household'],
  ['shampoo', 'Personal Care'], ['soap', 'Personal Care'],
];

function mapOffCategory(tags: string[] | undefined): string {
  if (!tags) return 'Other';
  for (const tag of tags) {
    const mapped = OFF_CATEGORY_MAP[tag];
    if (mapped) return mapped;
  }
  return 'Other';
}

function guessCategory(name: string): string {
  const lower = name.toLowerCase();
  for (const [kw, cat] of MONSTER_KEYWORD_MAP) {
    if (lower.includes(kw)) return cat;
  }
  return 'Other';
}

export interface BarcodeLookup {
  name: string;
  category: string;
  imageUrl: string | null;
}

function pickOffImage(p: Record<string, unknown>): string | null {
  const candidates = [
    p.image_front_small_url, p.image_small_url,
    p.image_front_thumb_url, p.image_thumb_url,
    p.image_front_url, p.image_url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

async function lookupOpenFoodFacts(code: string): Promise<BarcodeLookup | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json.status !== 1 || !json.product) return null;
    const p = json.product;
    const name: string = p.product_name_en?.trim() || p.product_name?.trim() || '';
    if (!name) return null;
    return { name, category: mapOffCategory(p.categories_tags), imageUrl: pickOffImage(p) };
  } catch {
    return null;
  }
}

async function lookupBarcodeMonster(code: string): Promise<BarcodeLookup | null> {
  try {
    const res = await fetch(`https://barcode.monster/${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const name: string = json.itemname?.trim() || '';
    if (!name) return null;
    return { name, category: guessCategory(name), imageUrl: null };
  } catch {
    return null;
  }
}

export async function lookupBarcode(
  code: string
): Promise<BarcodeLookup | null> {
  // 1. Check local/Supabase cache first — fastest path (cache stores name + category only)
  const { getCachedBarcode, setCachedBarcode } = await import('./storage');
  const cached = await getCachedBarcode(code);
  if (cached) return { ...cached, imageUrl: null };

  // 2. Query both APIs in parallel
  const [off, monster] = await Promise.allSettled([
    lookupOpenFoodFacts(code),
    lookupBarcodeMonster(code),
  ]);
  const result =
    (off.status === 'fulfilled' ? off.value : null) ??
    (monster.status === 'fulfilled' ? monster.value : null);

  // 3. Cache the result for next time
  if (result) {
    setCachedBarcode(code, result.name, result.category).catch(() => {});
  }

  return result;
}
