import { ProgressStatus } from './progress.service';

export const STATUS_LABELS: Record<ProgressStatus, string> = {
  new: 'Nuevo',
  'in-progress': 'En curso',
  completed: 'Completado',
};

export const CTA_LABELS: Record<ProgressStatus, string> = {
  new: 'Empezar',
  'in-progress': 'Continuar',
  completed: 'Revisar',
};
