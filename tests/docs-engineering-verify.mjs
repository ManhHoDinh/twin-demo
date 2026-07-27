import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENGINEERING_DIR = path.join(ROOT, 'docs', '07-engineering');

const REQUIRED_FILES = [
  'README.md',
  '01-scientific-architecture.md',
  '02-simulation-architecture.md',
  '03-engine-contract-catalog.md',
  '04-hydrology-model.md',
  '05-hydraulic-model.md',
  '06-reservoir-model.md',
  '07-river-network-model.md',
  '08-data-pipeline.md',
  '09-gis-architecture.md',
  '10-3d-rendering-pipeline.md',
  '11-lod-and-gpu-optimisation.md',
  '12-visualisation-and-animation-rules.md',
  '13-decision-engine.md',
  '14-calibration-and-validation.md',
  '15-verification-strategy.md',
  '16-performance-targets.md',
  '17-engineering-risks-and-open-questions.md',
  '18-requirement-traceability.md',
];

const ENGINES = [
  'Terrain',
  'Hydrology',
  'Hydraulic',
  'Weather',
  'Reservoir',
  'River Network',
  'Flood Propagation',
  'Digital Twin',
  'Scenario',
  'Decision Support',
  'AI Explanation',
  'Visualization',
];

const CONTRACT_FIELDS = [
  'Purpose and scope',
  'Scientific and implementation status',
  'Inputs',
  'Outputs',
  'Dependencies and allowed dependency direction',
  'Accepted alternatives and recommended method',
  'Governing equations and implementation form',
  'Variables, units, parameters and bounds',
  'Data structures and serialization',
  'Update cadence and triggering events',
  'Spatial and temporal resolution',
  'Complexity and resource use',
  'Initialization, warm-up and boundary conditions',
  'Calibration method and observations',
  'Validation metrics, datasets and acceptance thresholds',
  'Verification tests and invariants',
  'Visualization derived from measurable state',
  'Assumptions and limitations',
  'Failure detection, degraded behavior and recovery',
  'Future extensions and scientific prerequisites',
  'Implementation evidence and traceability',
  'Next',
];

const SCIENTIFIC_STATUSES = [
  'IMPLEMENTED',
  'PLANNED',
  'REFERENCE MODEL',
  'REQUIRES DOMAIN REVIEW',
];

const PROVENANCE_VALUES = ['MEASURED', 'FORECAST', 'MODELLED', 'ASSUMED', 'SYNTHETIC'];
const SPECIALIZED_CONTRACTS = [
  '04-hydrology-model.md',
  '05-hydraulic-model.md',
  '06-reservoir-model.md',
  '07-river-network-model.md',
  '13-decision-engine.md',
];

const errors = [];
const documents = new Map();

function report(message) {
  errors.push(message);
}

function normalize(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function containsLabel(markdown, label) {
  return normalize(markdown).includes(normalize(label));
}

function metadataValues(markdown, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\s*(?:[-*]\\s*)?(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:\\s*(.+?)\\s*$`, 'gim');
  return [...markdown.matchAll(pattern)].map((match) => match[1].replace(/[*`]/g, '').trim());
}

function headingAnchors(markdown) {
  const anchors = new Set();
  for (const match of markdown.matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~`]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    if (slug) anchors.add(slug);
  }
  for (const match of markdown.matchAll(/<a\s+(?:name|id)=["']([^"']+)["']/gi)) anchors.add(match[1]);
  return anchors;
}

function localLinks(markdown) {
  const links = [];
  const pattern = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(pattern)) {
    let target = match[1].trim();
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    target = target.split(/\s+["']/)[0];
    if (!target || /^(?:[a-z]+:|\/\/)/i.test(target)) continue;
    links.push(target);
  }
  return links;
}

function resolveLocalLink(sourceFile, target) {
  const hashIndex = target.indexOf('#');
  const rawPath = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const rawAnchor = hashIndex === -1 ? '' : target.slice(hashIndex + 1);
  let decodedPath;
  let decodedAnchor;
  try {
    decodedPath = decodeURIComponent(rawPath);
    decodedAnchor = decodeURIComponent(rawAnchor);
  } catch {
    return { error: `malformed link ${target}` };
  }
  const targetFile = decodedPath
    ? path.resolve(path.dirname(sourceFile), decodedPath)
    : sourceFile;
  if (!fs.existsSync(targetFile)) return { error: `missing target ${target}` };
  if (decodedAnchor && path.extname(targetFile).toLowerCase() === '.md') {
    const targetMarkdown = fs.readFileSync(targetFile, 'utf8');
    if (!headingAnchors(targetMarkdown).has(decodedAnchor.toLowerCase())) {
      return { error: `missing anchor ${target}` };
    }
  }
  return { targetFile };
}

function sectionForEngine(markdown, engine, followingEngines) {
  const heading = new RegExp(`^#{2,6}\\s+(?:[^\\n]*?\\b)?${engine.replace(/ /g, '\\s+')}\\s+(?:Engine\\b[^\\n]*)?$`, 'im');
  const match = heading.exec(markdown);
  if (!match) return null;
  const start = match.index;
  let end = markdown.length;
  for (const other of followingEngines) {
    const otherHeading = new RegExp(`^#{2,6}\\s+(?:[^\\n]*?\\b)?${other.replace(/ /g, '\\s+')}\\s+(?:Engine\\b[^\\n]*)?$`, 'im');
    const candidate = otherHeading.exec(markdown.slice(start + match[0].length));
    if (candidate) end = Math.min(end, start + match[0].length + candidate.index);
  }
  return markdown.slice(start, end);
}

function validateContract(markdown, label) {
  const missing = CONTRACT_FIELDS.filter((field) => !containsLabel(markdown, field));
  if (missing.length) report(`${label}: missing contract fields: ${missing.join('; ')}`);
}

function parseTable(markdown) {
  const lines = markdown.split(/\r?\n/);
  const tables = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].includes('|') || !/^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) continue;
    const rows = [];
    let cursor = index + 2;
    while (cursor < lines.length && lines[cursor].includes('|')) {
      rows.push(lines[cursor]);
      cursor += 1;
    }
    tables.push({ header: lines[index], rows });
    index = cursor - 1;
  }
  return tables;
}

const missingFiles = REQUIRED_FILES.filter((name) => !fs.existsSync(path.join(ENGINEERING_DIR, name)));
if (missingFiles.length) {
  for (const name of missingFiles) report(`missing docs/07-engineering/${name}`);
} else {
  for (const name of REQUIRED_FILES) {
    const file = path.join(ENGINEERING_DIR, name);
    documents.set(name, fs.readFileSync(file, 'utf8'));
  }

  const ids = new Map();
  for (const [name, markdown] of documents) {
    const documentIds = metadataValues(markdown, 'Document ID');
    if (documentIds.length !== 1) {
      report(`${name}: expected exactly one Document ID`);
    } else if (ids.has(documentIds[0])) {
      report(`${name}: duplicate Document ID ${documentIds[0]} (also in ${ids.get(documentIds[0])})`);
    } else {
      ids.set(documentIds[0], name);
    }

    const statusBlocks = metadataValues(markdown, 'Status');
    const scientificStatusBlocks = metadataValues(markdown, 'Scientific status');
    const implementationStatusBlocks = metadataValues(markdown, 'Implementation status');
    const hasSingleStatus = statusBlocks.length === 1
      && scientificStatusBlocks.length === 0
      && implementationStatusBlocks.length === 0;
    const hasPairedStatus = statusBlocks.length === 0
      && scientificStatusBlocks.length === 1
      && implementationStatusBlocks.length === 1;
    if (!hasSingleStatus && !hasPairedStatus) {
      report(`${name}: expected one Status line or one Scientific/Implementation status pair`);
    }

    for (const target of localLinks(markdown)) {
      const result = resolveLocalLink(path.join(ENGINEERING_DIR, name), target);
      if (result.error) report(`${name}: ${result.error}`);
    }
  }

  const corpus = [...documents.values()].join('\n');
  for (const status of SCIENTIFIC_STATUSES) {
    if (!new RegExp(`\\b${status.replace(/ /g, '\\s+')}\\b`).test(corpus)) report(`missing scientific status ${status}`);
  }
  for (const provenance of PROVENANCE_VALUES) {
    if (!new RegExp(`\\b${provenance}\\b`).test(corpus)) report(`missing provenance value ${provenance}`);
  }

  const catalog = documents.get('03-engine-contract-catalog.md');
  for (let index = 0; index < ENGINES.length; index += 1) {
    const engine = ENGINES[index];
    const section = sectionForEngine(catalog, engine, ENGINES.filter((_, otherIndex) => otherIndex !== index));
    if (!section) {
      report(`03-engine-contract-catalog.md: missing ${engine} Engine section`);
    } else {
      validateContract(section, `03-engine-contract-catalog.md: ${engine} Engine`);
    }
  }
  for (const name of SPECIALIZED_CONTRACTS) validateContract(documents.get(name), name);

  const traceability = documents.get('18-requirement-traceability.md');
  const traceabilityTables = parseTable(traceability).filter(({ header }) => /requirement/i.test(header));
  const traceabilityRows = traceabilityTables.flatMap(({ rows }) => rows).filter((row) => !/^\s*\|?\s*$/.test(row));
  if (!traceabilityRows.length) report('18-requirement-traceability.md: no requirement traceability rows');
  for (const row of traceabilityRows.filter((value) => /\bIMPLEMENTED\b/.test(value))) {
    const evidenceLinks = localLinks(row).filter((target) => {
      const resolved = resolveLocalLink(path.join(ENGINEERING_DIR, '18-requirement-traceability.md'), target);
      return !resolved.error && resolved.targetFile !== path.join(ENGINEERING_DIR, '18-requirement-traceability.md');
    });
    if (!evidenceLinks.length) report(`18-requirement-traceability.md: IMPLEMENTED row lacks existing evidence: ${row.trim()}`);
  }
}

if (errors.length) {
  console.error(`Engineering documentation verification failed (${errors.length}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Engineering documentation verification passed (${REQUIRED_FILES.length} documents, ${ENGINES.length} engines).`);
}
