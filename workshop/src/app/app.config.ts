import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, SecurityContext, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { MARKED_EXTENSIONS, SANITIZE, provideMarkdown } from 'ngx-markdown';
import { workshopMarkdownExtension } from './core/content/markdown-blocks';
import './core/content/prism-setup';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    provideHttpClient(withFetch()),
    provideMarkdown({
      markedExtensions: [{ provide: MARKED_EXTENSIONS, useValue: workshopMarkdownExtension, multi: true }],
      // Sanitization is disabled on purpose: all Markdown is authored by us and shipped as static assets
      // (public/tutorials). It is never user input, and the sanitizer would strip the <details>, <aside>,
      // <button> and class attributes that the custom blocks and the copy buttons rely on.
      sanitize: { provide: SANITIZE, useValue: SecurityContext.NONE },
    }),
  ],
};
