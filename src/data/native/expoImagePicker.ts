/**
 * The camera and Android's photo picker, and nothing else.
 *
 * TWO ROUTES, TWO VERY DIFFERENT PERMISSION STORIES
 * -------------------------------------------------
 * `takePhoto` needs the camera, so it asks — once. Android remembers the
 * answer, so the ask only ever happens the first time; afterwards
 * `getCameraPermissionsAsync` already knows and no dialog appears. A refusal
 * comes back as `denied`, with whether asking again would even show a dialog,
 * so the screen can point at Settings instead of asking a question Android will
 * silently drop.
 *
 * `choosePhoto` asks for nothing at all, deliberately. On Android 13 and later
 * `launchImageLibraryAsync` goes through the system photo picker, which runs
 * outside this app: the person picks one picture and this app is handed that
 * one picture. It never sees the roll, so there is nothing for it to be given
 * access to. `requestMediaLibraryPermissionsAsync` is therefore not called here
 * and must not be — calling it would make Android show a permission prompt for
 * access the app does not need and should not have, and READ_EXTERNAL_STORAGE
 * is blocked in `app.config.ts` precisely so it cannot be granted.
 *
 * WHAT THIS MODULE DOES NOT DO
 * ----------------------------
 * No cropping, no editing, no multiple selection, no metadata. `exif: false`
 * means the EXIF block is not even handed to JavaScript, so there is no copy of
 * a photograph's coordinates anywhere in this process to leak; the file itself
 * is cleaned later and by the app's own code (`../photos/jpeg.ts`), because
 * what the picker tells us is not the same as what is in the file.
 *
 * Nothing is written to the Gallery from here. There is no call that could.
 */

import * as ImagePicker from 'expo-image-picker';

import type { CapturedImage, PhotoSource, PhotoSourceOutcome } from '../adapters';

/**
 * One picture, at full quality, with no editor in the way.
 *
 * `quality: 1` is right even though the stored copy is compressed later: this
 * is the only chance at the original pixels, and compressing twice shows.
 */
const PICK_ONE_IMAGE: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsMultipleSelection: false,
  allowsEditing: false,
  exif: false,
  base64: false,
  quality: 1,
};

function firstImage(result: ImagePicker.ImagePickerResult): PhotoSourceOutcome {
  if (result.canceled) {
    return { status: 'cancelled' };
  }
  const asset = result.assets[0];
  if (asset === undefined) {
    // Not cancelled and nothing picked: nothing sensible to store, and saying
    // so is better than storing whatever `assets[0]` would have been.
    return { status: 'failed', message: 'no photo came back from that' };
  }
  const image: CapturedImage = {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
  };
  return { status: 'captured', image };
}

function failure(cause: unknown): PhotoSourceOutcome {
  return {
    status: 'failed',
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

export const expoPhotoSource: PhotoSource = {
  async takePhoto(): Promise<PhotoSourceOutcome> {
    try {
      // Asked for only if Android does not already have an answer, so the
      // person sees the dialog once in the life of the install.
      let permission = await ImagePicker.getCameraPermissionsAsync();
      if (!permission.granted && permission.canAskAgain) {
        permission = await ImagePicker.requestCameraPermissionsAsync();
      }
      if (!permission.granted) {
        return { status: 'denied', canAskAgain: permission.canAskAgain };
      }
      return firstImage(await ImagePicker.launchCameraAsync(PICK_ONE_IMAGE));
    } catch (cause: unknown) {
      return failure(cause);
    }
  },

  async choosePhoto(): Promise<PhotoSourceOutcome> {
    try {
      // No permission call. See the note at the top of this file: the system
      // photo picker is the permission.
      return firstImage(await ImagePicker.launchImageLibraryAsync(PICK_ONE_IMAGE));
    } catch (cause: unknown) {
      return failure(cause);
    }
  },
};
