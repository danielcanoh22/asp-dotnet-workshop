import { InjectionToken, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TutorialManifest, TutorialStep } from './tutorial.model';

export const TUTORIAL_MANIFESTS = new InjectionToken<readonly TutorialManifest[]>('TUTORIAL_MANIFESTS');

@Injectable({ providedIn: 'root' })
export class ContentService {
  getAll(): readonly TutorialManifest[] {
    throw new Error('not implemented');
  }
  getBySlug(_slug: string): TutorialManifest | undefined {
    throw new Error('not implemented');
  }
  getStep(_slug: string, _stepId: string): TutorialStep | undefined {
    throw new Error('not implemented');
  }
  getStepNumber(_slug: string, _stepId: string): number | undefined {
    throw new Error('not implemented');
  }
  getNeighbours(_slug: string, _stepId: string): { prev?: TutorialStep; next?: TutorialStep } {
    throw new Error('not implemented');
  }
  getTotalMinutes(_manifest: TutorialManifest): number {
    throw new Error('not implemented');
  }
  loadOverview(_slug: string): Observable<string> {
    throw new Error('not implemented');
  }
  loadStep(_slug: string, _stepId: string): Observable<string> {
    throw new Error('not implemented');
  }
}
