import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Friendly empty/error state with a way back to the catalog. */
@Component({
  selector: 'app-not-found-message',
  imports: [RouterLink],
  template: `
    <section class="not-found">
      <span class="material-symbols-outlined not-found__icon" aria-hidden="true">{{ icon() }}</span>
      <h1>{{ heading() }}</h1>
      <p>{{ message() }}</p>
      <a class="not-found__link" routerLink="/">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        Volver al catálogo
      </a>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .not-found {
      max-width: 34rem;
      margin: 0 auto;
      padding: 4rem 1.25rem;
      text-align: center;
    }
    .not-found__icon {
      font-size: 3.5rem;
      color: var(--mat-sys-primary);
    }
    h1 {
      margin: 0.75rem 0 0.5rem;
      font-size: 1.8rem;
    }
    p {
      margin: 0 0 1.5rem;
      line-height: 1.6;
      color: var(--mat-sys-on-surface-variant);
    }
    .not-found__link {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.6rem 1.2rem;
      border-radius: 999px;
      background: var(--mat-sys-primary);
      color: var(--mat-sys-on-primary);
      font-weight: 600;
      text-decoration: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundMessage {
  readonly heading = input('No encontramos lo que buscas');
  readonly message = input('Revisa la dirección o vuelve al catálogo para elegir un tutorial.');
  readonly icon = input('explore_off');
}
