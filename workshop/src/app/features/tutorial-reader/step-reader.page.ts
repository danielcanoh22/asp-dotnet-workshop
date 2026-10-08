import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatSidenavContent, MatSidenavModule } from '@angular/material/sidenav';
import { RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ContentService } from '../../core/content/content.service';
import { ProgressService } from '../../core/progress/progress.service';
import { formatMinutes } from '../../shared/format/duration';
import { MarkdownView } from '../../shared/ui/markdown-view/markdown-view';
import { NotFoundMessage } from '../../shared/ui/not-found-message/not-found-message';
import { StepNav } from './ui/step-nav';

/** Smart page for `/tutorials/:slug/:stepId`: sidebar TOC, rendered step, completion and navigation. */
@Component({
  selector: 'app-step-reader-page',
  imports: [RouterLink, MatButtonModule, MatSidenavModule, MarkdownView, NotFoundMessage, StepNav],
  templateUrl: './step-reader.page.html',
  styleUrl: './step-reader.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StepReaderPage {
  private readonly content = inject(ContentService);
  private readonly progress = inject(ProgressService);

  readonly slug = input.required<string>();
  readonly stepId = input.required<string>();

  protected readonly tutorial = computed(() => {
    const tutorial = this.content.getBySlug(this.slug());
    return tutorial?.status === 'available' ? tutorial : undefined;
  });
  protected readonly step = computed(() => (this.tutorial() ? this.content.getStep(this.slug(), this.stepId()) : undefined));
  protected readonly stepNumber = computed(() => this.content.getStepNumber(this.slug(), this.stepId()) ?? 0);
  protected readonly total = computed(() => this.tutorial()?.steps.length ?? 0);
  protected readonly neighbours = computed(() => this.content.getNeighbours(this.slug(), this.stepId()));
  protected readonly minutes = computed(() => formatMinutes(this.step()?.estimatedMinutes ?? 0));

  protected readonly completedIds = computed(() => this.progress.completedSteps(this.slug())());
  protected readonly isDone = computed(() => this.completedIds().includes(this.stepId()));
  protected readonly percent = computed(() => {
    this.completedIds();
    const steps = this.tutorial()?.steps ?? [];
    return this.progress.percentage(this.slug(), steps.length, steps.map((s) => s.id));
  });

  protected readonly markdown = rxResource({
    params: () => (this.step() ? { slug: this.slug(), stepId: this.stepId() } : undefined),
    stream: ({ params }) => this.content.loadStep(params.slug, params.stepId),
  });

  // Responsive drawer: persistent sidebar on wide screens, overlay on mobile.
  protected readonly isMobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 959.98px)')
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );
  protected readonly navOpen = signal(true);

  private readonly scroller = viewChild(MatSidenavContent);

  constructor() {
    effect(() => this.navOpen.set(!this.isMobile()));

    effect(() => {
      const step = this.step();
      if (step) untracked(() => this.progress.setLastVisited(this.slug(), step.id));
    });

    // The sidenav content is the scroll container, so reset it when the step changes.
    effect(() => {
      this.stepId();
      const scroller = this.scroller();
      if (scroller) scroller.getElementRef().nativeElement.scrollTop = 0;
    });
  }

  protected toggleDone(): void {
    this.progress.toggle(this.slug(), this.stepId());
  }

  protected closeNavOnMobile(): void {
    if (this.isMobile()) this.navOpen.set(false);
  }
}
