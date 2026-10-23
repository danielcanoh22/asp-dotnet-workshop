import { TutorialManifest, TutorialStep } from '../tutorial.model';

function step(number: number, id: string, title: string, estimatedMinutes: number): TutorialStep {
  const prefix = String(number).padStart(2, '0');
  return { id, title, file: `${prefix}-${id}.md`, estimatedMinutes };
}

export const ADVANCED_VALIDATION_ERRORS: TutorialManifest = {
  slug: 'advanced-validation-errors',
  number: 3,
  title: 'Validación avanzada y manejo de errores',
  subtitle: 'Reglas de negocio, FluentValidation y respuestas consistentes',
  summary:
    'Evoluciona el Task Tracker para que cada error tenga una respuesta clara: validación con FluentValidation, ' +
    'reglas de negocio, manejadores globales de excepciones, errores de base de datos y concurrencia optimista.',
  level: 'intermediate',
  estimatedMinutes: 350,
  topics: ['FluentValidation', 'ProblemDetails', 'Exception handling', 'Business rules', 'Concurrency'],
  status: 'available',
  whatYouWillBuild:
    'El Task Tracker del tutorial 2 con validación en FluentValidation aplicada por un endpoint filter, ' +
    'ProblemDetails consistentes con códigos de error estables, reglas de negocio que responden 409, ' +
    'manejadores de excepciones para errores inesperados y de base de datos, y detección de actualizaciones perdidas ' +
    'con concurrencia optimista.',
  steps: [
    step(1, 'error-taxonomy', 'Tipos de errores en una API', 15),
    step(2, 'starting-point-audit', 'Punto de partida: auditar los errores actuales', 20),
    step(3, 'limits-of-data-annotations', 'Los límites de las DataAnnotations', 25),
    step(4, 'fluentvalidation-basics', 'Primeros pasos con FluentValidation', 35),
    step(5, 'validation-endpoint-filter', 'Validación automática con un endpoint filter', 30),
    step(6, 'advanced-rules', 'Reglas avanzadas y reutilizables', 35),
    step(7, 'consistent-problem-details', 'ProblemDetails consistentes', 25),
    step(8, 'business-rules', 'Reglas de negocio', 35),
    step(9, 'global-exception-handler', 'Manejador global de excepciones', 35),
    step(10, 'database-errors', 'Errores de base de datos', 30),
    step(11, 'optimistic-concurrency', 'Concurrencia optimista', 40),
    step(12, 'wrap-up', 'Catálogo de errores y cierre', 25),
  ],
};
