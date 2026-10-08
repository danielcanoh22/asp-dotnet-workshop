import { ChangeDetectionStrategy, Component } from '@angular/core';
import { NotFoundMessage } from '../../shared/ui/not-found-message/not-found-message';

@Component({
  selector: 'app-not-found-page',
  imports: [NotFoundMessage],
  template: `<app-not-found-message heading="Página no encontrada" message="No encontramos la página que buscas." />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
