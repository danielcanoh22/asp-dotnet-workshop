import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { TUTORIAL_MANIFESTS } from './content.service';
import { TutorialManifest } from './tutorial.model';
import { stepTitle, tutorialTitle, WorkshopTitleStrategy, APP_TITLE } from './route-titles';

const TUTORIAL: TutorialManifest = {
  slug: 'bookshelf',
  number: 1,
  title: 'Bookshelf API',
  subtitle: '',
  summary: '',
  level: 'beginner',
  estimatedMinutes: 0,
  topics: [],
  status: 'available',
  steps: [{ id: 'a', title: 'Primer paso', file: '01-a.md', estimatedMinutes: 5 }],
};

function route(params: Record<string, string>): ActivatedRouteSnapshot {
  return { paramMap: convertToParamMap(params) } as ActivatedRouteSnapshot;
}

describe('route titles', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), { provide: TUTORIAL_MANIFESTS, useValue: [TUTORIAL] }],
    }),
  );

  it('uses the tutorial title for the overview', () => {
    const title = TestBed.runInInjectionContext(() => tutorialTitle(route({ slug: 'bookshelf' }), {} as RouterStateSnapshot));

    expect(title).toBe('Bookshelf API');
  });

  it('falls back to a generic title for unknown tutorials', () => {
    const title = TestBed.runInInjectionContext(() => tutorialTitle(route({ slug: 'nope' }), {} as RouterStateSnapshot));

    expect(title).toBe('Tutorial no encontrado');
  });

  it('uses "step - tutorial" for the reader', () => {
    const title = TestBed.runInInjectionContext(() =>
      stepTitle(route({ slug: 'bookshelf', stepId: 'a' }), {} as RouterStateSnapshot),
    );

    expect(title).toBe('Primer paso · Bookshelf API');
  });

  it('falls back to a generic title for unknown steps', () => {
    const title = TestBed.runInInjectionContext(() =>
      stepTitle(route({ slug: 'bookshelf', stepId: 'zzz' }), {} as RouterStateSnapshot),
    );

    expect(title).toBe('Paso no encontrado');
  });

  it('appends the app name to every page title', () => {
    const setTitle = vi.fn();
    const strategy = TestBed.runInInjectionContext(() => new WorkshopTitleStrategy());
    (strategy as unknown as { title: { setTitle: typeof setTitle } }).title = { setTitle };
    vi.spyOn(strategy, 'buildTitle').mockReturnValue('Catálogo');

    strategy.updateTitle({} as RouterStateSnapshot);

    expect(setTitle).toHaveBeenCalledWith(`Catálogo · ${APP_TITLE}`);
  });

  it('uses only the app name when a page has no title', () => {
    const setTitle = vi.fn();
    const strategy = TestBed.runInInjectionContext(() => new WorkshopTitleStrategy());
    (strategy as unknown as { title: { setTitle: typeof setTitle } }).title = { setTitle };
    vi.spyOn(strategy, 'buildTitle').mockReturnValue(undefined);

    strategy.updateTitle({} as RouterStateSnapshot);

    expect(setTitle).toHaveBeenCalledWith(APP_TITLE);
  });
});
