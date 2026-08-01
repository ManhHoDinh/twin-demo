/* Role-workspace UI guard — city + plant.

   The behavioural suites (role-workspaces.mjs) prove the dashboards compute the right
   things. This one proves a human can reach them and read them. Every check here is a
   defect that was measured on the live app, not a hypothetical:

     1. The switcher used to be a fixed pill at top:12/left:50% — the exact geometry of the
        geoshell command bar — so its buttons rendered under the scenario select. The two
        role screens were effectively URL-only.
     2. There was no "map" route button. Entering city or plant was a one-way door; the only
        exit was the browser Back button or an Escape path that exists only when you arrived
        by clicking.
     3. Map-context chrome (.geoOpsStrip, .aiLauncher) was absent from shell.js's yield list,
        so dark map furniture floated over the light dashboards, overlapping the header.
     4. Workflow enums (NOT_IN_CURRENT_DEMO, ASSUMED_FOR_DEMO, APPROVED_PLAN…), code
        identifiers (FT.hydro.at(FT.state.timeH)) and database column names
        (approved_order_id; event_id; facility_id) were rendered as user-facing copy.
     5. Numbers were formatted en-US inside a Vietnamese interface, so "1,530 m3/s" read as
        one-and-a-half.

   Run: node tests/workspace-ui.mjs                                                       */
import { launchGpu } from './browser.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const srv = spawn('node', [path.join(HERE, 'serve.mjs'), '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
const port = await new Promise((res, rej) => {
  let buf = '';
  const t = setTimeout(() => rej(new Error('no port: ' + buf)), 8000);
  const f = (d) => { buf += d; const m = buf.match(/127\.0\.0\.1:(\d+)/); if (m) { clearTimeout(t); res(m[1]); } };
  srv.stdout.on('data', f); srv.stderr.on('data', f);
});
const BASE = `http://127.0.0.1:${port}/index.html`;

let fails = 0;
const ok = (n, c, x) => { console.log(`${c ? '  ✓' : '  ✗'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };

const VIEWS = [[1512, 900], [1280, 800], [768, 1024], [390, 844]];

/* Text a user actually sees, per visible text node. */
function readableTextProbe() {
  const host = document.getElementById('roleWorkspaceHost');
  if (!host || host.hidden) return { error: 'workspace host is hidden' };
  const vis = (n) => {
    if (!n) return false;
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const enums = [], idents = [], columns = [], usNumbers = [], asciiUnits = [];
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walk.nextNode())) {
    const t = (node.textContent || '').trim();
    if (!t || !vis(node.parentElement)) continue;
    // SHOUTING_SNAKE_CASE workflow codes
    const e = t.match(/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/g);
    if (e) enums.push(t.slice(0, 80));
    // FT.namespace.call(...) leaking out of provenance strings
    if (/\bFT\.[A-Za-z]/.test(t)) idents.push(t.slice(0, 80));
    // database column names
    if (/\b[a-z]+_(?:id|at|seq|cms)\b/.test(t)) columns.push(t.slice(0, 80));
    // 1,530 — en-US grouping inside a Vietnamese interface
    if (document.documentElement.lang !== 'en' && /\d,\d{3}\b/.test(t)) usNumbers.push(t.slice(0, 60));
    if (/\bm3\/s\b/.test(t)) asciiUnits.push(t.slice(0, 60));
  }
  return { enums, idents, columns, usNumbers, asciiUnits };
}

/* Chrome that belongs to the map must not paint over a workspace. */
function chromeProbe() {
  const vis = (n) => {
    if (!n) return false;
    const cs = getComputedStyle(n);
    if (n.hidden || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
    const r = n.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const box = (s) => { const n = document.querySelector(s); if (!vis(n)) return null; const r = n.getBoundingClientRect(); return { s, l: r.left, t: r.top, r: r.right, b: r.bottom }; };
  const overlap = (A, B) => !(A.r <= B.l + 1 || B.r <= A.l + 1 || A.b <= B.t + 1 || B.b <= A.t + 1);
  const mapChrome = ['.cmdBar', '.geoActions', '.geoOpsStrip', '.geoDock', '.geoViewCtl', '.geoModeRail', '.geoTimeline', '.aiLauncher']
    .map(box).filter(Boolean);
  const panels = ['.roleDashboardHead', '.cityKpis', '.plantFacilityBar', '.roleDashboardGrid'].map(box).filter(Boolean);
  const collisions = [];
  mapChrome.forEach((c) => panels.forEach((p) => { if (overlap(c, p)) collisions.push(`${c.s} ∩ ${p.s}`); }));
  return { leaked: mapChrome.map((c) => c.s), collisions };
}

/* A workspace must still say, somewhere visible, that the data is not real. */
function safetyMarkerProbe() {
  const vis = (n) => { const cs = getComputedStyle(n); if (n.hidden || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  return [...document.querySelectorAll('.citySyntheticBanner, .plantSyntheticBanner, .geoRibbon, .opsMode')]
    .some((n) => vis(n) && /mô phỏng|simulated|synthetic|not for operations/i.test(n.textContent || ''));
}

const browser = await launchGpu();

console.log('\n== switcher reachability ==');
{
  const page = await browser.newPage({ viewport: { width: 1512, height: 900 } });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2200);

  const routes = await page.evaluate(() =>
    [...document.querySelectorAll('#workspaceNav [data-workspace]')].map((b) => b.dataset.workspace));
  ok('switcher offers map, city and plant', ['map', 'city', 'plant'].every((r) => routes.includes(r)), routes.join(','));

  // Every button must be the topmost element at its own centre, or it cannot be clicked.
  const covered = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#workspaceNav [data-workspace]').forEach((b) => {
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      if (top !== b && !b.contains(top)) out.push(`${b.dataset.workspace} covered by ${top ? (top.id || top.className || top.tagName) : 'nothing'}`);
    });
    return out;
  });
  ok('no switcher button is covered by other chrome', covered.length === 0, covered.join('; '));

  // map → city → plant → map, by clicking only.
  const seen = [];
  for (const route of ['city', 'plant', 'map']) {
    await page.click(`#workspaceNav [data-workspace="${route}"]`);
    await page.waitForTimeout(900);
    seen.push(await page.evaluate(() => document.body.dataset.workspace));
  }
  ok('round trip map → city → plant → map by clicking', seen.join('>') === 'city>plant>map', seen.join('>'));
  await page.close();
}

console.log('\n== deep link keeps an exit ==');
for (const ws of ['city', 'plant']) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 900 } });
  await page.goto(`${BASE}?workspace=${ws}`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  const exitVisible = await page.evaluate(() => {
    const b = document.querySelector('#workspaceNav [data-workspace="map"]');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    const cs = getComputedStyle(b);
    return cs.display !== 'none' && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight;
  });
  ok(`${ws}: map button is on screen after a cold deep link`, exitVisible);
  if (exitVisible) {
    await page.click('#workspaceNav [data-workspace="map"]');
    await page.waitForTimeout(900);
    const back = await page.evaluate(() => ({ ws: document.body.dataset.workspace, q: location.search }));
    ok(`${ws}: that button returns to the map and clears the query`, back.ws === 'map' && !back.q.includes('workspace='), JSON.stringify(back));
  }
  await page.close();
}

for (const ws of ['city', 'plant']) {
  console.log(`\n== ${ws} workspace ==`);
  for (const [w, h] of VIEWS) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 140)));
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      if (/tile|terrain|arcgis|esri|aws/i.test(t)) return;   // third-party basemap tiles
      errors.push(t.slice(0, 140));
    });
    await page.goto(`${BASE}?workspace=${ws}`, { waitUntil: 'load' });
    await page.waitForTimeout(2400);

    const vp = `${w}×${h}`;
    const text = await page.evaluate(readableTextProbe);
    ok(`${vp} renders`, !text.error, text.error);
    if (!text.error) {
      ok(`${vp} no workflow enum codes on screen`, text.enums.length === 0, text.enums.slice(0, 2).join(' | '));
      ok(`${vp} no FT.* code identifiers on screen`, text.idents.length === 0, text.idents.slice(0, 2).join(' | '));
      ok(`${vp} no database column names on screen`, text.columns.length === 0, text.columns.slice(0, 2).join(' | '));
      ok(`${vp} numbers use the interface locale`, text.usNumbers.length === 0, text.usNumbers.slice(0, 2).join(' | '));
      ok(`${vp} flow units are typeset (m³/s)`, text.asciiUnits.length === 0, text.asciiUnits.slice(0, 2).join(' | '));
    }

    const chrome = await page.evaluate(chromeProbe);
    ok(`${vp} no map chrome leaks over the dashboard`, chrome.leaked.length === 0, chrome.leaked.join(','));
    ok(`${vp} no chrome/panel collisions`, chrome.collisions.length === 0, chrome.collisions.join('; '));

    ok(`${vp} synthetic-data marker still visible`, await page.evaluate(safetyMarkerProbe));
    ok(`${vp} no page errors`, errors.length === 0, errors.slice(0, 2).join(' | '));
    await page.close();
  }
}

console.log('\n== English switch keeps the same guarantees ==');
for (const ws of ['city', 'plant']) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 900 } });
  await page.goto(`${BASE}?workspace=${ws}#en`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.FT && FT.i18n && FT.i18n.setLang('en'));
  await page.waitForTimeout(900);
  const text = await page.evaluate(readableTextProbe);
  ok(`${ws} EN: no enum codes`, !text.error && text.enums.length === 0, text.error || text.enums.slice(0, 2).join(' | '));
  ok(`${ws} EN: no FT.* identifiers`, !text.error && text.idents.length === 0, text.error || text.idents.slice(0, 2).join(' | '));
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('#workspaceNav [data-workspace]')].map((b) => b.textContent.trim()));
  ok(`${ws} EN: switcher labels are translated`, labels.join(',') === 'Map,City operations,Plant operations', labels.join(','));
  await page.close();
}

console.log('\n== i18n dictionary integrity ==');
{
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  // A duplicate key in an object literal is silently dropped, so a missing status label
  // shows up as the raw code. Assert every code the screens can emit has a label.
  const unresolved = await page.evaluate(() => {
    const codes = ['PROPOSED', 'SUBMITTED', 'APPROVED', 'NOTIFIED', 'EXECUTING', 'DEVIATING', 'VERIFIED',
      'CLOSED', 'ASSESSED', 'REJECTED', 'SUPERSEDED', 'NOT_IN_CURRENT_DEMO', 'ASSUMED_FOR_DEMO',
      'APPROVED_PLAN', 'PROPOSAL', 'RECOMMENDATION', 'CURRENT_PACKAGE', 'MISSING', 'OK',
      'HydropowerFacility', 'operating', 'not-generating'];
    const bad = [];
    ['vi', 'en'].forEach((lang) => {
      FT.i18n.setLang(lang);
      codes.forEach((c) => { const l = FT.i18n.status(c); if (l === c || l === `status.${c}`) bad.push(`${lang}:${c}`); });
    });
    FT.i18n.setLang('vi');
    return bad;
  });
  ok('every workflow code has a human label in both languages', unresolved.length === 0, unresolved.join(','));
  await page.close();
}

await browser.close();
srv.kill();
console.log(`\n${fails ? `✗ ${fails} check(s) failed` : '✓ all workspace UI checks passed'}`);
process.exit(fails ? 1 : 0);
