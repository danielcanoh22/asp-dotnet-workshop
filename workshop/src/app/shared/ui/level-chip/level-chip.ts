import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LEVEL_LABELS, TutorialLevel } from '../../../core/content/tutorial.model';

@Component({
  selector: 'app-level-chip',
  template: `<span class="material-symbols-outlined" aria-hidden="true">{{ icon() }}</span>{{ label() }}`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.65rem 0.2rem 0.45rem;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 600;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      white-space: nowrap;
    }
    .material-symbols-outlined {
      font-size: 1rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LevelChip {
  readonly level = input.required<TutorialLevel>();
  protected readonly label = computed(() => LEVEL_LABELS[this.level()]);
  protected readonly icon = computed(
    () => ({ beginner: 'signal_cellular_1_bar', intermediate: 'signal_cellular_3_bar', advanced: 'signal_cellular_4_bar' })[this.level()],
  );
}
