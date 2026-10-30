/**
 * Export this cook, with update 2 (0.3.0): the meal type, the ingredients,
 * the ratings (N/A and guests) and the next-time lines, through the real
 * export service to the share sheet. Made-up people.
 */

import { cleanup } from '@testing-library/react-native';

import type { EvidenceDecision } from '../src/domain/evidence';
import { openScreenHarness, type ScreenHarness } from './support/screens';

let harness: ScreenHarness;

function granted<T>(decision: EvidenceDecision<T>): T {
  if (!decision.allowed) {
    throw new Error(`refused: ${decision.code}`);
  }
  return decision.record;
}

async function startCook(id: string, title: string): Promise<void> {
  const { data, now } = harness.storage;
  granted(await data.capture.startCook({ id, title, startedAt: now() }, 'user', now()));
}

async function household(...names: string[]): Promise<void> {
  for (const name of names) {
    granted(await harness.storage.data.householdWorkflow.add(name, { id: `m-${name.toLowerCase()}` }, harness.tick()));
  }
}

beforeEach(async () => {
  harness = await openScreenHarness();
});

afterEach(async () => {
  await cleanup();
  await harness.close();
});

describe('Export this cook, with update 2', () => {
  it('adds the meal type, the ingredients, the ratings with N/A and guests, and next time', async () => {
    await household('Alex', 'Sam');
    await startCook('cook-1', 'Fish pie');
    const { data, exporter } = harness.storage;
    granted(await data.cookRecord.setMealType('cook-1', 'lunch_dinner', 'user', harness.tick()));
    granted(await data.cookRecord.saveIngredients('cook-1', 'haddock\nprawns', { id: 'ing-1' }, 'user', harness.tick()));
    granted(await data.cookRecord.saveIngredients('cook-1', 'haddock\nprawns\nleeks', { id: 'ing-2' }, 'user', harness.tick()));
    granted(await data.capture.saveReview('cook-1', 'Good.', 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-1', { memberId: 'm-alex' }, { stars: 4, notEaten: false, line: 'Creamy.' }, { id: 'r1' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-1', { memberId: 'm-sam' }, { stars: null, notEaten: true, line: null }, { id: 'r2' }, 'user', harness.tick()));
    granted(await data.cookRecord.rate('cook-1', { guestName: 'Jo' }, { stars: 5, notEaten: false, line: null }, { id: 'r3' }, 'user', harness.tick()));
    granted(await data.cookRecord.addNextTime('cook-1', 'More leeks.', { id: 'lesson-1' }, 'user', harness.tick()));
    granted(await data.cookRecord.reviseNextTime('lesson-1', 'Twice the leeks.', { id: 'lr-1' }, 'user', harness.tick()));

    const outcome = await exporter.exportCook('cook-1');
    expect(outcome.ok).toBe(true);
    const text = harness.sink.shared[0]?.text ?? '';
    expect(text).toContain('Meal: Lunch/Dinner');
    expect(text).toContain('Ingredients (edited)\nhaddock\nprawns\nleeks\n');
    expect(text).toContain('Who ate it\n- Alex: 4 stars — “Creamy.”\n- Sam: N/A (didn’t eat it)\n- Jo (guest): 5 stars\n');
    expect(text).toContain('Next time\n- Twice the leeks. (edited)\n');
    expect(text).toContain('Your notes\nGood.\n');
  });
});
