/* ==========================================================================
   E2E harness core.

   Inherited from SkyLabs_SURF2026/scripts/e2e.mjs: the step/ok/bad/check result
   collection, per-page console + pageerror capture, and the grouped console report
   with a non-zero exit code.

   Four deliberate improvements over the inherited version:

   1. BOOT ON A SIGNAL, NOT A SLEEP. The old harness waited `page.waitForTimeout(22000)`
      for the demo to settle. That is simultaneously too slow on a warm machine and too
      short on a cold one — the classic source of "flaky" CI. This waits for the app's own
      `[selftest]` console line, which the app only emits once geo, world, hydro and the
      decision layer are all up. Fast when the machine is fast, patient when it is not.

   2. SCREENSHOT + STATE DUMP ON FAILURE. A red line in a log tells you nothing about a
      canvas application. Each failure writes a PNG and the FT state that produced it.

   3. DETERMINISTIC TIME CONTROL. `setTime()` drives the app the way the app itself does
      (scrub → resettle world → recompute zones → tick), so a test never races the
      render loop. Every timing-dependent assertion goes through it.

   4. MACHINE-READABLE REPORT. A JSON artefact alongside the human output, so results can
      be diffed between runs rather than eyeballed.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ARTIFACTS = path.resolve(HERE, 'artifacts');

export const results = [];
let current = '(ungrouped)';
let currentPage = null;

export function step(name) { current = name; }
export function usePage(page) { currentPage = page; }
export function ok(msg, detail) { results.push({ pass: true, group: current, msg, detail }); }
export function bad(msg, detail) { results.push({ pass: false, group: current, msg, detail }); }

/** Run one assertion. Returning false fails it; throwing fails it with the message. */
export async function check(msg, fn) {
  let detail;
  try {
    const r = await fn((d) => { detail = d; });
    if (r === false) { await onFail(msg); bad(msg, detail); }
    else ok(msg, detail);
  } catch (e) {
    await onFail(msg);
    bad(msg, `${e.message.split('\n')[0]}${detail ? ` · ${JSON.stringify(detail)}` : ''}`);
  }
}

/** Capture evidence for a failing assertion — a canvas app cannot be debugged from text. */
async function onFail(msg) {
  if (!currentPage) return;
  try {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    const slug = msg.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
    await currentPage.screenshot({ path: path.join(ARTIFACTS, `fail-${slug}.png`), fullPage: false });
    const state = await currentPage.evaluate(() => {
      const S = window.FT && window.FT.state;
      return S ? {
        scenario: S.scenario, policy: S.policy, timeH: S.timeH, view: S.view,
        mpcApproved: S.mpcApproved, lang: S.lang,
        dataLevel: window.FT.ops ? window.FT.ops.health().level : null,
        pkgKind: window.FT.ops && window.FT.ops._last ? window.FT.ops._last.kind : null,
      } : null;
    }).catch(() => null);
    fs.writeFileSync(path.join(ARTIFACTS, `fail-${slug}.json`), JSON.stringify(state, null, 2));
  } catch { /* evidence capture must never mask the real failure */ }
}

/* ---------- app control ---------- */

/** Open the app and wait for its OWN readiness signal rather than a fixed sleep. */
export async function bootApp(browser, base, opts = {}) {
  const ctx = await browser.newContext({
    viewport: opts.viewport || { width: 1440, height: 900 },
    ...(opts.context || {}),
  });
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('console', (m) => {
    logs.push(m.text());
    if (m.type() !== 'error') return;
    const where = (m.location && m.location().url) || '';
    errors.push(m.text() + (where ? ' @ ' + where : ''));
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(`${base}/index.html${opts.hash || ''}`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  /* the app logs `[selftest] PASS n/n` (or FAIL) once every subsystem is up */
  const t0 = Date.now();
  const deadline = opts.bootTimeout || 90000;
  let selftest = null;
  while (Date.now() - t0 < deadline) {
    selftest = logs.find((l) => l.includes('[selftest]'));
    if (selftest) break;
    await page.waitForTimeout(250);
  }
  /* the decision layer initialises just after; wait for it to be addressable */
  await page.waitForFunction(() => window.FT && window.FT.ops && window.FT.hydro && window.FT.hydro.ready,
    null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);

  return { ctx, page, errors, logs, selftest, bootMs: Date.now() - t0 };
}

/** Drive the app to a simulation time the way the app itself does. Never race the loop. */
export async function setTime(page, t, ticks = 5) {
  await page.evaluate(({ t, ticks }) => {
    const FT = window.FT;
    FT.state.playing = false;
    FT.state.timeH = t;
    FT.bus.emit('scrubbed');
    FT.world.updateRoadDepths();
    FT.zones.stepStats(true);
    const snap = FT.hydro.at(t);
    if (FT.alarms) FT.alarms.scan(snap);
    for (let i = 0; i < ticks; i++) FT.ui.tick(snap);
  }, { t, ticks });
}

/** Switch scenario and let every derived layer rebuild. */
export async function setScenario(page, scenario) {
  await page.evaluate((s) => {
    window.FT.state.scenario = s;
    window.FT.hydro.rebuild();
  }, scenario);
  await page.waitForTimeout(150);
}

/** Choose the operating policy through the real control, not by poking state. */
export async function setPolicy(page, policy) {
  await page.click(`.policyToggle button[data-policy="${policy}"]`);
  await page.waitForTimeout(200);
}

/** Sign on as the holder of a given role label, through the real selector.
    Decisions are now gated by the RACI table, so a test must sign on as the office that is
    actually accountable for the decision it is about to make — which is also how the real
    workflow behaves. */
export async function signOnRole(page, roleLabel) {
  return page.evaluate((label) => {
    const s = document.getElementById('opsActor');
    for (const o of s.options) {
      if (o.value.includes('|' + label)) { s.value = o.value; s.dispatchEvent(new Event('change')); return o.value; }
    }
    throw new Error('no duty officer with role ' + label);
  }, roleLabel);
}
export const ROLE = {
  operator: 'Trưởng ca vận hành',
  resEngineer: 'Kỹ sư vận hành hồ',
  plantManager: 'Giám đốc nhà máy',
  authority: 'Ban Chỉ huy PCTT&TKCN',
  damSafety: 'Kỹ sư an toàn đập',
  commander: 'Chỉ huy ứng phó',
};

/** Sign on as a duty operator through the real selector. */
export async function signOn(page, index = 1) {
  const value = await page.evaluate((i) => {
    const s = document.getElementById('opsActor');
    s.value = s.options[i].value;
    s.dispatchEvent(new Event('change'));
    return s.value;
  }, index);
  return value;
}

/** Set the data-degradation level through the real control. */
export async function setDegradation(page, level) {
  await page.evaluate((lv) => {
    const s = document.getElementById('opsDegrade');
    s.value = lv == null ? '' : String(lv);
    s.dispatchEvent(new Event('change'));
  }, level);
  await page.waitForTimeout(120);
}

/* ---------- reporting ---------- */
export function report(title = 'FloodTwin E2E') {
  let group = '';
  for (const r of results) {
    if (r.group !== group) { group = r.group; console.log(`\n${group}`); }
    console.log(`  ${r.pass ? '✓' : '✗'} ${r.msg}${r.detail && !r.pass ? `\n      ${typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail)}` : ''}`);
  }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(20)} ${title} ${'='.repeat(20)}`);
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFailed:');
    failed.forEach((f) => console.log(`  ✗ [${f.group}] ${f.msg}`));
    console.log(`\nEvidence: ${ARTIFACTS}`);
  }
  try {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify({
      title,
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.length,
      results,
    }, null, 2));
  } catch { /* the report is a convenience, not a gate */ }
  return failed.length;
}
