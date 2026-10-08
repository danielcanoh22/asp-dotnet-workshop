import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MarkdownComponent } from 'ngx-markdown';
import { handleCodeCopyClick } from '../../../core/content/code-copy';

/** Renders tutorial Markdown (custom blocks + Prism) and wires the code copy buttons by event delegation. */
@Component({
  selector: 'app-markdown-view',
  imports: [MarkdownComponent],
  template: `<markdown class="markdown-body" [data]="content()" (click)="onClick($event)" (ready)="rendered.emit()" />`,
  styles: `
    :host {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarkdownView {
  readonly content = input.required<string>();
  /** Emits after each render, once the HTML is in the DOM. */
  readonly rendered = output<void>();

  protected onClick(event: Event): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      handleCodeCopyClick(event, navigator.clipboard);
    }
  }
}
