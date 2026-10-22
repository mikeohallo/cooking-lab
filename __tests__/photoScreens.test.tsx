/**
 * Photographs on the screens: adding one, looking at it, taking it back.
 *
 * The composer, the timeline, the full-screen view and the real capture
 * pipeline, against real SQL and a real private file store. The camera is
 * scripted so a refusal and a cancellation can each be driven deliberately.
 */

import { screen, userEvent, waitFor } from '@testing-library/react-native';

import {
  ADD_PHOTO,
  CANCEL,
  CHOOSE_PHOTO,
  CLOSE_PHOTO,
  PHOTO_CAMERA_BLOCKED_BODY,
  PHOTO_CAMERA_DENIED_TITLE,
  REMOVE_PHOTO,
  REMOVE_PHOTO_CONFIRM,
  REMOVE_PHOTO_CONFIRM_TITLE,
  REMOVE_PHOTO_KEEP,
  TAKE_PHOTO,
} from '../src/content/product';
import { CookScreen } from '../src/screens/CookScreen';
import { openScreenHarness, type ScreenHarness } from './support/screens';

const user = userEvent.setup();

let harness: ScreenHarness;

beforeEach(async () => {
  harness = await openScreenHarness('photo-screens.db');
});

afterEach(async () => {
  await harness.close();
});

async function startCook(): Promise<void> {
  const { data, now } = harness.storage;
  await data.capture.startCook({ id: 'cook-1', startedAt: now() }, 'user', now());
}

async function openCook(): Promise<void> {
  await harness.render(<CookScreen cookId="cook-1" onBack={jest.fn()} onReview={jest.fn()} />);
  await screen.findByTestId('cook-screen');
}

/** Opens the photo panel and takes a photograph with the camera. */
async function takePhoto(): Promise<void> {
  await user.press(screen.getByTestId('add-photo'));
  await user.press(await screen.findByRole('button', { name: TAKE_PHOTO }));
}

describe('the camera button', () => {
  it('sits beside the note field and carries its name for a screen reader', async () => {
    await startCook();
    await openCook();

    const button = screen.getByTestId('add-photo');
    expect(button).toBeOnTheScreen();
    expect(button.props.accessibilityLabel).toBe(ADD_PHOTO);
    // Android's minimum, which the baseline requires of every control.
    // Pressable hands its style down as an array, the base style first.
    expect(button.props.style[0]).toMatchObject({ width: 48, height: 48 });
  });

  it('offers the camera and the photo picker, and nothing else', async () => {
    await startCook();
    await openCook();

    await user.press(screen.getByTestId('add-photo'));

    expect(await screen.findByRole('button', { name: TAKE_PHOTO })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: CHOOSE_PHOTO })).toBeOnTheScreen();
  });

  it('closes again without taking anything', async () => {
    await startCook();
    await openCook();

    await user.press(screen.getByTestId('add-photo'));
    await user.press(await screen.findByRole('button', { name: CANCEL }));

    expect(screen.queryByTestId('photo-panel')).toBeNull();
    expect(screen.getByTestId('note-input')).toBeOnTheScreen();
    expect(harness.camera.asked).toEqual([]);
  });
});

describe('adding a photograph', () => {
  it('puts it in the timeline at the time it was added', async () => {
    await startCook();
    await openCook();

    await takePhoto();

    const events = await waitFor(async () => {
      const found = await harness.storage.data.cookEvents.listForCook({ cookId: 'cook-1' });
      expect(found).toHaveLength(1);
      return found;
    });
    expect(events[0]?.kind).toBe('photo');
    expect(events[0]?.ts).toBe(harness.storage.now());
    expect(await screen.findByTestId(`photo-${events[0]!.id}`)).toBeOnTheScreen();
  });

  it('draws it from the app’s own storage and not from the camera’s file', async () => {
    await startCook();
    await openCook();

    await takePhoto();

    const events = await waitFor(async () => {
      const found = await harness.storage.data.cookEvents.listForCook({ cookId: 'cook-1' });
      expect(found).toHaveLength(1);
      return found;
    });
    const image = await screen.findByTestId(`photo-${events[0]!.id}`);

    // A copy in the private store: the record carries a logical path, and the
    // screen is handed a transient URI for that file. Not the camera's path.
    expect(events[0]?.photoPath).toMatch(/^cooks\/cook-1\//);
    expect(image.props.source.uri).not.toBe('file:///camera/shot.jpg');
    expect(image.props.source.uri).toContain(events[0]!.photoPath);
  });

  it('takes one from the roll when that is what was asked for', async () => {
    await startCook();
    await openCook();

    await user.press(screen.getByTestId('add-photo'));
    await user.press(await screen.findByRole('button', { name: CHOOSE_PHOTO }));

    await waitFor(() => expect(harness.camera.asked).toEqual(['library']));
  });

  it('says nothing at all when the person backs out of the camera', async () => {
    await startCook();
    await openCook();
    harness.camera.next = { status: 'cancelled' };

    await takePhoto();

    await waitFor(() => expect(harness.camera.asked).toEqual(['camera']));
    // Backing out is not an error, so there is nothing to tell anybody.
    expect(screen.queryByTestId('photo-failed')).toBeNull();
    expect(screen.queryByTestId('photo-denied')).toBeNull();
    expect(await harness.storage.data.cookEvents.listForCook({ cookId: 'cook-1' })).toEqual([]);
  });

  it('explains a refused camera, and points at Settings when asking is no use', async () => {
    await startCook();
    await openCook();
    harness.camera.next = { status: 'denied', canAskAgain: false };

    await takePhoto();

    expect(await screen.findByTestId('photo-denied')).toBeOnTheScreen();
    expect(screen.getByText(PHOTO_CAMERA_DENIED_TITLE)).toBeOnTheScreen();
    expect(screen.getByText(PHOTO_CAMERA_BLOCKED_BODY)).toBeOnTheScreen();
  });

  it('says the cook is unchanged when the photograph could not be saved', async () => {
    await startCook();
    await openCook();
    harness.camera.next = { status: 'failed', message: 'the camera was busy' };

    await takePhoto();

    expect(await screen.findByTestId('photo-failed')).toBeOnTheScreen();
    expect(screen.getByText(/the camera was busy/)).toBeOnTheScreen();
    expect(await harness.storage.data.cookEvents.listForCook({ cookId: 'cook-1' })).toEqual([]);
  });

  it('is not offered on a reviewed cook', async () => {
    await startCook();
    const { data, now } = harness.storage;
    await data.capture.saveReview('cook-1', 'Good.', 'user', now());

    await harness.render(<CookScreen cookId="cook-1" onBack={jest.fn()} onReview={jest.fn()} />);
    await screen.findByTestId('cook-detail-screen');

    expect(screen.queryByTestId('add-photo')).toBeNull();
    expect(screen.queryByTestId('composer')).toBeNull();
  });
});

describe('looking at a photograph', () => {
  async function addAndOpen(): Promise<string> {
    await startCook();
    await openCook();
    await takePhoto();

    const events = await waitFor(async () => {
      const found = await harness.storage.data.cookEvents.listForCook({ cookId: 'cook-1' });
      expect(found).toHaveLength(1);
      return found;
    });
    const eventId = events[0]!.id;
    await screen.findByTestId(`photo-${eventId}`);
    await user.press(screen.getByTestId(`event-${eventId}`));
    await screen.findByTestId('photo-viewer-image');
    return eventId;
  }

  it('opens it full screen', async () => {
    await addAndOpen();

    expect(screen.getByTestId('photo-viewer-image')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: CLOSE_PHOTO })).toBeOnTheScreen();
  });

  it('closes again, changing nothing', async () => {
    const eventId = await addAndOpen();

    await user.press(screen.getByRole('button', { name: CLOSE_PHOTO }));

    await waitFor(() => expect(screen.queryByTestId('photo-viewer-image')).toBeNull());
    expect(await harness.storage.data.cookEvents.findById(eventId)).not.toBeNull();
  });

  it('asks before removing one, and says what goes', async () => {
    await addAndOpen();

    await user.press(screen.getByRole('button', { name: REMOVE_PHOTO }));

    expect(await screen.findByTestId('photo-remove-confirm')).toBeOnTheScreen();
    expect(screen.getByText(REMOVE_PHOTO_CONFIRM_TITLE)).toBeOnTheScreen();
    // The notice has to say what is *not* removed as well.
    expect(screen.getByText(/Everything else about this cook stays/)).toBeOnTheScreen();
  });

  it('keeps it when the confirm is declined', async () => {
    const eventId = await addAndOpen();

    await user.press(screen.getByRole('button', { name: REMOVE_PHOTO }));
    await user.press(await screen.findByRole('button', { name: REMOVE_PHOTO_KEEP }));

    expect(screen.queryByTestId('photo-remove-confirm')).toBeNull();
    expect(await harness.storage.data.cookEvents.findById(eventId)).not.toBeNull();
    expect(harness.files.files.size).toBe(1);
  });

  it('removes the entry and the file once it is confirmed', async () => {
    const eventId = await addAndOpen();
    const event = await harness.storage.data.cookEvents.findById(eventId);

    await user.press(screen.getByRole('button', { name: REMOVE_PHOTO }));
    await user.press(await screen.findByRole('button', { name: REMOVE_PHOTO_CONFIRM }));

    await waitFor(async () =>
      expect(await harness.storage.data.cookEvents.findById(eventId)).toBeNull(),
    );
    expect(await harness.storage.photos.exists(event!.photoPath!)).toBe(false);
    expect(harness.files.files.size).toBe(0);
    // And the viewer has closed, because there is nothing left to look at.
    await waitFor(() => expect(screen.queryByTestId('photo-viewer-image')).toBeNull());
  });

  it('leaves the notes and readings alone', async () => {
    await startCook();
    const { data, now } = harness.storage;
    await data.capture.addEvent(
      { id: 'note-1', cookId: 'cook-1', ts: now(), kind: 'user_note', body: 'Crust caught' },
      'user',
    );
    await openCook();
    await takePhoto();
    const photo = await waitFor(async () => {
      const found = await data.cookEvents.listForCook({ cookId: 'cook-1', kind: 'photo' });
      expect(found).toHaveLength(1);
      return found[0]!;
    });
    await screen.findByTestId(`photo-${photo.id}`);
    await user.press(screen.getByTestId(`event-${photo.id}`));
    await screen.findByTestId('photo-viewer-image');

    await user.press(screen.getByRole('button', { name: REMOVE_PHOTO }));
    await user.press(await screen.findByRole('button', { name: REMOVE_PHOTO_CONFIRM }));

    await waitFor(async () =>
      expect(await data.cookEvents.listForCook({ cookId: 'cook-1' })).toHaveLength(1),
    );
    expect(screen.getByText('Crust caught')).toBeOnTheScreen();
  });
});

describe('a photograph whose file has gone', () => {
  it('says so instead of showing a broken picture', async () => {
    await startCook();
    const { data, now } = harness.storage;
    // An entry whose file was never written: what a restored backup with a
    // missing photograph looks like.
    await data.capture.addEvent(
      {
        id: 'lost-photo',
        cookId: 'cook-1',
        ts: now(),
        kind: 'photo',
        photoPath: 'cooks/cook-1/events/lost-photo/20261015t083000-00.jpg',
      },
      'user',
    );

    await openCook();

    expect(await screen.findByText('This photo is no longer on the phone.')).toBeOnTheScreen();
    expect(screen.queryByTestId('photo-lost-photo')).toBeNull();
  });
});
