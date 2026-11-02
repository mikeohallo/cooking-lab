import { useCallback, useEffect, useRef } from 'react';
import { Keyboard, Platform } from 'react-native';

/** What a field spreads onto its `TextField`, so leaving it saves. */
export type LeaveHandlers = {
  readonly onFocus: () => void;
  readonly onBlur: () => void;
};

/**
 * Saves a one-line field's words when the person leaves it (0.4.0, part 6):
 * when the field loses focus, or when the keyboard is closed while it has
 * focus. Android's Back closes the keyboard and leaves the field focused, so
 * the keyboard closing counts as leaving too.
 *
 * `leave` decides whether there is anything to save and saves it, exactly as
 * the field's own Save would; an unchanged or empty field saves nothing.
 * While one save is in flight, another leave does nothing, so the Return key
 * (which also blurs) and the keyboard closing never save twice.
 *
 * Only the field that has focus answers the keyboard closing, so several of
 * these on one screen never save each other's words.
 */
export function useSaveOnLeave(leave: () => Promise<unknown> | void): LeaveHandlers {
  const latest = useRef(leave);
  const focused = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    latest.current = leave;
  });

  const fire = useCallback(() => {
    if (running.current) {
      return;
    }
    const result = latest.current();
    if (result instanceof Promise) {
      running.current = true;
      void result.finally(() => {
        running.current = false;
      });
    }
  }, []);

  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const hidden = Keyboard.addListener(event, () => {
      if (focused.current) {
        fire();
      }
    });
    return () => hidden.remove();
  }, [fire]);

  const onFocus = useCallback(() => {
    focused.current = true;
  }, []);

  const onBlur = useCallback(() => {
    focused.current = false;
    fire();
  }, [fire]);

  return { onFocus, onBlur };
}
