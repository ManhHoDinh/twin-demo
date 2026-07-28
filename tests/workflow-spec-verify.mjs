import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC_PATH = path.join(ROOT, 'docs', '03-operations', '04-workflow-specifications.md');
const REFERENCE_FILES = {
  P: path.join(ROOT, 'docs', '02-stakeholders', '01-personas.md'),
  D: path.join(ROOT, 'docs', '02-stakeholders', '02-decision-rights-raci.md'),
  S: path.join(ROOT, 'docs', '05-product', '02-screen-catalog.md'),
  WF: path.join(ROOT, 'docs', '03-operations', '01-workflow-catalog.md'),
};

const REQUIRED_FIELDS = [
  'Actors',
  'Goals',
  'Inputs',
  'Outputs',
  'Domain entities',
  'State transitions',
  'Decision points',
  'Human approvals',
  'Data sources',
  'Visualisations',
  'User interactions (from the map)',
  'Failure cases',
  'Audit trail',
  'KPIs',
  'Acceptance criteria',
];

const WORKFLOWS = [
  'Watershed monitoring',
  'Forecast interpretation',
  'Scenario simulation',
  'Reservoir coordination',
  'Operator review',
  'Regional coordination',
  'Government approval',
  'Public warning',
  'Emergency response',
  'Post-event replay',
];

const REVIEWERS = [
  'Reservoir Operator',
  'Regional Coordinator',
  'Emergency Manager',
  'Government Authority',
  'GIS Engineer',
  'UX Designer',
  'Principal Software Engineer',
];

const LIFECYCLE_CLASSES = [
  'OBSERVED',
  'FORECAST',
  'SIMULATION',
  'RECOMMENDATION',
  'OPERATOR_DECISION',
  'APPROVED_PLAN',
];

const failures = [];
const markdown = fs.readFileSync(SPEC_PATH, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function check(condition, message) {
  if (!condition) failures.push(message);
}

const sections = [...markdown.matchAll(/^## WF-SPEC-(\d+) — ([^\n]+)\n([\s\S]*?)(?=^## WF-SPEC-|^## Review)/gm)];
check(sections.length === WORKFLOWS.length, `expected ${WORKFLOWS.length} workflow sections, found ${sections.length}`);

for (let index = 0; index < WORKFLOWS.length; index += 1) {
  const match = sections[index];
  if (!match) continue;
  const [, number, title, body] = match;
  check(Number(number) === index + 1, `workflow ${index + 1} has non-sequential id ${number}`);
  check(title.startsWith(WORKFLOWS[index]), `workflow ${number} title does not match "${WORKFLOWS[index]}"`);

  for (const field of REQUIRED_FIELDS) {
    check(body.includes(`- **${field}.**`), `WF-SPEC-${number} missing field: ${field}`);
  }
  check(body.includes('- **Lifecycle classes produced.**'), `WF-SPEC-${number} missing lifecycle classification`);
}

for (const lifecycleClass of LIFECYCLE_CLASSES) {
  check(markdown.includes(`\`${lifecycleClass}\``), `missing lifecycle class ${lifecycleClass}`);
}
check(/Only `APPROVED_PLAN` is actionable\./.test(markdown), 'missing approved-plan-only actionability invariant');
check(/Every AI recommendation states its assumptions,[\s\S]*confidence,[\s\S]*expected downstream impact/.test(markdown),
  'missing AI assumptions, confidence, and downstream-impact contract');
check(/only[\s\S]{0,120}through an `OPERATOR_DECISION` by an entitled actor/.test(markdown),
  'missing entitled human-review gate for AI recommendations');
check(/Every workflow below is executable from a single map surface/.test(markdown), 'missing map-primary workspace contract');
check(/no workflow requires navigating away from the map/i.test(markdown), 'missing no-page-navigation invariant');

for (const reviewer of REVIEWERS) {
  check(markdown.includes(`**${reviewer}`), `missing review perspective: ${reviewer}`);
}

for (const [prefix, referencePath] of Object.entries(REFERENCE_FILES)) {
  const reference = fs.readFileSync(referencePath, 'utf8');
  const ids = new Set(markdown.match(new RegExp(`\\b${prefix}-\\d{2}\\b`, 'g')) ?? []);
  for (const id of ids) check(reference.includes(id), `unresolved ${prefix} cross-reference: ${id}`);
}

check(markdown.includes('## Verification evidence'), 'missing current-versus-planned verification evidence section');
for (let index = 1; index <= WORKFLOWS.length; index += 1) {
  check(markdown.includes(`| WF-SPEC-${index} |`), `missing verification evidence row for WF-SPEC-${index}`);
}

const unchecked = markdown.match(/^- \[ \] .+$/gm) ?? [];
check(unchecked.length === 0, `verification checklist still has ${unchecked.length} unchecked item(s)`);
check(packageJson.scripts?.['docs:workflow'] === 'node tests/workflow-spec-verify.mjs',
  'package.json must expose the workflow verifier as docs:workflow');
check(packageJson.scripts?.test?.includes('npm run docs:workflow'),
  'the default test command must run docs:workflow');

if (failures.length) {
  console.error(`Workflow specification verification FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`Workflow specification verification PASS (${WORKFLOWS.length}/${WORKFLOWS.length} workflows, ${WORKFLOWS.length * REQUIRED_FIELDS.length}/${WORKFLOWS.length * REQUIRED_FIELDS.length} required fields, ${REVIEWERS.length}/${REVIEWERS.length} review perspectives)`);
