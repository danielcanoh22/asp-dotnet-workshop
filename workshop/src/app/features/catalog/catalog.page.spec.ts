import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TUTORIAL_MANIFESTS } from '../../core/content/content.service';
import { TutorialManifest } from '../../core/content/tutorial.model';
import { PROGRESS_STORAGE, ProgressService } from '../../core/progress/progress.service';
import { CatalogPage } from './catalog.page';

const AVAILABLE: TutorialManifest = {
  slug: 'bookshelf',
  number: 1,
  title: 'Bookshelf API',
  subtitle: 'Primera API',
  summary: 'Resumen',
  level: 'beginner',
  estimatedMinutes: 0,
  topics: ['Controllers', 'DI'],
  status: 'available',
  steps: [
    { id: 'a', title: 'A', file: '01-a.md', estimatedMinutes: 10 },
    { id: 'b', title: 'B', file: '02-b.md', estimatedMinutes: 20 },
  ],
};

const SOON: TutorialManifest = {
  slug: 'later',
  number: 2,
  title: 'Más adelante',
  subtitle: 'Sub',
  summary: 'Sub',
  level: 'advanced',
  estimatedMinutes: 0,
  topics: ['JWT'],
  status: 'coming-soon',
  steps: [],
};

async function render() {
  TestBed.configureTestingModule({
    imports: [CatalogPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: TUTORIAL_MANIFESTS, useValue: [SOON, AVAILABLE] },
      { provide: PROGRESS_STORAGE, useValue: null },
    ],
  });
  const fixture = TestBed.createComponent(CatalogPage);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, progress: TestBed.inject(ProgressService) };
}

describe('CatalogPage', () => {
  it('shows the hero with the workshop description', async () => {
    const { root } = await render();

    expect(root.querySelector('h1')?.textContent).toContain('ASP.NET Core');
    expect(root.querySelector('.hero')?.textContent).toContain('Visual Studio');
  });

  it('renders one card per tutorial, ordered by number', async () => {
    const { root } = await render();
    const titles = [...root.querySelectorAll('app-tutorial-card .card__title')].map((el) => el.textContent?.trim());

    expect(titles).toEqual(['Bookshelf API', 'Más adelante']);
  });

  it('shows number, level, duration and topics on an available card', async () => {
    const { root } = await render();
    const card = root.querySelector('app-tutorial-card')!;

    expect(card.querySelector('.card__number')?.textContent?.trim()).toBe('01');
    expect(card.querySelector('.card__level')?.textContent).toContain('Principiante');
    expect(card.textContent).toContain('30 min');
    expect(card.textContent).toContain('Controllers');
    expect(card.textContent).toContain('DI');
  });

  it('links an available card to its overview with the "Empezar" call to action', async () => {
    const { root } = await render();
    const link = root.querySelector<HTMLAnchorElement>('app-tutorial-card a.card__link')!;

    expect(link.getAttribute('href')).toBe('/tutorials/bookshelf');
    expect(link.textContent).toContain('Empezar');
    expect(root.querySelector('app-tutorial-card')?.textContent).toContain('Nuevo');
  });

  it('marks a coming-soon card as muted, labelled and not clickable', async () => {
    const { root } = await render();
    const card = root.querySelectorAll('app-tutorial-card')[1];

    expect(card.querySelector('.card')?.classList.contains('card--soon')).toBe(true);
    expect(card.textContent).toContain('Próximamente');
    expect(card.querySelector('a')).toBeNull();
  });

  it('shows "Continuar" and progress once a step is completed', async () => {
    const { fixture, root, progress } = await render();

    progress.toggle('bookshelf', 'a');
    progress.setLastVisited('bookshelf', 'b');
    await fixture.whenStable();

    const card = root.querySelector('app-tutorial-card')!;
    expect(card.textContent).toContain('En curso');
    expect(card.textContent).toContain('50%');
    expect(card.querySelector('a.card__link')?.textContent).toContain('Continuar');
    expect(card.querySelector('a.card__link')?.getAttribute('href')).toBe('/tutorials/bookshelf/b');
  });

  it('shows "Revisar" when every step is completed', async () => {
    const { fixture, root, progress } = await render();

    progress.toggle('bookshelf', 'a');
    progress.toggle('bookshelf', 'b');
    await fixture.whenStable();

    const card = root.querySelector('app-tutorial-card')!;
    expect(card.textContent).toContain('Completado');
    expect(card.querySelector('a.card__link')?.textContent).toContain('Revisar');
    expect(card.querySelector('a.card__link')?.getAttribute('href')).toBe('/tutorials/bookshelf');
  });
});
