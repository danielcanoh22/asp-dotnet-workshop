import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { THEME_STORAGE, SYSTEM_PREFERS_DARK } from './core/theme/theme.service';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: THEME_STORAGE, useValue: null },
        { provide: SYSTEM_PREFERS_DARK, useValue: () => false },
      ],
    }).compileComponents();
  });

  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  it('renders the brand linking to the catalog', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const brand = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a.brand');

    expect(brand?.textContent).toContain('ASP.NET Core Workshop');
    expect(brand?.getAttribute('href')).toBe('/');
  });

  it('toggles the theme from the toolbar button', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.theme-toggle')!;

    expect(button.getAttribute('aria-label')).toBe('Cambiar a tema oscuro');

    button.click();
    await fixture.whenStable();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(button.getAttribute('aria-label')).toBe('Cambiar a tema claro');
  });
});
