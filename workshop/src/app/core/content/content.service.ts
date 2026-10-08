import { HttpClient } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { TUTORIAL_REGISTRY } from './registry';
import { TutorialManifest, TutorialStep } from './tutorial.model';

/** Overridable in tests; defaults to the real registry. */
export const TUTORIAL_MANIFESTS = new InjectionToken<readonly TutorialManifest[]>('TUTORIAL_MANIFESTS', {
  providedIn: 'root',
  factory: () => TUTORIAL_REGISTRY,
});

export interface StepNeighbours {
  readonly prev?: TutorialStep;
  readonly next?: TutorialStep;
}

@Injectable({ providedIn: 'root' })
export class ContentService {
  private readonly http = inject(HttpClient);
  private readonly manifests = [...inject(TUTORIAL_MANIFESTS)].sort((a, b) => a.number - b.number);

  getAll(): readonly TutorialManifest[] {
    return this.manifests;
  }

  getBySlug(slug: string): TutorialManifest | undefined {
    return this.manifests.find((m) => m.slug === slug);
  }

  getStep(slug: string, stepId: string): TutorialStep | undefined {
    return this.getBySlug(slug)?.steps.find((s) => s.id === stepId);
  }

  /** 1-based position of the step inside its tutorial. */
  getStepNumber(slug: string, stepId: string): number | undefined {
    const index = this.getBySlug(slug)?.steps.findIndex((s) => s.id === stepId) ?? -1;
    return index === -1 ? undefined : index + 1;
  }

  getNeighbours(slug: string, stepId: string): StepNeighbours {
    const steps = this.getBySlug(slug)?.steps ?? [];
    const index = steps.findIndex((s) => s.id === stepId);
    if (index === -1) return { prev: undefined, next: undefined };
    return { prev: steps[index - 1], next: steps[index + 1] };
  }

  /** Sum of the step durations, or the manifest estimate when it has no steps. */
  getTotalMinutes(manifest: TutorialManifest): number {
    if (manifest.steps.length === 0) return manifest.estimatedMinutes;
    return manifest.steps.reduce((total, s) => total + s.estimatedMinutes, 0);
  }

  loadOverview(slug: string): Observable<string> {
    return this.loadText(slug, 'overview.md');
  }

  loadStep(slug: string, stepId: string): Observable<string> {
    const step = this.getStep(slug, stepId);
    if (!step) return throwError(() => new Error(`Unknown step "${stepId}" in tutorial "${slug}"`));
    return this.loadText(slug, step.file);
  }

  // Relative URL: resolved against <base href>, so the app also works under a sub-path.
  private loadText(slug: string, file: string): Observable<string> {
    return this.http.get(`tutorials/${slug}/${file}`, { responseType: 'text' });
  }
}
