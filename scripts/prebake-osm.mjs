/* Bake OSM buildings and waterways into the repo.

   Why this exists: the app fetched both from Overpass at boot. Overpass refuses
   connections regularly — measured twice in one afternoon, one run with buildings and one
   without — and the failure is silent: the scene falls back to scattered procedural boxes
   and to a hand-drawn 7-polyline river schematic. A demo that loses its buildings because
   a public API is busy is not a demo you can show.

   So the real geometry ships in the repo, and the network path becomes an optional
   refresh on top of it (js/geo.js prefers baked data, then overlays a live fetch if one
   succeeds). Re-run this when the source data should be updated:

     node scripts/prebake-osm.mjs             # both layers
     node scripts/prebake-osm.mjs buildings   # one layer

   Output: data/osm-buildings.json, data/osm-waterways.json — coordinates already in the
   app's km space, rounded to 1 m, so the browser does no projection work at boot.        */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(ROOT, 'data');

/* Must match js/geo.js exactly — the app reads these files as km and never re-projects. */
const LON0 = 107.55, LON1 = 108.45, LAT0 = 15.30, LAT1 = 16.16;
const KM_PER_LON = 103.3, KM_PER_LAT = 111.1;
const ll2km = (lon, lat) => [(lon - LON0) * KM_PER_LON, (LAT1 - lat) * KM_PER_LAT];
const r3 = (v) => Math.round(v * 1000) / 1000;      // 1 m precision

/* Building windows. The first five mirror js/geo.js DETAIL_WINDOWS; Giao Thủy and Duy
   Xuyên are added because the gauge sits on the Thu Bồn there and the area had no real
   geometry at all — "near the river and no river visible" was reported from exactly this
   spot. */
const BUILDING_WINDOWS = [
  { name: 'Đà Nẵng',    lon: 108.21,  lat: 16.055, r: 0.055 },
  { name: 'Hội An',     lon: 108.328, lat: 15.878, r: 0.038 },
  { name: 'Ái Nghĩa',   lon: 108.10,  lat: 15.885, r: 0.030 },
  { name: 'Vĩnh Điện',  lon: 108.248, lat: 15.920, r: 0.032 },
  { name: 'Nam Phước',  lon: 108.26,  lat: 15.850, r: 0.030 },
  { name: 'Giao Thủy',  lon: 108.135, lat: 15.788, r: 0.030 },
  { name: 'Duy Xuyên',  lon: 108.20,  lat: 15.830, r: 0.028 },
];

const MIRRORS = [
  'https://overpass-api.de/api/interpreter?data=',
  'https://overpass.kumi.systems/api/interpreter?data=',
  'https://overpass.private.coffee/api/interpreter?data=',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Overpass is a shared free service and it defends itself. Two failure modes cost a run
   each before this was handled properly:
     - 406 Not Acceptable from overpass-api.de — Node's fetch sends no User-Agent at all
       and the server rejects the request outright. It is not a query problem.
     - 429 Too Many Requests — the mirrors rate-limit per IP. Retrying immediately, and
       then rolling to the next mirror and retrying immediately there too, is how you get
       rate-limited on all three at once.
   So: identify ourselves, back off geometrically on 429, and never hammer. A bake is a
   once-in-a-while job; being slow and polite is free. */
const UA = 'FloodTwin-Q1-Demo/1.0 (prebake; flood decision-support research demo)';

async function overpass(query, label) {
  let lastErr = null;
  for (const mirror of MIRRORS) {
    const host = new URL(mirror).host;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        process.stdout.write(`  ${label}: ${host} try ${attempt} … `);
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 300000);
        const res = await fetch(mirror + encodeURIComponent(query), {
          signal: ctrl.signal,
          headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        });
        clearTimeout(timer);
        if (res.status === 429 || res.status === 504) {
          const wait = 30000 * attempt;
          console.log(`HTTP ${res.status}, backing off ${wait / 1000}s`);
          lastErr = new Error(`HTTP ${res.status}`);
          await sleep(wait);
          continue;
        }
        if (!res.ok) { console.log(`HTTP ${res.status}`); lastErr = new Error(`HTTP ${res.status}`); break; }
        const js = await res.json();
        console.log(`ok, ${(js.elements || []).length} elements`);
        await sleep(3000);                       // be a good neighbour between queries
        return js;
      } catch (e) {
        console.log(`failed (${e.message})`);
        lastErr = e;
        await sleep(5000);
      }
    }
  }
  throw lastErr || new Error('all mirrors failed');
}

/* ---------------------------------------------------------------- buildings */
/* Height: OSM gives `height` in metres or `building:levels` as a storey count. Neither is
   usually present in Vietnam, so the fallback matters more than the parser — 3.3 m per
   storey, two storeys for an untagged town house, which is what the Thu Bồn delta mostly
   is. The number reaches the shader as the wall the waterline is drawn against, so a
   wrong height is a wrong flood reading, not just a wrong picture: it is recorded per
   building as `src` so the app can say which heights are real. */
function heightOf(tags) {
  const h = parseFloat(tags?.height);
  if (Number.isFinite(h) && h > 1 && h < 200) return { m: h, src: 'height' };
  const lv = parseFloat(tags?.['building:levels']);
  if (Number.isFinite(lv) && lv >= 1 && lv < 60) return { m: lv * 3.3, src: 'levels' };
  return { m: 6.6, src: 'assumed' };
}

async function bakeBuildings() {
  console.log('\nBuildings');
  const out = [];
  const stats = { height: 0, levels: 0, assumed: 0 };
  for (const w of BUILDING_WINDOWS) {
    const bbox = `${(w.lat - w.r).toFixed(4)},${(w.lon - w.r).toFixed(4)},${(w.lat + w.r).toFixed(4)},${(w.lon + w.r).toFixed(4)}`;
    const q = `[out:json][timeout:180];(way["building"](${bbox});relation["building"](${bbox}););out geom;`;
    const js = await overpass(q, w.name.padEnd(10));
    let n = 0;
    for (const el of js.elements || []) {
      const rings = el.type === 'way' ? [el.geometry]
        : (el.members || []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry);
      for (const ring of rings) {
        if (!ring || ring.length < 4) continue;
        const pts = ring.slice(0, -1).map((p) => ll2km(p.lon, p.lat));
        if (pts.length < 3 || pts.length > 60) continue;
        const { m, src } = heightOf(el.tags);
        stats[src]++;
        out.push({ p: pts.map(([x, y]) => [r3(x), r3(y)]), h: Math.round(m * 10) / 10, s: src[0] });
        n++;
      }
    }
    console.log(`    → ${n} footprints`);
  }
  return { out, stats };
}

/* --------------------------------------------------------------- waterways */
/* Two kinds, and they are not interchangeable:
     - `way["waterway"~"river|stream"]` are centrelines, which is what the flood model's
       distance-to-channel field needs;
     - `way|relation["natural"="water"]` and `["waterway"="riverbank"]` are polygons — the
       actual wet surface, which is what you need to DRAW a river that looks like the one
       in the satellite image.
   The hand-drawn schematic in js/data.js only ever had centrelines, with 4–10 points for
   a 50 km river, which is why the rendered channel does not sit where the real one does. */
async function bakeWaterways() {
  console.log('\nWaterways');
  const bbox = `${LAT0},${LON0},${LAT1},${LON1}`;
  const lines = [], areas = [];

  const qLine = `[out:json][timeout:180];(way["waterway"~"^(river|stream|canal)$"](${bbox}););out geom;`;
  const jsLine = await overpass(qLine, 'centrelines');
  for (const el of jsLine.elements || []) {
    if (!el.geometry || el.geometry.length < 2) continue;
    const kind = el.tags?.waterway;
    // stream/canal are kept but marked: they are metres wide and must not be drawn as rivers
    lines.push({
      n: el.tags?.name || '',
      k: kind === 'river' ? 'r' : kind === 'canal' ? 'c' : 's',
      w: parseFloat(el.tags?.width) || 0,
      p: el.geometry.map((p) => { const [x, y] = ll2km(p.lon, p.lat); return [r3(x), r3(y)]; }),
    });
  }
  console.log(`    → ${lines.length} centrelines`);

  const qArea = `[out:json][timeout:180];(way["natural"="water"](${bbox});way["waterway"="riverbank"](${bbox});relation["natural"="water"](${bbox}););out geom;`;
  const jsArea = await overpass(qArea, 'water areas');
  for (const el of jsArea.elements || []) {
    const rings = el.type === 'way' ? [el.geometry]
      : (el.members || []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry);
    for (const ring of rings) {
      if (!ring || ring.length < 4) continue;
      const pts = ring.map((p) => { const [x, y] = ll2km(p.lon, p.lat); return [r3(x), r3(y)]; });
      // drop degenerate slivers; keep everything a person could see from the air
      if (pts.length < 4) continue;
      areas.push({ n: el.tags?.name || '', p: pts });
    }
  }
  console.log(`    → ${areas.length} water polygons`);
  return { lines, areas };
}

/* -------------------------------------------------------------------- main */
const want = process.argv.slice(2);
const doBuildings = !want.length || want.includes('buildings');
const doWater = !want.length || want.includes('waterways');
fs.mkdirSync(OUT, { recursive: true });

if (doBuildings) {
  const { out, stats } = await bakeBuildings();
  if (out.length < 500) throw new Error(`only ${out.length} footprints — refusing to write a thin bake over a good one`);
  const file = path.join(OUT, 'osm-buildings.json');
  fs.writeFileSync(file, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    source: 'OpenStreetMap contributors, ODbL',
    note: 'coordinates in FloodTwin km space (js/geo.js ll2km); h = metres; s = height source h|l|a',
    windows: BUILDING_WINDOWS.map((w) => w.name),
    heightSources: stats,
    count: out.length,
    b: out,
  }));
  console.log(`\nwrote ${path.relative(ROOT, file)} — ${out.length} buildings ` +
              `(${stats.height} tagged height, ${stats.levels} from levels, ${stats.assumed} assumed) ` +
              `${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
}

if (doWater) {
  const { lines, areas } = await bakeWaterways();
  if (lines.length < 20) throw new Error(`only ${lines.length} centrelines — refusing to write a thin bake`);
  const file = path.join(OUT, 'osm-waterways.json');
  fs.writeFileSync(file, JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    source: 'OpenStreetMap contributors, ODbL',
    note: 'coordinates in FloodTwin km space; k = r river | c canal | s stream',
    counts: { lines: lines.length, areas: areas.length },
    l: lines,
    a: areas,
  }));
  console.log(`\nwrote ${path.relative(ROOT, file)} — ${lines.length} lines, ${areas.length} areas, ` +
              `${(fs.statSync(file).size / 1048576).toFixed(1)} MB`);
}
