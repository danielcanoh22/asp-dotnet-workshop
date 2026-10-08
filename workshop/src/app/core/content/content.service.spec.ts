import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ContentService, TUTORIAL_MANIFESTS } from './content.service';
import { TutorialManifest } from './tutorial.model';
import { TUTORIAL_REGISTRY, validateManifests } from './registry';

function manifest(overrides: Partial<TutorialManifest>): TutorialManifest {
  return {
    slug: 'sample',
    number: 1,
    title: 'Sample',
    subtitle: 'Sub',
    summary: 'Summary',
    level: 'beginner',
    estimatedMinutes: 30,
    topics: [],
    status: 'available',
    steps: [],
    ...overrides,
  };
}

const SAMPLE = manifest({
  slug: 'alpha',
  number: 2,
  steps: [
    { id: 'one', title: 'One', file: '01-one.md', estimatedMinutes: 5 },
    { id: 'two', title: 'Two', file: '02-two.md', estimatedMinutes: 6 },
    { id: 'three', title: 'Three', file: '03-three.md', estimatedMinutes: 7 },
  ],
});
const FIRST = manifest({ slug: 'zeta', number: 1 });
const SOON = manifest({ slug: 'soon', number: 3, status: 'coming-soon' });

describe('ContentService', () => {
  let service: ContentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TUTORIAL_MANIFESTS, useValue: [SOON, SAMPLE, FIRST] },
      ],
    });
    service = TestBed.inject(ContentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('returns every manifest sorted by number', () => {
    expect(service.getAll().map((m) => m.slug)).toEqual(['zeta', 'alpha', 'soon']);
  });

  it('finds a manifest by slug', () => {
    expect(service.getBySlug('alpha')).toBe(SAMPLE);
    expect(service.getBySlug('missing')).toBeUndefined();
  });

  it('finds a step by tutorial slug and step id', () => {
    expect(service.getStep('alpha', 'two')?.title).toBe('Two');
    expect(service.getStep('alpha', 'nope')).toBeUndefined();
    expect(service.getStep('nope', 'two')).toBeUndefined();
  });

  it('returns the 1-based step number', () => {
    expect(service.getStepNumber('alpha', 'one')).toBe(1);
    expect(service.getStepNumber('alpha', 'three')).toBe(3);
    expect(service.getStepNumber('alpha', 'nope')).toBeUndefined();
  });

  it('computes previous and next steps', () => {
    expect(service.getNeighbours('alpha', 'one')).toEqual({ prev: undefined, next: SAMPLE.steps[1] });
    expect(service.getNeighbours('alpha', 'two')).toEqual({ prev: SAMPLE.steps[0], next: SAMPLE.steps[2] });
    expect(service.getNeighbours('alpha', 'three')).toEqual({ prev: SAMPLE.steps[1], next: undefined });
  });

  it('returns empty neighbours for unknown steps', () => {
    expect(service.getNeighbours('alpha', 'nope')).toEqual({ prev: undefined, next: undefined });
  });

  it('loads the overview markdown from the tutorial folder', () => {
    let result = '';
    service.loadOverview('alpha').subscribe((text) => (result = text));

    const request = http.expectOne('tutorials/alpha/overview.md');
    expect(request.request.responseType).toBe('text');
    request.flush('# Overview');

    expect(result).toBe('# Overview');
  });

  it('loads a step markdown using the manifest file name', () => {
    let result = '';
    service.loadStep('alpha', 'two').subscribe((text) => (result = text));

    http.expectOne('tutorials/alpha/02-two.md').flush('# Two');

    expect(result).toBe('# Two');
  });

  it('errors when loading an unknown step', () => {
    let failed = false;
    service.loadStep('alpha', 'nope').subscribe({ error: () => (failed = true) });

    expect(failed).toBe(true);
  });

  it('sums the step minutes of a tutorial', () => {
    expect(service.getTotalMinutes(SAMPLE)).toBe(18);
    expect(service.getTotalMinutes(FIRST)).toBe(FIRST.estimatedMinutes);
  });
});

describe('validateManifests', () => {
  it('accepts a consistent list', () => {
    expect(validateManifests([FIRST, SAMPLE, SOON])).toEqual([]);
  });

  it('reports duplicated slugs and numbers', () => {
    const problems = validateManifests([FIRST, manifest({ slug: 'zeta', number: 1 })]);

    expect(problems).toContain('Duplicated slug: zeta');
    expect(problems).toContain('Duplicated number: 1');
  });

  it('reports duplicated step ids and files inside a tutorial', () => {
    const step = { id: 'a', title: 'A', file: 'a.md', estimatedMinutes: 1 };
    const problems = validateManifests([manifest({ steps: [step, step] })]);

    expect(problems).toContain('sample: duplicated step id a');
    expect(problems).toContain('sample: duplicated step file a.md');
  });

  it('reports available tutorials without steps and coming-soon tutorials with steps', () => {
    const step = { id: 'a', title: 'A', file: 'a.md', estimatedMinutes: 1 };
    const problems = validateManifests([
      manifest({ slug: 'empty', number: 1, status: 'available', steps: [] }),
      manifest({ slug: 'soon', number: 2, status: 'coming-soon', steps: [step] }),
    ]);

    expect(problems).toContain('empty: an available tutorial needs at least one step');
    expect(problems).toContain('soon: a coming-soon tutorial must not declare steps');
  });
});

describe('TUTORIAL_REGISTRY', () => {
  it('is valid', () => {
    expect(validateManifests(TUTORIAL_REGISTRY)).toEqual([]);
  });

  it('contains the bookshelf-api tutorial with 15 steps', () => {
    const bookshelf = TUTORIAL_REGISTRY.find((m) => m.slug === 'bookshelf-api');

    expect(bookshelf?.status).toBe('available');
    expect(bookshelf?.steps).toHaveLength(15);
  });

  it('lists tutorials 2 to 7 as coming soon', () => {
    const upcoming = TUTORIAL_REGISTRY.filter((m) => m.number >= 2);

    expect(upcoming.map((m) => m.number)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(upcoming.every((m) => m.status === 'coming-soon')).toBe(true);
  });
});
