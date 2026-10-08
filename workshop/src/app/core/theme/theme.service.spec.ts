import { TestBed } from '@angular/core/testing';
import { THEME_STORAGE, THEME_STORAGE_KEY, ThemeService, SYSTEM_PREFERS_DARK } from './theme.service';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function create(options: { storage?: Pick<Storage, 'getItem' | 'setItem'> | null; prefersDark?: boolean }) {
  TestBed.configureTestingModule({
    providers: [
      { provide: THEME_STORAGE, useValue: options.storage ?? new MemoryStorage() },
      { provide: SYSTEM_PREFERS_DARK, useValue: () => options.prefersDark ?? false },
    ],
  });
  return TestBed.inject(ThemeService);
}

describe('ThemeService', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('follows the system preference by default', () => {
    const light = create({ prefersDark: false });
    expect(light.mode()).toBe('system');
    expect(light.isDark()).toBe(false);

    TestBed.resetTestingModule();

    const dark = create({ prefersDark: true });
    expect(dark.isDark()).toBe(true);
  });

  it('restores a stored explicit theme and applies it to the document', () => {
    const storage = new MemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'dark');

    const service = create({ storage, prefersDark: false });
    TestBed.tick();

    expect(service.mode()).toBe('dark');
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('ignores invalid stored values', () => {
    const storage = new MemoryStorage();
    storage.setItem(THEME_STORAGE_KEY, 'purple');

    expect(create({ storage }).mode()).toBe('system');
  });

  it('toggles to the opposite of the effective scheme and persists it', () => {
    const storage = new MemoryStorage();
    const service = create({ storage, prefersDark: true });

    service.toggle();
    TestBed.tick();

    expect(service.mode()).toBe('light');
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    service.toggle();
    expect(service.mode()).toBe('dark');
  });

  it('works when storage is unavailable or throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };

    const service = create({ storage: throwing });

    expect(() => service.toggle()).not.toThrow();
    expect(service.mode()).toBe('dark');
  });
});
