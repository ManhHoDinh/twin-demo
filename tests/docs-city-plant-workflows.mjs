import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(ROOT, '..', 'SkyLabs_SURF2026');
const failures = [];
let checks = 0;

function read(base, rel) {
  const target = path.join(base, rel);
  if (!fs.existsSync(target)) {
    failures.push(`missing document: ${target}`);
    return '';
  }
  return fs.readFileSync(target, 'utf8');
}

function check(label, condition, detail = '') {
  checks += 1;
  if (condition) {
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

console.log('\nCity and plant operations workflow contracts');

const roleDoc = read(SITE, 'product-os/capabilities/CAP-RW-role-workspaces.md');
const registryDoc = read(SITE, 'product-os/database/DB-04-connected-watershed-registry.md');
const planningDoc = read(SITE, 'product-os/capabilities/CAP-UX-planning-screens.md');
const entityDoc = read(ROOT, 'docs/01-domain-model/01-entity-model.md');
const screenDoc = read(ROOT, 'docs/05-product/02-screen-catalog.md');
const principlesDoc = read(ROOT, 'docs/05-product/04-ux-principles.md');
const combined = [roleDoc, registryDoc, planningDoc, entityDoc, screenDoc, principlesDoc].join('\n');

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

console.log(`\n${checks - failures.length}/${checks} city/plant workflow checks passed`);
if (failures.length) {
  console.error(`\n${failures.length} city/plant workflow gap(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
