import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.resolve(ROOT, '..', 'SkyLabs_SURF2026');
const failures = [];
let checks = 0;

function check(label, condition, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failures.push(detail ? `${label}: ${detail}` : label);
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

function read(base, rel) {
  const target = path.join(base, rel);
  if (!fs.existsSync(target)) {
    failures.push(`missing document: ${target}`);
    return '';
  }
  return fs.readFileSync(target, 'utf8');
}

function sections(markdown, pattern) {
  const matches = [...markdown.matchAll(pattern)];
  return matches.map((match, index) => ({
    id: match[1],
    title: match[2]?.trim() || '',
    body: markdown.slice(match.index, matches[index + 1]?.index ?? markdown.length),
  }));
}

function hasField(body, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\n)(?:[-*]\\s*)?\\*{0,2}${escaped}\\*{0,2}\\s*[.:—-]`, 'i').test(body);
}

function requireFields(group, fields, label) {
  for (const section of group) {
    for (const field of fields) {
      check(`${label} ${section.id} defines ${field}`, hasField(section.body, field));
    }
  }
}

function localMarkdownTargets(base, rel) {
  const sourcePath = path.join(base, rel);
  const markdown = fs.readFileSync(sourcePath, 'utf8').replace(/```[\s\S]*?```/g, '');
  const targets = [];
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const raw = match[1].trim().replace(/^<|>$/g, '');
    if (/^(?:https?:|mailto:|tel:|#)/i.test(raw)) continue;
    const [filePart] = raw.split('#');
    if (!filePart) continue;
    const decoded = decodeURIComponent(filePart);
    targets.push({
      raw,
      resolved: decoded.startsWith('/')
        ? path.resolve(base, decoded.slice(1))
        : path.resolve(path.dirname(sourcePath), decoded),
    });
  }
  return targets;
}

console.log('\nIntegrated watershed objective · capability contracts');
const capabilityPath = 'product-os/capabilities/CAP-IW-integrated-watershed-platform.md';
const capabilitiesDoc = read(SITE, capabilityPath);
const capabilities = sections(capabilitiesDoc, /^##\s+(CAP-\d{2})\s*[·:-]\s*(.+)$/gm);
const capabilityFields = [
  'Business objective', 'Users', 'Workflow', 'Domain model', 'State model',
  'Dependencies', 'Edge cases', 'Validation', 'Acceptance criteria',
];
const capabilityNames = [
  'Reservoir Registry', 'River Network', 'Watershed Network', 'Catchments',
  'Weather & Rainfall', 'Forecast', 'Reservoir Monitoring', 'Reservoir Coordination',
  'Cascade Reservoir Simulation', 'Downstream Impact Analysis', 'Scenario Comparison',
  'Timeline Replay', 'Risk Assessment', 'Infrastructure Exposure', 'Population Exposure',
  'Decision Support', 'Audit Trail',
];
check('capability count is exactly 17', capabilities.length === 17, `found ${capabilities.length}`);
check('capability identifiers are unique', new Set(capabilities.map((item) => item.id)).size === capabilities.length);
for (const name of capabilityNames) {
  check(`core capability is present: ${name}`, capabilities.some((item) => item.title === name));
}
requireFields(capabilities, capabilityFields, 'capability');

console.log('\nIntegrated watershed objective · reservoir and topology registry');
const registryPath = 'product-os/database/DB-04-connected-watershed-registry.md';
const registryDoc = read(SITE, registryPath);
const reservoirs = sections(registryDoc, /^##\s+(RES-\d{2})\s*[·:-]\s*(.+)$/gm);
const reservoirFields = [
  'Location', 'Watershed', 'Storage', 'Current state', 'Upstream reservoirs',
  'Downstream reservoirs', 'Connected rivers', 'Travel-time assumptions',
  'Operational constraints', 'Dependencies', 'Potential downstream influence',
];
check('reference reservoir registry contains four records', reservoirs.length === 4, `found ${reservoirs.length}`);
check('reservoir identifiers are unique', new Set(reservoirs.map((item) => item.id)).size === reservoirs.length);
for (const name of ['A Vương', 'Sông Bung 4', 'Đắk Mi 4', 'Sông Tranh 2']) {
  check(`reference reservoir is present: ${name}`, reservoirs.some((item) => item.title === name));
}
requireFields(reservoirs, reservoirFields, 'reservoir');
check('registry refuses an unproven completeness claim', /Inventory status(?:\*{0,2})?\s*[.:—-](?:\*{0,2})?\s*INCOMPLETE/i.test(registryDoc));
for (const node of ['Watershed', 'Catchment', 'Reservoir', 'River', 'Reach', 'Junction', 'Diversion', 'Gauge', 'DownstreamArea', 'AdministrativeUnit']) {
  check(`topology defines node type ${node}`, new RegExp(`\\b${node}\\b`).test(registryDoc));
}
check('topology links are directed and versioned', /directed/i.test(registryDoc) && /network_version/i.test(registryDoc));
check('travel-time uncertainty is explicit', /travel_time/i.test(registryDoc) && /uncertainty/i.test(registryDoc));

console.log('\nIntegrated watershed objective · scenario contracts');
const scenariosPath = 'product-os/capabilities/CAP-SC-scenario-library.md';
const scenariosDoc = read(SITE, scenariosPath);
const scenarios = sections(scenariosDoc, /^##\s+(SC-\d+)\s*[·:-]\s*(.+)$/gm);
const scenarioFields = [
  'Assumptions', 'Simulation timeline', 'Reservoir status', 'River status',
  'Estimated downstream impacts', 'Infrastructure potentially affected',
  'Population exposure estimates', 'Alternative scenarios', 'Confidence', 'Known limitations',
];
check('scenario count remains exactly 8', scenarios.length === 8, `found ${scenarios.length}`);
check('scenario identifiers are unique', new Set(scenarios.map((item) => item.id)).size === scenarios.length);
requireFields(scenarios, scenarioFields, 'scenario');

console.log('\nIntegrated watershed objective · administrative geography');
const adminPath = 'product-os/database/DB-05-administrative-geography.md';
const adminDoc = read(SITE, adminPath);
check('administrative authority names Resolution 1659', /1659\/NQ-UBTVQH15/.test(adminDoc));
check('administrative validity starts on 2025-07-01', /2025-07-01/.test(adminDoc));
check('official total is 94 commune-level units', /94\s+(?:commune-level units|đơn vị hành chính cấp xã)/i.test(adminDoc));
check('official composition is 23 wards, 70 communes and 1 special zone', /23\s+(?:wards|phường)/i.test(adminDoc) && /70\s+(?:communes|xã)/i.test(adminDoc) && /(?:1|01)\s+(?:special zone|đặc khu)/i.test(adminDoc));
check('boundaries and names carry validity periods', /valid_from/.test(adminDoc) && /valid_to/.test(adminDoc));
check('places remain separate from administrative units', /place/i.test(adminDoc) && /separate/i.test(adminDoc));
check('geometry is not invented', /geometry[^\n]*(?:MISSING|REQUIRES|not supplied)/i.test(adminDoc));
check('population is not invented', /population[^\n]*(?:MISSING|REQUIRES|not supplied)/i.test(adminDoc));

console.log('\nIntegrated watershed objective · map-first reservoir workspace');
const uxPath = 'product-os/capabilities/CAP-UX-planning-screens.md';
const uxDoc = read(SITE, uxPath);
const screenDoc = read(ROOT, 'docs/05-product/02-screen-catalog.md');
for (const view of ['Current state', 'Historical trends', 'Scenario comparison', 'Relationship graph', 'Timeline', 'Downstream analysis']) {
  check(`reservoir selection exposes ${view}`, new RegExp(view, 'i').test(uxDoc) && new RegExp(view, 'i').test(screenDoc));
}
check('map-first target remains 85–95 percent', /85\s*[–-]\s*95\s*(?:%|percent)/i.test(uxDoc));
check('reservoir views share one selection and clock', /one (?:active )?reservoir selection/i.test(uxDoc) && /one global clock/i.test(uxDoc));

console.log('\nIntegrated watershed objective · cross-cutting safety and review');
const cap00 = read(SITE, 'product-os/capabilities/CAP-00-emergency-planning-index.md');
for (const dataClass of ['Observed', 'Forecast', 'Simulation', 'Assumption', 'AI recommendation', 'Human-approved decision']) {
  check(`data class remains explicit: ${dataClass}`, new RegExp(dataClass, 'i').test(cap00));
}
check('only human approval can create actionable state', /only[^\n]*human/i.test(cap00) && /actionable/i.test(cap00));
for (const lens of ['Reservoir Operator', 'Regional Coordinator', 'Emergency Management', 'GIS Engineer', 'Senior UX Designer', 'Principal Software Engineer']) {
  const combined = [capabilitiesDoc, registryDoc, scenariosDoc, adminDoc, uxDoc].join('\n');
  check(`six-lens review covers ${lens}`, new RegExp(lens, 'i').test(combined));
}

console.log('\nIntegrated watershed objective · cross-reference integrity');
for (const [base, rel] of [
  [SITE, capabilityPath],
  [SITE, registryPath],
  [SITE, adminPath],
  [SITE, scenariosPath],
  [SITE, uxPath],
  [ROOT, 'docs/05-product/02-screen-catalog.md'],
]) {
  const missing = localMarkdownTargets(base, rel).filter((target) => !fs.existsSync(target.resolved));
  check(`local cross-references resolve: ${rel}`, missing.length === 0, missing.map((item) => item.raw).join(', '));
}

console.log(`\n${checks - failures.length}/${checks} integrated-watershed checks passed`);
if (failures.length) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
