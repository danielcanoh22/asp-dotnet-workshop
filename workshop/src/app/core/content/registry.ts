import { BOOKSHELF_API } from './manifests/bookshelf-api.manifest';
import { COMING_SOON } from './manifests/coming-soon.manifests';
import { TASK_TRACKER_API } from './manifests/task-tracker-api.manifest';
import { TutorialManifest } from './tutorial.model';

/**
 * Single registration point. To add a tutorial:
 *   1. create `public/tutorials/<slug>/` with `overview.md` and the step files,
 *   2. create its manifest in `./manifests/`,
 *   3. add ONE line to this array.
 */
export const TUTORIAL_REGISTRY: readonly TutorialManifest[] = [
  BOOKSHELF_API,
  TASK_TRACKER_API,
  ...COMING_SOON,
];

function duplicates(values: readonly (string | number)[]): (string | number)[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

/** Returns human-readable problems; an empty array means the manifests are consistent. */
export function validateManifests(manifests: readonly TutorialManifest[]): string[] {
  const problems: string[] = [];

  for (const slug of new Set(duplicates(manifests.map((m) => m.slug)))) {
    problems.push(`Duplicated slug: ${slug}`);
  }
  for (const number of new Set(duplicates(manifests.map((m) => m.number)))) {
    problems.push(`Duplicated number: ${number}`);
  }

  for (const manifest of manifests) {
    for (const id of new Set(duplicates(manifest.steps.map((s) => s.id)))) {
      problems.push(`${manifest.slug}: duplicated step id ${id}`);
    }
    for (const file of new Set(duplicates(manifest.steps.map((s) => s.file)))) {
      problems.push(`${manifest.slug}: duplicated step file ${file}`);
    }
    if (manifest.status === 'available' && manifest.steps.length === 0) {
      problems.push(`${manifest.slug}: an available tutorial needs at least one step`);
    }
    if (manifest.status === 'coming-soon' && manifest.steps.length > 0) {
      problems.push(`${manifest.slug}: a coming-soon tutorial must not declare steps`);
    }
  }

  return problems;
}
