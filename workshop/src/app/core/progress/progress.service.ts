import { Injectable, InjectionToken, Signal, computed, inject, signal } from '@angular/core';

export const PROGRESS_STORAGE_KEY = 'aspnet-workshop.progress.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Reading `localStorage` can itself throw (blocked site data, private windows), hence the guard. */
export const PROGRESS_STORAGE = new InjectionToken<StorageLike | null>('PROGRESS_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return globalThis.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

export type ProgressStatus = 'new' | 'in-progress' | 'completed';

interface TutorialProgress {
  readonly completed: readonly string[];
  readonly lastStep?: string;
}

type ProgressState = Readonly<Record<string, TutorialProgress>>;

const EMPTY: TutorialProgress = { completed: [] };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Keeps only well-formed entries so a corrupted payload can never break the app. */
function sanitize(raw: unknown): ProgressState {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};

  const result: Record<string, TutorialProgress> = {};
  for (const [slug, entry] of Object.entries(raw)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { completed, lastStep } = entry as Record<string, unknown>;
    result[slug] = {
      completed: isStringArray(completed) ? completed : [],
      lastStep: typeof lastStep === 'string' ? lastStep : undefined,
    };
  }
  return result;
}

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private readonly storage = inject(PROGRESS_STORAGE);
  private readonly state = signal<ProgressState>(this.load());

  /** Reactive list of completed step ids for a tutorial (use inside templates/computed). */
  completedSteps(slug: string): Signal<readonly string[]> {
    return computed(() => (this.state()[slug] ?? EMPTY).completed);
  }

  isCompleted(slug: string, stepId: string): boolean {
    return this.entry(slug).completed.includes(stepId);
  }

  completedCount(slug: string, validIds?: readonly string[]): number {
    const completed = this.entry(slug).completed;
    return validIds ? completed.filter((id) => validIds.includes(id)).length : completed.length;
  }

  toggle(slug: string, stepId: string): void {
    this.setCompleted(slug, stepId, !this.isCompleted(slug, stepId));
  }

  setCompleted(slug: string, stepId: string, completed: boolean): void {
    const current = this.entry(slug);
    if (current.completed.includes(stepId) === completed) return;

    this.update(slug, {
      ...current,
      completed: completed
        ? [...current.completed, stepId]
        : current.completed.filter((id) => id !== stepId),
    });
  }

  /** Completion percentage (0-100, rounded). Pass `validIds` to ignore steps removed from the manifest. */
  percentage(slug: string, total: number, validIds?: readonly string[]): number {
    if (total <= 0) return 0;
    return Math.round((this.completedCount(slug, validIds) / total) * 100);
  }

  status(slug: string, total: number, validIds?: readonly string[]): ProgressStatus {
    if (total > 0 && this.completedCount(slug, validIds) >= total) return 'completed';
    const entry = this.entry(slug);
    return entry.completed.length > 0 || entry.lastStep ? 'in-progress' : 'new';
  }

  lastVisited(slug: string): string | undefined {
    return this.entry(slug).lastStep;
  }

  setLastVisited(slug: string, stepId: string): void {
    const current = this.entry(slug);
    if (current.lastStep === stepId) return;
    this.update(slug, { ...current, lastStep: stepId });
  }

  reset(slug: string): void {
    const { [slug]: _removed, ...rest } = this.state();
    this.state.set(rest);
    this.persist();
  }

  private entry(slug: string): TutorialProgress {
    return this.state()[slug] ?? EMPTY;
  }

  private update(slug: string, value: TutorialProgress): void {
    this.state.update((state) => ({ ...state, [slug]: value }));
    this.persist();
  }

  private load(): ProgressState {
    try {
      const raw = this.storage?.getItem(PROGRESS_STORAGE_KEY);
      return raw ? sanitize(JSON.parse(raw)) : {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    try {
      this.storage?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(this.state()));
    } catch {
      // Storage may be blocked or full: progress still works for the current session.
    }
  }
}
