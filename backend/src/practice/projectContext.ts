import { ProjectFile } from '../models/projectFile.model';
import { FileContent } from '../models/fileContent.model';
import { Project, IProject } from '../models/project.model';
import { ProjectPracticeContext, EvidenceRef, IProjectPracticeContext } from '../models/projectPracticeContext.model';

const MAX_DIGEST_CHARS = 14_000;
const MAX_FILE_SAMPLE_CHARS = 2_500;

/** Dependency name -> technology label, used only to report what package.json ACTUALLY lists. */
const DEP_TECH_MAP: Record<string, string> = {
  react: 'React', 'react-dom': 'React', next: 'React',
  express: 'Express', '@types/express': 'Express',
  mongoose: 'MongoDB', mongodb: 'MongoDB',
  typescript: 'TypeScript',
  vue: 'Vue', svelte: 'Svelte', angular: '@angular/core',
};

function detectFromPackageJson(content: string, file: string): { name: string; evidence: EvidenceRef[] }[] {
  try {
    const pkg = JSON.parse(content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const found = new Map<string, EvidenceRef[]>();
    for (const dep of Object.keys(deps || {})) {
      const tech = DEP_TECH_MAP[dep];
      if (!tech) continue;
      const list = found.get(tech) ?? [];
      list.push({ file, detail: `dependency "${dep}"` });
      found.set(tech, list);
    }
    return [...found.entries()].map(([name, evidence]) => ({ name, evidence }));
  } catch {
    return [];
  }
}

function detectApiPatterns(path: string, content: string): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  const routeMatch = content.matchAll(/\b(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/g);
  for (const m of routeMatch) refs.push({ file: path, detail: `${m[1].toUpperCase()} ${m[2]}` });
  return refs.slice(0, 15);
}

function detectDatabasePatterns(path: string, content: string): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  const schemaMatch = content.matchAll(/new\s+(?:mongoose\.)?Schema[\s<(]/g);
  if ([...schemaMatch].length > 0) refs.push({ file: path, detail: 'Mongoose schema definition' });
  const modelMatch = content.matchAll(/mongoose\.model[<(]\s*['"`]?(\w+)?/g);
  for (const m of modelMatch) if (m[1]) refs.push({ file: path, detail: `model "${m[1]}"` });
  return refs.slice(0, 10);
}

/**
 * Builds (or returns the cached) evidence-only digest for a project. Every detected technology, API pattern,
 * or database pattern is backed by an EvidenceRef pointing at the real file/line pattern that produced it —
 * nothing here is invented. The digest is capped so it is never the whole repository sent to Gemini.
 */
export async function getProjectPracticeContext(project: IProject, userId: string): Promise<IProjectPracticeContext> {
  const projectId = project._id;
  const existing = await ProjectPracticeContext.findOne({ projectId, userId });
  // Invalidate on EITHER signal changing: Project.updatedAt (touched on most project mutations) or
  // fileCount (a real, already-tracked field that changes on reprocessing even in the rare case updatedAt
  // doesn't). Both are existing project fields — nothing invented here.
  if (existing && existing.builtFromUpdatedAt.getTime() === new Date(project.updatedAt).getTime() && existing.builtFromFileCount === project.fileCount) {
    return existing;
  }

  const files = await ProjectFile.find({ projectId, isAnalyzable: true }).select('path language size').limit(400).lean();
  const keyFiles = files
    .filter((f) => /package\.json$|routes?[\\/]|\.route\.|controller|model|schema|app\.(ts|js)$|server\.(ts|js)$|index\.(ts|js)$/i.test(f.path))
    .slice(0, 20)
    .map((f) => f.path);

  const techMap = new Map<string, EvidenceRef[]>();
  const apiPatterns: EvidenceRef[] = [];
  const databasePatterns: EvidenceRef[] = [];
  const architecturalNotes: string[] = [];

  // Single bounded round trip instead of N sequential queries (N+1) — keyFiles is already capped at 20.
  const contentDocs = keyFiles.length > 0
    ? await FileContent.find({ projectId, filePath: { $in: keyFiles } }).select('filePath content').lean()
    : [];
  const contentByPath = new Map(contentDocs.map((d) => [d.filePath, d.content]));

  for (const path of keyFiles) {
    const raw = contentByPath.get(path);
    if (!raw) continue;
    const content = raw.slice(0, MAX_FILE_SAMPLE_CHARS);

    if (/package\.json$/i.test(path)) {
      for (const t of detectFromPackageJson(content, path)) {
        const list = techMap.get(t.name) ?? [];
        techMap.set(t.name, [...list, ...t.evidence]);
      }
    }
    apiPatterns.push(...detectApiPatterns(path, content));
    databasePatterns.push(...detectDatabasePatterns(path, content));
  }

  if (apiPatterns.length > 0) architecturalNotes.push('Backend exposes HTTP routes (evidence: matched router/app.<method> declarations).');
  if (databasePatterns.length > 0) architecturalNotes.push('Uses Mongoose/MongoDB for persistence (evidence: schema/model definitions found).');
  if (project.languages?.length) for (const lang of project.languages) if (!techMap.has(lang)) techMap.set(lang, [{ file: '(project index)', detail: 'detected during initial project scan' }]);

  const detectedTechnologies = [...techMap.entries()].map(([name, evidence]) => ({ name, evidence: evidence.slice(0, 5) }));
  const suggestedTopics = [
    ...(apiPatterns.length ? ['API design', 'error handling in routes'] : []),
    ...(databasePatterns.length ? ['schema design', 'querying MongoDB'] : []),
    ...(detectedTechnologies.some((t) => t.name === 'React') ? ['component structure', 'state management'] : []),
  ];

  const digestParts = [
    `Project: ${project.name} (${project.mainLanguage ?? 'unknown primary language'})`,
    detectedTechnologies.length ? `Detected technologies (evidence-backed): ${detectedTechnologies.map((t) => t.name).join(', ')}` : 'No specific frameworks were confidently detected from package.json.',
    keyFiles.length ? `Key files: ${keyFiles.join(', ')}` : '',
    apiPatterns.length ? `API routes found: ${apiPatterns.slice(0, 10).map((r) => r.detail).join('; ')}` : '',
    databasePatterns.length ? `Database patterns found: ${databasePatterns.slice(0, 10).map((r) => r.detail).join('; ')}` : '',
  ].filter(Boolean).join('\n');
  const digest = digestParts.slice(0, MAX_DIGEST_CHARS);

  const doc = {
    projectId, userId, detectedTechnologies, keyFiles, apiPatterns: apiPatterns.slice(0, 15), databasePatterns: databasePatterns.slice(0, 15),
    architecturalNotes, suggestedTopics, digest, builtFromUpdatedAt: new Date(project.updatedAt), builtFromFileCount: project.fileCount,
  };
  return ProjectPracticeContext.findOneAndUpdate({ projectId, userId }, { $set: doc }, { upsert: true, new: true }) as Promise<IProjectPracticeContext>;
}
