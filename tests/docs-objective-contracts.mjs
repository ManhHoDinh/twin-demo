import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.resolve(HERE, '..');
const SITE = path.resolve(DEMO, '../SkyLabs_SURF2026');

const failures = [];
let checks = 0;

function read(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function check(condition, label, detail = '') {
  checks += 1;
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures.push(detail ? `${label}: ${detail}` : label);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function sections(markdown, expression) {
  const matches = [...markdown.matchAll(expression)];
  return matches.map((match, index) => ({
    id: match[1],
    title: match[2] || match[1],
    body: markdown.slice(match.index + match[0].length, matches[index + 1]?.index ?? markdown.length),
  }));
}

function fieldValue(body, field, aliases = []) {
  for (const label of [field, ...aliases]) {
    const escaped = escapeRegExp(label);
    const match = new RegExp(
      `\\*\\*${escaped}(?:\\.| / fields\\.)?\\*\\*\\s*([\\s\\S]*?)(?=\\n(?:- )?\\*\\*|\\n#{1,6}\\s|$)`,
      'i',
    ).exec(body);
    if (match) return match[1].replace(/\s+/g, ' ').trim();
  }
  return null;
}

function requireSectionFields(label, items, expectedCount, fields) {
  check(items.length === expectedCount, `${label} count`, `expected ${expectedCount}, found ${items.length}`);
  check(new Set(items.map((item) => item.id)).size === items.length, `${label} identifiers are unique`);
  for (const item of items) {
    const invalid = [];
    for (const { name, aliases = [] } of fields) {
      const value = fieldValue(item.body, name, aliases);
      if (!value) invalid.push(`${name} missing`);
      else if (value.length < 12) invalid.push(`${name} under-specified`);
      else if (/\b(?:TBD|TODO|FIXME|implement later|as appropriate)\b/i.test(value)) invalid.push(`${name} contains placeholder wording`);
    }
    check(invalid.length === 0, `${label} ${item.id} has the complete contract`, invalid.join(', '));
  }
}

function localMarkdownTargets(root, relativePath) {
  const sourcePath = path.join(root, relativePath);
  const markdown = fs.readFileSync(sourcePath, 'utf8').replace(/```[\s\S]*?```/g, '');
  const targets = [];
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const raw = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|tel:|#)/i.test(raw)) continue;
    const [filePart] = raw.split('#');
    if (!filePart) continue;
    targets.push({ raw, resolved: path.resolve(path.dirname(sourcePath), decodeURIComponent(filePart)) });
  }
  return targets;
}

const featureFields = [
  'Business objective', 'Domain model', 'State machine', 'Workflow', 'Dependencies',
  'Edge cases', 'Validation', 'Performance', 'Security', 'Future extension',
].map((name) => ({ name }));

const scenarioFields = [
  'Inputs', 'Assumptions', 'Simulation', 'Expected impacts', 'Confidence', 'Limitations',
].map((name) => ({ name }));

const screenFields = [
  { name: 'Purpose' },
  { name: 'Target users', aliases: ['Primary user'] },
  { name: 'Operational workflow' },
  { name: 'Required data' },
  { name: 'Map layers', aliases: ['Layers'] },
  { name: 'User interactions', aliases: ['Interactions'] },
  { name: 'Loading' },
  { name: 'Empty states' },
  { name: 'Errors' },
  { name: 'Accessibility' },
  { name: 'Acceptance criteria' },
];

console.log('\nObjective contract · workflow features');
const capWf = read(SITE, 'product-os/capabilities/CAP-WF-workflow-steps.md');
requireSectionFields(
  'workflow step',
  sections(capWf, /^## Step (\d+) · ([^\n]+)/gm),
  13,
  featureFields,
);

console.log('\nObjective contract · scenarios');
const capSc = read(SITE, 'product-os/capabilities/CAP-SC-scenario-library.md');
requireSectionFields(
  'scenario',
  sections(capSc, /^## (SC-\d+) · ([^\n]+)/gm),
  8,
  scenarioFields,
);

console.log('\nObjective contract · canonical screens');
const screenCatalog = read(DEMO, 'docs/05-product/02-screen-catalog.md');
requireSectionFields(
  'screen',
  sections(screenCatalog, /^## (S-\d+) [—-]+ ([^\n]+)/gm),
  18,
  screenFields,
);

console.log('\nObjective contract · planning screens');
const capUx = read(SITE, 'product-os/capabilities/CAP-UX-planning-screens.md');
requireSectionFields(
  'planning screen',
  sections(capUx, /^## (UX-\d+) · ([^\n]+)/gm),
  3,
  screenFields,
);

console.log('\nObjective contract · cross-cutting invariants');
const cap00 = read(SITE, 'product-os/capabilities/CAP-00-emergency-planning-index.md');
for (const dataClass of ['Observed', 'Forecast', 'Simulation', 'AI recommendation', 'Human decision']) {
  check(new RegExp(`\\*\\*${escapeRegExp(dataClass)}\\*\\*`, 'i').test(cap00), `data class remains explicit: ${dataClass}`);
}
for (const capability of [
  'Digital Twin', '3D GIS Map', 'Reservoir Network', 'River Network', 'Rainfall & Forecast',
  'Flood Simulation', 'Scenario Comparison', 'Timeline Replay', 'AI Decision Support',
  'Impact Assessment', 'Public Information', 'Audit Trail',
]) {
  check(cap00.includes(capability), `core capability remains mapped: ${capability}`);
}
check(/AI generates explainable scenarios/i.test(cap00), 'AI remains an explainable-scenario author');
check(/human decision is the only thing that changes the\s+downstream state/i.test(cap00), 'only a human decision can change operational state');
check(/85\s*[–-]\s*95\s*%/.test(cap00), 'map-first target remains 85–95% of the viewport');
check(/floating panel/i.test(cap00) && /contextual/i.test(cap00), 'non-map instruments remain contextual floating panels');

console.log('\nObjective contract · six-lens review record');
const reviewFiles = [
  'product-os/capabilities/CAP-WF-workflow-steps.md',
  'product-os/capabilities/CAP-SC-scenario-library.md',
  'product-os/capabilities/CAP-UX-planning-screens.md',
  'product-os/capabilities/CAP-RW-role-workspaces.md',
  'product-os/capabilities/CAP-VER-verification.md',
  'docs/superpowers/specs/2026-07-28-objective-contract-completion-design.md',
];
const reviews = reviewFiles.map((relativePath) => ({ relativePath, text: read(SITE, relativePath) }));
for (const review of reviews) check(/^## .*review/im.test(review.text), `review section exists: ${review.relativePath}`);
const combinedReview = reviews.map((review) => review.text).join('\n');
for (const lens of [
  'Reservoir Operator', 'Emergency Manager', 'Government Coordinator',
  'GIS Engineer', 'Senior UX Designer', 'Principal Software Engineer',
]) {
  check(combinedReview.includes(lens), `combined review record covers: ${lens}`);
}

console.log('\nObjective contract · cross-reference integrity');
const crossReferenceDocs = [
  [SITE, 'product-os/capabilities/CAP-00-emergency-planning-index.md'],
  [SITE, 'product-os/capabilities/CAP-WF-workflow-steps.md'],
  [SITE, 'product-os/capabilities/CAP-SC-scenario-library.md'],
  [SITE, 'product-os/capabilities/CAP-UX-planning-screens.md'],
  [SITE, 'product-os/capabilities/CAP-RW-role-workspaces.md'],
  [SITE, 'product-os/capabilities/CAP-VER-verification.md'],
  [DEMO, 'docs/05-product/02-screen-catalog.md'],
];
for (const [root, relativePath] of crossReferenceDocs) {
  const broken = localMarkdownTargets(root, relativePath).filter((target) => !fs.existsSync(target.resolved));
  check(broken.length === 0, `local cross-references resolve: ${relativePath}`, broken.map((target) => target.raw).join(', '));
}

console.log(`\n${checks - failures.length}/${checks} objective-contract checks passed`);
if (failures.length) {
  console.error(`\n${failures.length} objective-contract gap(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
}
