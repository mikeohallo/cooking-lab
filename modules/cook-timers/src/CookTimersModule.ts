/**
 * The timers module on the phone: `android/`, through the Expo Modules API.
 * The web preview takes `CookTimersModule.web.ts` instead, and Jest a mock
 * (`../mocks/CookTimersModule.ts`, set up in `jest.setup.ts`).
 */
import { requireNativeModule } from 'expo';

import type { CookTimersNative } from './CookTimers.types';

export default requireNativeModule<CookTimersNative & object>('CookTimers') as CookTimersNative;
