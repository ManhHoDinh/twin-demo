import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(ROOT, '..', 'SkyLabs_SURF2026');
const failures = [];
let checks = 0;
let passedChecks = 0;

function read(base, rel) {
  const target = path.join(base, rel);
  checks += 1;
  if (!fs.existsSync(target)) {
    failures.push(`missing document: ${target}`);
    console.log(`  ✗ load ${rel}`);
    return '';
  }
  passedChecks += 1;
  console.log(`  ✓ load ${rel}`);
  return fs.readFileSync(target, 'utf8');
}

function check(label, condition, detail = '') {
  checks += 1;
  if (condition) {
    passedChecks += 1;
    console.log(`  ✓ ${label}`);
    return;
  }
  failures.push(detail ? `${label}: ${detail}` : label);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function sections(markdown, pattern) {
  const matches = [...markdown.matchAll(pattern)];
  return matches.map((match, index) => ({
    id: match[1],
    title: match[2]?.trim() || '',
    body: markdown.slice(match.index, matches[index + 1]?.index ?? markdown.length),
  }));
}

function containsAll(markdown, values) {
  return values.every((value) => markdown.includes(value));
}

function sectionBody(markdown, headingPattern) {
  const match = headingPattern.exec(markdown);
  if (!match) return '';
  const rest = markdown.slice(match.index + match[0].length);
  const nextHeading = rest.search(/\n#{1,6}\s/);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

console.log('\nCity and plant operations workflow contracts');

const roleDoc = read(SITE, 'product-os/capabilities/CAP-RW-role-workspaces.md');
const registryDoc = read(SITE, 'product-os/database/DB-04-connected-watershed-registry.md');
const planningDoc = read(SITE, 'product-os/capabilities/CAP-UX-planning-screens.md');
const entityDoc = read(ROOT, 'docs/01-domain-model/01-entity-model.md');
const screenDoc = read(ROOT, 'docs/05-product/02-screen-catalog.md');
const principlesDoc = read(ROOT, 'docs/05-product/04-ux-principles.md');
const combined = [roleDoc, registryDoc, planningDoc, entityDoc, screenDoc, principlesDoc].join('\n');
const roleContract = sectionBody(roleDoc, /^## City\/Plant Operations Dashboard Contract$/m);
const planningContract = sectionBody(planningDoc, /^## City\/Plant dashboard screen contracts$/m);
const screenContract = sectionBody(screenDoc, /^### City\/Plant role dashboard amendment$/m);
const registryContract = sectionBody(registryDoc, /^### Municipal HydropowerFacility Contract$/m);
const entityFacility = sectionBody(entityDoc, /^### E-07A HydropowerFacility$/m);
const entityDecision = sectionBody(entityDoc, /^### E-37 Decision$/m);

const cityStatePath = 'PORTFOLIO -> EVENT_ACTIVE -> DECISION_PENDING -> ORDERED -> EXECUTING -> VERIFIED -> CLOSED';
const plantStatePath = 'FACILITY_SELECTED -> ADVISORY_AVAILABLE -> PROPOSED -> APPROVED_PLAN -> EXECUTING -> COMPLETE';
const sharedIds = ['event_id', 'facility_id', 'proposal_id', 'decision_id', 'approved_order_id'];
const exceptionalStates = ['CONFLICTING_SOURCES', 'NOT_IN_CURRENT_DEMO', 'MISSING', 'SUPERSEDED'];
const demoReservoirs = ['A Vương', 'Sông Bung 4', 'Đắk Mi 4', 'Sông Tranh 2'];

const roleSections = sections(roleDoc, /^##\s+(RW-\d+)\s*[·:-]\s*(.+)$/gm);
check('role workspace sections still parse', roleSections.length >= 6, `found ${roleSections.length}`);

const requiredPhrases = [
  'City Operations Dashboard',
  'Plant Operations Dashboard',
  '44 hydropower facilities',
  '34 named',
  '10 unresolved',
  '19 hydropower reservoirs',
  'HydropowerFacility',
  'APPROVED_PLAN',
  'actual-versus-commanded',
  'shared operational core',
];

for (const phrase of requiredPhrases) {
  check(`contract contains ${phrase}`, combined.includes(phrase));
}

check(
  'separate dashboards supersede the universal-map-only rule',
  /separate dashboards/i.test(roleDoc) && /supersede/i.test(roleDoc),
);
check(
  'non-demo facilities cannot produce operational advice',
  /NOT_IN_CURRENT_DEMO/.test(registryDoc) && /cannot produce operational advice/i.test(registryDoc),
);

for (const [label, body] of [
  ['role dashboard contract', roleContract],
  ['planning dashboard contract', planningContract],
  ['screen catalog dashboard contract', screenContract],
]) {
  check(`${label} contains exact City state path`, body.includes(cityStatePath));
  check(`${label} contains exact Plant state path`, body.includes(plantStatePath));
  check(`${label} contains complete shared ID set`, containsAll(body, sharedIds));
  check(`${label} contains all exceptional states`, containsAll(body, exceptionalStates));
}

check(
  'role authority contract states D-06 and human-only approval',
  /D-06/.test(roleContract) && /AI\s+proposes only;\s*authorized humans approve/i.test(roleContract),
);
check(
  'entity authority contract states D-06 and human-only approval',
  /D-06/.test(entityDecision) && /AI proposes only;\s*authorized humans approve/i.test(entityDecision),
);
check('registry contract contains all exceptional states', containsAll(registryContract, exceptionalStates));
check('entity facility contract contains all exceptional states', containsAll(entityFacility, exceptionalStates));
check('registry documentation contains exact four demo reservoir names', containsAll(registryDoc, demoReservoirs));
check('entity documentation contains exact four demo reservoir names', containsAll(entityDoc, demoReservoirs));

console.log(`\n${passedChecks}/${checks} city/plant workflow checks passed`);
if (failures.length) {
  console.error(`\n${failures.length} city/plant workflow gap(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
