import { Routes } from '@angular/router';
import { stepTitle, tutorialTitle } from './core/content/route-titles';

export const routes: Routes = [
  {
    path: '',
    title: 'Catálogo',
    loadComponent: () => import('./features/catalog/catalog.page').then((m) => m.CatalogPage),
  },
  {
    path: 'tutorials/:slug',
    title: tutorialTitle,
    loadComponent: () =>
      import('./features/tutorial-reader/tutorial-overview.page').then((m) => m.TutorialOverviewPage),
  },
  {
    path: 'tutorials/:slug/:stepId',
    title: stepTitle,
    loadComponent: () =>
      import('./features/tutorial-reader/step-reader.page').then((m) => m.StepReaderPage),
  },
  {
    path: '**',
    title: 'Página no encontrada',
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
