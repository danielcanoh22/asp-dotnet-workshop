import { SecurityContext } from '@angular/core';
import { MARKED_EXTENSIONS, SANITIZE, provideMarkdown } from 'ngx-markdown';
import { workshopMarkdownExtension } from './markdown-blocks';
import './prism-setup';

export function provideWorkshopMarkdown() {
  return provideMarkdown({
    markedExtensions: [{ provide: MARKED_EXTENSIONS, useValue: workshopMarkdownExtension, multi: true }],
    // Sanitization is disabled on purpose: all Markdown is authored by us and shipped as static assets
    // (public/tutorials). It is never user input, and the sanitizer would strip the <details>, <aside>,
    // <button> and class attributes that the custom blocks and the copy buttons rely on.
    sanitize: { provide: SANITIZE, useValue: SecurityContext.NONE },
  });
}
