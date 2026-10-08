import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ContentService } from '../../core/content/content.service';
import { TutorialManifest } from '../../core/content/tutorial.model';
import { ProgressService, ProgressStatus } from '../../core/progress/progress.service';
import { TutorialCard } from './ui/tutorial-card';

interface CatalogEntry {
  readonly tutorial: TutorialManifest;
  readonly status: ProgressStatus;
  readonly percent: number;
  readonly minutes: number;
  readonly link: readonly string[];
}

/** Smart page: reads content and progress, hands plain data to the presentational cards. */
@Component({
  selector: 'app-catalog-page',
  imports: [TutorialCard],
  templateUrl: './catalog.page.html',
  styleUrl: './catalog.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPage {
  private readonly content = inject(ContentService);
  private readonly progress = inject(ProgressService);

  protected readonly entries = computed<CatalogEntry[]>(() =>
    this.content.getAll().map((tutorial) => {
      const total = tutorial.steps.length;
      const ids = tutorial.steps.map((s) => s.id);
      // Reading the signal registers the dependency so cards refresh when progress changes.
      this.progress.completedSteps(tutorial.slug)();

      const status = this.progress.status(tutorial.slug, total, ids);
      const last = this.progress.lastVisited(tutorial.slug);
      const resumeStep = status === 'in-progress' && last && ids.includes(last) ? last : undefined;

      return {
        tutorial,
        status,
        percent: this.progress.percentage(tutorial.slug, total, ids),
        minutes: this.content.getTotalMinutes(tutorial),
        link: resumeStep ? ['/tutorials', tutorial.slug, resumeStep] : ['/tutorials', tutorial.slug],
      };
    }),
  );
}
