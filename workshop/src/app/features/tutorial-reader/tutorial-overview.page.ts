import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ContentService } from '../../core/content/content.service';
import { CTA_LABELS } from '../../core/progress/progress-labels';
import { ProgressService } from '../../core/progress/progress.service';
import { formatMinutes } from '../../shared/format/duration';
import { LevelChip } from '../../shared/ui/level-chip/level-chip';
import { MarkdownView } from '../../shared/ui/markdown-view/markdown-view';
import { NotFoundMessage } from '../../shared/ui/not-found-message/not-found-message';

/** Smart page for `/tutorials/:slug`: metadata, step list and the tutorial's `overview.md`. */
@Component({
  selector: 'app-tutorial-overview-page',
  imports: [RouterLink, LevelChip, MarkdownView, NotFoundMessage],
  templateUrl: './tutorial-overview.page.html',
  styleUrl: './tutorial-overview.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TutorialOverviewPage {
  private readonly content = inject(ContentService);
  private readonly progress = inject(ProgressService);

  readonly slug = input.required<string>();

  protected readonly manifest = computed(() => this.content.getBySlug(this.slug()));
  protected readonly available = computed(() => this.manifest()?.status === 'available');
  protected readonly duration = computed(() => {
    const manifest = this.manifest();
    return manifest ? formatMinutes(this.content.getTotalMinutes(manifest)) : '';
  });

  protected readonly completedIds = computed(() => this.progress.completedSteps(this.slug())());
  protected readonly percent = computed(() => {
    this.completedIds();
    const steps = this.manifest()?.steps ?? [];
    return this.progress.percentage(this.slug(), steps.length, steps.map((s) => s.id));
  });

  /** Where the main button leads: the last visited step when resuming, otherwise the first one. */
  protected readonly cta = computed(() => {
    const steps = this.manifest()?.steps ?? [];
    this.completedIds();
    const status = this.progress.status(this.slug(), steps.length, steps.map((s) => s.id));
    const last = this.progress.lastVisited(this.slug());
    const target = status === 'in-progress' && steps.some((s) => s.id === last) ? last : steps[0]?.id;
    return { label: CTA_LABELS[status], link: target ? ['/tutorials', this.slug(), target] : null };
  });

  protected readonly overview = rxResource({
    params: () => (this.available() ? this.slug() : undefined),
    stream: ({ params }) => this.content.loadOverview(params),
  });
}
