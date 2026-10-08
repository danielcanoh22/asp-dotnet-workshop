import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideWorkshopMarkdown } from './core/content/markdown.providers';
import { WorkshopTitleStrategy } from './core/content/route-titles';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ anchorScrolling: 'enabled' })),
    { provide: TitleStrategy, useExisting: WorkshopTitleStrategy },
    provideHttpClient(withFetch()),
    provideWorkshopMarkdown(),
  ],
};
