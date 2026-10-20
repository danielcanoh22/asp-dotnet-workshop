import { TutorialManifest, TutorialStep } from '../tutorial.model';

function step(number: number, id: string, title: string, estimatedMinutes: number): TutorialStep {
  const prefix = String(number).padStart(2, '0');
  return { id, title, file: `${prefix}-${id}.md`, estimatedMinutes };
}

export const TASK_TRACKER_API: TutorialManifest = {
  slug: 'task-tracker-api',
  number: 2,
  title: 'Task Tracker API: Minimal APIs + EF Core + SQLite',
  subtitle: 'Una base de datos real y endpoints más ligeros',
  summary:
    'Construye una API de gestión de tareas con Minimal APIs y una base de datos SQLite real: ' +
    'modela relaciones con Entity Framework Core, evoluciona el esquema con migraciones y escribe consultas eficientes.',
  level: 'beginner',
  estimatedMinutes: 420,
  topics: ['Minimal APIs', 'EF Core', 'SQLite', 'Migrations', 'Relationships', 'LINQ'],
  status: 'available',
  whatYouWillBuild:
    'Una API de proyectos, tareas y etiquetas con Minimal APIs, persistida en SQLite con EF Core: relaciones uno a muchos ' +
    'y muchos a muchos, migraciones, filtros y ordenación, validación integrada, operaciones masivas, datos de ejemplo ' +
    'y documentación con OpenAPI y Scalar.',
  steps: [
    step(1, 'from-controllers-to-minimal-apis', 'De controllers a Minimal APIs', 15),
    step(2, 'create-project', 'Crear el proyecto en Visual Studio 2026', 20),
    step(3, 'first-endpoints', 'Tus primeros endpoints', 30),
    step(4, 'route-groups-typed-results', 'Route groups y TypedResults', 25),
    step(5, 'orm-and-efcore', '¿Qué es un ORM? Entity Framework Core', 20),
    step(6, 'dbcontext-and-entities', 'DbContext y entidades', 30),
    step(7, 'migrations', 'Migraciones: del modelo a la base de datos', 30),
    step(8, 'projects-crud', 'CRUD de proyectos con EF Core', 40),
    step(9, 'one-to-many-tasks', 'Relación uno a muchos: tareas', 40),
    step(10, 'task-endpoints-queries', 'Endpoints de tareas y consultas', 40),
    step(11, 'many-to-many-tags', 'Relación muchos a muchos: etiquetas', 40),
    step(12, 'validation', 'Validación integrada en Minimal APIs', 30),
    step(13, 'bulk-ops-seeding', 'Operaciones masivas y datos de ejemplo', 30),
    step(14, 'performance-docs-wrap-up', 'Rendimiento, documentación y cierre', 30),
  ],
};
