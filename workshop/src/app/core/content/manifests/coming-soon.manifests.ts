import { TutorialManifest } from '../tutorial.model';

function comingSoon(
  number: number,
  slug: string,
  title: string,
  subtitle: string,
  level: TutorialManifest['level'],
  topics: string[],
): TutorialManifest {
  return {
    slug,
    number,
    title,
    subtitle,
    summary: subtitle,
    level,
    estimatedMinutes: 0,
    topics,
    status: 'coming-soon',
    steps: [],
  };
}

export const COMING_SOON: readonly TutorialManifest[] = [
  comingSoon(
    4,
    'clean-architecture',
    'Clean Architecture en ASP.NET Core',
    'Capas, dependencias y casos de uso bien separados',
    'intermediate',
    ['Clean Architecture', 'Use cases', 'Repositories'],
  ),
  comingSoon(
    5,
    'testing-xunit',
    'Testing: xUnit y WebApplicationFactory',
    'Pruebas unitarias y de integración para tu API',
    'intermediate',
    ['xUnit', 'WebApplicationFactory', 'Integration tests'],
  ),
  comingSoon(
    6,
    'jwt-authentication',
    'Autenticación con JWT',
    'Protege tu API con tokens y políticas de autorización',
    'advanced',
    ['JWT', 'Authentication', 'Authorization'],
  ),
  comingSoon(
    7,
    'pagination-caching-versioning',
    'Paginación, caching y versionado',
    'Hazla escalable y evolutiva',
    'advanced',
    ['Pagination', 'Caching', 'API versioning'],
  ),
];
