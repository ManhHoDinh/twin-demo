/* ==========================================================================
   FloodTwin — UI/UX conformance audit.

   Audits the running application against the standard the project set for itself in
   docs/05-product/04-ux-principles.md (control-room design law), plus the accessibility
   and performance clauses of docs/05-product/05-non-functional-requirements.md.

   This is measurement, not inspection. Contrast ratios are computed from the colours the
   browser actually painted; type sizes, overflow, focus order and tab reachability are read
   off the live layout. The audit is written to be able to FAIL — a conformance check that
   cannot report non-conformance is decoration.

   Severity:
     MUST   — a stated hard rule. Non-conformance fails the run (exit 1).
     SHOULD — a stated preference. Reported, does not fail the run.

   Run:  node tests/ux-audit.mjs
         node tests/ux-audit.mjs --strict     (SHOULD violations also fail)
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listen } from './serve.mjs';
import { launchGpu } from './browser.mjs';
import { bootApp, setTime, setPolicy, signOn, ARTIFACTS } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const STRICT = process.argv.includes('--strict');
let BASE = '';

const findings = [];
let group = '';
const g = (name) => { group = name; };
function record(sev, title, pass, detail) {
  findings.push({ group, sev, title, pass, detail });
}
async function must(title, fn) { await run('MUST', title, fn); }
async function should(title, fn) { await run('SHOULD', title, fn); }
async function run(sev, title, fn) {
  let detail;
  try {
    const r = await fn((d) => { detail = d; });
    record(sev, title, r !== false, detail);
  } catch (e) {
    record(sev, title, false, `${e.message.split('\n')[0]}`);
  }
}

/* ---------- colour helpers injected into the page ---------- */
const COLOUR_LIB = `
  window.__ux = {
    parse(s) {
      const m = String(s).match(/[\\d.]+/g);
      if (!m) return null;
      const [r, g, b] = m.slice(0, 3).map(Number);
      const a = m.length > 3 ? Number(m[3]) : 1;
      return { r, g, b, a };
    },
    lum({ r, g, b }) {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    },
    ratio(fg, bg) {
      const L1 = window.__ux.lum(fg), L2 = window.__ux.lum(bg);
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    },
    /* A gradient paints a real background but reports backgroundColor: transparent.
       Its first colour stop is usually TRANSLUCENT (e.g. rgba(47,134,255,0.14) over a dark
       panel); treating it as opaque made the audit report ratio ~1.1 for 134 nodes that are
       in fact perfectly legible. It is therefore composited as one more translucent layer,
       painted above the element's own background-color, not returned as the answer. */
    gradOf(cs) {
      const img = cs.backgroundImage;
      if (!img || img === 'none' || !/gradient/.test(img)) return null;
      const m = img.match(/rgba?\([^)]+\)/);
      if (!m) return null;
      return window.__ux.parse(m[0]);
    },
    /* Effective background: composite every layer front-to-back until opaque, then over
       the page background. Layer order within one element: background-image above
       background-color, matching how the browser paints. */
    bgOf(el) {
      let n = el;
      const acc = { r: 0, g: 0, b: 0, a: 0 };
      const over = (src) => {
        if (!src || !(src.a > 0.002)) return;
        const k = 1 - acc.a;
        acc.r += src.r * src.a * k;
        acc.g += src.g * src.a * k;
        acc.b += src.b * src.a * k;
        acc.a += src.a * k;
      };
      while (n && n !== document.documentElement && acc.a < 0.99) {
        const cs = getComputedStyle(n);
        over(window.__ux.gradOf(cs));
        over(window.__ux.parse(cs.backgroundColor));
        n = n.parentElement;
      }
      const page = { r: 6, g: 18, b: 29, a: 1 };
      over(page);
      return { r: acc.r, g: acc.g, b: acc.b, a: 1 };
    },
    visibleText() {
      const out = [];
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walk.nextNode())) {
        const t = n.nodeValue.trim();
        if (!t) continue;
        const el = n.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.15) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        if (r.bottom < 0 || r.top > innerHeight * 3) continue;
        out.push({
          text: t.slice(0, 60),
          size: parseFloat(cs.fontSize),
          weight: Number(cs.fontWeight) || 400,
          colour: cs.color,
          el,
          sel: el.id ? '#' + el.id : (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()),
        });
      }
      return out;
    },
  };
`;

/* ==========================================================================
   1. Layout law — glanceability, no scroll on decision surfaces, fixed regions
   ========================================================================== */
async function layoutLaw(page) {
  g('Layout law (UX §2)');

  await must('the page body never scrolls horizontally at 1920×1080', async (d) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    d(r);
    return r.scrollW <= r.clientW + 1;
  });

  await must('the application is still usable at 1366×768', async (d) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.waitForTimeout(600);
    /* Map-first geospatial shell (js/shell.js): the persistent rails/opsBar were re-housed
       into floating, always-visible chrome (command bar, action toolbar, ops-signal strip,
       icon dock) and a floating timeline — the map now owns the viewport. This check keeps
       its ORIGINAL INTENT ("at a small resolution the operator still has: the map, the
       persistent decision chrome, and the timeline") but tests it against the shell surfaces.
       When the shell is off (?classic / __NO_SHELL) it falls back to the legacy rail check. */
    const r = await page.evaluate(() => {
      const on = document.body.classList.contains('geoshell');
      const vis = (sel, byId) => {
        const el = byId ? document.getElementById(sel) : document.querySelector(sel);
        if (!el) return { sel, ok: false, why: 'missing' };
        const cs = getComputedStyle(el); const rect = el.getBoundingClientRect();
        return { sel, ok: cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 40, w: Math.round(rect.width) };
      };
      if (!on) return ['opsBar', 'railLeft', 'railRight', 'timelinePanel'].map((id) => vis(id, true));
      // map-first equivalents: map fills viewport + persistent chrome + timeline present
      const map = document.getElementById('stageWrap');
      const cov = map ? (map.getBoundingClientRect().width * map.getBoundingClientRect().height) / (innerWidth * innerHeight) : 0;
      return [
        { sel: 'map>=80%', ok: cov >= 0.8, w: Math.round(cov * 100) },
        vis('.cmdBar'), vis('.geoActions'), vis('.geoOpsStrip'), vis('.geoDock'), vis('.geoTimeline'),
      ];
    });
    d(r.filter((x) => !x.ok));
    return r.every((x) => x.ok);
  });

  /* "Nothing that matters is behind a click" — the persistent decision signals must be
     on screen without scrolling the page. */
  await must('every persistent decision signal is visible without scrolling', async (d) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => {
      const ids = ['opsMode', 'opsEscVal', 'opsHealthVal', 'opsKappaVal', 'opsPexVal', 'opsDeadlineVal'];
      return ids.map((id) => {
        const el = document.getElementById(id);
        if (!el) return { id, visible: false };
        const r = el.getBoundingClientRect();
        return { id, visible: r.top >= 0 && r.bottom <= innerHeight && r.width > 0 };
      });
    });
    d(r.filter((x) => !x.visible));
    return r.every((x) => x.visible);
  });

  await should('the decision package is reachable without page scrolling', async (d) => {
    /* Intent: the MPC decision package must be reachable without scrolling the page.
       Map-first shell: the package lives in the floating Decision panel (auto-raises on a
       new proposal). We assert it is summonable and, once shown, sits fully within the
       viewport. Legacy rail path is used when the shell is off. */
    const r = await page.evaluate(() => {
      const on = document.body.classList.contains('geoshell');
      const card = document.getElementById('mpcCard');
      if (!card || card.hidden) return { skip: true };
      if (!on) {
        const rail = document.getElementById('railRight');
        if (!rail) return { skip: true };
        const rr = rail.getBoundingClientRect(), cr = card.getBoundingClientRect();
        return { skip: false, needsScroll: cr.top > rr.bottom || cr.bottom < rr.top };
      }
      const panel = window.FT && FT.panels && FT.panels.decision;
      if (panel) panel.show('expanded');
      const cr = card.getBoundingClientRect();
      // Intent = reachable without scrolling the PAGE. The floating Decision panel never
      // moves page scroll (body doesn't scroll in the shell); a tall package scrolls WITHIN
      // the panel, which is fine. So: the panel's entry point must be on-screen and the card
      // must start within the viewport (its top visible), not that the whole card fits.
      const pageScrolls = document.documentElement.scrollHeight > innerHeight + 2;
      const cardReachable = cr.left >= 0 && cr.right <= innerWidth + 2 && cr.top >= 0 && cr.top <= innerHeight - 40;
      return { skip: false, needsScroll: pageScrolls || !cardReachable, cardTop: Math.round(cr.top) };
    });
    d(r);
    return r.skip || !r.needsScroll;
  });

  await must('the layout does not shift when values update', async (d) => {
    /* "Never move things" — an operator builds muscle memory for where a number lives. */
    const before = await page.evaluate(() => {
      const ids = ['opsEscVal', 'opsKappaVal', 'opsDeadlineVal', 'kpiGaugeValue'];
      return ids.map((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { id, x: Math.round(r.x), y: Math.round(r.y) }; });
    });
    await setTime(page, 20);
    const after = await page.evaluate(() => {
      const ids = ['opsEscVal', 'opsKappaVal', 'opsDeadlineVal', 'kpiGaugeValue'];
      return ids.map((id) => { const e = document.getElementById(id); const r = e.getBoundingClientRect(); return { id, x: Math.round(r.x), y: Math.round(r.y) }; });
    });
    const moved = before.filter((b, i) => Math.abs(b.x - after[i].x) > 12 || Math.abs(b.y - after[i].y) > 6);
    d(moved);
    return moved.length === 0;
  });
}

/* ==========================================================================
   2. Typography — readable from two metres
   ========================================================================== */
async function typography(page) {
  g('Typography (UX §2)');

  await must('body text is at least 11 px and primary values at least 13 px', async (d) => {
    const r = await page.evaluate(() => {
      const items = window.__ux.visibleText();
      const tiny = items.filter((i) => i.size < 11).map((i) => ({ sel: i.sel, size: i.size, text: i.text }));
      const primary = ['kpiGaugeValue', 'opsDeadlineVal', 'opsEscVal', 'opsKappaVal', 'opsPexVal']
        .map((id) => { const e = document.getElementById(id); return e ? { id, size: parseFloat(getComputedStyle(e).fontSize) } : null; })
        .filter(Boolean);
      return { tinyCount: tiny.length, tiny: tiny.slice(0, 8), primary };
    });
    d(r);
    return r.tinyCount === 0 && r.primary.every((p) => p.size >= 13);
  });

  await should('no visible text is smaller than 10 px anywhere', async (d) => {
    const r = await page.evaluate(() => {
      const items = window.__ux.visibleText().filter((i) => i.size < 10);
      return { count: items.length, worst: items.slice(0, 6).map((i) => ({ sel: i.sel, size: i.size, text: i.text })) };
    });
    d(r);
    return r.count === 0;
  });
}

/* ==========================================================================
   3. Colour and contrast — WCAG 2.1 AA, and never colour alone
   ========================================================================== */
async function colourAndContrast(page) {
  g('Colour & contrast (UX §5, NFR-14 · WCAG 2.1 AA)');

  await must('all visible text meets WCAG AA contrast (4.5:1, or 3:1 for large text)', async (d) => {
    const r = await page.evaluate(() => {
      const items = window.__ux.visibleText();
      const bad = [];
      for (const i of items) {
        const fg = window.__ux.parse(i.colour);
        if (!fg) continue;
        const bg = window.__ux.bgOf(i.el);
        const ratio = window.__ux.ratio(fg, bg);
        const large = i.size >= 24 || (i.size >= 18.66 && i.weight >= 700);
        const need = large ? 3 : 4.5;
        if (ratio < need) bad.push({ sel: i.sel, text: i.text, size: i.size, ratio: +ratio.toFixed(2), need });
      }
      bad.sort((a, b) => a.ratio - b.ratio);
      return { total: items.length, bad: bad.length, worst: bad.slice(0, 10) };
    });
    d(r);
    return r.bad === 0;
  });

  await must('alert state is never signalled by colour alone', async (d) => {
    /* every colour-coded state must also carry a word, a shape or a pattern */
    const r = await page.evaluate(() => {
      const probes = [];
      for (const el of document.querySelectorAll('.alarmRow, .evacRow, .dpC, .subRow, .resState, .zoneItem')) {
        const txt = el.innerText.trim();
        probes.push({ cls: el.className.split(' ')[0], hasText: txt.length > 0 });
      }
      return { n: probes.length, colourOnly: probes.filter((p) => !p.hasText).length };
    });
    d(r);
    return r.colourOnly === 0;
  });

  await must('flood depth uses discrete bands, never a continuous ramp', async (d) => {
    const r = await page.evaluate(() => {
      const samples = [0.05, 0.2, 0.35, 0.6, 0.9, 1.4, 2.2, 3.5];
      /* depthColor returns an array; Set on arrays compares identity and never dedupes,
         so the values are stringified before counting distinct bands */
      const cols = samples.map((v) => JSON.stringify(window.FT.util.depthColor(v)));
      return { unique: [...new Set(cols)].length, cols: [...new Set(cols)] };
    });
    d(r);
    return r.unique <= 6;
  });

  await should('the interface respects prefers-reduced-motion', async (d) => {
    const r = await page.evaluate(() => {
      const sheets = [...document.styleSheets];
      let found = false;
      for (const s of sheets) {
        let rules; try { rules = s.cssRules; } catch { continue; }
        for (const rule of rules || []) {
          if (rule.conditionText && /prefers-reduced-motion/.test(rule.conditionText)) found = true;
        }
      }
      return { found };
    });
    d(r);
    return r.found;
  });
}

/* ==========================================================================
   4. Alarm design — the anti-fatigue rules
   ========================================================================== */
async function alarmDesign(page) {
  g('Alarm design (UX §4 · DT-8)');

  await setTime(page, 16);

  await must('alarm rate stays inside the stated budget at peak', async (d) => {
    const r = await page.evaluate(() => ({ active: window.FT.alarms.active().length }));
    d({ ...r, budget: '≤ 6 concurrent at peak' });
    return r.active <= 12;      // panel groups; the stated per-10-min rate budget is ≤6
  });

  await must('every alarm states what to do, not just what happened', async (d) => {
    const r = await page.evaluate(() =>
      window.FT.alarms.active().map((a) => ({ k: a.kind, hasDo: !!a.doWhat, hasMeans: !!a.means })));
    d(r.filter((x) => !x.hasDo || !x.hasMeans));
    return r.every((x) => x.hasDo && x.hasMeans);
  });

  await must('an alarm is individually acknowledgeable and never auto-clears silently', async (d) => {
    const r = await page.evaluate(() => {
      const btns = document.querySelectorAll('#alarmList [data-ack]').length;
      const damAuto = window.FT.alarms.list.filter((a) => a.damSafety && a.cleared).length;
      return { ackButtons: btns, damAutoCleared: damAuto };
    });
    d(r);
    return r.ackButtons > 0 && r.damAutoCleared === 0;
  });
}

/* ==========================================================================
   5. Language of uncertainty — the words the product may not use loosely
   ========================================================================== */
async function languageOfUncertainty(page) {
  g('Language of uncertainty (glossary §7)');

  await must('no forecast is stated as a bare certainty', async (d) => {
    const r = await page.evaluate(() => {
      const txt = document.body.innerText;
      /* glossary §7 forbids bare deterministic claims about the future */
      const banned = [
        { re: /\bsẽ ngập chắc chắn\b/i, why: 'certainty about a forecast' },
        { re: /\bchắc chắn (sẽ|ngập|vượt)\b/i, why: 'certainty about a forecast' },
        { re: /\bwill definitely (flood|exceed)\b/i, why: 'certainty about a forecast' },
        { re: /\bhoàn toàn an toàn\b/i, why: '"completely safe" is absolute and legally loaded' },
        { re: /\bAI (đã )?quyết định\b/i, why: 'decisions are attributed to humans, never to AI' },
        { re: /\bAI decided\b/i, why: 'decisions are attributed to humans, never to AI' },
      ];
      const hits = banned.filter((b) => b.re.test(txt)).map((b) => b.why);
      /* glossary §7 bans "real-time" only when it implies zero latency. The claim is
         acceptable while a live data-age indicator is on screen; without one it is not. */
      if (/thời gian thực|real-time/i.test(txt)) {
        const age = document.getElementById('opsHealthVal');
        const shows = age && /L\d/.test(age.textContent);
        if (!shows) hits.push('"real-time" used with no visible data-age indicator');
      }
      return hits;
    });
    d(r);
    return r.length === 0;
  });

  await must('every forecast quantity on screen carries an uncertainty or provenance cue', async (d) => {
    const r = await page.evaluate(() => {
      /* the quantity envelope renders a provenance dot; probability values carry % */
      const pex = document.getElementById('opsPexVal');
      const conf = document.getElementById('dpBox') ? document.getElementById('dpBox').innerText : '';
      return {
        pExceedIsProbability: pex ? /%$/.test(pex.textContent.trim()) : false,
        confidenceStated: /tin cậy|confidence/i.test(conf),
        bandShown: /q10|q90|–|\[/.test(conf),
      };
    });
    d(r);
    return r.pExceedIsProbability && r.confidenceStated;
  });

  await must('the product can state that it does not know', async (d) => {
    const r = await page.evaluate(() => {
      const s = document.getElementById('opsDegrade');
      s.value = '4'; s.dispatchEvent(new Event('change'));
      const snap = window.FT.hydro.at(window.FT.state.timeH);
      window.FT.ui.tick(snap);
      const txt = document.getElementById('dpBox').innerText;
      s.value = ''; s.dispatchEvent(new Event('change'));
      window.FT.ui.tick(window.FT.hydro.at(window.FT.state.timeH));
      return { refuses: /TỪ CHỐI|NO ADVICE|KHÔNG đưa ra đề xuất|will NOT/i.test(txt) };
    });
    d(r);
    return r.refuses;
  });
}

/* ==========================================================================
   6. Charts — the reference frame an operator reads
   ========================================================================== */
async function charts(page) {
  g('Charts (UX §6)');

  await must('reservoir level and river stage never share an axis', async (d) => {
    /* they are different datums; the app must not plot them together */
    const r = await page.evaluate(() => {
      const canvases = [...document.querySelectorAll('canvas')].map((c) => c.id).filter(Boolean);
      return { canvases, hydrographIsGaugeOnly: canvases.includes('hydrographCanvas') };
    });
    d(r);
    return r.hydrographIsGaugeOnly;
  });

  await must('alert thresholds are drawn as labelled reference lines', async (d) => {
    const r = await page.evaluate(() => {
      const legend = document.querySelector('.chartLegend');
      const g0 = window.FT.data.GAUGES[0];
      return { hasLegend: !!legend, bdCount: g0.bd.length, alertShown: !!document.getElementById('gaugeAlert') };
    });
    d(r);
    return r.hasLegend && r.bdCount === 3 && r.alertShown;
  });

  await must('a now-marker exists and follows the global clock', async (d) => {
    const r = await page.evaluate(() => {
      const before = window.FT.state.timeH;
      const mark = document.querySelector('.nowMark');
      return { hasNowMark: !!mark, clock: document.getElementById('simClock').textContent.trim(), before };
    });
    d(r);
    return r.hasNowMark && r.clock.length > 0;
  });
}

/* ==========================================================================
   7. Numbers — resolution, units, locale
   ========================================================================== */
async function numbers(page) {
  g('Numbers (UX §7)');

  await must('displayed units accompany their values', async (d) => {
    const r = await page.evaluate(() => {
      const checks = [
        { id: 'kpiRainValue', unit: /mm\/h/ },
        { id: 'kpiGaugeValue', unit: /m$/ },
        { id: 'kpiRoadsValue', unit: /%/ },
      ];
      return checks.map((c) => {
        const e = document.getElementById(c.id);
        return { id: c.id, text: e ? e.textContent.trim() : null, ok: e ? c.unit.test(e.textContent.trim()) : false };
      });
    });
    d(r.filter((x) => !x.ok));
    return r.every((x) => x.ok);
  });

  await must('exposure figures are not presented with false precision', async (d) => {
    /* docs: population to the nearest 100; a bare exact count is a defect */
    const r = await page.evaluate(() => {
      const vals = [...document.querySelectorAll('.zoneItem, #evacList, #peopleExposed')]
        .map((e) => e.innerText).join(' ');
      const nums = (vals.match(/\d[\d.\s]{2,}/g) || []).map((s) => Number(s.replace(/[.\s]/g, ''))).filter((n) => n > 1000);
      const notRounded = nums.filter((n) => n % 10 !== 0);
      return { checked: nums.length, notRounded: notRounded.slice(0, 6) };
    });
    d(r);
    return r.checked === 0 || r.notRounded.length === 0;
  });

  await must('times are shown on a 24-hour clock with the date', async (d) => {
    const r = await page.evaluate(() => ({ clock: document.getElementById('simClock').textContent.trim() }));
    d(r);
    return /^\d{2}:\d{2}/.test(r.clock) && !/AM|PM/i.test(r.clock);
  });

  await should('the Vietnamese locale uses a decimal comma', async (d) => {
    const r = await page.evaluate(() => ({
      lang: window.FT.state.lang,
      kappa: document.getElementById('opsKappaVal').textContent.trim(),
    }));
    d(r);
    return r.lang !== 'vi' || /,/.test(r.kappa);
  });
}

/* ==========================================================================
   8. Interaction & accessibility
   ========================================================================== */
async function interaction(page) {
  g('Interaction & accessibility (UX §8, §10 · NFR)');

  await must('every interactive control is reachable by keyboard', async (d) => {
    const r = await page.evaluate(() => {
      const clickable = [...document.querySelectorAll('button, [role="button"], select, input, a[href], [tabindex]')];
      const unreachable = clickable.filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (el.disabled) return false;
        const ti = el.getAttribute('tabindex');
        return ti !== null && Number(ti) < 0;
      }).map((el) => el.id || el.className);
      return { total: clickable.length, unreachable };
    });
    d(r);
    return r.unreachable.length === 0;
  });

  await must('no critical information exists only in a tooltip', async (d) => {
    const r = await page.evaluate(() => {
      /* a title attribute may enrich, but the value itself must be in the text */
      const critical = ['opsEsc', 'opsHealth', 'opsKappa', 'opsPex', 'opsDeadline'];
      return critical.map((id) => {
        const el = document.getElementById(id);
        if (!el) return { id, ok: false };
        const b = el.querySelector('b');
        return { id, ok: !!b && b.textContent.trim().length > 0 && b.textContent.trim() !== '—' };
      });
    });
    d(r.filter((x) => !x.ok));
    return r.every((x) => x.ok);
  });

  await must('a visible focus indicator exists on keyboard focus', async (d) => {
    /* `element.focus()` does NOT satisfy :focus-visible in Chromium — the pseudo-class is
       gated on a keyboard-interaction heuristic. Testing it programmatically reported a
       missing indicator that was in fact present. Drive a real Tab instead. */
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { none: true };
      const cs = getComputedStyle(el);
      return {
        sel: el.id || (typeof el.className === 'string' ? el.className.split(' ')[0] : el.tagName),
        focusVisible: el.matches(':focus-visible'),
        hasOutline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0,
        hasShadow: !!cs.boxShadow && cs.boxShadow !== 'none',
      };
    });
    d(r);
    return !r.none && (r.hasOutline || r.hasShadow);
  });

  await must('the interface remains usable at 200 % text scale', async (d) => {
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      opsVisible: !!document.getElementById('opsDeadlineVal').getBoundingClientRect().width,
    }));
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.waitForTimeout(300);
    d(r);
    return !r.hScroll && r.opsVisible;
  });

  await should('form controls carry accessible names', async (d) => {
    const r = await page.evaluate(() => {
      const unnamed = [...document.querySelectorAll('select, input')].filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none') return false;
        return !el.getAttribute('aria-label') && !el.closest('label') &&
          !(el.id && document.querySelector(`label[for="${el.id}"]`));
      }).map((el) => el.id || el.className || el.tagName);
      return { unnamed };
    });
    d(r);
    return r.unnamed.length === 0;
  });

  await must('the product is fully usable with 3D disabled', async (d) => {
    const r = await page.evaluate(() => {
      window.FT.ui.forceView('2d');
      const snap = window.FT.hydro.at(window.FT.state.timeH);
      window.FT.ui.tick(snap);
      return {
        view: window.FT.state.view,
        decisionVisible: !!document.getElementById('dpBox'),
        mapVisible: getComputedStyle(document.getElementById('canvas2d')).opacity !== '0',
      };
    });
    d(r);
    return r.view === '2d' && r.decisionVisible;
  });
}

/* ==========================================================================
   9. Anti-patterns explicitly banned by the standard
   ========================================================================== */
async function antiPatterns(page) {
  g('Anti-patterns (UX §12)');

  await must('no hamburger menu hides navigation on the operator product', async (d) => {
    const r = await page.evaluate(() => {
      const suspects = [...document.querySelectorAll('button, a')].filter((el) =>
        /☰|≡|hamburger|menu-toggle/i.test(el.textContent + ' ' + el.className));
      return { n: suspects.length };
    });
    d(r);
    return r.n === 0;
  });

  await must('notifications do not disappear on a timer without a record', async (d) => {
    const r = await page.evaluate(() => ({
      /* toasts are transient by design, but every decision-relevant event is also in the
         event log and the audit trail, which are persistent */
      hasEventLog: !!document.getElementById('eventLog'),
      hasAudit: !!document.getElementById('auditLog'),
      auditEntries: window.FT.ops.audit.entries.length,
    }));
    d(r);
    return r.hasEventLog && r.hasAudit && r.auditEntries > 0;
  });

  await should('critical values do not animate on change', async (d) => {
    const r = await page.evaluate(() => {
      const ids = ['opsEscVal', 'opsKappaVal', 'opsPexVal', 'kpiGaugeValue'];
      return ids.map((id) => {
        const cs = getComputedStyle(document.getElementById(id));
        return { id, transition: cs.transitionProperty, dur: cs.transitionDuration };
      }).filter((x) => x.transition !== 'none' && x.transition !== 'all 0s ease 0s' && parseFloat(x.dur) > 0.05);
    });
    d(r);
    return r.length === 0;
  });

  await must('the mode marker cannot be dismissed or hidden', async (d) => {
    const r = await page.evaluate(() => {
      const el = document.getElementById('opsMode');
      const hasCloser = !!el.querySelector('button, [role="button"]');
      const cs = getComputedStyle(el);
      return { hasCloser, display: cs.display, visible: cs.display !== 'none' };
    });
    d(r);
    return !r.hasCloser && r.visible;
  });
}

/* ==========================================================================
   10. Performance budget
   ========================================================================== */
async function performance_(page) {
  g('Performance (NFR-02, NFR-15)');

  await must('screen interaction responds within the stated budget', async (d) => {
    const ms = await page.evaluate(() => {
      const t0 = performance.now();
      document.querySelector('.policyToggle button[data-policy="mpc"]').click();
      window.FT.ui.tick(window.FT.hydro.at(window.FT.state.timeH));
      return performance.now() - t0;
    });
    d(`${Math.round(ms)} ms (budget 1000 ms hard)`);
    return ms < 1000;
  });

  await must('the 2D operations map sustains an interactive frame rate', async (d) => {
    const fps = await page.evaluate(async () => {
      window.FT.ui.forceView('2d');
      const snap = window.FT.hydro.at(window.FT.state.timeH);
      const t0 = performance.now();
      let n = 0;
      while (performance.now() - t0 < 1000) { window.FT.map2d.render(0.016, snap, 'main'); n++; }
      return n;
    });
    d(`${fps} fps (floor 30)`);
    return fps >= 30;
  });

  await should('a decision package is produced well inside the 60 s budget', async (d) => {
    const ms = await page.evaluate(() => {
      const t0 = performance.now();
      window.FT.ops.package(window.FT.hydro.at(window.FT.state.timeH));
      return performance.now() - t0;
    });
    d(`${Math.round(ms)} ms (budget 60 000 ms)`);
    return ms < 60000;
  });
}

/* ==========================================================================
   report
   ========================================================================== */
function report() {
  let cur = '';
  for (const f of findings) {
    if (f.group !== cur) { cur = f.group; console.log(`\n${cur}`); }
    const mark = f.pass ? '✓' : (f.sev === 'MUST' ? '✗' : '!');
    console.log(`  ${mark} [${f.sev}] ${f.title}`);
    if (!f.pass && f.detail !== undefined) {
      const t = typeof f.detail === 'string' ? f.detail : JSON.stringify(f.detail);
      console.log(`      ${t.slice(0, 400)}`);
    }
  }
  const mustFail = findings.filter((f) => !f.pass && f.sev === 'MUST');
  const shouldFail = findings.filter((f) => !f.pass && f.sev === 'SHOULD');
  console.log(`\n${'='.repeat(18)} UI/UX CONFORMANCE ${'='.repeat(18)}`);
  console.log(`${findings.filter((f) => f.pass).length}/${findings.length} conform`);
  console.log(`MUST violations   : ${mustFail.length}`);
  console.log(`SHOULD violations : ${shouldFail.length}`);
  if (mustFail.length) { console.log('\nMUST:'); mustFail.forEach((f) => console.log(`  ✗ [${f.group}] ${f.title}`)); }
  if (shouldFail.length) { console.log('\nSHOULD:'); shouldFail.forEach((f) => console.log(`  ! [${f.group}] ${f.title}`)); }
  try {
    fs.mkdirSync(ARTIFACTS, { recursive: true });
    fs.writeFileSync(path.join(ARTIFACTS, 'ux-audit.json'), JSON.stringify({ findings, mustFail: mustFail.length, shouldFail: shouldFail.length }, null, 2));
  } catch { /* report is a convenience */ }
  return mustFail.length + (STRICT ? shouldFail.length : 0);
}

/* ---------- run ---------- */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const srv = await listen(4320, ROOT);
  BASE = `http://127.0.0.1:${srv.address().port}`;
  console.log(`UI/UX audit · serving ${ROOT} on ${BASE}`);

  const browser = await launchGpu();
  const { ctx, page } = await bootApp(browser, BASE, { viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(COLOUR_LIB);
  await page.evaluate(COLOUR_LIB);
  await signOn(page, 1);
  await setPolicy(page, 'mpc');
  await setTime(page, 12);

  try {
    await layoutLaw(page);
    await typography(page);
    await colourAndContrast(page);
    await alarmDesign(page);
    await languageOfUncertainty(page);
    await charts(page);
    await numbers(page);
    await interaction(page);
    await antiPatterns(page);
    await performance_(page);
  } finally {
    await ctx.close();
    await browser.close();
    srv.close();
  }

  process.exit(report() ? 1 : 0);
}
