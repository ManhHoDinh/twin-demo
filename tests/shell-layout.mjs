/* Shell layout / anti-slop guard.
   Asserts the map-first floating chrome never overlaps, clips text, or leaks placeholder
   junk — across viewports and panel states. This is the regression net for "AI slop":
   the behavioural suites check that controls WORK; this checks they don't visually collide. */
import { launchGpu } from './browser.mjs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const srv = spawn('node', [path.join(HERE, 'serve.mjs'), '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = await new Promise((res, rej) => {
  let buf = ''; const t = setTimeout(() => rej(new Error('no port: ' + buf)), 8000);
  const f = (d) => { buf += d; const m = buf.match(/127\.0\.0\.1:(\d+)/); if (m) { clearTimeout(t); res(m[1]); } };
  srv.stdout.on('data', f); srv.stderr.on('data', f);
});

let fails = 0;
const ok = (n, c, x) => { console.log(`${c ? '  ✓' : '  ✗'} ${n}${x ? ' — ' + x : ''}`); if (!c) fails++; };

// chrome + summonable surfaces we require to never collide
const SELS = [
  '.cmdBar', '.geoActions', '.geoOpsStrip', '.geoDock', '.geoViewCtl', '.geoModeRail',
  '.geoTimeline', '#waterBadge', '.aiLauncher',
  '[data-panel="decision"]', '[data-panel="inspector"]', '[data-panel="ai"]', '[data-panel="alerts"]',
];

async function collisions(page) {
  return page.evaluate((sels) => {
    const box = (s) => {
      const n = document.querySelector(s); if (!n) return null;
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || cs.pointerEvents === 'none') return null;
      const r = n.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return null;
      return { s, n, l: r.left, t: r.top, r: r.right, b: r.bottom };
    };
    const bs = sels.map(box).filter(Boolean);
    const ov = (A, B) => !(A.r <= B.l + 1 || B.r <= A.l + 1 || A.b <= B.t + 1 || B.b <= A.t + 1);
    /* Two surfaces sharing pixels is only a defect when neither owns the other. Some of
       these surfaces are now docked INSIDE another (the action toolbar sits in the command
       row, the impact readout in the ops row); a child inside its parent's box is the
       layout working, not a collision. */
    const nested = (A, B) => A.n.contains(B.n) || B.n.contains(A.n);
    const c = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (!nested(bs[i], bs[j]) && ov(bs[i], bs[j])) c.push(bs[i].s + '∩' + bs[j].s);
    // off-screen surfaces
    const off = bs.filter((x) => x.l < -2 || x.t < -2 || x.r > innerWidth + 2 || x.b > innerHeight + 2).map((x) => x.s);
    return { c, off };
  }, SELS);
}

const b = await launchGpu({ headless: true });
try {
  for (const [w, h] of [[1512, 945], [1366, 768], [1920, 1080]]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load', timeout: 30000 });
    await sleep(2800);

    // rest
    let r = await collisions(p);
    ok(`${w}×${h} rest: no overlaps`, r.c.length === 0, r.c.join(', '));
    ok(`${w}×${h} rest: nothing off-screen`, r.off.length === 0, r.off.join(', '));

    // decision open
    await p.evaluate(() => window.FT.panels.decision.show('expanded')); await sleep(250);
    r = await collisions(p);
    ok(`${w}×${h} decision: no overlaps`, r.c.length === 0, r.c.join(', '));

    // + AI open
    await p.evaluate(() => window.FT.panels.ai.show('expanded')); await sleep(250);
    r = await collisions(p);
    ok(`${w}×${h} decision+AI: no overlaps`, r.c.length === 0, r.c.join(', '));

    // + inspector must yield (right-lane single-context) — exactly one right-lane panel visible
    await p.evaluate(() => { const g = window.FT.data.GAUGES[0]; window.FT.state.selectedGauge = g.id; window.FT.bus.emit('gaugeSelected', g.id); }); await sleep(250);
    const laneCount = await p.evaluate(() => {
      return ['inspector', 'decision', 'alerts'].filter((id) => {
        const n = document.querySelector(`[data-panel="${id}"]`); if (!n) return false;
        const cs = getComputedStyle(n);
        return cs.display !== 'none' && cs.opacity !== '0' && !n.classList.contains('hidden-chrome');
      }).length;
    });
    ok(`${w}×${h} right-lane shows ≤1 context panel`, laneCount <= 1, laneCount + ' open');

    // no clipped text in the top chrome band
    const clipped = await p.evaluate(() => [...document.querySelectorAll('.cmdBar *, .geoActions *, .geoOpsStrip *')]
      .filter((n) => n.scrollWidth > n.clientWidth + 2 && getComputedStyle(n).overflow !== 'visible')
      .map((n) => (n.textContent || '').slice(0, 16)).slice(0, 6));
    ok(`${w}×${h} top chrome: no clipped text`, clipped.length === 0, clipped.join(' | '));

    await p.close();
  }

  // slop-word scan (placeholder junk, undefined/NaN leaks) at rest
  const p = await b.newPage({ viewport: { width: 1512, height: 945 } });
  await p.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await sleep(2800);
  const slop = await p.evaluate(() => {
    const t = document.body.innerText;
    return ['lorem', 'ipsum', 'TODO', 'FIXME', 'undefined', 'NaN', '[object', 'placeholder text', 'Untitled'].filter((w) => t.includes(w));
  });
  ok('no placeholder / slop words in UI text', slop.length === 0, slop.join(', '));
  await p.close();
} catch (e) {
  console.error('LAYOUT THREW:', e.message); fails++;
} finally { await b.close(); srv.kill(); }

console.log(fails === 0 ? '\nLAYOUT PASS' : `\nLAYOUT FAIL (${fails})`);
process.exit(fails === 0 ? 0 : 1);
