import { Injectable, InjectionToken, Signal } from '@angular/core';

export const PROGRESS_STORAGE_KEY = 'aspnet-workshop.progress.v1';

export const PROGRESS_STORAGE = new InjectionToken<Pick<Storage, 'getItem' | 'setItem'> | null>(
  'PROGRESS_STORAGE',
  { providedIn: 'root', factory: () => null },
);

export type ProgressStatus = 'new' | 'in-progress' | 'completed';

@Injectable({ providedIn: 'root' })
export class ProgressService {
  completedCount(_slug: string, _validIds?: readonly string[]): number {
    throw new Error('not implemented');
  }
  isCompleted(_slug: string, _stepId: string): boolean {
    throw new Error('not implemented');
  }
  toggle(_slug: string, _stepId: string): void {
    throw new Error('not implemented');
  }
  setCompleted(_slug: string, _stepId: string, _completed: boolean): void {
    throw new Error('not implemented');
  }
  percentage(_slug: string, _total: number, _validIds?: readonly string[]): number {
    throw new Error('not implemented');
  }
  status(_slug: string, _total: number): ProgressStatus {
    throw new Error('not implemented');
  }
  lastVisited(_slug: string): string | undefined {
    throw new Error('not implemented');
  }
  setLastVisited(_slug: string, _stepId: string): void {
    throw new Error('not implemented');
  }
  completedSteps(_slug: string): Signal<readonly string[]> {
    throw new Error('not implemented');
  }
  reset(_slug: string): void {
    throw new Error('not implemented');
  }
}
