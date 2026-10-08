import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, ResolveFn, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { ContentService } from './content.service';

export const APP_TITLE = 'ASP.NET Core Workshop';

/** Route `title` resolver for `/tutorials/:slug`. */
export const tutorialTitle: ResolveFn<string> = (route: ActivatedRouteSnapshot) => {
  const tutorial = inject(ContentService).getBySlug(route.paramMap.get('slug') ?? '');
  return tutorial?.title ?? 'Tutorial no encontrado';
};

/** Route `title` resolver for `/tutorials/:slug/:stepId`. */
export const stepTitle: ResolveFn<string> = (route: ActivatedRouteSnapshot) => {
  const content = inject(ContentService);
  const slug = route.paramMap.get('slug') ?? '';
  const step = content.getStep(slug, route.paramMap.get('stepId') ?? '');
  const tutorial = content.getBySlug(slug);
  return step && tutorial ? `${step.title} · ${tutorial.title}` : 'Paso no encontrado';
};

/** Appends the application name to every page title. */
@Injectable({ providedIn: 'root' })
export class WorkshopTitleStrategy extends TitleStrategy {
  protected readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    this.title.setTitle(pageTitle ? `${pageTitle} · ${APP_TITLE}` : APP_TITLE);
  }
}
