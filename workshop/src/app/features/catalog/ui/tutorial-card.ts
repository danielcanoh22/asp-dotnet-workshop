import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TutorialManifest } from '../../../core/content/tutorial.model';
import { CTA_LABELS, STATUS_LABELS } from '../../../core/progress/progress-labels';
import { ProgressStatus } from '../../../core/progress/progress.service';
import { formatMinutes } from '../../../shared/format/duration';
import { LevelChip } from '../../../shared/ui/level-chip/level-chip';

/** Presentational card: everything arrives through inputs, it owns no state or services. */
@Component({
  selector: 'app-tutorial-card',
  imports: [RouterLink, MatProgressBarModule, LevelChip],
  templateUrl: './tutorial-card.html',
  styleUrl: './tutorial-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorialCard {
  readonly tutorial = input.required<TutorialManifest>();
  readonly status = input<ProgressStatus>('new');
  readonly percent = input(0);
  readonly minutes = input(0);
  /** Router commands for the call to action. */
  readonly link = input<readonly string[]>([]);

  protected readonly available = computed(() => this.tutorial().status === 'available');
  protected readonly numberLabel = computed(() => String(this.tutorial().number).padStart(2, '0'));
  protected readonly duration = computed(() => formatMinutes(this.minutes()));
  protected readonly statusLabel = computed(() => STATUS_LABELS[this.status()]);
  protected readonly ctaLabel = computed(() => CTA_LABELS[this.status()]);
}
