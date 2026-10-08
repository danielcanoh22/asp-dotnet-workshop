import { Title } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_TITLE = 'ASP.NET Core Workshop';

export function tutorialTitle(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): string {
  return '';
}
export function stepTitle(_route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): string {
  return '';
}
export class WorkshopTitleStrategy extends TitleStrategy {
  protected readonly title = {} as Title;
  override updateTitle(_snapshot: RouterStateSnapshot): void {}
}
