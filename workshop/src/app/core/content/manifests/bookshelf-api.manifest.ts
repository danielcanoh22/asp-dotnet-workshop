import { TutorialManifest, TutorialStep } from '../tutorial.model';

function step(number: number, id: string, title: string, estimatedMinutes: number): TutorialStep {
  const prefix = String(number).padStart(2, '0');
  return { id, title, file: `${prefix}-${id}.md`, estimatedMinutes };
}

export const BOOKSHELF_API: TutorialManifest = {
  slug: 'bookshelf-api',
  number: 1,
  title: 'Bookshelf API: fundamentos de ASP.NET Core',
  subtitle: 'Construye tu primera Web API con controllers, DI y middleware',
  summary:
    'Aprende los pilares de ASP.NET Core construyendo una API REST para gestionar una biblioteca de libros: ' +
    'desde el pipeline HTTP hasta la validación y la documentación, entendiendo el porqué de cada pieza.',
  level: 'beginner',
  estimatedMinutes: 410,
  topics: ['Controllers', 'Routing', 'DI', 'Services', 'Middleware', 'Configuration', 'Validation'],
  status: 'available',
  whatYouWillBuild:
    'Una API REST completa de libros (CRUD) con persistencia en un archivo JSON, configuración tipada, ' +
    'validación con ProblemDetails, manejo global de errores, logging y documentación con OpenAPI y Scalar.',
  steps: [
    step(1, 'what-is-dotnet', '¿Qué es .NET y ASP.NET Core?', 15),
    step(2, 'create-project', 'Crear el proyecto en Visual Studio 2026', 20),
    step(3, 'project-tour', 'Recorrido por el proyecto', 15),
    step(4, 'http-basics', 'HTTP en 10 minutos', 15),
    step(5, 'host-and-builder', 'El host: de CreateBuilder a app.Run()', 20),
    step(6, 'middleware-pipeline', 'Middleware y el pipeline HTTP', 25),
    step(7, 'first-controller', 'Tu primer modelo y controller', 30),
    step(8, 'dependency-injection', 'Inyección de dependencias', 40),
    step(9, 'json-repository', 'Persistencia en un archivo JSON', 40),
    step(10, 'configuration-options', 'Configuración y Options pattern', 25),
    step(11, 'model-binding-dtos', 'Model binding, DTOs y crear libros', 35),
    step(12, 'validation', 'Validación y ProblemDetails', 25),
    step(13, 'complete-crud', 'Completa el CRUD (retos)', 45),
    step(14, 'errors-logging', 'Manejo global de errores y logging', 30),
    step(15, 'api-docs-wrap-up', 'Documentación con OpenAPI + Scalar y cierre', 30),
  ],
};
