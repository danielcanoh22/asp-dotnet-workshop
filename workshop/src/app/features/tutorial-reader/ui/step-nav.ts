import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import { TutorialManifest } from '../../../core/content/tutorial.model';

/** Presentational table of contents: steps with numbers, check marks and overall progress. */
@Component({
  selector: 'app-step-nav',
  imports: [RouterLink, MatProgressBarModule],
  templateUrl: './step-nav.html',
  styleUrl: './step-nav.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepNav {
  readonly tutorial = input.required<TutorialManifest>();
  readonly currentId = input<string>();
  readonly completed = input<readonly string[]>([]);
  readonly percent = input(0);
  /** Emitted when a step link is chosen (lets the host close a mobile drawer). */
  readonly picked = output<void>();
}
