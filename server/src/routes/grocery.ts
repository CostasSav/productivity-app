import { Router } from 'express';
import { db } from '../db/database';
import { GROCERY_CATEGORIES } from '../types';
import type { GroceryCategory } from '../types';
import { anthropic } from '../ai/client';

const router = Router();

const VALID_CATEGORIES = new Set<string>(GROCERY_CATEGORIES);

async function inferCategory(name: string): Promise<GroceryCategory> {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: `Given this grocery item name, return only the category it belongs to from this list: Produce, Meat & Fish, Dairy & Eggs, Bakery, Frozen, Pantry, Drinks, Snacks, Cleaning, Personal Care, Other. Item: ${name}. Reply with only the category name, nothing else.`,
      }],
    });
    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    if (VALID_CATEGORIES.has(text)) return text as GroceryCategory;
    return 'Other';
  } catch {
    return 'Other';
  }
}

// ── Grocery items ─────────────────────────────────────────────────────────────

// GET /api/grocery
router.get('/', (_req, res) => {
  res.json(db.getGroceryItems());
});

// DELETE /api/grocery/checked — must be before /:id
router.delete('/checked', (_req, res) => {
  const removed = db.deleteCheckedGroceryItems();
  res.json({ removed });
});

// DELETE /api/grocery/all — must be before /:id
router.delete('/all', (req, res) => {
  if (req.body?.confirm !== true) {
    res.status(400).json({ error: 'Pass { confirm: true } to clear the entire list' });
    return;
  }
  const removed = db.clearGroceryList();
  res.json({ removed });
});

// POST /api/grocery
router.post('/', async (req, res) => {
  const { name, quantity, unit, category, note } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (quantity !== undefined && (typeof quantity !== 'number' || quantity <= 0)) {
    res.status(400).json({ error: 'quantity must be a positive number' });
    return;
  }
  if (category !== undefined && !VALID_CATEGORIES.has(category)) {
    res.status(400).json({ error: `category must be one of: ${GROCERY_CATEGORIES.join(', ')}` });
    return;
  }

  const resolvedCategory: GroceryCategory = category
    ? (category as GroceryCategory)
    : await inferCategory(name.trim());

  const item = db.addGroceryItem({
    name: name.trim(),
    quantity: quantity ?? 1,
    unit: typeof unit === 'string' ? unit : '',
    category: resolvedCategory,
    note: typeof note === 'string' ? note.trim() || null : null,
  });
  res.status(201).json(item);
});

// PATCH /api/grocery/reorder — must be before /:id
router.patch('/reorder', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.every((x: unknown) => Number.isInteger(x))) {
    res.status(400).json({ error: 'ids must be an array of integers' }); return;
  }
  db.reorderGroceryItems(ids as number[]);
  res.status(204).end();
});

// PATCH /api/grocery/:id
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }

  const { name, quantity, unit, checked, note, category } = req.body;
  const fields: Parameters<typeof db.updateGroceryItem>[1] = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'name must be a non-empty string' }); return;
    }
    fields.name = name.trim();
  }
  if (quantity !== undefined) {
    if (typeof quantity !== 'number' || quantity <= 0) {
      res.status(400).json({ error: 'quantity must be a positive number' }); return;
    }
    fields.quantity = quantity;
  }
  if (unit !== undefined) fields.unit = String(unit);
  if (checked !== undefined) fields.checked = Boolean(checked);
  if (note !== undefined) fields.note = note === null ? null : String(note).trim() || null;
  if (category !== undefined) {
    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: `category must be one of: ${GROCERY_CATEGORIES.join(', ')}` }); return;
    }
    fields.category = category as GroceryCategory;
  }

  const updated = db.updateGroceryItem(id, fields);
  if (!updated) { res.status(404).json({ error: 'item not found' }); return; }
  res.json(updated);
});

// DELETE /api/grocery/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  if (!db.deleteGroceryItem(id)) { res.status(404).json({ error: 'item not found' }); return; }
  res.status(204).end();
});

// ── Grocery staples ───────────────────────────────────────────────────────────

// GET /api/grocery/staples — registered on main router via prefix in index.ts
// (staples routes are exported separately and mounted at /api/grocery/staples)

export { router as groceryRouter };

// ── Staples sub-router ────────────────────────────────────────────────────────

const staplesRouter = Router();

// POST /api/grocery/staples/add-to-list — must be before /:id
staplesRouter.post('/add-to-list', (_req, res) => {
  const result = db.addStaplesToList();
  res.json(result);
});

// GET /api/grocery/staples
staplesRouter.get('/', (_req, res) => {
  res.json(db.getGroceryStaples());
});

// POST /api/grocery/staples
staplesRouter.post('/', async (req, res) => {
  const { name, quantity, unit, category } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' }); return;
  }
  if (quantity !== undefined && (typeof quantity !== 'number' || quantity <= 0)) {
    res.status(400).json({ error: 'quantity must be a positive number' }); return;
  }
  if (category !== undefined && !VALID_CATEGORIES.has(category)) {
    res.status(400).json({ error: `category must be one of: ${GROCERY_CATEGORIES.join(', ')}` }); return;
  }

  const resolvedCategory: GroceryCategory = category
    ? (category as GroceryCategory)
    : await inferCategory(name.trim());

  const staple = db.addGroceryStaple({
    name: name.trim(),
    quantity: quantity ?? 1,
    unit: typeof unit === 'string' ? unit : '',
    category: resolvedCategory,
  });
  res.status(201).json(staple);
});

// PATCH /api/grocery/staples/:id
staplesRouter.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }

  const { name, quantity, unit, category } = req.body;
  const fields: Parameters<typeof db.updateGroceryStaple>[1] = {};

  if (name !== undefined) fields.name = String(name).trim();
  if (quantity !== undefined) {
    if (typeof quantity !== 'number' || quantity <= 0) {
      res.status(400).json({ error: 'quantity must be a positive number' }); return;
    }
    fields.quantity = quantity;
  }
  if (unit !== undefined) fields.unit = String(unit);
  if (category !== undefined) {
    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: `category must be one of: ${GROCERY_CATEGORIES.join(', ')}` }); return;
    }
    fields.category = category as GroceryCategory;
  }

  const updated = db.updateGroceryStaple(id, fields);
  if (!updated) { res.status(404).json({ error: 'staple not found' }); return; }
  res.json(updated);
});

// DELETE /api/grocery/staples/:id
staplesRouter.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  if (!db.deleteGroceryStaple(id)) { res.status(404).json({ error: 'staple not found' }); return; }
  res.status(204).end();
});

export { staplesRouter as groceryStaplesRouter };
