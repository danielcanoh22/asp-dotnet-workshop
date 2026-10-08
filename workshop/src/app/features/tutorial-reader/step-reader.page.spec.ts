import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TUTORIAL_MANIFESTS } from '../../core/content/content.service';
import { provideWorkshopMarkdown } from '../../core/content/markdown.providers';
import { TutorialManifest } from '../../core/content/tutorial.model';
import { PROGRESS_STORAGE, ProgressService } from '../../core/progress/progress.service';
import { StepReaderPage } from './step-reader.page';

const TUTORIAL: TutorialManifest = {
  slug: 'bookshelf',
  number: 1,
  title: 'Bookshelf API',
  subtitle: 'Sub',
  summary: 'Summary',
  level: 'beginner',
  estimatedMinutes: 0,
  topics: [],
  status: 'available',
  steps: [
    { id: 'a', title: 'Primer paso', file: '01-a.md', estimatedMinutes: 10 },
    { id: 'b', title: 'Segundo paso', file: '02-b.md', estimatedMinutes: 20 },
    { id: 'c', title: 'Tercer paso', file: '03-c.md', estimatedMinutes: 15 },
  ],
};

function setup() {
  TestBed.configureTestingModule({
    imports: [StepReaderPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideWorkshopMarkdown(),
      { provide: TUTORIAL_MANIFESTS, useValue: [TUTORIAL] },
      { provide: PROGRESS_STORAGE, useValue: null },
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const progress = TestBed.inject(ProgressService);

  async function open(slug: string, stepId: string, markdown?: string) {
    const fixture = TestBed.createComponent(StepReaderPage);
    fixture.componentRef.setInput('slug', slug);
    fixture.componentRef.setInput('stepId', stepId);
    fixture.detectChanges();
    TestBed.tick();
    if (markdown !== undefined) {
      const file = TUTORIAL.steps.find((s) => s.id === stepId)!.file;
      http.expectOne(`tutorials/${slug}/${file}`).flush(markdown);
    }
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  return { open, http, progress };
}

describe('StepReaderPage', () => {
  it('shows the step position, duration and the rendered markdown', async () => {
    const { open } = setup();

    const { root } = await open('bookshelf', 'b', '# Hola\n\n:::tip\nConsejo\n:::');

    expect(root.querySelector('.reader__position')?.textContent).toContain('Paso 2 de 3');
    expect(root.querySelector('.reader__minutes')?.textContent).toContain('20 min');
    expect(root.querySelector('.markdown-body h1')?.textContent).toBe('Hola');
    expect(root.querySelector('aside.callout--tip')).not.toBeNull();
  });

  it('records the step as last visited', async () => {
    const { open, progress } = setup();

    await open('bookshelf', 'b', 'x');

    expect(progress.lastVisited('bookshelf')).toBe('b');
  });

  it('lists every step in the sidebar with the current one marked', async () => {
    const { open } = setup();

    const { root } = await open('bookshelf', 'b', 'x');
    const items = [...root.querySelectorAll('app-step-nav a.step-link')];

    expect(items).toHaveLength(3);
    expect(items[0].getAttribute('href')).toBe('/tutorials/bookshelf/a');
    expect(items[1].getAttribute('aria-current')).toBe('step');
    expect(items[0].getAttribute('aria-current')).toBeNull();
  });

  it('toggles completion from the footer and reflects it in the sidebar', async () => {
    const { open, progress } = setup();
    const { fixture, root } = await open('bookshelf', 'a', 'x');
    const toggle = root.querySelector<HTMLButtonElement>('.complete-toggle')!;

    expect(toggle.textContent).toContain('Marcar como completado');

    toggle.click();
    await fixture.whenStable();

    expect(progress.isCompleted('bookshelf', 'a')).toBe(true);
    expect(toggle.textContent).toContain('Completado');
    expect(root.querySelector('app-step-nav .step-link .step-link__check')).not.toBeNull();
    expect(root.querySelector('app-step-nav .nav__percent')?.textContent).toContain('33%');

    toggle.click();
    await fixture.whenStable();

    expect(progress.isCompleted('bookshelf', 'a')).toBe(false);
  });

  it('offers previous and next steps', async () => {
    const { open } = setup();

    const { root } = await open('bookshelf', 'b', 'x');

    expect(root.querySelector('a.nav-prev')?.getAttribute('href')).toBe('/tutorials/bookshelf/a');
    expect(root.querySelector('a.nav-next')?.getAttribute('href')).toBe('/tutorials/bookshelf/c');
  });

  it('hides "previous" on the first step', async () => {
    const { open } = setup();

    const { root } = await open('bookshelf', 'a', 'x');

    expect(root.querySelector('a.nav-prev')).toBeNull();
    expect(root.querySelector('a.nav-next')).not.toBeNull();
  });

  it('replaces "next" with a link back to the overview on the last step', async () => {
    const { open } = setup();

    const { root } = await open('bookshelf', 'c', 'x');

    expect(root.querySelector('a.nav-next')).toBeNull();
    expect(root.querySelector('a.nav-finish')?.getAttribute('href')).toBe('/tutorials/bookshelf');
  });

  it('shows a friendly message for an unknown step without requesting content', async () => {
    const { open, http } = setup();

    const { root } = await open('bookshelf', 'nope');

    expect(root.querySelector('.not-found')?.textContent).toContain('No encontramos');
    expect(root.querySelector('.not-found a')?.getAttribute('href')).toBe('/');
    http.verify();
  });

  it('shows a friendly message for an unknown tutorial', async () => {
    const { open, http } = setup();

    const { root } = await open('nope', 'a');

    expect(root.querySelector('.not-found')).not.toBeNull();
    http.verify();
  });

  it('shows an error message when the content fails to load', async () => {
    const { open, http } = setup();
    const fixture = TestBed.createComponent(StepReaderPage);
    fixture.componentRef.setInput('slug', 'bookshelf');
    fixture.componentRef.setInput('stepId', 'a');
    fixture.detectChanges();
    TestBed.tick();

    http.expectOne('tutorials/bookshelf/01-a.md').flush('missing', { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).querySelector('.load-error')?.textContent).toContain('No se pudo cargar');
    expect(open).toBeDefined();
  });
});
