/* ==========================================================================
   FloodTwin — end-to-end suite.

   Organised by OPERATIONAL WORKFLOW (docs/03-operations/01-workflow-catalog.md), not by
   screen. A screen that renders is not evidence of anything; the question these tests ask
   is whether a duty operator can get from "something is happening" to "the right people
   have been told, and it is on the record".

   Run:  node tests/e2e.mjs            all suites
         node tests/e2e.mjs --quick    skip the slow sweeps (perf, scenario matrix)
   ========================================================================== */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listen } from './serve.mjs';
import { launchGpu } from './browser.mjs';
import {
  step, check, usePage, bootApp, setTime, setScenario, setPolicy, signOn, setDegradation,
  report, results, signOnRole, ROLE,
} from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const QUICK = process.argv.includes('--quick');
let BASE = '';

/* ==========================================================================
   WF-01 · boot, self-test and the honesty layer
   ========================================================================== */
async function bootAndHonesty(browser) {
  step('WF-01 · Boot, self-test, honesty layer');
  const { ctx, page, errors, selftest, bootMs } = await bootApp(browser, BASE);
  usePage(page);

  /* Application errors must be zero. Failures fetching the OPTIONAL third-party vector
     layers (Overpass) are a different thing: they are progressive enhancement, the app is
     built to run without them, and treating them as failures would make this suite flaky
     for a reason that has nothing to do with the product. They are therefore excluded here
     and asserted separately as a graceful-degradation requirement. */
  const THIRD_PARTY = /overpass|arcgisonline|elevation-tiles-prod|jsdelivr|unpkg|cdn\./i;
  await check('the app boots with no application-level console or page errors', (d) => {
    const app = errors.filter((e) => !THIRD_PARTY.test(e));
    d({ appErrors: app.slice(0, 4), thirdPartyIgnored: errors.length - app.length });
    return app.length === 0;
  });

  await check('a third-party layer outage degrades gracefully and is surfaced', async (d) => {
    const failed = errors.filter((e) => THIRD_PARTY.test(e));
    const tag = await page.evaluate(() => {
      const el = document.getElementById('buildTag');
      return el ? el.textContent.trim() : '';
    });
    d({ thirdPartyFailures: failed.length, buildTag: tag });
    /* nothing failed → nothing to prove; if it did, the app must still be up and say so */
    if (!failed.length) return true;
    const alive = await page.evaluate(() => !!(window.FT && window.FT.hydro && window.FT.hydro.ready));
    return alive && /OSM|đường thật|raster|✗/i.test(tag);
  });

  await check('the in-app physics self-test passes every assertion', (d) => {
    d(selftest);
    return !!selftest && /PASS \d+\/\d+/.test(selftest) && !/FAIL/.test(selftest);
  });

  await check('boot completes within a workable time', (d) => {
    d(`${bootMs} ms`);
    return bootMs < 60000;
  });

  await check('the core domain objects are all addressable', async (d) => {
    const g = await page.evaluate(() => Object.keys(window.FT || {}));
    d(g);
    return ['hydro', 'world', 'zones', 'traffic', 'ops', 'forecast', 'alarms', 'domain', 'reports']
      .every((k) => g.includes(k));
  });

  /* The single most important non-negotiable in the whole product: a build running on
     synthetic hydrology must say so, permanently and structurally (docs FR-03). */
  await check('the synthetic / non-operational marker is permanently visible', async (d) => {
    const m = await page.evaluate(() => {
      const el = document.getElementById('opsMode');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { text: el.textContent.trim(), visible: cs.display !== 'none' && cs.visibility !== 'hidden' };
    });
    d(m);
    return !!m && m.visible && /SYNTHETIC|TỔNG HỢP/i.test(m.text);
  });

  await check('the global chrome exposes every persistent decision signal', async (d) => {
    const ids = ['opsEscVal', 'opsHealthVal', 'opsKappaVal', 'opsPexVal', 'opsDeadlineVal'];
    const seen = await page.evaluate((list) => list.map((id) => {
      const el = document.getElementById(id);
      return { id, present: !!el, text: el ? el.textContent.trim() : null };
    }), ids);
    d(seen);
    return seen.every((s) => s.present && s.text && s.text !== '');
  });

  await ctx.close();
}

/* ==========================================================================
   WF-03 · the decision package — the product's core artefact
   ========================================================================== */
async function decisionPackage(browser) {
  step('WF-03 · Decision package');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setPolicy(page, 'mpc');
  await setTime(page, 6);

  await check('a proposal carries actions, constraints, counterfactual, alternatives and regret', async (d) => {
    const p = await page.evaluate(() => {
      const k = window.FT.ops._last;
      return k && {
        kind: k.kind,
        hasAction: !!(k.action && k.action.q1 && k.action.tStart != null && k.action.rampMax),
        constraints: (k.constraints || []).length,
        hasCounterfactual: !!(k.counterfactual && k.counterfactual.peak != null),
        alternatives: (k.alternatives || []).length,
        hasRegret: !!(k.regret && k.regret.actAndMiss && k.regret.waitAndHit),
        hasDeadline: k.deadline != null,
        hasConfidence: !!k.confidence,
        hasVersions: !!(k.versions && k.versions.engine),
      };
    });
    d(p);
    return p && p.hasAction && p.constraints >= 8 && p.hasCounterfactual &&
      p.alternatives >= 2 && p.hasRegret && p.hasDeadline && p.hasConfidence && p.hasVersions;
  });

  /* The behaviour that separates an engineering tool from a demo: when a hard constraint
     fails, say so and name it — never quietly relax it (docs FR-11/FR-12). */
  await check('a hard-constraint failure is reported as infeasible with the binding constraint named', async (d) => {
    const p = await page.evaluate(() => {
      const k = window.FT.ops._last;
      const failed = (k.constraints || []).filter((c) => c.status === 'FAIL');
      return { kind: k.kind, feasible: k.feasible, failed: failed.map((c) => c.id), binding: k.binding && k.binding.id };
    });
    d(p);
    if (!p.failed.length) return true;                 // nothing to prove in this state
    return p.feasible === false && !!p.binding;
  });

  await check('the counterfactual is rendered on screen, not hidden behind a click', async (d) => {
    const txt = await page.evaluate(() => document.getElementById('dpBox').innerText);
    d(txt.slice(0, 120));
    return /KHÔNG hành động|No action|Không hành động/i.test(txt);
  });

  await check('the decision deadline counts down and is derived from the notification chain', async (d) => {
    const v = await page.evaluate(() => ({
      text: document.getElementById('opsDeadlineVal').textContent.trim(),
      inH: window.FT.ops._last ? window.FT.ops._last.deadlineIn : null,
      lead: window.FT.ops.config.notificationLeadH,
      appr: window.FT.ops.config.approvalLeadH,
      start: window.FT.ops._last ? window.FT.ops._last.action.tStart : null,
      deadline: window.FT.ops._last ? window.FT.ops._last.deadline : null,
    }));
    d(v);
    if (v.start == null) return true;
    return Math.abs(v.deadline - (v.start - v.lead - v.appr)) < 1e-6 && v.text !== '';
  });

  /* A product that cannot recommend "do nothing" has no credibility with engineers. */
  await check('a benefit inside the forecast error yields the honest-null recommendation', async (d) => {
    await setScenario(page, 'monsoon');
    await setTime(page, 6);
    const k = await page.evaluate(() => ({ kind: window.FT.ops._last.kind, cut: window.FT.ops._last.cut }));
    d(k);
    return k.kind === 'NULL' || k.kind === 'SATURATED' || Math.abs(k.cut) >= 0.15;
  });

  /* The worst scenario must never read as "no action needed" just because the analytic
     stage model clipped — that is a false negative exactly where it matters most. */
  await check('a saturated gauge model is declared, not reported as "no action needed"', async (d) => {
    await setScenario(page, 'yagi');
    await setTime(page, 12);
    const k = await page.evaluate(() => {
      const p = window.FT.ops._last;
      return { kind: p.kind, saturated: !!p.saturated, conf: p.confidence, box: document.getElementById('dpBox').innerText.slice(0, 90) };
    });
    d(k);
    if (!k.saturated) return true;
    return k.kind === 'SATURATED' && k.conf === 'UNUSABLE';
  });

  await ctx.close();
}

/* ==========================================================================
   WF-03/WF-07 · approval gate — no anonymous, no unreasoned decisions
   ========================================================================== */
async function approvalGate(browser) {
  step('WF-07 · Approval gate and audit trail');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setPolicy(page, 'mpc');
  await setTime(page, 6);

  await check('an anonymous approval is refused', async (d) => {
    const r = await page.evaluate(() => {
      const before = window.FT.ops.audit.entries.length;
      document.getElementById('dpReasonInput').value = 'reason present but nobody signed on';
      document.getElementById('mpcApprove').click();
      return { before, after: window.FT.ops.audit.entries.length, approved: window.FT.state.mpcApproved };
    });
    d(r);
    return r.after === r.before && r.approved === false;
  });

  await signOn(page, 1);

  await check('an approval without a reason of record is refused', async (d) => {
    const r = await page.evaluate(() => {
      const before = window.FT.ops.audit.entries.filter((e) => e.action === 'decision.approve').length;
      document.getElementById('dpReasonInput').value = '';
      document.getElementById('mpcApprove').click();
      return { before, after: window.FT.ops.audit.entries.filter((e) => e.action === 'decision.approve').length };
    });
    d(r);
    return r.after === r.before;
  });

  await signOnRole(page, ROLE.authority);          // D-03 is accountable to the committee
  await check('an identified, reasoned approval is accepted and recorded', async (d) => {
    const r = await page.evaluate(() => {
      document.getElementById('dpReasonInput').value = 'E2E: chấp nhận C9 để cắt đỉnh hạ du';
      document.getElementById('mpcApprove').click();
      const e = [...window.FT.ops.audit.entries].reverse().find((x) => x.action === 'decision.approve');
      return e && {
        actor: e.actor, reason: e.reason, snapshot: e.snapshot, mode: e.mode,
        hasVersions: !!(e.versions && e.versions.engine),
        detailKeys: Object.keys(e.detail || {}),
      };
    });
    d(r);
    return !!r && /Nguyễn|Trần|Lê|Phạm/.test(r.actor) && r.reason.length > 4 &&
      !!r.snapshot && r.hasVersions && r.detailKeys.includes('counterfactualPeak');
  });

  await check('the audit trail is append-only — earlier entries are never rewritten', async (d) => {
    const r = await page.evaluate(() => {
      const first = window.FT.ops.audit.entries[0];
      const snap0 = JSON.stringify(first);
      window.FT.ops.audit.log('e2e.probe', { x: 1 }, 'probe');
      return { unchanged: JSON.stringify(window.FT.ops.audit.entries[0]) === snap0, seqMonotonic:
        window.FT.ops.audit.entries.every((e, i, a) => i === 0 || e.seq > a[i - 1].seq) };
    });
    d(r);
    return r.unchanged && r.seqMonotonic;
  });

  await ctx.close();
}

/* ==========================================================================
   Decision rights · being identified is not the same as being entitled
   ========================================================================== */
async function decisionRights(browser) {
  step('RACI · Decision rights');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setPolicy(page, 'mpc');
  await setTime(page, 6);

  await must0('a pre-release is approvable only by the accountable role', page, async (d) => {
    const r = await page.evaluate(() => {
      const sel = document.getElementById('opsActor');
      const snap = window.FT.hydro.at(window.FT.state.timeH);
      const dId = window.FT.roles.decisionForProposal(window.FT.ops._last, snap);
      const out = [];
      for (let i = 1; i < sel.options.length; i++) {
        sel.value = sel.options[i].value; sel.dispatchEvent(new Event('change'));
        window.FT.ui.tick(snap);
        const before = window.FT.ops.audit.entries.filter((e) => e.action === 'decision.approve').length;
        document.getElementById('dpReasonInput').value = 'rights probe';
        document.getElementById('mpcApprove').click();
        const after = window.FT.ops.audit.entries.filter((e) => e.action === 'decision.approve').length;
        out.push({
          role: window.FT.roles.roleIdOf(window.FT.ops.audit.actor.role),
          entitled: window.FT.roles.can(dId),
          approved: after > before,
        });
        window.FT.state.mpcApproved = false;
      }
      return { dId, accountable: window.FT.roles.accountable(dId), out };
    });
    d(r);
    /* exactly one role may approve, and it is the accountable one */
    return r.dId === 'D-03' &&
      r.out.filter((x) => x.approved).length === 1 &&
      r.out.every((x) => x.approved === x.entitled);
  });

  await must0('a refused approval is itself recorded, naming the required role', page, async (d) => {
    const r = await page.evaluate(() => {
      const e = [...window.FT.ops.audit.entries].reverse().find((x) => x.action === 'decision.refused');
      return e && { decision: e.detail.decision, required: e.detail.requiredRole, actorRole: e.detail.actorRole };
    });
    d(r);
    return !!r && !!r.required && !!r.actorRole && r.required !== r.actorRole;
  });

  await must0('the package names whose decision it is before the buttons are pressed', page, async (d) => {
    const t = await page.evaluate(() => {
      const el = document.querySelector('.dpRights');
      return el ? el.innerText.replace(/\s+/g, ' ') : null;
    });
    d(t ? t.slice(0, 120) : null);
    return !!t && /D-\d\d/.test(t) && /(chịu trách nhiệm|accountable)/i.test(t);
  });

  /* The inversion that matters: once dam safety is in play the authority is merely
     informed, and may no longer approve. docs/02-stakeholders §2. */
  await must0('dam safety outranks the authority once the design level is passed', page, async (d) => {
    const r = await page.evaluate(() => {
      const R = window.FT.roles;
      return {
        d03: { authority: R.can('D-03', 'authority'), damSafety: R.can('D-03', 'damSafety') },
        d06: { authority: R.can('D-06', 'authority'), damSafety: R.can('D-06', 'damSafety') },
        d10: { authority: R.can('D-10', 'authority'), commander: R.can('D-10', 'commander') },
      };
    });
    d(r);
    return r.d03.authority && !r.d03.damSafety &&
      !r.d06.authority && r.d06.damSafety &&
      r.d10.authority && !r.d10.commander;
  });

  await must0('publishing to the public requires the accountable role', page, async (d) => {
    const r = await page.evaluate(() => {
      const sel = document.getElementById('opsActor');
      const asRole = (label) => {
        for (const o of sel.options) if (o.value.includes('|' + label)) { sel.value = o.value; sel.dispatchEvent(new Event('change')); return true; }
        return false;
      };
      const attempt = () => {
        document.getElementById('nfThreshold').click();
        const btn = document.getElementById('nfSend');
        const before = window.FT.notifyOps.sent.length;
        if (btn) btn.click();
        const after = window.FT.notifyOps.sent.length;
        document.getElementById('modalScrim').hidden = true;
        return after > before;
      };
      asRole('Kỹ sư vận hành hồ');
      const engineer = attempt();
      asRole('Ban Chỉ huy PCTT&TKCN');
      const authority = attempt();
      const refused = window.FT.ops.audit.entries.some((e) => e.action === 'notify.refused');
      return { engineer, authority, refused };
    });
    d(r);
    return r.engineer === false && r.authority === true && r.refused === true;
  });

  await ctx.close();
}
/* thin wrapper so the rights group reads as assertions rather than plumbing */
async function must0(title, page, fn) { usePage(page); await check(title, fn); }

/* ==========================================================================
   DT-7 · degradation — the product must know what it cannot see
   ========================================================================== */
async function degradation(browser) {
  step('DT-7 · Data degradation L0–L4');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setPolicy(page, 'mpc');
  await setTime(page, 6);

  const expect = { 0: 'PROPOSAL', 1: 'PROPOSAL', 2: 'DEGRADED', 3: 'DEGRADED', 4: 'REFUSAL' };
  for (const lv of [0, 1, 2, 3, 4]) {
    await check(`L${lv}: the engine responds correctly to the data it actually has`, async (d) => {
      await setDegradation(page, lv || null);
      await setTime(page, 6);
      const r = await page.evaluate(() => ({
        kind: window.FT.ops._last.kind,
        level: window.FT.ops.health().level,
        chip: document.getElementById('opsHealthVal').textContent.trim(),
        box: document.getElementById('dpBox').innerText.slice(0, 80),
      }));
      d(r);
      if (lv === 0) return r.level === 0 && (r.kind === expect[0] || r.kind === 'NULL' || r.kind === 'SATURATED');
      return r.level === lv && r.kind === expect[lv];
    });
  }

  await check('at L4 the product refuses to advise and blanks the decision deadline', async (d) => {
    await setDegradation(page, 4);
    await setTime(page, 6);
    const r = await page.evaluate(() => ({
      kind: window.FT.ops._last.kind,
      deadline: document.getElementById('opsDeadlineVal').textContent.trim(),
      box: document.getElementById('dpBox').innerText,
    }));
    d({ kind: r.kind, deadline: r.deadline });
    return r.kind === 'REFUSAL' && r.deadline === '—' && /TỪ CHỐI|NO ADVICE/i.test(r.box);
  });

  await setDegradation(page, null);
  await ctx.close();
}

/* ==========================================================================
   WF-05 · reservoir safety margins and lifecycle
   ========================================================================== */
async function reservoirSafety(browser) {
  step('WF-05 · Reservoir safety margins and lifecycle');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setTime(page, 10);

  await check('freeboard, dZ/dt and time-to-ceiling are shown per reservoir', async (d) => {
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('#resList .resSafety')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
    d(rows[0]);
    return rows.length === 4 && rows.every((r) => /m/.test(r) && /m\/h/.test(r) && /Mm³/.test(r));
  });

  await check('each reservoir shows an explicit operating state', async (d) => {
    const st = await page.evaluate(() =>
      [...document.querySelectorAll('#resList .resState')].map((s) => s.textContent.trim()));
    d(st);
    return st.length === 4 && st.every((s) => s.length > 0);
  });

  await check('the reservoir lifecycle only takes transitions the domain permits', async (d) => {
    const bad = await page.evaluate(() => {
      window.FT.domain.rebuildTimeline();
      return window.FT.domain.illegalTransitions().map((e) => `${e.subject} ${e.from}->${e.to}`);
    });
    d(bad);
    return bad.length === 0;
  });

  await check('buffer exhaustion is announced as its own event', async (d) => {
    const evs = await page.evaluate(() =>
      window.FT.domain.events.filter((e) => e.type === 'BUFFER_EXHAUSTED').map((e) => e.title));
    d(evs.slice(0, 3));
    return evs.length > 0;
  });

  await ctx.close();
}

/* ==========================================================================
   WF-09 · notification chain — where a forecast becomes safety
   ========================================================================== */
async function notifications(browser) {
  step('WF-09 · Downstream notification chain');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await signOnRole(page, ROLE.authority);          // D-14 public information
  await setPolicy(page, 'mpc');
  await setTime(page, 12);

  await check('every channel variant is rendered from ONE decision record', async (d) => {
    const r = await page.evaluate(() => {
      const rec = window.FT.notifyOps.buildRecord('release', window.FT.hydro.at(window.FT.state.timeH));
      return {
        id: rec.id,
        channels: Object.keys(rec.channels),
        recipients: rec.recipients.map((x) => x.key),
      };
    });
    d(r);
    return ['call', 'sms', 'loudspeaker', 'public', 'cap'].every((c) => r.channels.includes(c)) &&
      r.recipients.includes('communes') && r.recipients.includes('public');
  });

  /* A warning that says "10.2 m, above AL1 by 0.03 m" when 10.2 m is above AL3 is a real
     defect class, not a cosmetic one. It is asserted for every message type. */
  await check('the quoted alert level always matches the quoted stage at the quoted gauge', async (d) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (const type of ['threshold', 'release', 'evacuation', 'passthrough']) {
        const rec = window.FT.notifyOps.buildRecord(type, window.FT.hydro.at(window.FT.state.timeH));
        if (!rec.gauge || rec.stage == null) continue;
        const b = rec.gauge.bd, s = rec.stage;
        const expect = s >= b[2] ? 3 : s >= b[1] ? 2 : s >= b[0] ? 1 : null;
        out.push({ type, stage: +s.toFixed(2), bd: b, level: rec.bdLevel, expect, ok: rec.bdLevel === expect });
      }
      return out;
    });
    d(r.filter((x) => !x.ok));
    return r.every((x) => x.ok);
  });

  await check('SMS is plain ASCII and split into ≤160-character parts, never truncated', async (d) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (const type of ['threshold', 'release', 'evacuation']) {
        const rec = window.FT.notifyOps.buildRecord(type, window.FT.hydro.at(window.FT.state.timeH));
        out.push({
          type,
          ascii: !/[^\x20-\x7E\n]/.test(rec.channels.sms),
          parts: rec.channels.smsParts.map((p) => p.length),
          numbered: rec.channels.smsParts.length === 1 || rec.channels.smsParts.every((p) => /\(\d+\/\d+\)$/.test(p)),
        });
      }
      return out;
    });
    d(r);
    return r.every((x) => x.ascii && x.parts.every((n) => n <= 160) && x.numbered);
  });

  await check('the CAP payload is valid machine-readable JSON marked as an exercise', async (d) => {
    const r = await page.evaluate(() => {
      const rec = window.FT.notifyOps.buildRecord('release', window.FT.hydro.at(window.FT.state.timeH));
      try {
        const o = JSON.parse(rec.channels.cap);
        return { ok: true, status: o.status, hasArea: Array.isArray(o.area), note: o.note };
      } catch (e) { return { ok: false, err: e.message }; }
    });
    d(r);
    return r.ok && /Exercise/i.test(r.status) && /SYNTHETIC/i.test(r.note || '');
  });

  await check('dispatch is refused until a duty operator is identified', async (d) => {
    const r = await page.evaluate(() => {
      const keep = window.FT.ops.audit.actor;
      window.FT.ops.audit.actor = { name: '', role: '' };
      document.getElementById('nfRelease').click();
      const btn = document.getElementById('nfSend');
      const before = window.FT.notifyOps.sent.length;
      if (btn) btn.click();
      const after = window.FT.notifyOps.sent.length;
      window.FT.ops.audit.actor = keep;
      document.getElementById('modalScrim').hidden = true;
      return { before, after };
    });
    d(r);
    return r.after === r.before;
  });

  await check('an approved dispatch reaches every required recipient and is logged', async (d) => {
    await page.click('#nfRelease');
    await page.waitForTimeout(150);
    await page.click('#nfSend');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const e = window.FT.notifyOps.sent[0];
      const logged = window.FT.ops.audit.entries.filter((x) => x.action === 'notify.dispatch').length;
      return e && { recipients: e.recipients.length, sandbox: true, logged, actor: e.actor };
    });
    d(r);
    await page.evaluate(() => { document.getElementById('modalScrim').hidden = true; });
    return !!r && r.recipients >= 6 && r.logged >= 1;
  });

  await check('acknowledgement is tracked per recipient and escalation is surfaced', async (d) => {
    const r = await page.evaluate(() => {
      const chip = document.querySelector('#notifyList [data-nfack]');
      if (chip) chip.click();
      const e = window.FT.notifyOps.sent[0];
      return {
        acked: e.recipients.filter((x) => x.acked).length,
        pending: e.recipients.filter((x) => !x.acked).length,
        panel: document.getElementById('notifyList').innerText.replace(/\s+/g, ' ').slice(0, 120),
        ackLogged: window.FT.ops.audit.entries.some((x) => x.action === 'notify.ack'),
      };
    });
    d(r);
    return r.acked >= 1 && r.pending >= 1 && r.ackLogged && /Chưa xác nhận|Unacknowledged/i.test(r.panel);
  });

  await ctx.close();
}

/* ==========================================================================
   DT-8 · alarm philosophy
   ========================================================================== */
async function alarms(browser) {
  step('DT-8 · Alarm philosophy');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setTime(page, 14);

  await check('alarms are raised for actionable conditions and carry an instruction', async (d) => {
    const a = await page.evaluate(() => window.FT.alarms.active().map((x) => ({
      kind: x.kind, sev: x.severity, hasWhat: !!x.what, hasDo: !!x.doWhat,
    })));
    d(a.slice(0, 4));
    return a.length > 0 && a.every((x) => x.hasWhat && x.hasDo);
  });

  await check('one root cause produces one alarm, not one per affected object', async (d) => {
    const a = await page.evaluate(() => window.FT.alarms.active().filter((x) => x.kind === 'isolation').map((x) => x.subject));
    d(a);
    return a.length <= 2;                              // "cut" and "soon", never one per zone
  });

  await check('acknowledgement requires an identified operator', async (d) => {
    const r = await page.evaluate(() => {
      const keep = window.FT.ops.audit.actor;
      window.FT.ops.audit.actor = { name: '', role: '' };
      const before = window.FT.alarms.unacked().length;
      const btn = document.querySelector('#alarmList [data-ack]');
      if (btn) btn.click();
      const after = window.FT.alarms.unacked().length;
      window.FT.ops.audit.actor = keep;
      return { before, after };
    });
    d(r);
    return r.after === r.before;
  });

  await check('an identified acknowledgement is accepted and attributed', async (d) => {
    await signOn(page, 2);
    const r = await page.evaluate(() => {
      const before = window.FT.alarms.unacked().length;
      const btn = document.querySelector('#alarmList [data-ack]');
      if (btn) btn.click();
      const e = [...window.FT.ops.audit.entries].reverse().find((x) => x.action === 'alarm.ack');
      return { before, after: window.FT.alarms.unacked().length, actor: e && e.actor };
    });
    d(r);
    return r.after < r.before && !!r.actor && r.actor !== 'unattributed';
  });

  await check('dam-safety alarms are never grouped away', async (d) => {
    const bad = await page.evaluate(() => window.FT.alarms.list.filter((a) => a.damSafety && a.groupOf).length);
    d(bad);
    return bad === 0;
  });

  await ctx.close();
}

/* ==========================================================================
   WF-10 · evacuation: time-aware routes, shelters, isolation
   ========================================================================== */
async function evacuation(browser) {
  step('WF-10 · Evacuation, routes and shelters');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setTime(page, 12);

  /* The defining failure of this feature is directing people onto a road that will be
     cut before they finish moving (failure library §3 #12). */
  await check('routes are judged at the time of use, with a closure time and last departure', async (d) => {
    const r = await page.evaluate(() => {
      const F = window.FT.forecast, t = window.FT.state.timeH;
      const z = window.FT.zones.list.find((x) => x.shelterRoute && x.shelterRoute.openUntil != null);
      if (!z) return { none: true };
      const v = z.shelterRoute;
      return { zone: z.def.name, timeH: v.timeH, openUntil: v.openUntil, lastDeparture: v.lastDeparture,
        consistent: Math.abs((v.openUntil - v.timeH) - v.lastDeparture) < 1e-6 };
    });
    d(r);
    return r.none === true || r.consistent === true;
  });

  await check('a shelter inside the flood footprint is excluded, not offered', async (d) => {
    const r = await page.evaluate(() => {
      const F = window.FT.forecast, t = window.FT.state.timeH;
      const all = window.FT.data.SHELTERS.map((s) => ({ n: s.name, st: F.shelterState(s, t) }));
      const invalid = all.filter((x) => !x.st.valid);
      const assigned = window.FT.zones.list.map((z) => z.shelter && z.shelter.name).filter(Boolean);
      return {
        invalid: invalid.map((x) => x.n),
        anyInvalidAssigned: invalid.some((x) => assigned.includes(x.n)),
      };
    });
    d(r);
    return r.anyInvalidAssigned === false;
  });

  /* Vertical evacuation: losing the ground floor cuts usable capacity, it does not delete
     the site. Only the refuge level going under does. (A low two-storey building CAN be
     fully submerged in a severe flood — that is a valid exclusion, not a bug, which is why
     the invariant is written against refugeLost rather than against storey count.) */
  await check('ground-floor flooding degrades a shelter; only a submerged refuge excludes it', async (d) => {
    const r = await page.evaluate(() => {
      const F = window.FT.forecast, t = window.FT.state.timeH;
      return window.FT.data.SHELTERS.map((s) => {
        const st = F.shelterState(s, t);
        const refugeLost = st.refugeLostAt != null && st.refugeLostAt <= t + 1e-6;
        return {
          n: s.name.slice(0, 24), storeys: s.storeys, valid: st.valid, groundLost: st.groundLost,
          refugeLost, cap: st.capacity, base: s.capacity, reason: st.reason,
        };
      }).filter((x) => x.groundLost);
    });
    d(r.filter((x) => x.valid === x.refugeLost));
    return r.length > 0 && r.every((x) =>
      /* validity is decided by the refuge, never by the ground floor */
      x.valid === !x.refugeLost &&
      /* and a wet ground floor always costs capacity */
      x.cap < x.base);
  });

  await check('an isolated zone is told to shelter in place, not to travel', async (d) => {
    const r = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#evacList .evacRow')];
      const isolated = rows.filter((row) => /ĐÃ CÔ LẬP|ISOLATED/i.test(row.querySelector('b')?.textContent || ''));
      const bad = isolated.filter((row) => /đi trước|depart by/i.test(row.querySelector('em')?.textContent || ''));
      return { n: isolated.length, tellsToTravel: bad.length > 0, bad: bad.map((row) => row.innerText) };
    });
    d(r);
    return r.n === 0 || r.tellsToTravel === false;
  });

  await check('a single-access community is flagged before the event, not discovered during it', async (d) => {
    const r = await page.evaluate(() => {
      const F = window.FT.forecast;
      const single = window.FT.data.ZONES.filter((z) => F.isSingleAccess(z.node)).map((z) => z.name);
      const badge = document.querySelectorAll('#evacList .onlyRoute').length;
      return { single, badge };
    });
    d(r);
    return r.single.length === 0 || r.badge >= 1;
  });

  await check('the modelled-network limitation is stated on screen, not hidden', async (d) => {
    const t = await page.evaluate(() => document.querySelector('.evacPanel .metricNote').innerText);
    d(t.slice(0, 120));
    return /Giới hạn mô hình|model/i.test(t) && /\d+/.test(t);
  });

  await ctx.close();
}

/* ==========================================================================
   Domain layer · time is a first-class citizen
   ========================================================================== */
async function domainLayer(browser) {
  step('Domain · state machines, events, determinism');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setTime(page, 10);

  await check('the derived event timeline is deterministic across rebuilds', async (d) => {
    const r = await page.evaluate(() => {
      const sig = () => { window.FT.domain.rebuildTimeline();
        return window.FT.domain.events.map((e) => `${e.tH.toFixed(2)}|${e.type}|${e.subject}`).join(';'); };
      const a = sig(), b = sig(), c = sig();
      return { same: a === b && b === c, n: window.FT.domain.events.length };
    });
    d(r);
    return r.same && r.n > 20;
  });

  /* If state were accumulated frame-by-frame, scrubbing backwards would not reproduce
     what scrubbing forwards produced, and replay would be worthless. */
  await check('object state is a pure function of (entity, t)', async (d) => {
    const r = await page.evaluate(() => {
      const probe = (t) => ({
        res: window.FT.data.RESERVOIRS.map((r) => window.FT.domain.reservoirState(r, t)).join(','),
        gauge: window.FT.data.GAUGES.map((g) => window.FT.domain.gaugeState(g, t)).join(','),
        shelter: window.FT.data.SHELTERS.map((s) => window.FT.forecast.shelterState(s, t).valid).join(','),
      });
      const keep = window.FT.state.timeH;
      const settle = (t) => { window.FT.state.timeH = t; window.FT.bus.emit('scrubbed'); window.FT.world.updateRoadDepths(); };
      settle(2); const a = probe(20);
      settle(44); const b = probe(20);
      settle(keep);
      return { a, b, same: JSON.stringify(a) === JSON.stringify(b) };
    });
    d(r.same ? null : r);
    return r.same;
  });

  await check('scrubbing forward and backward reaches identical state', async (d) => {
    const r = await page.evaluate(() => {
      const snapshot = () => JSON.stringify(window.FT.domain.snapshotStates(16));
      const settle = (t) => { window.FT.state.timeH = t; window.FT.bus.emit('scrubbed'); window.FT.world.updateRoadDepths(); window.FT.zones.stepStats(true); };
      settle(-20); settle(0); settle(8); settle(16); const fwd = snapshot();
      settle(44); settle(30); settle(20); settle(16); const back = snapshot();
      return { same: fwd === back, fwd: fwd.slice(0, 90) };
    });
    d(r.same ? null : r);
    return r.same;
  });

  await check('the event ribbon renders and jumping to an event moves the clock', async (d) => {
    const before = await page.evaluate(() => window.FT.state.timeH);
    const r = await page.evaluate(() => {
      const chip = document.querySelector('#eventRibbon [data-evt]');
      if (!chip) return { none: true };
      const target = Number(chip.dataset.evt);
      chip.click();
      return { target, now: window.FT.state.timeH };
    });
    d({ before, ...r });
    return r.none === true || Math.abs(r.target - r.now) < 1e-6;
  });

  await check('every emitted event carries a time, a title and an explanation', async (d) => {
    const r = await page.evaluate(() => {
      const bad = window.FT.domain.events.filter((e) => e.tH == null || !e.title || !e.detail);
      return { total: window.FT.domain.events.length, bad: bad.length };
    });
    d(r);
    return r.bad === 0;
  });

  await ctx.close();
}

/* ==========================================================================
   WF-12 · reports and the public record
   ========================================================================== */
async function reports(browser) {
  step('WF-12 · Reports and the public operation record');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await signOn(page, 3);
  await setPolicy(page, 'mpc');
  await setTime(page, 16);

  for (const kind of ['situation', 'operation', 'event']) {
    await check(`the ${kind} report renders with its watermark and model versions`, async (d) => {
      const r = await page.evaluate((k) => {
        const html = window.FT.reports[k]();
        return {
          chars: html.length,
          watermark: /SYNTHETIC|TỔNG HỢP/i.test(html),
          versions: /hydro-analytic/.test(html),
          attribution: /Esri|OpenStreetMap/.test(html),
        };
      }, kind);
      d(r);
      return r.chars > 800 && r.watermark && r.versions && r.attribution;
    });
  }

  /* The argument about whether releases worsened a flood is settled in public within
     days. This is the artefact that settles it with evidence. */
  await check('the operation record answers "did the dam cause this?" with numbers', async (d) => {
    const r = await page.evaluate(() => {
      const html = window.FT.reports.operation();
      const txt = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      return {
        hasHeldBack: /Mm³/.test(txt),
        hasKappa: /κ/.test(txt),
        hasCounterfactual: /không hành động|no action/i.test(txt),
        hasPerReservoir: window.FT.data.RESERVOIRS.every((r) => txt.includes(r.name)),
      };
    });
    d(r);
    return r.hasHeldBack && r.hasKappa && r.hasCounterfactual && r.hasPerReservoir;
  });

  await check('the post-event report reconstructs the timeline and the decisions', async (d) => {
    const r = await page.evaluate(() => {
      const txt = window.FT.reports.event().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      return {
        hasEvents: /Dòng sự kiện|Event timeline/i.test(txt),
        hasAudit: /kiểm toán|audit/i.test(txt),
        hasNotifications: /Thông báo|notification/i.test(txt),
      };
    });
    d(r);
    return r.hasEvents && r.hasAudit && r.hasNotifications;
  });

  await check('previewing a report is itself recorded in the audit trail', async (d) => {
    await page.click('#btnRepOperation');
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const open = !document.getElementById('modalScrim').hidden;
      const logged = window.FT.ops.audit.entries.some((e) => e.action === 'report.preview');
      document.getElementById('modalScrim').hidden = true;
      return { open, logged };
    });
    d(r);
    return r.open && r.logged;
  });

  await ctx.close();
}

/* ==========================================================================
   Map, layers, views — the map is the centre of the application
   ========================================================================== */
async function mapAndViews(browser) {
  step('Map · views, layers, spatial objects');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setTime(page, 14);

  await check('switching between the 3D twin and the 2D operations map works', async (d) => {
    await page.click('#viewTabs button[data-view="2d"]');
    await page.waitForTimeout(600);
    const two = await page.evaluate(() => window.FT.state.view);
    await page.click('#viewTabs button[data-view="3d"]');
    await page.waitForTimeout(900);
    const three = await page.evaluate(() => window.FT.state.view);
    d({ two, three });
    return two === '2d' && three === '3d';
  });

  await check('the shelter layer actually paints and reflects live validity', async (d) => {
    await page.click('#viewTabs button[data-view="2d"]');
    await page.waitForTimeout(700);
    const r = await page.evaluate(() => {
      const c = document.getElementById('canvas2d');
      const snap = window.FT.hydro.at(window.FT.state.timeH);
      const hash = () => {
        const g = c.getContext('2d');
        const dta = g.getImageData(0, 0, c.width, c.height).data;
        let h = 2166136261;
        for (let i = 0; i < dta.length; i += 997) { h ^= dta[i]; h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(16);
      };
      window.FT.state.layers.shelters = false; window.FT.map2d.render(0.016, snap, 'main'); const off = hash();
      window.FT.state.layers.shelters = true; window.FT.map2d.render(0.016, snap, 'main'); const on = hash();
      const states = window.FT.data.SHELTERS.map((s) => window.FT.forecast.shelterState(s, window.FT.state.timeH).valid);
      return { paints: off !== on, valid: states.filter(Boolean).length, total: states.length };
    });
    d(r);
    return r.paints && r.valid > 0 && r.valid < r.total;   // some valid, some excluded
  });

  await check('every layer toggle is wired to the renderer', async (d) => {
    const r = await page.evaluate(() => {
      const out = [];
      for (const el of document.querySelectorAll('[data-layer]')) {
        const key = el.dataset.layer;
        const before = window.FT.state.layers[key];
        el.checked = !before; el.dispatchEvent(new Event('change'));
        const after = window.FT.state.layers[key];
        el.checked = before; el.dispatchEvent(new Event('change'));
        out.push({ key, wired: after !== before });
      }
      return out;
    });
    d(r.filter((x) => !x.wired));
    return r.length >= 10 && r.every((x) => x.wired);
  });

  await ctx.close();
}

/* ==========================================================================
   Hydrology · sub-catchments and antecedent wetness
   ========================================================================== */
async function hydrology(browser) {
  step('FR-29 · Sub-catchment rainfall and antecedent wetness');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setTime(page, 6);

  await check('rainfall is decomposed into controllable and uncontrolled catchments', async (d) => {
    const r = await page.evaluate(() => {
      const subs = window.FT.data.SUBCATCH;
      return {
        upper: subs.filter((s) => s.kind === 'upper').length,
        local: subs.filter((s) => s.kind === 'local').length,
        split: document.getElementById('subSplit').textContent.trim(),
        rows: document.querySelectorAll('#subList .subRow').length,
      };
    });
    d(r);
    return r.upper === 4 && r.local === 4 && r.rows === 8 && /%/.test(r.split);
  });

  /* The decomposition must redistribute the forcing, not inflate it — otherwise every
     downstream calibration silently shifts. */
  await check('the orographic weights are normalised, so total forcing is preserved', async (d) => {
    const r = await page.evaluate(() => {
      const subs = window.FT.data.SUBCATCH.filter((s) => s.kind === 'upper');
      const wsum = subs.reduce((a, s) => a + s.weight, 0);
      const mean = subs.reduce((a, s) => a + s.oro * s.weight, 0) / wsum;
      return { mean: +mean.toFixed(3) };
    });
    d(r);
    return Math.abs(r.mean - 1) < 0.02;
  });

  await check('the wetness factor is volume-neutral over the event', async (d) => {
    const r = await page.evaluate(() => window.FT.data.SUBCATCH.map((sc) => {
      const w = window.FT.hydro.sub[sc.id].wet;
      return +(w.reduce((a, b) => a + b, 0) / w.length).toFixed(3);
    }));
    d(r);
    return r.every((m) => Math.abs(m - 1) < 0.01);
  });

  await check('antecedent wetness is shown as a saturation index, not a bare millimetre figure', async (d) => {
    const t = await page.evaluate(() => document.getElementById('subList').innerText);
    d(t.slice(0, 100));
    return /%/.test(t) && /Khô|Ẩm|Ướt|BÃO HÒA|Dry|Moist|Wet|SATURATED/.test(t);
  });

  await check('the rainfall calibration caveat is surfaced, not buried', async (d) => {
    const t = await page.evaluate(() => document.getElementById('rainCaveat').innerText);
    d(t.slice(0, 110));
    return /Cảnh báo hiệu chỉnh|Calibration caveat/i.test(t) && /mm/.test(t);
  });

  await check('controllability κ is consistent with the controllable rainfall share', async (d) => {
    const r = await page.evaluate(() => ({
      kappa: window.FT.ops.kappa(window.FT.data.GAUGES[0], window.FT.state.timeH),
      chip: document.getElementById('opsKappaVal').textContent.trim(),
    }));
    d(r);
    return r.kappa >= 0 && r.kappa <= 1 && r.chip !== '';
  });

  await ctx.close();
}

/* ==========================================================================
   UX-1 / SC-4 / SC-8 · Scenario Comparison and Recovery
   ========================================================================== */
async function scenarioComparison(browser) {
  step('UX-1 · Scenario Comparison, joint attribution, Recovery');
  const { ctx, page, errors } = await bootApp(browser, BASE);
  usePage(page);

  await check('two to four options share one map clock and control gauge', async (d) => {
    await page.keyboard.press('c');
    await page.waitForTimeout(180);
    const r = await page.evaluate(() => {
      const state = FT.compare.state;
      const options = state.optionOrder.map((id) => state.options[id]);
      return {
        count: options.length,
        sameClock: options.every((option) => option.result.validTime === state.validTime),
        sameGauge: options.every((option) => option.result.gaugeId === state.gaugeId),
        panel: !!document.querySelector('[data-panel="compare"] [role="listbox"]'),
      };
    });
    d(r);
    return r.count >= 2 && r.count <= 4 && r.sameClock && r.sameGauge && r.panel;
  });

  await check('joint schedule names the combined peak and binding gauge', async (d) => {
    const r = await page.evaluate(() => {
      const joint = Object.values(FT.compare.state.options).find((option) => option.kind === 'JOINT_SCHEDULE');
      return joint ? joint.result.attribution : null;
    });
    d(r);
    return !!r && r.reservoirIds.length >= 2 && Number.isFinite(r.combinedPeakM) && Number.isFinite(r.combinedPeakTimeH) && !!r.bindingGaugeId;
  });

  await check('changing the viewed option leaves policy and approval unchanged', async (d) => {
    const r = await page.evaluate(() => {
      const before = { policy: FT.state.policy, approved: FT.state.mpcApproved };
      document.querySelector('[data-panel="compare"] [data-option="mpc"]').click();
      return { before, policy: FT.state.policy, approved: FT.state.mpcApproved, viewKey: FT.compare.viewKey() };
    });
    d(r);
    return r.viewKey === 'mpc' && r.policy === r.before.policy && r.approved === r.before.approved;
  });

  await check('an infeasible option stays visible with its binding constraint and cannot export', async (d) => {
    const r = await page.evaluate(() => {
      const option = Object.values(FT.compare.state.options).find((item) => item.status === 'INFEASIBLE');
      return option ? {
        visible: !!document.querySelector(`[data-panel="compare"] [data-option="${option.id}"]`),
        binding: option.result.binding && option.result.binding.id,
        gauge: option.result.gaugeId,
        exported: FT.compare.exportRecommendation(option.id).ok,
      } : null;
    });
    d(r);
    return !!r && r.visible && !!r.binding && !!r.gauge && !r.exported;
  });

  await check('Recovery is directly selectable at a derived descending-limb time', async (d) => {
    const r = await page.evaluate(() => {
      const select = document.getElementById('scenarioSelect');
      select.value = 'recovery'; select.dispatchEvent(new Event('change'));
      return {
        scenario: FT.state.scenario,
        timeH: FT.state.timeH,
        derived: FT.hydro.recoveryStart('recovery'),
        playing: FT.state.playing,
        illegal: FT.domain.illegalTransitions().length,
      };
    });
    d(r);
    return r.scenario === 'recovery' && Number.isFinite(r.derived) && r.timeH === r.derived && !r.playing && r.illegal === 0;
  });

  await check('comparison interaction introduces no application errors', (d) => {
    const app = errors.filter((error) => !/overpass|arcgisonline|elevation-tiles-prod|jsdelivr|unpkg|cdn\./i.test(error));
    d(app);
    return app.length === 0;
  });

  await ctx.close();
}

/* ==========================================================================
   Cross-cutting: i18n, keyboard, resilience
   ========================================================================== */
async function crossCutting(browser) {
  step('Cross-cutting · i18n, keyboard, resilience');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);
  await setTime(page, 8);

  await check('the language toggle switches the interface', async (d) => {
    const before = await page.evaluate(() => document.querySelector('[data-i18n="panel.zones"]').textContent);
    await page.click('#langToggle');
    await page.waitForTimeout(300);
    const after = await page.evaluate(() => document.querySelector('[data-i18n="panel.zones"]').textContent);
    await page.click('#langToggle');
    await page.waitForTimeout(200);
    d({ before, after });
    return before !== after;
  });

  await check('the data-health panel is reachable by keyboard', async (d) => {
    const r = await page.evaluate(() => {
      const el = document.getElementById('opsHealth');
      el.focus();
      const focused = document.activeElement === el;
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const open = !document.getElementById('modalScrim').hidden;
      document.getElementById('modalScrim').hidden = true;
      return { focused, open, tabindex: el.getAttribute('tabindex') };
    });
    d(r);
    return r.focused && r.open;
  });

  await check('invalid shelters are marked by shape, not by colour alone', async (d) => {
    /* colour-blind safety: the map draws a cross on an excluded shelter, and the panel
       states the reason in words (docs UX §5) */
    const r = await page.evaluate(() => {
      const txt = document.getElementById('shelterList').innerText;
      return { hasWords: /loại|excluded|NGẬP|SUBMERGED|không dùng được|unusable/i.test(txt), len: txt.length };
    });
    d(r);
    return r.len === 0 || r.hasWords;
  });

  await check('the app survives a rapid scrub without errors', async (d) => {
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.evaluate(() => {
      for (let t = -24; t <= 48; t += 2) {
        window.FT.state.timeH = t;
        window.FT.bus.emit('scrubbed');
        window.FT.ui.tick(window.FT.hydro.at(t));
      }
    });
    await page.waitForTimeout(400);
    d(errs.slice(0, 3));
    return errs.length === 0;
  });

  await check('the timeline stays responsive while scrubbing', async (d) => {
    const samples = await page.evaluate(() => {
      const run = () => {
        const t0 = performance.now();
        for (let t = -20; t <= 40; t += 4) {
          window.FT.state.timeH = t;
          window.FT.bus.emit('scrubbed');
          window.FT.ui.tick(window.FT.hydro.at(t));
        }
        return performance.now() - t0;
      };
      return [run(), run(), run()];
    });
    const median = samples.slice().sort((a, b) => a - b)[1];
    d(`${Math.round(median)} ms median for 16 scrub steps (${samples.map(Math.round).join(', ')} ms)`);
    return median < 4000;
  });

  await ctx.close();
}

/* ==========================================================================
   Scenario matrix — every scenario × policy must run clean
   ========================================================================== */
async function scenarioMatrix(browser) {
  step('Scenario matrix · every scenario × policy');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);

  for (const scenario of ['oct2020', 'yagi', 'monsoon', 'recovery']) {
    for (const policy of ['rule', 'mpc']) {
      await check(`${scenario} × ${policy} runs the full event without error`, async (d) => {
        const r = await page.evaluate(async ({ s, p }) => {
          const FT = window.FT;
          const errs = [];
          try {
            FT.state.scenario = s; FT.hydro.rebuild();
            document.querySelector(`.policyToggle button[data-policy="${p}"]`).click();
            for (const t of [-10, 0, 10, 24, 40]) {
              FT.state.timeH = t; FT.bus.emit('scrubbed');
              FT.world.updateRoadDepths(); FT.zones.stepStats(true);
              const snap = FT.hydro.at(t);
              FT.alarms.scan(snap); FT.ui.tick(snap);
            }
            FT.domain.rebuildTimeline();
            ['situation', 'operation', 'event'].forEach((k) => FT.reports[k]());
            FT.notifyOps.buildRecord('release', FT.hydro.at(10));
          } catch (e) { errs.push(e.message); }
          return {
            errs,
            events: FT.domain.events.length,
            illegal: FT.domain.illegalTransitions().length,
          };
        }, { s: scenario, p: policy });
        d(r);
        return r.errs.length === 0 && r.illegal === 0 && r.events > 10;
      });
    }
  }

  await ctx.close();
}

/* ==========================================================================
   run
   ========================================================================== */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const srv = await listen(4310, ROOT);
  BASE = `http://127.0.0.1:${srv.address().port}`;
  console.log(`serving ${ROOT} on ${BASE}${QUICK ? ' (quick mode)' : ''}`);

  const browser = await launchGpu();
  const t0 = Date.now();
  try {
    await bootAndHonesty(browser);
    await decisionPackage(browser);
    await approvalGate(browser);
    await decisionRights(browser);
    await degradation(browser);
    await reservoirSafety(browser);
    await notifications(browser);
    await alarms(browser);
    await evacuation(browser);
    await domainLayer(browser);
    await reports(browser);
    await hydrology(browser);
    await mapAndViews(browser);
    await scenarioComparison(browser);
    if (!QUICK) {
      await crossCutting(browser);
      await scenarioMatrix(browser);
    }
  } finally {
    await browser.close();
    srv.close();
  }

  console.log(`\nran ${results.length} checks in ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(report('FloodTwin E2E') ? 1 : 0);
}
