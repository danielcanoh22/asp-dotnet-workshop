import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TUTORIAL_MANIFESTS } from '../../core/content/content.service';
import { provideWorkshopMarkdown } from '../../core/content/markdown.providers';
import { TutorialManifest } from '../../core/content/tutorial.model';
import { PROGRESS_STORAGE, ProgressService } from '../../core/progress/progress.service';
import { TutorialOverviewPage } from './tutorial-overview.page';

const TUTORIAL: TutorialManifest = {
  slug: 'bookshelf',
  number: 1,
  title: 'Bookshelf API',
  subtitle: 'Sub',
  summary: 'Resumen del tutorial',
  level: 'beginner',
  estimatedMinutes: 0,
  topics: ['Controllers', 'DI'],
  status: 'available',
  whatYouWillBuild: 'Una API de libros',
  steps: [
    { id: 'a', title: 'Primer paso', file: '01-a.md', estimatedMinutes: 10 },
    { id: 'b', title: 'Segundo paso', file: '02-b.md', estimatedMinutes: 20 },
  ],
};

const SOON: TutorialManifest = {
  ...TUTORIAL,
  slug: 'later',
  number: 2,
  title: 'Más adelante',
  status: 'coming-soon',
  steps: [],
};

function setup() {
  TestBed.configureTestingModule({
    imports: [TutorialOverviewPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideWorkshopMarkdown(),
      { provide: TUTORIAL_MANIFESTS, useValue: [TUTORIAL, SOON] },
      { provide: PROGRESS_STORAGE, useValue: null },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const progress = TestBed.inject(ProgressService);

  async function open(slug: string, markdown?: string) {
    const fixture = TestBed.createComponent(TutorialOverviewPage);
    fixture.componentRef.setInput('slug', slug);
    fixture.detectChanges();
    TestBed.tick();
    if (markdown !== undefined) http.expectOne(`tutorials/${slug}/overview.md`).flush(markdown);
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  return { open, http, progress };
}

describe('TutorialOverviewPage', () => {
  it('shows the tutorial metadata and the rendered overview markdown', async () => {
    const { open } = setup();

    const { root } = await open('bookshelf', '# Bienvenido\n\nTexto');

    expect(root.querySelector('h1')?.textContent).toContain('Bookshelf API');
    expect(root.querySelector('app-level-chip')?.textContent).toContain('Principiante');
    expect(root.querySelector('.meta')?.textContent).toContain('30 min');
    expect(root.textContent).toContain('Controllers');
    expect(root.textContent).toContain('Una API de libros');
    expect(root.querySelector('.markdown-body h1')?.textContent).toBe('Bienvenido');
  });

  it('lists the steps linking to the reader, with completion checks', async () => {
    const { open, progress } = setup();
    progress.toggle('bookshelf', 'b');

    const { root } = await open('bookshelf', 'x');
    const items = [...root.querySelectorAll('li.step')];

    expect(items).toHaveLength(2);
    expect(items[0].querySelector('a')?.getAttribute('href')).toBe('/tutorials/bookshelf/a');
    expect(items[0].querySelector('.step__done')).toBeNull();
    expect(items[1].querySelector('.step__done')).not.toBeNull();
  });

  it('offers "Empezar" linking to the first step', async () => {
    const { open } = setup();

    const { root } = await open('bookshelf', 'x');
    const cta = root.querySelector<HTMLAnchorElement>('a.cta')!;

    expect(cta.textContent).toContain('Empezar');
    expect(cta.getAttribute('href')).toBe('/tutorials/bookshelf/a');
  });

  it('offers "Continuar" linking to the last visited step', async () => {
    const { open, progress } = setup();
    progress.toggle('bookshelf', 'a');
    progress.setLastVisited('bookshelf', 'b');

    const { root } = await open('bookshelf', 'x');
    const cta = root.querySelector<HTMLAnchorElement>('a.cta')!;

    expect(cta.textContent).toContain('Continuar');
    expect(cta.getAttribute('href')).toBe('/tutorials/bookshelf/b');
  });

  it('shows a friendly message for an unknown tutorial', async () => {
    const { open, http } = setup();

    const { root } = await open('nope');

    expect(root.querySelector('.not-found')?.textContent).toContain('No encontramos');
    http.verify();
  });

  it('shows a coming-soon message instead of content for unreleased tutorials', async () => {
    const { open, http } = setup();

    const { root } = await open('later');

    expect(root.querySelector('.not-found')?.textContent).toContain('Próximamente');
    http.verify();
  });
});
