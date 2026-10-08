import { TestBed } from '@angular/core/testing';
import { PROGRESS_STORAGE, PROGRESS_STORAGE_KEY, ProgressService } from './progress.service';

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem'> {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function create(storage: Pick<Storage, 'getItem' | 'setItem'> | null): ProgressService {
  TestBed.configureTestingModule({ providers: [{ provide: PROGRESS_STORAGE, useValue: storage }] });
  return TestBed.inject(ProgressService);
}

describe('ProgressService', () => {
  it('uses the documented storage key', () => {
    expect(PROGRESS_STORAGE_KEY).toBe('aspnet-workshop.progress.v1');
  });

  it('starts empty', () => {
    const service = create(new MemoryStorage());

    expect(service.completedCount('t')).toBe(0);
    expect(service.isCompleted('t', 'a')).toBe(false);
    expect(service.lastVisited('t')).toBeUndefined();
  });

  it('toggles a step on and off', () => {
    const service = create(new MemoryStorage());

    service.toggle('t', 'a');
    expect(service.isCompleted('t', 'a')).toBe(true);

    service.toggle('t', 'a');
    expect(service.isCompleted('t', 'a')).toBe(false);
  });

  it('sets completion explicitly and idempotently', () => {
    const service = create(new MemoryStorage());

    service.setCompleted('t', 'a', true);
    service.setCompleted('t', 'a', true);

    expect(service.completedCount('t')).toBe(1);

    service.setCompleted('t', 'a', false);
    expect(service.completedCount('t')).toBe(0);
  });

  it('keeps tutorials independent', () => {
    const service = create(new MemoryStorage());

    service.toggle('one', 'a');

    expect(service.isCompleted('one', 'a')).toBe(true);
    expect(service.isCompleted('two', 'a')).toBe(false);
  });

  it('computes the percentage against the total of steps', () => {
    const service = create(new MemoryStorage());
    service.toggle('t', 'a');
    service.toggle('t', 'b');

    expect(service.percentage('t', 4)).toBe(50);
    expect(service.percentage('t', 0)).toBe(0);
  });

  it('only counts known steps when valid ids are provided', () => {
    const service = create(new MemoryStorage());
    service.toggle('t', 'a');
    service.toggle('t', 'removed');

    expect(service.percentage('t', 2, ['a', 'b'])).toBe(50);
    expect(service.completedCount('t', ['a', 'b'])).toBe(1);
  });

  it('derives the status: new, in-progress, completed', () => {
    const service = create(new MemoryStorage());

    expect(service.status('t', 2)).toBe('new');

    service.toggle('t', 'a');
    expect(service.status('t', 2)).toBe('in-progress');

    service.toggle('t', 'b');
    expect(service.status('t', 2)).toBe('completed');
  });

  it('treats a visited tutorial without completed steps as in progress', () => {
    const service = create(new MemoryStorage());

    service.setLastVisited('t', 'a');

    expect(service.status('t', 3)).toBe('in-progress');
    expect(service.lastVisited('t')).toBe('a');
  });

  it('never reports completed for a tutorial without steps', () => {
    const service = create(new MemoryStorage());

    expect(service.status('t', 0)).toBe('new');
  });

  it('persists to storage and restores in a new instance', () => {
    const storage = new MemoryStorage();
    const first = create(storage);
    first.toggle('t', 'a');
    first.setLastVisited('t', 'b');
    TestBed.resetTestingModule();

    const second = create(storage);

    expect(second.isCompleted('t', 'a')).toBe(true);
    expect(second.lastVisited('t')).toBe('b');
    expect(storage.data.has(PROGRESS_STORAGE_KEY)).toBe(true);
  });

  it('ignores corrupted stored data', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_STORAGE_KEY, '{not json');

    const service = create(storage);

    expect(service.completedCount('t')).toBe(0);
  });

  it('ignores stored data with an unexpected shape', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify({ t: { completed: 'nope' } }));

    const service = create(storage);

    expect(service.completedCount('t')).toBe(0);
  });

  it('keeps working in memory when storage is unavailable', () => {
    const service = create(null);

    service.toggle('t', 'a');

    expect(service.isCompleted('t', 'a')).toBe(true);
  });

  it('keeps working when storage throws on read and write', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const service = create(throwing);

    expect(() => service.toggle('t', 'a')).not.toThrow();
    expect(service.isCompleted('t', 'a')).toBe(true);
  });

  it('resets one tutorial', () => {
    const service = create(new MemoryStorage());
    service.toggle('one', 'a');
    service.toggle('two', 'a');

    service.reset('one');

    expect(service.completedCount('one')).toBe(0);
    expect(service.completedCount('two')).toBe(1);
  });

  it('exposes reactive state through signals', () => {
    const service = create(new MemoryStorage());
    const completed = service.completedSteps('t');

    expect(completed()).toEqual([]);

    service.toggle('t', 'a');

    expect(completed()).toEqual(['a']);
  });
});
