import { screen, userEvent, waitFor } from '@testing-library/react-native';

import {
  AI_NOT_CONNECTED_TITLE,
  CUISINE_HEADING,
  FINISH_REVIEW,
  NEXT_TIME,
  OPTIONAL,
  RAW_EVIDENCE,
  WHAT_WAS_IT,
  WHO_ATE_IT,
  YOUR_NOTES,
} from '../src/content/product';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('review-screen.db');
});

afterEach(async () => {
  await harness.close();
});

async function startCook(id = 'cook-1') {
  const { data, now } = harness.storage;
  const started = await data.capture.startCook({ id, startedAt: now() }, 'user', now());
  if (!started.allowed) {
    throw new Error(started.message);
  }
  return started.record;
}

async function renderReview(cookId: string) {
  const onBack = jest.fn();
  const onFinished = jest.fn();
  await harness.render(<ReviewScreen cookId={cookId} onBack={onBack} onFinished={onFinished} />);
  return { onBack, onFinished };
}

describe('ReviewScreen', () => {
  it('records that the review was opened, once', async () => {
    await startCook();
    await renderReview('cook-1');
    await screen.findByTestId('review-screen');

    await waitFor(async () => {
      const cook = await harness.db.data.cooks.findById('cook-1');
      expect(cook?.reviewOpenedAt).toBe('2026-10-15T08:30:00.000Z');
      expect(cook?.status).toBe('open');
    });
  });

  it('asks, in order, what it was, the cuisine, who ate it, your notes and next time — and nothing more', async () => {
    await startCook();
    const { data, now } = harness.storage;
    await data.capture.addEvent(
      { id: 'e1', cookId: 'cook-1', ts: now(), kind: 'user_note', body: 'Pulled at 54' },
      'user',
    );
    await renderReview('cook-1');
    await screen.findByTestId('review-screen');
    await screen.findByText(WHAT_WAS_IT);

    const headings = screen
      .getAllByRole('header')
      .map((node) => String(node.props.children))
      .filter((text) => [WHAT_WAS_IT, CUISINE_HEADING, WHO_ATE_IT, YOUR_NOTES, NEXT_TIME].includes(text));
    expect(headings).toEqual([WHAT_WAS_IT, CUISINE_HEADING, WHO_ATE_IT, YOUR_NOTES, NEXT_TIME]);
    expect(screen.getByText(OPTIONAL)).toBeOnTheScreen();
    // As drawn (0.4.0): no Suggestions and no raw evidence on the review.
    expect(screen.queryByText(AI_NOT_CONNECTED_TITLE)).toBeNull();
    expect(screen.queryByText(RAW_EVIDENCE)).toBeNull();
    expect(screen.queryByText('Pulled at 54')).toBeNull();
  });

  it('saves the verdict verbatim, marks the cook reviewed, and hands off', async () => {
    await startCook();
    const { onFinished } = await renderReview('cook-1');
    await screen.findByTestId('review-screen');

    await user.type(screen.getByTestId('verdict-input'), '  Great crust!\nApple needed acid.  ');
    harness.tick();
    await user.press(screen.getByRole('button', { name: FINISH_REVIEW }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledWith('cook-1'));
    const cook = await harness.db.data.cooks.findById('cook-1');
    expect(cook).toMatchObject({
      status: 'reviewed',
      verdict: '  Great crust!\nApple needed acid.  ',
      reviewOpenedAt: '2026-10-15T08:30:00.000Z',
      reviewSavedAt: '2026-10-15T08:31:00.000Z',
    });
  });

  it('completes a cook with no verdict at all', async () => {
    await startCook();
    const { onFinished } = await renderReview('cook-1');
    await screen.findByTestId('review-screen');

    await user.press(screen.getByRole('button', { name: FINISH_REVIEW }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledWith('cook-1'));
    const cook = await harness.db.data.cooks.findById('cook-1');
    expect(cook).toMatchObject({ status: 'reviewed', verdict: null });
  });

  it('stores an optional takeaway as an approved, user-authored lesson', async () => {
    await startCook();
    const { onFinished } = await renderReview('cook-1');
    await screen.findByTestId('review-screen');

    await user.type(screen.getByTestId('verdict-input'), 'Fine.');
    await user.type(screen.getByTestId('takeaway-input'), '  Pull 3°C earlier.  ');
    await user.press(screen.getByRole('button', { name: FINISH_REVIEW }));

    await waitFor(() => expect(onFinished).toHaveBeenCalledWith('cook-1'));
    const lessons = await harness.db.data.lessons.list({ cookId: 'cook-1' });
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      text: 'Pull 3°C earlier.',
      status: 'approved',
      provenance: 'live',
    });
    expect(await harness.db.data.findings.list({ cookId: 'cook-1' })).toHaveLength(0);
  });

  it('keeps the verdict on screen and the cook open when saving fails', async () => {
    await startCook();
    const failing = {
      ...harness.storage,
      data: {
        ...harness.storage.data,
        capture: {
          ...harness.storage.data.capture,
          saveReview: async () => {
            throw new Error('database is locked');
          },
        },
      },
    };
    const onFinished = jest.fn();
    await harness.render(
      <ReviewScreen cookId="cook-1" onBack={jest.fn()} onFinished={onFinished} />,
      failing,
    );
    await screen.findByTestId('review-screen');

    await user.type(screen.getByTestId('verdict-input'), 'Overcooked.');
    await user.press(screen.getByRole('button', { name: FINISH_REVIEW }));

    expect(await screen.findByTestId('review-save-failed')).toBeOnTheScreen();
    expect(screen.getByTestId('verdict-input')).toHaveDisplayValue('Overcooked.');
    expect(onFinished).not.toHaveBeenCalled();
    const cook = await harness.db.data.cooks.findById('cook-1');
    expect(cook).toMatchObject({ status: 'open', verdict: null });
  });

  it('explains a missing cook', async () => {
    await renderReview('nope');
    expect(await screen.findByTestId('review-missing')).toBeOnTheScreen();
  });
});
