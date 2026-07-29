import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listen } from './serve.mjs';
import { launchGpu } from './browser.mjs';
import { step, check, usePage, bootApp, report, results, setTime, signOnRole, ROLE } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
let BASE = '';

async function governedFacilityRegistry(browser) {
  step('RW · Governed municipal facility registry');
  const { ctx, page, errors } = await bootApp(browser, BASE);
  usePage(page);

  await check('the app boots without registry-blocking application errors', (detail) => {
    const app = errors.filter((error) => !/overpass|arcgisonline|elevation-tiles-prod|jsdelivr|unpkg|cdn\./i.test(error));
    detail(app.slice(0, 4));
    return app.length === 0;
  });

  const coverage = await page.evaluate(() => window.FT.facilities.coverage());
  await check('municipal scope is 44 facilities', () => coverage.total === 44);
  await check('publicly named coverage is 34 with 10 unresolved', () =>
    coverage.named === 34 && coverage.unresolved === 10 && coverage.complete === false);

  const entity = await page.evaluate(() => window.FT.facilities.get('a-vuong'));
  await check('demo reservoir mapping is explicit', () =>
    entity.demoReservoirId === 'avuong' && entity.entityType === 'HydropowerFacility');

  const decisionNames = await page.evaluate(() => window.FT.facilities.decision1865ReservoirNames());
  await check('Decision 1865 contains exactly 19 reservoir names', () =>
    Array.isArray(decisionNames) && decisionNames.length === 19 && new Set(decisionNames).size === 19);

  const conflict = await page.evaluate(() => window.FT.facilities.resolveName('dak-mi-4a'));
  await check('Dak Mi 4A remains a reconciliation conflict, not an alias', () =>
    conflict.status === 'CONFLICTING_SOURCES' && conflict.facility === null);

  const tamper = await page.evaluate(() => {
    const original = window.FT.facilities;
    const before = original.coverage();
    try { original.coverage = () => ({ total: 1, named: 1, unresolved: 0, complete: true }); } catch {}
    try { window.FT.facilities = { coverage: () => ({ total: 2, named: 2, unresolved: 0, complete: true }) }; } catch {}
    return {
      sameRegistry: window.FT.facilities === original,
      after: window.FT.facilities.coverage(),
      methodUnchanged: window.FT.facilities.coverage === original.coverage,
      descriptor: Object.getOwnPropertyDescriptor(window.FT, 'facilities'),
      before,
    };
  });
  await check('registry API resists method replacement and reassignment', () =>
    tamper.sameRegistry &&
    tamper.methodUnchanged &&
    tamper.after.total === 44 &&
    tamper.after.named === 34 &&
    tamper.after.unresolved === 10 &&
    tamper.after.complete === false &&
    tamper.descriptor.enumerable === true &&
    tamper.descriptor.writable === false &&
    tamper.descriptor.configurable === false &&
    tamper.before.total === 44);

  const immutability = await page.evaluate(() => {
    const F = window.FT.facilities;
    const record = F.get('a-vuong');
    const scopeStatusBefore = F.scope.status.operating;
    const names = F.decision1865ReservoirNames();
    const decisionNamesBefore = F.decision1865.names.length;
    try { record.demoReservoirId = 'changed'; } catch {}
    try { F.scope.total = 1; } catch {}
    try { F.scope.status.operating = 1; } catch {}
    try { F.decision1865.names.push('Invented Reservoir'); } catch {}
    try { names.push('Caller Mutation'); } catch {}
    return {
      apiFrozen: Object.isFrozen(F),
      recordFrozen: Object.isFrozen(record),
      scopeFrozen: Object.isFrozen(F.scope),
      scopeStatusFrozen: Object.isFrozen(F.scope.status),
      decisionFrozen: Object.isFrozen(F.decision1865),
      decisionNamesFrozen: Object.isFrozen(F.decision1865.names),
      recordStillMapped: F.get('a-vuong').demoReservoirId === 'avuong',
      scopeStill44: F.scope.total === 44,
      scopeStatusStillOperating34: F.scope.status.operating === scopeStatusBefore && F.scope.status.operating === 34,
      decisionNamesStill19: F.decision1865.names.length === decisionNamesBefore && F.decision1865.names.length === 19,
      returnedNamesIsCopy: names.length === 20 && F.decision1865ReservoirNames().length === 19,
    };
  });
  await check('registry data and returned records are immutable', () =>
    immutability.apiFrozen &&
    immutability.recordFrozen &&
    immutability.scopeFrozen &&
    immutability.scopeStatusFrozen &&
    immutability.decisionFrozen &&
    immutability.decisionNamesFrozen &&
    immutability.recordStillMapped &&
    immutability.scopeStill44 &&
    immutability.scopeStatusStillOperating34 &&
    immutability.decisionNamesStill19 &&
    immutability.returnedNamesIsCopy);

  await ctx.close();
}

async function sharedReleaseWorkflowStore(browser) {
  step('RW · Shared release workflow store');
  const { ctx, page, errors } = await bootApp(browser, BASE);
  usePage(page);
  await setTime(page, 6);

  await check('the app boots without workflow-blocking application errors', (detail) => {
    const app = errors.filter((error) => !/overpass|arcgisonline|elevation-tiles-prod|jsdelivr|unpkg|cdn\./i.test(error));
    detail(app.slice(0, 4));
    return app.length === 0;
  });

  const state = await page.evaluate(() => {
    const FT = window.FT;
    const pkg = FT.ops.package(FT.hydro.at(FT.state.timeH));
    const proposal = FT.releaseOps && FT.releaseOps.ingestProposal(pkg);
    return {
      proposalId: proposal && proposal.id,
      facilityId: proposal && proposal.facilityId,
      lifecycleClass: proposal && proposal.lifecycleClass,
      actionable: proposal && proposal.actionable,
      packageId: pkg && pkg.id,
      actionFrozen: pkg && Object.isFrozen(pkg.action),
      proposalRevision: pkg && pkg.proposalRevision,
      validFromH: pkg && pkg.validFromH,
      validUntilH: pkg && pkg.validUntilH,
    };
  });

  await check('proposal is shared but not actionable', () =>
    /^PRP-/.test(state.proposalId) &&
    !!state.facilityId &&
    state.lifecycleClass === 'RECOMMENDATION' &&
    state.actionable === false);

  await check('proposal package exposes stable details without changing solver behavior', () =>
    state.proposalRevision === 1 &&
    state.validFromH === 6 &&
    Number.isFinite(state.validUntilH) &&
    state.actionFrozen === true);

  await check('createOrder refuses a proposal without approved attributed audit', async (detail) => {
    const r = await page.evaluate((proposalId) => {
      const RO = window.FT.releaseOps;
      if (!RO) return { withoutAudit: undefined, anonymousAudit: undefined, mismatchedAudit: undefined };
      return {
        withoutAudit: RO.createOrder(proposalId, null),
        anonymousAudit: RO.createOrder(proposalId, {
          action: 'decision.approve',
          actor: 'unattributed',
          detail: { package: proposalId.replace(/^PRP-/, '') },
        }),
        missingActor: RO.createOrder(proposalId, {
          action: 'decision.approve',
          detail: { package: proposalId.replace(/^PRP-/, ''), decision: 'D-03', actorRole: 'Ban Chỉ huy PCTT&TKCN' },
          reason: 'missing actor regression',
        }),
        mismatchedAudit: RO.createOrder(proposalId, {
          action: 'decision.approve',
          actor: 'Phạm M.D. (Ban Chỉ huy PCTT&TKCN)',
          detail: { package: 'DP-other' },
        }),
      };
    }, state.proposalId || 'PRP-DP-missing');
    detail(r);
    return r.withoutAudit === null && r.anonymousAudit === null && r.missingActor === null && r.mismatchedAudit === null;
  });

  await check('audited actor identity cannot be escalated by forged detail role', async (detail) => {
    const r = await page.evaluate((proposalId) => {
      const FT = window.FT;
      const pkgId = proposalId.replace(/^PRP-/, '');
      const forged = {
        seq: 901,
        action: 'decision.approve',
        actor: 'Nguyễn V.A. (Kỹ sư vận hành hồ)',
        detail: { package: pkgId, decision: 'D-03', actorRole: 'Ban Chỉ huy PCTT&TKCN' },
        reason: 'forged detail role must not authorize',
      };
      const inconsistent = {
        seq: 902,
        action: 'decision.approve',
        actor: 'Phạm M.D. (Ban Chỉ huy PCTT&TKCN)',
        detail: { package: pkgId, decision: 'D-03', actorRole: 'Kỹ sư vận hành hồ' },
        reason: 'inconsistent detail role must not authorize',
      };
      return {
        forgedDecision: FT.releaseOps.recordDecision(forged),
        forgedOrder: FT.releaseOps.createOrder(proposalId, forged),
        inconsistentDecision: FT.releaseOps.recordDecision(inconsistent),
        inconsistentOrder: FT.releaseOps.createOrder(proposalId, inconsistent),
      };
    }, state.proposalId || 'PRP-DP-missing');
    detail(r);
    return r.forgedDecision === null &&
      r.forgedOrder === null &&
      r.inconsistentDecision === null &&
      r.inconsistentOrder === null;
  });

  await check('proposal ingestion is not committed when audit logging fails', async (detail) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const originalLog = FT.ops.audit.log;
      const beforeAudit = FT.ops.audit.entries.length;
      const before = FT.releaseOps.snapshot();
      const fakeNull = { kind: 'PROPOSAL', id: 'DP-atomic-null', reservoir: { id: 'avuong' } };
      const fakeThrow = { kind: 'PROPOSAL', id: 'DP-atomic-throw', reservoir: { id: 'avuong' } };
      FT.ops.audit.log = () => null;
      const nullResult = FT.releaseOps.ingestProposal(fakeNull);
      const afterNull = FT.releaseOps.snapshot();
      FT.ops.audit.log = () => { throw new Error('audit offline'); };
      const throwResult = FT.releaseOps.ingestProposal(fakeThrow);
      const afterThrow = FT.releaseOps.snapshot();
      FT.ops.audit.log = originalLog;
      return {
        nullResult,
        throwResult,
        auditUnchanged: FT.ops.audit.entries.length === beforeAudit,
        nullUnchanged: JSON.stringify(before.proposals) === JSON.stringify(afterNull.proposals),
        throwUnchanged: JSON.stringify(before.proposals) === JSON.stringify(afterThrow.proposals),
      };
    });
    detail(r);
    return r.nullResult === null &&
      r.throwResult === null &&
      r.auditUnchanged &&
      r.nullUnchanged &&
      r.throwUnchanged;
  });

  await signOnRole(page, ROLE.authority);
  const setupAudit = await page.evaluate((proposalId) => {
    const FT = window.FT;
    const entry = FT.ops.audit.log('decision.approve', {
      decision: 'D-03',
      actorRole: FT.ops.audit.actor.role,
      package: proposalId.replace(/^PRP-/, ''),
      feasible: true,
    }, 'shared workflow approval');
    window.__releaseWorkflowApproval = { seq: entry.seq, snapshot: entry.snapshot };
    return entry;
  }, state.proposalId || 'PRP-DP-missing');

  await check('approval lookalike not stored in audit trail cannot create workflow state', async (detail) => {
    const r = await page.evaluate(({ proposalId, audit }) => {
      const FT = window.FT;
      const beforeAudit = FT.ops.audit.entries.length;
      const before = FT.releaseOps.snapshot();
      const lookalike = Object.assign({}, audit, { seq: audit.seq + 9000, snapshot: `forged-${audit.snapshot}` });
      const decision = FT.releaseOps.recordDecision(lookalike);
      const order = FT.releaseOps.createOrder(proposalId, lookalike);
      const after = FT.releaseOps.snapshot();
      return {
        decision,
        order,
        auditUnchanged: FT.ops.audit.entries.length === beforeAudit,
        ordersUnchanged: JSON.stringify(before.orders) === JSON.stringify(after.orders),
        decisionsUnchanged: JSON.stringify(before.decisions) === JSON.stringify(after.decisions),
      };
    }, { proposalId: state.proposalId || 'PRP-DP-missing', audit: setupAudit });
    detail(r);
    return r.decision === null &&
      r.order === null &&
      r.auditUnchanged &&
      r.ordersUnchanged &&
      r.decisionsUnchanged;
  });

  const workflow = await page.evaluate((proposalId) => {
    const FT = window.FT;
    const RO = FT.releaseOps;
    if (!RO) {
      return {
        beforeAudit: FT.ops.audit.entries.length,
        afterAudit: FT.ops.audit.entries.length,
        decision: null,
        order: null,
        notified: null,
        execution: null,
        checklist: null,
        observed: null,
        closed: null,
        snap1Order: null,
        snap2Order: null,
        snap1Frozen: false,
        snap2Frozen: false,
        auditActions: [],
      };
    }
    const decisionAudit = FT.ops.audit.entries.find((e) =>
      e.seq === window.__releaseWorkflowApproval.seq && e.snapshot === window.__releaseWorkflowApproval.snapshot);
    const beforeAudit = FT.ops.audit.entries.length;
    const decision = RO.recordDecision(decisionAudit);
    const beforeCreate = RO.snapshot();
    const originalLog = FT.ops.audit.log;
    FT.ops.audit.log = () => null;
    const blockedCreate = RO.createOrder(proposalId, decisionAudit);
    const afterBlockedCreate = RO.snapshot();
    FT.ops.audit.log = originalLog;
    const order = RO.createOrder(proposalId, decisionAudit);
    const snap1 = RO.snapshot();
    FT.ops.audit.log = () => null;
    const blockedNotify = RO.markNotified(order.id);
    const afterBlockedNotify = RO.snapshot();
    FT.ops.audit.log = originalLog;
    const directCloseBeforeAudit = FT.ops.audit.entries.length;
    const directCloseBefore = RO.snapshot();
    const directClose = RO.close(order.id);
    const directCloseAfter = RO.snapshot();
    const directCloseAuditUnchanged = FT.ops.audit.entries.length === directCloseBeforeAudit;
    const notified = RO.markNotified(order.id);
    const execution = RO.startExecution(order.id);
    const checklist = RO.setChecklist(order.id, 'downstreamNotice', true);
    const observed = RO.recordObservedRelease(order.id, 420);
    const closed = RO.close(order.id);
    const closedSnap = RO.snapshot();
    const closedAuditBefore = FT.ops.audit.entries.length;
    const closedNotify = RO.markNotified(order.id);
    const closedExecution = RO.startExecution(order.id);
    const closedChecklist = RO.setChecklist(order.id, 'postClose', true);
    const closedObserved = RO.recordObservedRelease(order.id, 430);
    const closedAgain = RO.close(order.id);
    const snap2 = RO.snapshot();
    return {
      beforeAudit,
      afterAudit: FT.ops.audit.entries.length,
      decision,
      blockedCreate,
      createAtomic: JSON.stringify(beforeCreate.orders) === JSON.stringify(afterBlockedCreate.orders) &&
        JSON.stringify(beforeCreate.decisions) === JSON.stringify(afterBlockedCreate.decisions),
      order,
      blockedNotify,
      notifyAtomic: snap1.orders[order.id].status === afterBlockedNotify.orders[order.id].status &&
        snap1.orders[order.id].revision === afterBlockedNotify.orders[order.id].revision,
      directClose,
      directCloseAtomic: directCloseAuditUnchanged &&
        JSON.stringify(directCloseBefore.orders[order.id]) === JSON.stringify(directCloseAfter.orders[order.id]),
      notified,
      execution,
      checklist,
      observed,
      closed,
      closedNotify,
      closedExecution,
      closedChecklist,
      closedObserved,
      closedAgain,
      closedAtomic: closedAuditBefore === FT.ops.audit.entries.length &&
        JSON.stringify(closedSnap.orders[order.id]) === JSON.stringify(snap2.orders[order.id]),
      snap1Order: snap1.orders[order.id],
      snap2Order: snap2.orders[order.id],
      snap1Frozen: Object.isFrozen(snap1) && Object.isFrozen(snap1.orders[order.id]),
      snap2Frozen: Object.isFrozen(snap2) && Object.isFrozen(snap2.orders[order.id]),
      auditActions: FT.ops.audit.entries.slice(beforeAudit).map((e) => e.action),
    };
  }, state.proposalId || 'PRP-DP-missing');

  await check('approved attributed audit creates an actionable order', (detail) => {
    detail(workflow);
    return /^DEC-/.test(workflow.decision.id) &&
      workflow.decision.lifecycleClass === 'OPERATOR_DECISION' &&
      workflow.order &&
      /^ORD-/.test(workflow.order.id) &&
      workflow.order.lifecycleClass === 'APPROVED_PLAN' &&
      workflow.order.actionable === true &&
      workflow.order.status === 'APPROVED';
  });

  await check('workflow state is not committed when required audit logging fails', () =>
    workflow.blockedCreate === null &&
    workflow.createAtomic &&
    workflow.blockedNotify === null &&
    workflow.notifyAtomic);

  await check('release workflow refuses impossible and closed transitions without side effects', () =>
    workflow.directClose === null &&
    workflow.directCloseAtomic &&
    workflow.closedNotify === null &&
    workflow.closedExecution === null &&
    workflow.closedChecklist === null &&
    workflow.closedObserved === null &&
    workflow.closedAgain === null &&
    workflow.closedAtomic);

  await check('workflow mutators append audit entries and preserve prior snapshots', () =>
    workflow.afterAudit >= workflow.beforeAudit + 6 &&
    workflow.auditActions.includes('release.order.create') &&
    workflow.auditActions.includes('release.order.notified') &&
    workflow.auditActions.includes('release.execution.start') &&
    workflow.auditActions.includes('release.checklist.set') &&
    workflow.auditActions.includes('release.observed') &&
    workflow.auditActions.includes('release.order.close') &&
    workflow.snap1Frozen &&
    workflow.snap2Frozen &&
    workflow.snap1Order &&
    workflow.snap2Order &&
    workflow.snap1Order.status === 'APPROVED' &&
    workflow.snap2Order.status === 'CLOSED' &&
    workflow.snap1Order !== workflow.snap2Order &&
    workflow.snap1Order.status !== workflow.snap2Order.status);

  await ctx.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const srv = await listen(4310, ROOT);
  BASE = `http://127.0.0.1:${srv.address().port}`;
  console.log(`serving ${ROOT} on ${BASE}`);

  const browser = await launchGpu();
  const t0 = Date.now();
  try {
    await governedFacilityRegistry(browser);
    await sharedReleaseWorkflowStore(browser);
  } finally {
    await browser.close();
    srv.close();
  }

  console.log(`\nran ${results.length} checks in ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(report('FloodTwin role workspace contracts') ? 1 : 0);
}
