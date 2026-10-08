import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, Signal, computed, effect, inject, signal } from '@angular/core';

export const THEME_STORAGE_KEY = 'aspnet-workshop.theme.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export const THEME_STORAGE = new InjectionToken<StorageLike | null>('THEME_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

const DARK_QUERY = '(prefers-color-scheme: dark)';

export const SYSTEM_PREFERS_DARK = new InjectionToken<() => boolean>('SYSTEM_PREFERS_DARK', {
  providedIn: 'root',
  factory: () => {
    const win = inject(DOCUMENT).defaultView;
    return () => win?.matchMedia?.(DARK_QUERY).matches ?? false;
  },
});

export type ThemeMode = 'system' | 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly storage = inject(THEME_STORAGE);
  private readonly document = inject(DOCUMENT);
  private readonly systemPrefersDark = inject(SYSTEM_PREFERS_DARK);
  private readonly systemDark = signal(this.systemPrefersDark());

  readonly mode = signal<ThemeMode>(this.load());
  readonly isDark: Signal<boolean> = computed(() => {
    const mode = this.mode();
    return mode === 'system' ? this.systemDark() : mode === 'dark';
  });

  constructor() {
    this.watchSystemPreference();

    effect(() => {
      const mode = this.mode();
      const root = this.document.documentElement;
      if (mode === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', mode);
    });
  }

  /** Switches to the opposite of the scheme currently on screen and remembers the choice. */
  toggle(): void {
    const next: ThemeMode = this.isDark() ? 'light' : 'dark';
    this.mode.set(next);
    try {
      this.storage?.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice still applies for this session.
    }
  }

  private load(): ThemeMode {
    try {
      const stored = this.storage?.getItem(THEME_STORAGE_KEY);
      return stored === 'light' || stored === 'dark' ? stored : 'system';
    } catch {
      return 'system';
    }
  }

  private watchSystemPreference(): void {
    const query = this.document.defaultView?.matchMedia?.(DARK_QUERY);
    query?.addEventListener?.('change', (event) => this.systemDark.set(event.matches));
  }
}
