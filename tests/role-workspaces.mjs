import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listen } from './serve.mjs';
import { launchGpu } from './browser.mjs';
import { step, check, usePage, bootApp, report, results, setTime, setScenario, setPolicy, signOnRole, ROLE, openWorkspace } from './harness.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
let BASE = '';

/* Order ids nest: ORD-…-action is a literal prefix of ORD-…-action-R3 and -R5. A plain
   substring test therefore "finds" a superseded order inside the current one's id and every
   not-rendered assertion silently passes. (The old assertions dodged this by matching the
   trailing ";" of a `approved_order_id <id>;` debug dump, which is no longer printed at the
   reader.) Match the id only where it is not followed by more of an identifier. */
const showsOrderId = (text, id) =>
  new RegExp(`${String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![-\\w])`).test(String(text || ''));


async function workspaceRouting(browser) {
  step('RW · URL routed role workspaces');
  const directCity = await bootApp(browser, BASE, { hash: '?workspace=city' });
  usePage(directCity.page);

  await check('direct city workspace route boots into dedicated host', async (detail) => {
    const state = await directCity.page.evaluate(() => ({
      api: !!(window.FT && window.FT.workspaces),
      workspace: window.FT && FT.state.workspace,
      bodyWorkspace: document.body.dataset.workspace,
      hostHidden: document.getElementById('roleWorkspaceHost')?.hidden,
      stageParentId: document.getElementById('stageWrap')?.parentElement?.dataset.workspaceMapSlot || null,
      url: location.search,
    }));
    detail(state);
    return state.api &&
      state.workspace === 'city' &&
      state.bodyWorkspace === 'city' &&
      state.hostHidden === false &&
      state.stageParentId === 'city' &&
      new URLSearchParams(state.url).get('workspace') === 'city';
  });

  await check('city workspace renders governed operations dashboard without invented identities', async (detail) => {
    const city = await directCity.page.evaluate(() => {
      const visibleText = (node) => node && node.textContent ? node.textContent.replace(/\s+/g, ' ').trim() : '';
      const kpiInt = (key) => {
        const node = document.querySelector(`[data-city-kpi="${key}"] .cityKpiValue`);
        const value = Number.parseInt((node && node.textContent || '').replace(/[^\d-]/g, ''), 10);
        return Number.isFinite(value) ? value : null;
      };
      const rows = [...document.querySelectorAll('[data-city-timeline] [data-process-row]')].map((row) => ({
        text: visibleText(row),
        state: row.getAttribute('data-state') || '',
        facilityId: row.getAttribute('data-facility-id') || '',
      }));
      const plantLink = document.querySelector('[data-city-portfolio] [data-plant-facility-id]');
      const unresolvedCards = [...document.querySelectorAll('[data-city-unresolved-evidence]')].map(visibleText);
      return {
        total: kpiInt('total'),
        named: kpiInt('named'),
        unresolved: kpiInt('unresolved'),
        facilityRows: document.querySelectorAll('[data-city-portfolio] [data-city-facility-row]').length,
        rows: document.querySelectorAll('[data-city-timeline] [data-process-row]').length,
        strayProcessRows: document.querySelectorAll('[data-city-portfolio] [data-process-row]').length,
        queue: document.querySelector('[data-city-decision-queue]')?.textContent,
        map: !!document.querySelector('[data-workspace="city"] [data-workspace-map-slot] #stageWrap'),
        plantLinkFacilityId: plantLink && plantLink.getAttribute('data-plant-facility-id'),
        unresolvedCards,
        rowStates: rows,
        downstream: visibleText(document.querySelector('[data-city-impact]')),
        readiness: visibleText(document.querySelector('[data-city-readiness]')),
        provenance: [...document.querySelectorAll('[data-provenance]')].map(visibleText).join(' | '),
      };
    });
    detail(city);
    return city.total === 44 &&
      city.named === 34 &&
      city.unresolved === 10 &&
      city.facilityRows === 34 &&
      city.rows === 4 &&
      city.strayProcessRows === 0 &&
      /accountable|thẩm quyền|PCTT|committee/i.test(city.queue || '') &&
      city.map === true &&
      city.plantLinkFacilityId === 'a-vuong' &&
      city.unresolvedCards.length === 1 &&
      /10 (facilities with no matching reservoir|công trình chưa khớp được với hồ nào)/i.test(city.unresolvedCards[0]) &&
      city.rowStates.every((row) => row.text.length > 0 && ['PROPOSED','SUBMITTED','APPROVED','NOTIFIED','EXECUTING','DEVIATING','VERIFIED','CLOSED','ASSESSED','NOT_IN_CURRENT_DEMO'].includes(row.state) &&
        !/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/.test(row.text)) &&
      /simulation|mô phỏng|synthetic|provenance|nguồn/i.test(city.downstream || '') &&
      /audit|notification|thông báo|provenance|source|nguồn/i.test(city.readiness || '') &&
      /simulation|synthetic|source|provenance|registry|audit|nguồn|đăng ký|kiểm toán/i.test(city.provenance || '');
  });

  await check('workspace navigation exposes current page and labels route controls accessibly', async (detail) => {
    const nav = await directCity.page.evaluate(() => {
      const controls = [...document.querySelectorAll('#workspaceNav [data-workspace]')].map((button) => ({
        workspace: button.dataset.workspace,
        text: button.textContent.replace(/\s+/g, ' ').trim(),
        ariaCurrent: button.getAttribute('aria-current'),
        name: button.getAttribute('aria-label') || button.textContent.replace(/\s+/g, ' ').trim(),
        minHeight: Math.round(button.getBoundingClientRect().height),
      }));
      return { current: FT.workspaces.current(), controls };
    });
    detail(nav);
    return nav.current.workspace === 'city' &&
      nav.controls.length >= 2 &&
      nav.controls.filter((item) => item.ariaCurrent === 'page').length === 1 &&
      nav.controls.some((item) => item.workspace === 'city' && item.ariaCurrent === 'page') &&
      nav.controls.every((item) => item.name.length > 0 && item.minHeight >= 40);
  });

  await check('city and plant workspace copy refreshes bilingually without changing identifiers or numeric values', async (detail) => {
    const result = await directCity.page.evaluate(async () => {
      const text = (selector) => document.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() || '';
      const stateRows = () => [...document.querySelectorAll('[data-city-timeline] [data-process-row]')]
        .map((row) => ({
          facilityId: row.getAttribute('data-facility-id') || '',
          state: row.getAttribute('data-state') || '',
          text: row.textContent.replace(/\s+/g, ' ').trim(),
        }));
      const nums = () => ({
        total: text('[data-city-kpi="total"] .cityKpiValue'),
        named: text('[data-city-kpi="named"] .cityKpiValue'),
        unresolved: text('[data-city-kpi="unresolved"] .cityKpiValue'),
        unresolvedText: text('[data-city-unresolved-evidence]'),
      });
      FT.i18n.setLang('en');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const en = {
        title: text('.cityDashboard .roleDashboardTitle h2'),
        queue: text('[data-city-decision-queue] h3'),
        nums: nums(),
        states: stateRows(),
      };
      FT.i18n.setLang('vi');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const vi = {
        title: text('.cityDashboard .roleDashboardTitle h2'),
        queue: text('[data-city-decision-queue] h3'),
        nums: nums(),
        states: stateRows(),
      };
      return { en, vi };
    });
    detail(result);
    const valuesStable = ['total', 'named', 'unresolved'].every((key) => result.en.nums[key] === result.vi.nums[key]) &&
      result.en.nums.total === '44' &&
      result.en.nums.named === '34' &&
      result.en.nums.unresolved === '10';
    const tokensStable = result.en.states.length === result.vi.states.length &&
      result.en.states.every((row, index) =>
        row.facilityId === result.vi.states[index].facilityId &&
        row.state === result.vi.states[index].state &&
        row.state === 'ASSESSED' &&
        // the code is carried by data-state, not printed at the reader
        !/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/.test(row.text) &&
        !/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/.test(result.vi.states[index].text));
    return /Municipal coordination dashboard/i.test(result.en.title) &&
      /Decision queue/i.test(result.en.queue) &&
      /Bảng điều phối đô thị/i.test(result.vi.title) &&
      /Hàng chờ quyết định/i.test(result.vi.queue) &&
      /10 facilities with no matching reservoir in the demo/i.test(result.en.nums.unresolvedText) &&
      /10 công trình chưa khớp được với hồ nào trong bản demo/i.test(result.vi.nums.unresolvedText) &&
      valuesStable &&
      tokensStable;
  });

  await check('role workspace Vietnamese copy does not leak English labels while preserving tokens and values', async (detail) => {
    const state = await directCity.page.evaluate(async () => {
      const text = (selector) => document.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() || '';
      const plantPanelText = () => [
        '.plantDashboard .roleDashboardHead',
        '.plantFacilityBar',
        '[data-plant-current-state]',
        '[data-plant-advisory]',
        '[data-plant-alternatives]',
        '[data-plant-approved-order]',
        '[data-plant-checklist]',
        '[data-plant-execution]',
      ].map(text).join(' ');
      FT.i18n.setLang('en');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const enCityQueue = text('[data-city-decision-queue]');
      FT.workspaces.navigate('plant', { facilityId: 'song-tranh-2' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const enPlant = plantPanelText();
      FT.i18n.setLang('vi');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const viPlant = plantPanelText();
      FT.workspaces.navigate('city');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const viCityQueue = text('[data-city-decision-queue]');
      FT.workspaces.navigate('plant', { facilityId: 'tra-linh-1' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const viUnavailable = plantPanelText();
      return {
        enCityQueue,
        viCityQueue,
        enPlant,
        viPlant,
        viUnavailable,
        enTokens: {
          assumed: enPlant.includes('ASSUMED_FOR_DEMO'),
          missing: enPlant.includes('MISSING'),
          facility: enPlant.includes('song-tranh-2'),
          date: enPlant.includes('2026-05-06'),
          proposalUnits: /1,100 → 2,000 m³\/s/.test(enPlant),
        },
        viTokens: {
          assumed: viPlant.includes('ASSUMED_FOR_DEMO'),
          missing: viPlant.includes('MISSING'),
          facility: viPlant.includes('song-tranh-2'),
          date: viPlant.includes('2026-05-06'),
          proposalUnits: /1\.100 → 2\.000 m³\/s/.test(viPlant),
        },
      };
    });
    const viText = `${state.viCityQueue} ${state.viPlant} ${state.viUnavailable}`;
    const leakedTerms = [
      'Accountable role',
      'Consulted roles',
      'inspection ',
      'Order ID, event and facility match current demo',
      'Downstream notifications acknowledged',
      'Plant crew ready',
      'Outlet path ready',
      'Ramp started',
      'Actual release recorded',
      'Downstream response monitored',
      'Completion confirmed',
      'RECOMMENDATION only',
      'revision ',
      'ASSUMED_FOR_DEMO command from approved package',
      'stored approval evidence',
      'telemetry feed not supplied',
      'storage/outlet geometry not supplied',
      'plant operating rules not supplied',
      'routing/forecast inputs not supplied',
      'none stored',
    ].filter((term) => viText.toLowerCase().includes(term.toLowerCase()));
    detail({ ...state, leakedTerms });
    return leakedTerms.length === 0 &&
      /Accountable role|Consulted/i.test(state.enCityQueue) &&
      /inspection|Order ID, event and facility match current demo|RECOMMENDATION only|none stored/i.test(state.enPlant) &&
      /Vai trò chịu trách nhiệm|Tham vấn/i.test(state.viCityQueue) &&
      /kiểm tra|ID lệnh, sự kiện và công trình khớp|chỉ là RECOMMENDATION|chưa lưu/i.test(state.viPlant) &&
      /telemetry|dung tích|quy tắc vận hành|định tuyến/i.test(state.viUnavailable) &&
      JSON.stringify(state.enTokens) === JSON.stringify(state.viTokens);
  });

  await check('missing-data i18n fallbacks are localized without changing canonical tokens', async (detail) => {
    const state = await directCity.page.evaluate(async () => {
      const text = (selector) => document.querySelector(selector)?.textContent.replace(/\s+/g, ' ').trim() || '';
      const original = {
        accountable: FT.roles.accountable,
        classifyDecision: FT.lifecycle && FT.lifecycle.classifyDecision,
      };
      const renderCityFallback = async (lang) => {
        FT.i18n.setLang(lang);
        FT.roles.accountable = () => '';
        FT.ops.audit.log('decision.refused', { eventId: FT.releaseOps.snapshot().event.id }, 'localized fallback regression');
        FT.workspaces.navigate('city');
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const queue = text('[data-city-decision-queue]');
        const readiness = text('[data-city-readiness]');
        FT.roles.accountable = original.accountable;
        return { queue, readiness };
      };
      const renderPlantFallback = async (lang) => {
        FT.i18n.setLang(lang);
        FT.lifecycle.classifyDecision = () => null;
        FT.workspaces.navigate('plant', { facilityId: 'song-tranh-2' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const advisory = text('[data-plant-advisory]');
        FT.lifecycle.classifyDecision = original.classifyDecision;
        return advisory;
      };
      const enCity = await renderCityFallback('en');
      const enPlant = await renderPlantFallback('en');
      const viCity = await renderCityFallback('vi');
      const viPlant = await renderPlantFallback('vi');
      FT.i18n.setLang('vi');
      FT.workspaces.navigate('city');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { enCity, enPlant, viCity, viPlant };
    });
    detail(state);
    const viText = `${state.viCity.queue} ${state.viCity.readiness} ${state.viPlant}`;
    return /unassigned in RACI|unknown role|required role/i.test(`${state.enCity.queue} ${state.enCity.readiness}`) &&
      /No current proposal-class decision package/i.test(state.enPlant) &&
      /chưa phân công|vai trò không xác định|vai trò bắt buộc/i.test(viText) &&
      /Tại thời điểm này chưa có gói ở dạng đề xuất/i.test(state.viPlant) &&
      !/unassigned in RACI|unknown role|required role|No current proposal-class decision package/i.test(viText) &&
      /Đề xuất|Khuyến nghị|Chưa có dữ liệu/i.test(`${state.viCity.queue} ${state.viPlant}`) &&
      !/\b[A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+\b/.test(`${state.viCity.queue} ${state.viPlant}`);
  });

  await check('role workspace DOM order puts critical decision content before shared map for keyboard flow', async (detail) => {
    const order = await directCity.page.evaluate(async () => {
      FT.workspaces.navigate('city');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const city = [...document.querySelector('.cityDashboard .roleDashboardGrid').children].map((node) => ({
        map: node.classList.contains('roleDashboardMap'),
        queue: node.matches('[data-city-decision-queue]'),
      }));
      FT.workspaces.navigate('plant', { facilityId: 'a-vuong' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const plant = [...document.querySelector('.plantDashboard .roleDashboardGrid').children].map((node) => ({
        map: node.classList.contains('roleDashboardMap'),
        current: node.matches('[data-plant-current-state]'),
        approved: node.matches('[data-plant-approved-order]'),
      }));
      FT.workspaces.navigate('city');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return { city, plant };
    });
    detail(order);
    const cityMap = order.city.findIndex((item) => item.map);
    const cityQueue = order.city.findIndex((item) => item.queue);
    const plantMap = order.plant.findIndex((item) => item.map);
    const plantCurrent = order.plant.findIndex((item) => item.current);
    const plantApproved = order.plant.findIndex((item) => item.approved);
    return cityQueue !== -1 &&
      cityMap !== -1 &&
      cityQueue < cityMap &&
      plantCurrent !== -1 &&
      plantApproved !== -1 &&
      plantMap !== -1 &&
      plantCurrent < plantMap &&
      plantApproved < plantMap;
  });

  await check('city dashboard layout remains usable across desktop, tablet and mobile widths', async (detail) => {
    const viewports = [
      { width: 1366, height: 768 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 701, height: 900 },
      { width: 390, height: 844 },
    ];
    const measurements = [];
    for (const viewport of viewports) {
      await directCity.page.setViewportSize(viewport);
      await directCity.page.waitForFunction(() => document.body.dataset.workspace === 'city' && document.querySelector('.cityDashboard'));
      measurements.push(await directCity.page.evaluate(() => {
        const rect = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
        };
        const panels = [...document.querySelectorAll('[data-city-portfolio], [data-city-timeline], [data-city-decision-queue], [data-city-impact], [data-city-readiness]')]
          .map((node) => {
            const r = node.getBoundingClientRect();
            return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
          });
        const map = rect('.roleDashboardMap');
        const grid = rect('.roleDashboardGrid');
        const banner = rect('.citySyntheticBanner');
        const queue = rect('[data-city-decision-queue]');
        const readiness = rect('[data-city-readiness]');
        const mapNode = rect('#stageWrap');
        const mapShare = map && grid ? (map.width * map.height) / (grid.width * grid.height) : 0;
        const overflowX = document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
        const mobile = window.innerWidth <= 720;
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          overflowX,
          mapShare: Number(mapShare.toFixed(3)),
          map, grid, banner, queue, readiness, mapNode, panels,
          queueBeforeMap: queue && map ? queue.top <= map.top : null,
          bannerVisible: !!banner && banner.top >= 0 && banner.bottom <= window.innerHeight,
          panelsInViewport: mobile ? true : panels.every((panel) =>
            panel.left >= 0 && panel.right <= window.innerWidth && panel.top >= 0 && panel.bottom <= window.innerHeight),
        };
      }));
    }
    detail(measurements);
    return measurements.every((layout) => {
      const mobile = layout.viewport.width <= 720;
      const fullDesktop = layout.viewport.width >= 1366;
      return layout.overflowX === false &&
        layout.grid &&
        layout.map &&
        layout.mapNode &&
        layout.bannerVisible &&
        layout.queue &&
        layout.readiness &&
        layout.mapNode.width >= 320 &&
        layout.mapNode.height >= (mobile ? 300 : 220) &&
        (mobile ? layout.queueBeforeMap === true : layout.panelsInViewport && layout.grid.bottom <= layout.viewport.height && layout.map.bottom <= layout.viewport.height && layout.mapNode.bottom <= layout.viewport.height) &&
        (!fullDesktop || layout.mapShare >= 0.55);
    });
  });

  await check('city live refresh preserves dashboard root, focus and scroll', async (detail) => {
    await directCity.page.setViewportSize({ width: 1366, height: 768 });
    await directCity.page.waitForFunction(() => document.body.dataset.workspace === 'city' && document.querySelector('.cityDashboard'));
    const state = await directCity.page.evaluate(async () => {
      const root = document.querySelector('.cityDashboard');
      const stageParent = document.getElementById('stageWrap')?.parentElement;
      const scroller = document.querySelector('[data-city-portfolio] .cityFacilityList')?.parentElement;
      const button = document.querySelector('[data-city-portfolio] [data-plant-facility-id="a-vuong"]');
      const beforeAudit = Number.parseInt(document.querySelector('[data-city-readiness] [data-city-kpi="audit"] .cityKpiValue')?.textContent || '0', 10);
      const beforeGauge = document.querySelector('[data-city-impact] .cityGaugeCard strong')?.textContent || '';
      if (scroller) scroller.scrollTop = 24;
      if (button) button.focus();
      const focusedBefore = document.activeElement === button;
      FT.ops.audit.log('notify.dispatch', { channel: 'city-regression' }, 'city refresh regression');
      FT.state.timeH = Math.min(FT.hydro.T1, FT.state.timeH + 6);
      FT.bus.emit('scrubbed');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const afterRoot = document.querySelector('.cityDashboard');
      const afterButton = document.querySelector('[data-city-portfolio] [data-plant-facility-id="a-vuong"]');
      const afterAudit = Number.parseInt(document.querySelector('[data-city-readiness] [data-city-kpi="audit"] .cityKpiValue')?.textContent || '0', 10);
      const afterGauge = document.querySelector('[data-city-impact] .cityGaugeCard strong')?.textContent || '';
      return {
        rootStable: root === afterRoot,
        mapParentStable: document.getElementById('stageWrap')?.parentElement === stageParent,
        buttonStable: button === afterButton,
        focusedBefore,
        focusPreserved: document.activeElement === button,
        scrollPreserved: !scroller || scroller.scrollTop >= 24,
        beforeAudit,
        afterAudit,
        beforeGauge,
        afterGauge,
      };
    });
    detail(state);
    return state.rootStable &&
      state.mapParentStable &&
      state.buttonStable &&
      state.focusedBefore &&
      state.focusPreserved &&
      state.scrollPreserved &&
      state.afterAudit > state.beforeAudit &&
      state.afterGauge !== state.beforeGauge;
  });

  await check('city portfolio deep link navigates to plant route for governed facility', async (detail) => {
    const state = await directCity.page.evaluate(() => {
      const button = document.querySelector('[data-city-portfolio] [data-plant-facility-id="a-vuong"]');
      button && button.click();
      return {
        hasButton: !!button,
        workspace: FT.state.workspace,
        bodyWorkspace: document.body.dataset.workspace,
        facility: FT.state.selectedFacilityId,
        current: FT.workspaces.current(),
        search: location.search,
        mapInPlantSlot: document.getElementById('stageWrap')?.parentElement?.dataset.workspaceMapSlot === 'plant',
      };
    });
    detail(state);
    return state.hasButton &&
      state.workspace === 'plant' &&
      state.bodyWorkspace === 'plant' &&
      state.facility === 'a-vuong' &&
      state.current.facilityId === 'a-vuong' &&
      new URLSearchParams(state.search).get('facility') === 'a-vuong' &&
      state.mapInPlantSlot;
  });

  await openWorkspace(directCity.page, 'city');
  await check('keyboard activation opens plant deep link and Escape restores focus to the originating workspace control', async (detail) => {
    const state = await directCity.page.evaluate(async () => {
      const link = document.querySelector('[data-city-portfolio] [data-plant-facility-id="a-vuong"]');
      if (!link) return { hasLink: false };
      link.focus();
      const focusedBefore = document.activeElement === link;
      link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const plantSelector = document.querySelector('[data-plant-facility-selector]');
      const selectorLabel = plantSelector ? (plantSelector.labels && plantSelector.labels[0] && plantSelector.labels[0].textContent || plantSelector.getAttribute('aria-label') || '') : '';
      const workspaceAfterEnter = FT.state.workspace;
      const facilityAfterEnter = FT.state.selectedFacilityId;
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        hasLink: true,
        focusedBefore,
        workspaceAfterEnter,
        facilityAfterEnter,
        workspaceAfterEscape: FT.state.workspace,
        selectorLabel: selectorLabel.replace(/\s+/g, ' ').trim(),
        focusedAfterEscapeFacility: document.activeElement?.dataset?.plantFacilityId || '',
        focusedAfterEscapeText: document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() || '',
      };
    });
    detail(state);
    return state.hasLink &&
      state.focusedBefore &&
      state.workspaceAfterEnter === 'plant' &&
      state.facilityAfterEnter === 'a-vuong' &&
      state.workspaceAfterEscape === 'city' &&
      /Facility|Công trình/i.test(state.selectorLabel) &&
      state.focusedAfterEscapeFacility === 'a-vuong' &&
      /Plant|Nhà máy/i.test(state.focusedAfterEscapeText);
  });
  await directCity.ctx.close();

  const directPlant = await bootApp(browser, BASE, { hash: '?workspace=plant&facility=a-vuong' });
  usePage(directPlant.page);
  await check('direct plant route preserves governed facility selection', async (detail) => {
    const state = await directPlant.page.evaluate(() => ({
      workspace: FT.state.workspace,
      bodyWorkspace: document.body.dataset.workspace,
      facility: FT.state.selectedFacilityId,
      current: FT.workspaces.current(),
      url: location.search,
      hostHidden: document.getElementById('roleWorkspaceHost')?.hidden,
      mapInSlot: document.getElementById('stageWrap')?.parentElement?.dataset.workspaceMapSlot === 'plant',
    }));
    detail(state);
    return state.workspace === 'plant' &&
      state.bodyWorkspace === 'plant' &&
      state.facility === 'a-vuong' &&
      state.current.facilityId === 'a-vuong' &&
      state.hostHidden === false &&
      state.mapInSlot &&
      new URLSearchParams(state.url).get('facility') === 'a-vuong';
  });

  await check('plant package target renders recommendation while preserving advisory boundary', async (detail) => {
    const target = await directPlant.page.evaluate(() => {
      const snap = FT.hydro.at(FT.state.timeH);
      const pkg = FT.ops.package(snap);
      const facility = pkg && pkg.reservoir && FT.facilities.all().find((item) => item.demoReservoirId === pkg.reservoir.id);
      if (facility) FT.workspaces.navigate('plant', { facilityId: facility.id });
      return {
        packageKind: pkg && pkg.kind,
        reservoirId: pkg && pkg.reservoir && pkg.reservoir.id,
        reservoirName: pkg && pkg.reservoir && pkg.reservoir.name,
        facilityId: facility && facility.id,
        facilityName: facility && facility.name,
      };
    });
    await directPlant.page.waitForFunction((facilityId) =>
      document.body.dataset.workspace === 'plant' && window.FT.state.selectedFacilityId === facilityId,
      target.facilityId);
    const plant = await directPlant.page.evaluate(() => {
      const visibleText = (node) => node && node.textContent ? node.textContent.replace(/\s+/g, ' ').trim() : '';
      const selector = document.querySelector('[data-plant-facility-selector]');
      const advisory = document.querySelector('[data-plant-advisory]');
      const approved = document.querySelector('[data-plant-approved-order]');
      const actions = [...document.querySelectorAll('[data-plant-action]')].map((button) => ({
        action: button.dataset.plantAction,
        disabled: button.disabled,
        text: visibleText(button),
      }));
      return {
        root: !!document.querySelector('.plantDashboard[data-workspace="plant"]'),
        identity: visibleText(document.querySelector('[data-plant-facility-identity]')),
        selectorValue: selector && selector.value,
        selectorOptions: selector ? [...selector.options].map((option) => option.value) : [],
        current: visibleText(document.querySelector('[data-plant-current-state]')),
        currentState: document.querySelector('[data-plant-data-state]')?.dataset.plantDataState,
        advisory: visibleText(advisory),
        advisoryClass: advisory?.dataset.plantLifecycleClass,
        advisoryActionable: advisory?.dataset.plantActionable,
        alternatives: visibleText(document.querySelector('[data-plant-alternatives]')),
        approved: visibleText(approved),
        approvedClass: approved?.className || '',
        checklist: visibleText(document.querySelector('[data-plant-checklist]')),
        execution: visibleText(document.querySelector('[data-plant-execution]')),
        map: !!document.querySelector('[data-workspace="plant"] [data-workspace-map-slot="plant"] #stageWrap'),
        provenance: [...document.querySelectorAll('.plantDashboard [data-provenance]')].map(visibleText),
        actions,
      };
    });
    detail({ target, plant });
    return target.packageKind === 'PROPOSAL' &&
      !!target.facilityId &&
      plant.root &&
      plant.identity.includes(target.facilityName) &&
      plant.selectorValue === target.facilityId &&
      plant.selectorOptions.length === 34 &&
      plant.currentState === 'ASSUMED_FOR_DEMO' &&
      /current|state|mực|release|xả|synthetic|assumed/i.test(plant.current) &&
      plant.advisoryClass === 'RECOMMENDATION' &&
      plant.advisoryActionable === 'false' &&
      /RECOMMENDATION|Recommendation|not in force|not actionable|Khuyến nghị|chưa thể chuyển thành đề xuất/i.test(plant.advisory) &&
      /ASSUMED_FOR_DEMO|Assumed for the demo|individual gate geometry is not modelled|not modelled|Giả định cho demo|chưa được mô hình hóa/i.test(plant.advisory) &&
      /alternative|rule|coordinate|peak|modelled|phương án|đỉnh mô hình/i.test(plant.alternatives) &&
      /approved order|none approved|no approved|lệnh đã phê duyệt|không có lệnh/i.test(plant.approved) &&
      /plantApprovedOrder/.test(plant.approvedClass) &&
      /checklist|danh sách kiểm tra/i.test(plant.checklist) &&
      /execution|no execution|approval|thực thi|phê duyệt/i.test(plant.execution) &&
      plant.map &&
      plant.provenance.length >= 3 &&
      plant.provenance.join(' | ').match(/source|provenance|synthetic|2026-05-06|hydro\.js|nguồn|tổng hợp/i) &&
      plant.actions.length >= 3 &&
      plant.actions.every((button) => button.disabled === true) &&
      plant.actions.some((button) => /propose/i.test(button.action || button.text)) &&
      plant.actions.some((button) => /execute/i.test(button.action || button.text));
  });

  await check('plant non-target demo facilities do not inherit active package advisory', async (detail) => {
    const result = await directPlant.page.evaluate(async () => {
      const visibleText = (node) => node && node.textContent ? node.textContent.replace(/\s+/g, ' ').trim() : '';
      const snap = FT.hydro.at(FT.state.timeH);
      const pkg = FT.ops.package(snap);
      const target = pkg && pkg.reservoir && FT.facilities.all().find((item) => item.demoReservoirId === pkg.reservoir.id);
      const demoFacilities = FT.facilities.all().filter((item) => item.demoReservoirId && (!target || item.id !== target.id)).slice(0, 2);
      const rows = [];
      for (const facility of demoFacilities) {
        FT.workspaces.navigate('plant', { facilityId: facility.id });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        rows.push({
          selectedId: FT.state.selectedFacilityId,
          selectedName: facility.name,
          identity: visibleText(document.querySelector('[data-plant-facility-identity]')),
          currentState: document.querySelector('[data-plant-current-state]')?.dataset.plantDataState,
          advisoryClass: document.querySelector('[data-plant-advisory]')?.dataset.plantLifecycleClass,
          advisoryActionable: document.querySelector('[data-plant-advisory]')?.dataset.plantActionable,
          advisory: visibleText(document.querySelector('[data-plant-advisory]')),
          alternatives: visibleText(document.querySelector('[data-plant-alternatives]')),
          actionsEnabled: [...document.querySelectorAll('[data-plant-action]')].filter((button) => !button.disabled).length,
        });
      }
      if (target) {
        FT.workspaces.navigate('plant', { facilityId: target.id });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      return {
        target,
        rows,
        targetView: target ? {
          selectedId: FT.state.selectedFacilityId,
          advisoryClass: document.querySelector('[data-plant-advisory]')?.dataset.plantLifecycleClass,
          advisory: visibleText(document.querySelector('[data-plant-advisory]')),
          alternatives: visibleText(document.querySelector('[data-plant-alternatives]')),
        } : null,
      };
    });
    detail(result);
    return result.target &&
      result.rows.length >= 2 &&
      result.rows.every((row) =>
        row.selectedId !== result.target.id &&
        row.identity.includes(row.selectedName) &&
        row.currentState === 'ASSUMED_FOR_DEMO' &&
        row.advisoryClass === 'MISSING' &&
        row.advisoryActionable === 'false' &&
        /not currently targeted|does not target|không nhắm tới|hiện không được/i.test(row.advisory) &&
        row.advisory.includes(row.selectedName) &&
        !row.advisory.includes('A Vương release advice') &&
        !row.advisory.includes(result.target.name) &&
        !/Lifecycle class: RECOMMENDATION|ASSUMED_FOR_DEMO|package gate|Proposed release|m3\/s|m³\/s|Modelled peak|Peak cut/i.test(`${row.advisory} ${row.alternatives}`) &&
        row.actionsEnabled === 0) &&
      result.targetView &&
      result.targetView.selectedId === result.target.id &&
      result.targetView.advisoryClass === 'RECOMMENDATION' &&
      /ASSUMED_FOR_DEMO|package gate|not modelled|ghi chú cửa van|không được mô hình/i.test(result.targetView.advisory) &&
      /Modelled peak|peak|Đỉnh mô hình/i.test(result.targetView.alternatives);
  });

  await check('plant workflow state is isolated to the current scenario event', async (detail) => {
    await signOnRole(directPlant.page, ROLE.authority);
    const setup = await directPlant.page.evaluate(async () => {
      const FT = window.FT;
      const snap = FT.hydro.at(FT.state.timeH);
      const pkg = FT.ops.package(snap);
      const target = pkg && pkg.reservoir && FT.facilities.all().find((item) => item.demoReservoirId === pkg.reservoir.id);
      const proposal = FT.releaseOps.ingestProposal(pkg);
      const audit = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: FT.ops.audit.actor.role,
        package: pkg.id,
        feasible: true,
      }, 'scenario boundary regression');
      const decision = FT.releaseOps.recordDecision(audit);
      const order = FT.releaseOps.createOrder(proposal.id, audit);
      const checks = FT.releaseOps.CHECKS.slice(0, 4);
      const checklist = checks.map((key) => FT.releaseOps.setChecklist(order.id, key, true));
      const execution = FT.releaseOps.startExecution(order.id);
      const beforeSnapshot = FT.releaseOps.snapshot();
      FT.workspaces.navigate('plant', { facilityId: target.id });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        scenario: FT.state.scenario,
        eventId: beforeSnapshot.event.id,
        target,
        pkgId: pkg.id,
        proposalId: proposal.id,
        decisionId: decision && decision.id,
        orderId: order && order.id,
        executionId: execution && execution.id,
        beforeFrozen: Object.isFrozen(beforeSnapshot) && Object.isFrozen(beforeSnapshot.orders[order.id]),
        orderEventId: beforeSnapshot.orders[order.id] && beforeSnapshot.orders[order.id].eventId,
        checklistKey: checks[0],
        checklistStatus: checklist.every(Boolean) && checklist[checklist.length - 1].status,
        visibleBefore: document.querySelector('.plantDashboard')?.textContent || '',
      };
    });
    const beforeVisible = await directPlant.page.evaluate((setup) => ({
      orderText: document.querySelector('[data-plant-approved-order]')?.textContent || '',
      checklistText: document.querySelector('[data-plant-checklist]')?.textContent || '',
      executionText: document.querySelector('[data-plant-execution]')?.textContent || '',
      currentEventId: FT.releaseOps.snapshot().event.id,
      orderStillFrozen: Object.isFrozen(FT.releaseOps.snapshot().orders[setup.orderId]),
    }), setup);

    await directPlant.page.evaluate(() => {
      const select = document.getElementById('scenarioSelect');
      select.value = 'yagi';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await directPlant.page.waitForFunction(() => window.FT.state.scenario === 'yagi' && window.FT.hydro.ready);
    await directPlant.page.waitForFunction(() => window.FT.releaseOps.snapshot().event.id === 'EVT-yagi', null, { timeout: 10000 }).catch(() => {});
    await directPlant.page.waitForTimeout(120);

    const after = await directPlant.page.evaluate((setup) => {
      const snap = FT.releaseOps.snapshot();
      const dashboardText = document.querySelector('.plantDashboard')?.textContent || '';
      const currentPkg = FT.ops.package(FT.hydro.at(FT.state.timeH));
      return {
        scenario: FT.state.scenario,
        eventId: snap.event.id,
        currentPkgId: currentPkg && currentPkg.id,
        oldOrderStillFrozen: Object.isFrozen(snap.orders[setup.orderId]),
        oldOrderEventId: snap.orders[setup.orderId] && snap.orders[setup.orderId].eventId,
        oldOrderStored: !!snap.orders[setup.orderId],
        orderText: document.querySelector('[data-plant-approved-order]')?.textContent || '',
        checklistText: document.querySelector('[data-plant-checklist]')?.textContent || '',
        executionText: document.querySelector('[data-plant-execution]')?.textContent || '',
        dashboardText,
      };
    }, setup);
    detail({ setup, beforeVisible, after });
    return setup.beforeFrozen &&
      setup.eventId === `EVT-${setup.scenario}` &&
      setup.orderEventId === setup.eventId &&
      beforeVisible.currentEventId === setup.eventId &&
      beforeVisible.orderText.includes(setup.orderId) &&
      /Order ID, event and facility match current demo|ID lệnh, sự kiện và công trình khớp/i.test(beforeVisible.checklistText) &&
      beforeVisible.executionText.includes(setup.executionId) &&
      after.scenario === 'yagi' &&
      after.eventId === 'EVT-yagi' &&
      after.currentPkgId !== setup.pkgId &&
      after.oldOrderStored &&
      after.oldOrderStillFrozen &&
      after.oldOrderEventId === setup.eventId &&
      !after.orderText.includes(setup.orderId) &&
      !after.executionText.includes(setup.executionId) &&
      !after.dashboardText.includes(setup.orderId) &&
      !after.dashboardText.includes(setup.executionId);
  });

  await check('plant unavailable facility shows registry-only provenance without fabricated operations', async (detail) => {
    await openWorkspace(directPlant.page, 'plant', 'tra-linh-1');
    const unavailable = await directPlant.page.evaluate(() => ({
      state: document.querySelector('[data-plant-data-state]')?.dataset.plantDataState,
      text: document.querySelector('[data-plant-data-state]')?.textContent,
      enabledActions: [...document.querySelectorAll('[data-plant-action]')].filter((b) => !b.disabled).length,
      identity: document.querySelector('[data-plant-facility-identity]')?.textContent,
      source: [...document.querySelectorAll('.plantDashboard [data-provenance]')].map((node) => node.textContent).join(' | '),
      missing: document.querySelector('[data-plant-missing-dependencies]')?.textContent,
      whole: document.querySelector('.plantDashboard')?.textContent,
    }));
    detail(unavailable);
    return unavailable.state === 'NOT_IN_CURRENT_DEMO' &&
      /Trà Linh 1|HydropowerFacility|not-generating/i.test(unavailable.identity || '') &&
      /source|provenance|dn-inspection-2026-05-06|2026-05-06/i.test(unavailable.source || '') &&
      /telemetry|storage|outlet geometry|operating rules|routing|forecast|số đo thời gian thực|dung tích hồ|cửa xả|quy tắc vận hành|định tuyến|dự báo/i.test(unavailable.missing || '') &&
      unavailable.enabledActions === 0 &&
      !/(gate opening|deviation|observed release|commanded release|m3\/s|m³\/s|telemetry advice|recommend \d)/i.test(unavailable.whole || '');
  });

  await check('plant facility selector updates deep URL only to governed facility IDs', async (detail) => {
    const state = await directPlant.page.evaluate(async () => {
      const selector = document.querySelector('[data-plant-facility-selector]');
      selector.value = 'dak-mi-4';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const afterGoverned = {
        workspace: FT.state.workspace,
        bodyWorkspace: document.body.dataset.workspace,
        facility: FT.state.selectedFacilityId,
        current: FT.workspaces.current(),
        search: location.search,
        selectorValue: document.querySelector('[data-plant-facility-selector]')?.value,
      };
      const selectedBeforeFake = FT.state.selectedFacilityId;
      selector.value = 'not-real';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        afterGoverned,
        selectedBeforeFake,
        afterFake: {
          workspace: FT.state.workspace,
          facility: FT.state.selectedFacilityId,
          current: FT.workspaces.current(),
          search: location.search,
          selectorValue: document.querySelector('[data-plant-facility-selector]')?.value,
        },
      };
    });
    detail(state);
    return state.afterGoverned.workspace === 'plant' &&
      state.afterGoverned.bodyWorkspace === 'plant' &&
      state.afterGoverned.facility === 'dak-mi-4' &&
      state.afterGoverned.current.facilityId === 'dak-mi-4' &&
      new URLSearchParams(state.afterGoverned.search).get('facility') === 'dak-mi-4' &&
      state.afterGoverned.selectorValue === 'dak-mi-4' &&
      state.afterFake.workspace === 'plant' &&
      state.afterFake.facility === state.selectedBeforeFake &&
      state.afterFake.current.facilityId === state.selectedBeforeFake &&
      new URLSearchParams(state.afterFake.search).get('facility') === state.selectedBeforeFake;
  });

  await check('plant live refresh preserves dashboard root, selector focus, scroll and map', async (detail) => {
    await openWorkspace(directPlant.page, 'plant', 'a-vuong');
    await directPlant.page.setViewportSize({ width: 1366, height: 768 });
    await directPlant.page.waitForFunction(() => document.body.dataset.workspace === 'plant' && document.querySelector('.plantDashboard'));
    const state = await directPlant.page.evaluate(async () => {
      const root = document.querySelector('.plantDashboard');
      const stageParent = document.getElementById('stageWrap')?.parentElement;
      const selector = document.querySelector('[data-plant-facility-selector]');
      const scroller = document.querySelector('[data-plant-advisory]');
      const beforeCurrent = document.querySelector('[data-plant-current-state]')?.textContent || '';
      if (scroller) scroller.scrollTop = 16;
      if (selector) selector.focus();
      const focusedBefore = document.activeElement === selector;
      FT.ops.audit.log('release.workflow.refreshProbe', { facilityId: 'a-vuong' }, 'plant refresh regression');
      FT.state.timeH = Math.min(FT.hydro.T1, FT.state.timeH + 6);
      FT.bus.emit('scrubbed');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        rootStable: root === document.querySelector('.plantDashboard'),
        mapParentStable: document.getElementById('stageWrap')?.parentElement === stageParent,
        selectorStable: selector === document.querySelector('[data-plant-facility-selector]'),
        focusedBefore,
        focusPreserved: document.activeElement === selector,
        scrollPreserved: !scroller || scroller.scrollTop >= 16,
        beforeCurrent,
        afterCurrent: document.querySelector('[data-plant-current-state]')?.textContent || '',
      };
    });
    detail(state);
    return state.rootStable &&
      state.mapParentStable &&
      state.selectorStable &&
      state.focusedBefore &&
      state.focusPreserved &&
      state.scrollPreserved &&
      state.beforeCurrent !== state.afterCurrent;
  });

  await check('plant current state reports margin calculation failure without fabricated margin', async (detail) => {
    await openWorkspace(directPlant.page, 'plant', 'a-vuong');
    const result = await directPlant.page.evaluate(async () => {
      const FT = window.FT;
      const originalMargins = FT.ops.margins;
      const originalLog = FT.log;
      const logs = [];
      FT.log = (msg, kind, tH) => {
        logs.push({ msg, kind, tH });
        return originalLog(msg, kind, tH);
      };
      FT.ops.margins = () => { throw new Error('forced margin failure'); };
      FT.bus.emit('scrubbed');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      FT.bus.emit('scrubbed');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const failedText = document.querySelector('[data-plant-current-state]')?.textContent || '';
      const failedState = document.querySelector('[data-plant-current-state]')?.dataset.plantMarginState || '';
      const matchingLogs = logs.filter((entry) => /MARGIN_CALCULATION_FAILED/.test(entry.msg || ''));
      FT.ops.margins = originalMargins;
      FT.bus.emit('scrubbed');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const recoveredText = document.querySelector('[data-plant-current-state]')?.textContent || '';
      const recoveredState = document.querySelector('[data-plant-current-state]')?.dataset.plantMarginState || '';
      FT.log = originalLog;
      return { failedText, failedState, matchingLogs, recoveredText, recoveredState };
    });
    detail(result);
    return result.failedState === 'MARGIN_CALCULATION_FAILED' &&
      /không tính được biên an toàn|safety margin could not be calculated/i.test(result.failedText) &&
      !/(Freeboard|Độ vượt cao an toàn)\s*\d/i.test(result.failedText) &&
      result.matchingLogs.length === 1 &&
      result.matchingLogs[0].kind === 'warn' &&
      result.recoveredState === 'OK' &&
      !/MARGIN_CALCULATION_FAILED/.test(result.recoveredText) &&
      /(Freeboard|Độ vượt cao an toàn)\s*\d/i.test(result.recoveredText);
  });

  await check('plant dashboard layout remains usable across desktop, tablet and mobile widths', async (detail) => {
    await openWorkspace(directPlant.page, 'plant', 'a-vuong');
    const viewports = [
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1024, height: 768 },
      { width: 768, height: 1024 },
      { width: 701, height: 900 },
      { width: 390, height: 844 },
    ];
    const measurements = [];
    for (const viewport of viewports) {
      await directPlant.page.setViewportSize(viewport);
      await directPlant.page.waitForFunction(() => document.body.dataset.workspace === 'plant' && document.querySelector('.plantDashboard'));
      measurements.push(await directPlant.page.evaluate(() => {
        const rect = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const r = node.getBoundingClientRect();
          return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
        };
        const panels = [...document.querySelectorAll('[data-plant-current-state], [data-plant-advisory], [data-plant-alternatives], [data-plant-approved-order], [data-plant-checklist], [data-plant-execution]')]
          .map((node) => {
            const r = node.getBoundingClientRect();
            return { top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height };
          });
        const map = rect('.roleDashboardMap');
        const grid = rect('.roleDashboardGrid');
        const current = rect('[data-plant-current-state]');
        const order = rect('[data-plant-approved-order]');
        const mapNode = rect('#stageWrap');
        const banner = rect('.plantSyntheticBanner');
        const overflowX = document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
        const mobile = window.innerWidth <= 720;
        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          overflowX,
          map, grid, current, order, mapNode, banner, panels,
          currentBeforeMap: current && map ? current.top <= map.top : null,
          orderBeforeMap: order && map ? order.top <= map.top : null,
          bannerVisible: !!banner && banner.top >= 0 && banner.bottom <= window.innerHeight,
          panelsInViewport: mobile ? true : panels.every((panel) =>
            panel.left >= 0 && panel.right <= window.innerWidth && panel.top >= 0 && panel.bottom <= window.innerHeight),
        };
      }));
    }
    detail(measurements);
    return measurements.every((layout) => {
      const mobile = layout.viewport.width <= 720;
      return layout.overflowX === false &&
        layout.grid &&
        layout.map &&
        layout.mapNode &&
        layout.bannerVisible &&
        layout.current &&
        layout.order &&
        layout.mapNode.width >= 300 &&
        layout.mapNode.height >= (mobile ? 280 : 210) &&
        (mobile
          ? layout.currentBeforeMap === true && layout.orderBeforeMap === true
          : layout.panelsInViewport && layout.grid.bottom <= layout.viewport.height && layout.map.bottom <= layout.viewport.height && layout.mapNode.bottom <= layout.viewport.height);
    });
  });

  await check('API navigation synchronizes query, state and browser history', async (detail) => {
    const before = await directPlant.page.evaluate(() => history.length);
    await openWorkspace(directPlant.page, 'city');
    const state = await directPlant.page.evaluate(() => ({
      before: window.__historyBefore,
      length: history.length,
      workspace: FT.state.workspace,
      bodyWorkspace: document.body.dataset.workspace,
      current: FT.workspaces.current(),
      search: location.search,
      hostHidden: document.getElementById('roleWorkspaceHost').hidden,
    }));
    state.before = before;
    detail(state);
    return state.length >= before + 1 &&
      state.workspace === 'city' &&
      state.bodyWorkspace === 'city' &&
      state.current.workspace === 'city' &&
      new URLSearchParams(state.search).get('workspace') === 'city' &&
      state.hostHidden === false;
  });

  await check('browser back and forward restore routed workspace state', async (detail) => {
    await directPlant.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
    await directPlant.page.waitForFunction(() => document.body.dataset.workspace === 'plant');
    const back = await directPlant.page.evaluate(() => ({
      workspace: FT.state.workspace,
      facility: FT.state.selectedFacilityId,
      search: location.search,
    }));
    await directPlant.page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => null);
    await directPlant.page.waitForFunction(() => document.body.dataset.workspace === 'city');
    const forward = await directPlant.page.evaluate(() => ({
      workspace: FT.state.workspace,
      facility: FT.state.selectedFacilityId,
      search: location.search,
    }));
    detail({ back, forward });
    return back.workspace === 'plant' &&
      back.facility === 'a-vuong' &&
      new URLSearchParams(back.search).get('facility') === 'a-vuong' &&
      forward.workspace === 'city' &&
      new URLSearchParams(forward.search).get('workspace') === 'city';
  });

  await check('browser Back restores focus to the originating workspace deep-link control once', async (detail) => {
    await openWorkspace(directPlant.page, 'city');
    const before = await directPlant.page.evaluate(() => {
      const button = document.querySelector('[data-city-portfolio] [data-plant-facility-id="a-vuong"]');
      if (!button) return { hasButton: false };
      button.focus();
      button.click();
      return {
        hasButton: true,
        workspace: FT.state.workspace,
        facility: FT.state.selectedFacilityId,
        activeTag: document.activeElement?.tagName || '',
      };
    });
    await directPlant.page.waitForFunction(() => document.body.dataset.workspace === 'plant' && window.FT.state.selectedFacilityId === 'a-vuong');
    await directPlant.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
    await directPlant.page.waitForFunction(() => document.body.dataset.workspace === 'city');
    await directPlant.page.waitForFunction(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.plantFacilityId === 'a-vuong', null, { timeout: 3000 }).catch(() => null);
    const afterBack = await directPlant.page.evaluate(() => ({
      workspace: FT.state.workspace,
      focusedFacility: document.activeElement?.dataset?.plantFacilityId || '',
      focusedText: document.activeElement?.textContent?.replace(/\s+/g, ' ').trim() || '',
    }));
    await directPlant.page.goBack({ waitUntil: 'domcontentloaded' }).catch(() => null);
    await directPlant.page.waitForTimeout(120);
    const afterUnrelatedBack = await directPlant.page.evaluate(() => ({
      workspace: FT.state.workspace,
      focusedFacility: document.activeElement?.dataset?.plantFacilityId || '',
      activeTag: document.activeElement?.tagName || '',
    }));
    detail({ before, afterBack, afterUnrelatedBack });
    return before.hasButton &&
      before.workspace === 'plant' &&
      afterBack.workspace === 'city' &&
      afterBack.focusedFacility === 'a-vuong' &&
      /Plant|Tuyến|Nhà máy/i.test(afterBack.focusedText) &&
      afterUnrelatedBack.focusedFacility !== 'a-vuong';
  });

  await check('map route restoration returns shared map node to original shell parent and position', async (detail) => {
    const state = await directPlant.page.evaluate(() => {
      const before = window.FT.workspaces.sharedMapNode;
      window.FT.workspaces.navigate('map');
      const stage = document.getElementById('stageWrap');
      return {
        sameNode: before === stage,
        workspace: FT.state.workspace,
        bodyWorkspace: document.body.dataset.workspace,
        hostHidden: document.getElementById('roleWorkspaceHost').hidden,
        parentClass: stage.parentElement.className,
        previousClass: stage.previousElementSibling && stage.previousElementSibling.className,
        inMapSlot: !!stage.parentElement.dataset.workspaceMapSlot,
        search: location.search,
      };
    });
    await directPlant.page.waitForFunction(() => document.body.dataset.workspace === 'map');
    detail(state);
    return state.sameNode &&
      state.workspace === 'map' &&
      state.bodyWorkspace === 'map' &&
      state.hostHidden === true &&
      /\bstage\b/.test(state.parentClass) &&
      /\bviewBar\b/.test(state.previousClass || '') &&
      state.inMapSlot === false &&
      !new URLSearchParams(state.search).has('workspace');
  });

  await check('map route language changes update workspace nav labels without changing route', async (detail) => {
    const state = await directPlant.page.evaluate(async () => {
      FT.workspaces.navigate('map');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const snapshot = () => [...document.querySelectorAll('#workspaceNav [data-workspace]')].map((button) => ({
        workspace: button.dataset.workspace,
        text: button.textContent.replace(/\s+/g, ' ').trim(),
        ariaLabel: button.getAttribute('aria-label') || '',
      }));
      FT.i18n.setLang('en');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const en = snapshot();
      const afterEn = { current: FT.workspaces.current(), bodyWorkspace: document.body.dataset.workspace, htmlLang: document.documentElement.lang };
      FT.i18n.setLang('vi');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const vi = snapshot();
      const afterVi = { current: FT.workspaces.current(), bodyWorkspace: document.body.dataset.workspace, htmlLang: document.documentElement.lang };
      return { en, afterEn, vi, afterVi };
    });
    detail(state);
    const enCity = state.en.find((item) => item.workspace === 'city');
    const enPlant = state.en.find((item) => item.workspace === 'plant');
    const viCity = state.vi.find((item) => item.workspace === 'city');
    const viPlant = state.vi.find((item) => item.workspace === 'plant');
    return state.afterEn.current.workspace === 'map' &&
      state.afterVi.current.workspace === 'map' &&
      state.afterEn.bodyWorkspace === 'map' &&
      state.afterVi.bodyWorkspace === 'map' &&
      state.afterEn.htmlLang === 'en' &&
      state.afterVi.htmlLang === 'vi' &&
      enCity?.text === 'City operations' &&
      enCity?.ariaLabel === 'City operations' &&
      enPlant?.text === 'Plant operations' &&
      enPlant?.ariaLabel === 'Plant operations' &&
      viCity?.text === 'Điều hành thành phố' &&
      viCity?.ariaLabel === 'Điều hành thành phố' &&
      viPlant?.text === 'Vận hành nhà máy' &&
      viPlant?.ariaLabel === 'Vận hành nhà máy';
  });

  await check('shared map node identity survives route switches', async (detail) => {
    const identity = await directPlant.page.evaluate(() => {
      const before = window.FT.workspaces.sharedMapNode;
      window.FT.workspaces.navigate('plant', { facilityId: 'a-vuong' });
      return {
        sameAsStage: before === document.getElementById('stageWrap'),
        sameApiNode: before === window.FT.workspaces.sharedMapNode,
        workspace: FT.state.workspace,
        mapInSlot: document.getElementById('stageWrap').parentElement.dataset.workspaceMapSlot === 'plant',
      };
    });
    detail(identity);
    return identity.sameAsStage && identity.sameApiNode && identity.workspace === 'plant' && identity.mapInSlot;
  });

  await check('workspace API exposes a read-only route snapshot and stable map node', async (detail) => {
    const state = await directPlant.page.evaluate(() => {
      const api = window.FT.workspaces;
      const current = api.current();
      const node = api.sharedMapNode;
      try { current.workspace = 'city'; } catch {}
      try { api.sharedMapNode = document.createElement('div'); } catch {}
      const descriptor = Object.getOwnPropertyDescriptor(api, 'sharedMapNode');
      return {
        frozen: Object.isFrozen(current),
        snapshotUnchanged: current.workspace === 'plant',
        nodeUnchanged: api.sharedMapNode === node && node === document.getElementById('stageWrap'),
        getterOnly: typeof descriptor.get === 'function' && descriptor.set === undefined,
      };
    });
    detail(state);
    return state.frozen &&
      state.snapshotUnchanged &&
      state.nodeUnchanged &&
      state.getterOnly;
  });

  await check('invalid workspace and facility values normalize without inventing facility records', async (detail) => {
    const state = await directPlant.page.evaluate(() => {
      window.FT.workspaces.navigate('plant', { facilityId: 'not-real' });
      const kept = FT.state.selectedFacilityId;
      window.FT.workspaces.navigate('unknown', { facilityId: 'also-fake' });
      return {
        kept,
        workspace: FT.state.workspace,
        bodyWorkspace: document.body.dataset.workspace,
        current: FT.workspaces.current(),
        search: location.search,
      };
    });
    detail(state);
    return state.kept === 'a-vuong' &&
      state.workspace === 'map' &&
      state.bodyWorkspace === 'map' &&
      state.current.workspace === 'map' &&
      !new URLSearchParams(state.search).has('workspace');
  });

  await directPlant.ctx.close();
}

async function workspaceRendererIsolation(browser) {
  step('RW · Workspace renderer isolation');
  const { ctx, page } = await bootApp(browser, BASE);
  usePage(page);

  await check('active renderer replacement is transactional on throw', async (detail) => {
    const state = await page.evaluate(() => {
      const FT = window.FT;
      const stage = document.getElementById('stageWrap');
      FT.workspaces.register('city', ({ workspace }) => {
        const shell = document.createElement('section');
        shell.dataset.testRenderer = 'working-city';
        const title = document.createElement('h2');
        title.textContent = 'Working city renderer';
        const slot = document.createElement('div');
        slot.dataset.workspaceMapSlot = workspace;
        shell.append(title, slot);
        return shell;
      });
      FT.workspaces.navigate('city');
      const beforeNode = FT.workspaces.sharedMapNode;
      let result = null;
      let threw = null;
      try {
        result = FT.workspaces.register('city', () => { throw new Error('candidate city renderer failed'); });
      } catch (error) {
        threw = error.message;
      }
      return {
        result,
        threw,
        sameNode: beforeNode === stage && FT.workspaces.sharedMapNode === stage,
        connected: stage.isConnected,
        workspace: FT.state.workspace,
        bodyWorkspace: document.body.dataset.workspace,
        workingRendererStillVisible: !!document.querySelector('[data-test-renderer="working-city"]'),
        mapInCitySlot: stage.parentElement && stage.parentElement.dataset.workspaceMapSlot === 'city',
      };
    });
    detail(state);
    return state.result === false &&
      state.threw === null &&
      state.sameNode &&
      state.connected &&
      state.workspace === 'city' &&
      state.bodyWorkspace === 'city' &&
      state.workingRendererStillVisible &&
      state.mapInCitySlot;
  });

  await check('throwing renderer navigation shows fallback without detaching shared map', async (detail) => {
    const state = await page.evaluate(() => {
      const FT = window.FT;
      const stage = document.getElementById('stageWrap');
      FT.workspaces.navigate('map');
      FT.workspaces.register('plant', () => { throw new Error('plant renderer failed'); });
      let threw = null;
      try {
        FT.workspaces.navigate('plant', { facilityId: 'a-vuong' });
      } catch (error) {
        threw = error.message;
      }
      return {
        threw,
        sameNode: FT.workspaces.sharedMapNode === stage,
        connected: stage.isConnected,
        workspace: FT.state.workspace,
        bodyWorkspace: document.body.dataset.workspace,
        facility: FT.state.selectedFacilityId,
        fallback: document.querySelector('.workspacePlaceholder')?.textContent || '',
        hasSlot: !!document.querySelector('[data-workspace-map-slot="plant"]'),
        mapInPlantSlot: stage.parentElement && stage.parentElement.dataset.workspaceMapSlot === 'plant',
      };
    });
    detail(state);
    return state.threw === null &&
      state.sameNode &&
      state.connected &&
      state.workspace === 'plant' &&
      state.bodyWorkspace === 'plant' &&
      state.facility === 'a-vuong' &&
      /không tải được|failed|lỗi/i.test(state.fallback) &&
      state.hasSlot &&
      state.mapInPlantSlot;
  });

  await check('renderer cannot move shared map during failed active replacement', async (detail) => {
    const state = await page.evaluate(() => {
      const FT = window.FT;
      const stage = document.getElementById('stageWrap');
      FT.workspaces.register('city', ({ workspace }) => {
        const shell = document.createElement('section');
        shell.dataset.testRenderer = 'stable-city';
        const slot = document.createElement('div');
        slot.dataset.workspaceMapSlot = workspace;
        shell.appendChild(slot);
        return shell;
      });
      FT.workspaces.navigate('city');
      let result = null;
      let threw = null;
      try {
        result = FT.workspaces.register('city', ({ host, sharedMapNode }) => {
          host.appendChild(sharedMapNode);
          throw new Error('moved shared map before failing');
        });
      } catch (error) {
        threw = error.message;
      }
      return {
        result,
        threw,
        sameNode: FT.workspaces.sharedMapNode === stage,
        connected: stage.isConnected,
        workspace: FT.state.workspace,
        stableRendererStillVisible: !!document.querySelector('[data-test-renderer="stable-city"]'),
        mapInCitySlot: stage.parentElement && stage.parentElement.dataset.workspaceMapSlot === 'city',
      };
    });
    detail(state);
    return state.result === false &&
      state.threw === null &&
      state.sameNode &&
      state.connected &&
      state.workspace === 'city' &&
      state.stableRendererStillVisible &&
      state.mapInCitySlot;
  });

  await check('invalid renderer return is refused with accessible fallback and stable route', async (detail) => {
    const state = await page.evaluate(() => {
      const FT = window.FT;
      const stage = document.getElementById('stageWrap');
      FT.workspaces.navigate('map');
      FT.workspaces.register('plant', () => '<img src=x onerror=alert(1)>');
      let threw = null;
      try {
        FT.workspaces.navigate('plant', { facilityId: 'a-vuong' });
      } catch (error) {
        threw = error.message;
      }
      return {
        threw,
        sameNode: FT.workspaces.sharedMapNode === stage,
        connected: stage.isConnected,
        workspace: FT.state.workspace,
        bodyWorkspace: document.body.dataset.workspace,
        hostText: document.getElementById('roleWorkspaceHost').textContent,
        unsafeMarkupInserted: !!document.querySelector('img[onerror]'),
        hasSlot: !!document.querySelector('[data-workspace-map-slot="plant"]'),
        mapInPlantSlot: stage.parentElement && stage.parentElement.dataset.workspaceMapSlot === 'plant',
      };
    });
    detail(state);
    return state.threw === null &&
      state.sameNode &&
      state.connected &&
      state.workspace === 'plant' &&
      state.bodyWorkspace === 'plant' &&
      /không tải được|failed|lỗi/i.test(state.hostText) &&
      state.unsafeMarkupInserted === false &&
      state.hasSlot &&
      state.mapInPlantSlot;
  });

  await ctx.close();
}

async function workspaceShellYield(browser) {
  step('RW · Shell chrome stays yielded off map');

  async function assertShellChromeSuppressed(route) {
    const query = route === 'plant' ? '?workspace=plant&facility=a-vuong' : '?workspace=city';
    const { ctx, page } = await bootApp(browser, BASE, { hash: query });
    usePage(page);
    await check(`${route} route suppresses lazy palette and context panels`, async (detail) => {
      const state = await page.evaluate(async () => {
        const visible = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return false;
          const style = getComputedStyle(node);
          return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
            style.opacity !== '0' && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
        };
        FT.palette && FT.palette.open('');
        FT.panels && FT.panels.drawer && FT.panels.drawer.show('expanded');
        FT.panels && FT.panels.ai && FT.panels.ai.show('expanded');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true, bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return {
          workspace: FT.state.workspace,
          bodyWorkspace: document.body.dataset.workspace,
          paletteVisible: visible('.cmdPalette'),
          drawerVisible: visible('.geoDrawer'),
          aiVisible: visible('.geoAI'),
          anyFloatVisible: [...document.querySelectorAll('.geoFloat')].some((node) => {
            const style = getComputedStyle(node);
            return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
              node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
          }),
        };
      });
      detail(state);
      return state.workspace === route &&
        state.bodyWorkspace === route &&
        state.paletteVisible === false &&
        state.drawerVisible === false &&
        state.aiVisible === false &&
        state.anyFloatVisible === false;
    });

    await check(`${route} route restores shell opening after returning to map`, async (detail) => {
      const state = await page.evaluate(async () => {
        FT.workspaces.navigate('map');
        FT.palette.open('');
        FT.panels.drawer.show('expanded');
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const visible = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return false;
          const style = getComputedStyle(node);
          return !node.hidden && style.display !== 'none' && style.visibility !== 'hidden' &&
            style.opacity !== '0' && node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
        };
        return {
          workspace: FT.state.workspace,
          bodyWorkspace: document.body.dataset.workspace,
          paletteVisible: visible('.cmdPalette'),
          drawerOpen: (() => {
            const drawer = document.querySelector('[data-panel="drawer"]');
            return !!drawer && drawer.style.display !== 'none' && !drawer.classList.contains('hidden-chrome');
          })(),
        };
      });
      detail(state);
      return state.workspace === 'map' &&
        state.bodyWorkspace === 'map' &&
        state.paletteVisible &&
        state.drawerOpen;
    });
    await ctx.close();
  }

  await assertShellChromeSuppressed('city');
  await assertShellChromeSuppressed('plant');
}

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

  await check('loaded audit history cannot authorize release workflow state', async (detail) => {
    const seeded = await bootApp(browser, BASE);
    usePage(seeded.page);
    await seeded.page.evaluate(() => {
      const forged = {
        seq: 1,
        tsUtc: new Date().toISOString(),
        simT: '6.00',
        actor: 'Phạm M.D. (Ban Chỉ huy PCTT&TKCN)',
        action: 'decision.approve',
        detail: {
          decision: 'D-03',
          actorRole: 'Ban Chỉ huy PCTT&TKCN',
          package: 'DP-loaded-forged-approval',
          eventId: 'EVT-oct2020',
          feasible: true,
        },
        reason: 'loaded forged approval must remain display-only',
        mode: 'SYNTHETIC',
        scenario: 'oct2020',
        versions: { engine: 'forged' },
        snapshot: 'loaded-forged-snapshot',
      };
      localStorage.setItem('ft.audit.v1', JSON.stringify([forged]));
    });
    await seeded.page.reload({ waitUntil: 'domcontentloaded' });
    await seeded.page.waitForLoadState('domcontentloaded');
    await seeded.page.waitForFunction(() => window.FT && window.FT.ops && window.FT.releaseOps && window.FT.hydro && window.FT.hydro.ready, null, { timeout: 90000 });
    await seeded.page.waitForTimeout(500);
    await signOnRole(seeded.page, ROLE.authority);
    const probe = await seeded.page.evaluate(() => {
      const FT = window.FT;
      const RO = FT.releaseOps;
      const pkg = {
        kind: 'PROPOSAL',
        id: 'DP-loaded-forged-approval',
        reservoir: { id: 'avuong' },
        action: { q0: 100, q1: 1777, tStart: 4, rampMax: 20, endCondition: 'loaded forged', gates: 'loaded forged gates' },
      };
      FT.state.scenario = 'oct2020';
      FT.hydro.rebuild();
      const proposal = RO.ingestProposal(pkg);
      const loaded = FT.ops.audit.entries.find((entry) => entry.action === 'decision.approve' && entry.detail && entry.detail.package === pkg.id);
      const beforeLoaded = RO.snapshot();
      const loadedStored = FT.ops.audit.stored(loaded);
      const clonedStored = FT.ops.audit.stored(Object.assign({}, loaded));
      const loadedDecision = RO.recordDecision(loaded);
      const loadedOrder = RO.createOrder(proposal && proposal.id, loaded);
      const afterLoaded = RO.snapshot();
      const authentic = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: 'Ban Chỉ huy PCTT&TKCN',
        package: pkg.id,
        eventId: RO.snapshot().event.id,
        feasible: true,
      }, 'current runtime approval after loaded forged history');
      const authenticDecision = RO.recordDecision(authentic);
      const authenticOrder = RO.createOrder(proposal && proposal.id, authentic);
      return {
        loadedVisible: !!loaded,
        loadedFrozen: !!loaded && Object.isFrozen(loaded) && Object.isFrozen(loaded.detail || {}),
        loadedStored,
        clonedStored,
        loadedDecision,
        loadedOrder,
        loadedStateUnchanged: JSON.stringify(beforeLoaded.orders) === JSON.stringify(afterLoaded.orders) &&
          JSON.stringify(beforeLoaded.decisions) === JSON.stringify(afterLoaded.decisions),
        authenticDecision,
        authenticOrder,
        exportText: FT.ops.audit.exportText(),
      };
    });
    await seeded.ctx.close();
    usePage(page);
    detail(probe);
    return probe.loadedVisible &&
      probe.loadedFrozen &&
      probe.loadedStored === null &&
      probe.clonedStored === null &&
      probe.loadedDecision === null &&
      probe.loadedOrder === null &&
      probe.loadedStateUnchanged &&
      probe.authenticDecision &&
      probe.authenticOrder &&
      probe.authenticOrder.commandedCms === 1777 &&
      /loaded forged approval must remain display-only/.test(probe.exportText);
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
  await check('public audit entries are immutable snapshots and forged insertion cannot authorize release', async (detail) => {
    const r = await page.evaluate(async (proposalId) => {
      const FT = window.FT;
      const RO = FT.releaseOps;
      const pkgId = proposalId.replace(/^PRP-/, '');
      const beforeEntries = FT.ops.audit.entries;
      const beforeLength = beforeEntries.length;
      const beforeExport = FT.ops.audit.exportText();
      const forged = {
        seq: beforeLength + 1000,
        tsUtc: new Date().toISOString(),
        simT: FT.state ? FT.state.timeH : null,
        actor: 'Phạm M.D. (Ban Chỉ huy PCTT&TKCN)',
        action: 'decision.approve',
        detail: {
          decision: 'D-03',
          actorRole: 'Ban Chỉ huy PCTT&TKCN',
          package: pkgId,
          eventId: RO.snapshot().event.id,
          feasible: true,
        },
        reason: 'forged public insertion must not authorize',
        mode: FT.ops.MODE,
        scenario: FT.state && FT.state.scenario,
        versions: FT.ops.versions,
        snapshot: 'forged-snapshot',
      };
      let pushThrew = false;
      let spliceThrew = false;
      let replaceThrew = false;
      let mutateThrew = false;
      try { beforeEntries.push(forged); } catch (error) { pushThrew = true; }
      try { beforeEntries.splice(0, 1); } catch (error) { spliceThrew = true; }
      try { FT.ops.audit.entries = [forged]; } catch (error) { replaceThrew = true; }
      const exposedAfterTamper = FT.ops.audit.entries;
      const first = exposedAfterTamper[0];
      const originalAction = first && first.action;
      try { if (first) first.action = 'decision.approve'; } catch (error) { mutateThrew = true; }
      const afterTamper = FT.ops.audit.entries;
      const forgedDecision = RO.recordDecision(forged);
      const forgedOrder = RO.createOrder(proposalId, forged);

      const select = document.getElementById('scenarioSelect');
      const chooseScenario = async (scenario) => {
        select.value = scenario;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      };
      await chooseScenario('yagi');
      const authPkg = {
        kind: 'PROPOSAL',
        id: 'DP-authentic-after-tamper',
        reservoir: { id: 'songbung4' },
        action: { q0: 100, q1: 1234, tStart: 4, rampMax: 20, endCondition: 'authentic gate', gates: 'authentic gates' },
      };
      const authProposal = RO.ingestProposal(authPkg);
      const authenticAudit = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: FT.ops.audit.actor.role,
        package: authPkg.id,
        eventId: RO.snapshot().event.id,
        feasible: true,
      }, 'authentic approval after public tamper probe');
      const authenticDecision = RO.recordDecision(authenticAudit);
      const authenticOrder = RO.createOrder(authProposal && authProposal.id, authenticAudit);
      const authenticEventId = RO.snapshot().event.id;
      await chooseScenario('oct2020');

      return {
        beforeLength,
        afterTamperLength: afterTamper.length,
        finalLength: FT.ops.audit.entries.length,
        beforeFrozen: Object.isFrozen(beforeEntries),
        afterFrozen: Object.isFrozen(afterTamper),
        samePublicArray: beforeEntries === afterTamper,
        pushThrew,
        spliceThrew,
        replaceThrew,
        mutateThrew,
        originalAction,
        exposedFirstAction: afterTamper[0] && afterTamper[0].action,
        publicEntryFrozen: !!afterTamper[0] && Object.isFrozen(afterTamper[0]) && Object.isFrozen(afterTamper[0].detail || {}),
        exportUnchangedAfterTamper: FT.ops.audit.exportText().startsWith(beforeExport),
        forgedDecision,
        forgedOrder,
        authenticDecision,
        authenticOrder,
        authenticEventId,
        restoredEventId: RO.snapshot().event.id,
      };
    }, state.proposalId || 'PRP-DP-missing');
    detail(r);
    return r.beforeFrozen &&
      r.afterFrozen &&
      r.samePublicArray === false &&
      r.afterTamperLength === r.beforeLength &&
      r.finalLength > r.beforeLength &&
      r.publicEntryFrozen &&
      r.exposedFirstAction === r.originalAction &&
      r.forgedDecision === null &&
      r.forgedOrder === null &&
      r.authenticDecision &&
      r.authenticOrder &&
      r.authenticEventId === 'EVT-yagi' &&
      r.authenticOrder.eventId === 'EVT-yagi' &&
      r.authenticOrder.commandedCms === 1234 &&
      r.restoredEventId === 'EVT-oct2020';
  });

  await check('same package id with changed action creates a new active proposal and current-command order', async (detail) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const RO = FT.releaseOps;
      const original = {
        kind: 'PROPOSAL',
        id: 'DP-stale-action',
        reservoir: { id: 'avuong' },
        action: { q0: 100, q1: 1000, tStart: 4, rampMax: 20, endCondition: 'old', gates: 'old gates' },
      };
      const changed = {
        kind: 'PROPOSAL',
        id: 'DP-stale-action',
        reservoir: { id: 'avuong' },
        action: { q0: 200, q1: 2222, tStart: 8, rampMax: 40, endCondition: 'new', gates: 'new gates' },
      };
      const first = RO.ingestProposal(original);
      const originalAudit = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: FT.ops.audit.actor.role,
        package: original.id,
        eventId: RO.snapshot().event.id,
        feasible: true,
      }, 'original action approval');
      const originalDecision = RO.recordDecision(originalAudit);
      const originalOrder = RO.createOrder(first && first.id, originalAudit);
      const before = RO.snapshot();
      const second = RO.ingestProposal(changed);
      const audit = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: FT.ops.audit.actor.role,
        package: changed.id,
        eventId: before.event.id,
        feasible: true,
      }, 'changed action approval must not reuse stale proposal');
      const decision = RO.recordDecision(audit);
      const order = RO.createOrder(second && second.id, audit);
      const after = RO.snapshot();
      const duplicateOrder = RO.createOrder(second && second.id, audit);
      const afterDuplicate = RO.snapshot();
      const proposals = Object.values(after.proposals).filter((item) => item.packageId === changed.id);
      const currentOrders = Object.values(after.orders).filter((item) => item.eventId === after.event.id && !item.supersededBy);
      return {
        firstId: first && first.id,
        firstAction: first && first.action,
        originalDecision,
        originalOrder,
        second,
        decision,
        order,
        duplicateOrder,
        proposals,
        currentOrders,
        orderCountBefore: Object.keys(before.orders).length,
        orderCountAfter: Object.keys(after.orders).length,
        orderCountAfterDuplicate: Object.keys(afterDuplicate.orders).length,
      };
    });
    detail(r);
    const archived = (r.proposals || []).find((item) => item.status === 'SUPERSEDED');
    const active = (r.proposals || []).find((item) => item.status === 'SUBMITTED' && !item.supersededBy);
    return r.firstAction &&
      r.firstAction.commandedCms === 1000 &&
      r.originalDecision &&
      r.originalOrder &&
      r.originalOrder.commandedCms === 1000 &&
      r.second &&
      r.second.action &&
      r.second.action.commandedCms === 2222 &&
      r.second.id !== r.firstId &&
      archived &&
      archived.action.commandedCms === 1000 &&
      active &&
      active.id === r.second.id &&
      r.decision &&
      r.order &&
      r.order.proposalId === r.second.id &&
      r.order.commandedCms === 2222 &&
      r.order.previousCms === 200 &&
      r.order.action.gates === 'new gates' &&
      r.currentOrders.length === 1 &&
      r.currentOrders[0].id === r.order.id &&
      r.currentOrders[0].commandedCms === 2222 &&
      r.duplicateOrder &&
      r.duplicateOrder.id === r.order.id &&
      r.orderCountAfter === r.orderCountBefore + 1 &&
      r.orderCountAfterDuplicate === r.orderCountAfter;
  });

  await check('proposal revision does not leave supersede audit without state change when ingest audit fails', async (detail) => {
    const r = await page.evaluate(() => {
      const FT = window.FT;
      const RO = FT.releaseOps;
      const original = {
        kind: 'PROPOSAL',
        id: 'DP-atomic-revision',
        reservoir: { id: 'avuong' },
        action: { q0: 100, q1: 1000, tStart: 4, rampMax: 20, endCondition: 'old', gates: 'old gates' },
      };
      const changed = {
        kind: 'PROPOSAL',
        id: 'DP-atomic-revision',
        reservoir: { id: 'avuong' },
        action: { q0: 200, q1: 2222, tStart: 8, rampMax: 40, endCondition: 'new', gates: 'new gates' },
      };
      const first = RO.ingestProposal(original);
      const before = RO.snapshot();
      const beforeAudit = FT.ops.audit.entries.length;
      const originalLog = FT.ops.audit.log;
      let calls = 0;
      FT.ops.audit.log = (action, auditDetail, reason) => {
        calls += 1;
        if (action === 'release.proposal.revise') return null;
        return originalLog(action, auditDetail, reason);
      };
      const changedResult = RO.ingestProposal(changed);
      FT.ops.audit.log = originalLog;
      const after = RO.snapshot();
      return {
        first,
        calls,
        changedResult,
        auditUnchanged: FT.ops.audit.entries.length === beforeAudit,
        proposalsUnchanged: JSON.stringify(before.proposals) === JSON.stringify(after.proposals),
      };
    });
    detail(r);
    return r.first &&
      r.changedResult === null &&
      r.calls === 1 &&
      r.auditUnchanged &&
      r.proposalsUnchanged;
  });

  await check('third changed-command order supersedes every prior current order revision', async (detail) => {
    const r = await page.evaluate(async () => {
      const FT = window.FT;
      const RO = FT.releaseOps;
      const packageId = 'DP-multi-revision-action';
      const eventId = RO.snapshot().event.id;
      const proposals = [
        {
          kind: 'PROPOSAL',
          id: packageId,
          reservoir: { id: 'songbung4' },
          action: { q0: 100, q1: 1000, tStart: 4, rampMax: 20, endCondition: 'first', gates: 'first gates' },
        },
        {
          kind: 'PROPOSAL',
          id: packageId,
          reservoir: { id: 'songbung4' },
          action: { q0: 200, q1: 2222, tStart: 8, rampMax: 40, endCondition: 'second', gates: 'second gates' },
        },
        {
          kind: 'PROPOSAL',
          id: packageId,
          reservoir: { id: 'songbung4' },
          action: { q0: 300, q1: 3333, tStart: 12, rampMax: 60, endCondition: 'third', gates: 'third gates' },
        },
      ];
      const approvals = [];
      for (const proposalPackage of proposals) {
        if (Number.isFinite(FT.state.timeH)) FT.state.timeH += 1;
        const proposal = RO.ingestProposal(proposalPackage);
        const audit = FT.ops.audit.log('decision.approve', {
          decision: 'D-03',
          actorRole: FT.ops.audit.actor.role,
          package: proposalPackage.id,
          eventId,
          feasible: true,
        }, `multi revision approval ${proposalPackage.action.endCondition}`);
        const decision = RO.recordDecision(audit);
        const order = RO.createOrder(proposal && proposal.id, audit);
        approvals.push({ proposal, audit, decision, order });
      }
      const duplicateThird = RO.createOrder(approvals[2].proposal && approvals[2].proposal.id, approvals[2].audit);
      const beforeBlocked = RO.snapshot();
      const priorOrderIds = approvals.slice(0, 2).map((item) => item.order && item.order.id).filter(Boolean);
      const blocked = priorOrderIds.map((orderId) => ({
        orderId,
        checklist: RO.setChecklist(orderId, 'order-valid', true),
        notified: RO.markNotified(orderId),
        start: RO.startExecution(orderId),
      }));
      const afterBlocked = RO.snapshot();
      const orders = Object.values(afterBlocked.orders).filter((item) => item.packageId === packageId && item.eventId === eventId);
      const currentOrders = orders.filter((item) => !item.supersededBy);
      const thirdOrder = approvals[2].order;
      const createAudits = approvals.map((approval) => FT.ops.audit.entries
        .filter((entry) => entry.action === 'release.order.create' && entry.detail && entry.detail.orderId === (approval.order && approval.order.id))
        .pop());
      FT.workspaces.navigate('city');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const cityRowText = document.querySelector(`[data-city-timeline] [data-process-row][data-facility-id="${thirdOrder && thirdOrder.facilityId}"]`)?.textContent || '';
      FT.workspaces.navigate('plant', { facilityId: thirdOrder && thirdOrder.facilityId });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const approvedText = document.querySelector('[data-plant-approved-order]')?.textContent || '';
      const executionText = document.querySelector('[data-plant-execution]')?.textContent || '';
      return {
        orderIds: approvals.map((item) => item.order && item.order.id),
        duplicateThirdId: duplicateThird && duplicateThird.id,
        blocked,
        blockedUnchanged: JSON.stringify(beforeBlocked.orders) === JSON.stringify(afterBlocked.orders) &&
          JSON.stringify(beforeBlocked.executions) === JSON.stringify(afterBlocked.executions),
        orders: orders.map((item) => ({
          id: item.id,
          proposalId: item.proposalId,
          commandedCms: item.commandedCms,
          createdAtH: item.createdAtH,
          supersededBy: item.supersededBy || null,
          status: item.status,
        })),
        currentOrders: currentOrders.map((item) => item.id),
        thirdOrderId: thirdOrder && thirdOrder.id,
        thirdCommandedCms: thirdOrder && thirdOrder.commandedCms,
        createAuditDetails: createAudits.map((entry) => entry && entry.detail),
        cityRowText,
        approvedText,
        executionText,
      };
    });
    detail(r);
    const auditSuperseded = (r.createAuditDetails || []).map((detail) => (detail && detail.supersededOrderIds || []).slice().sort().join('|'));
    const byId = new Map((r.orders || []).map((order) => [order.id, order]));
    return r.orderIds.length === 3 &&
      r.orderIds[0] !== r.orderIds[1] &&
      r.orderIds[1] !== r.orderIds[2] &&
      r.duplicateThirdId === r.thirdOrderId &&
      r.currentOrders.length === 1 &&
      r.currentOrders[0] === r.thirdOrderId &&
      r.thirdCommandedCms === 3333 &&
      byId.get(r.orderIds[0]).supersededBy === r.orderIds[1] &&
      byId.get(r.orderIds[1]).supersededBy === r.orderIds[2] &&
      r.orders.filter((item) => item.supersededBy === null)[0].id === r.thirdOrderId &&
      r.blocked.every((item) => item.checklist === null && item.notified === null && item.start === null) &&
      r.blockedUnchanged &&
      auditSuperseded[0] === '' &&
      auditSuperseded[1] === r.orderIds[0] &&
      auditSuperseded[2] === r.orderIds[1] &&
      r.createAuditDetails[2].supersedesOrderId === r.orderIds[1] &&
      showsOrderId(r.cityRowText, r.thirdOrderId) &&
      !r.orderIds.slice(0, 2).some((orderId) => showsOrderId(r.cityRowText, orderId)) &&
      showsOrderId(r.approvedText, r.thirdOrderId) &&
      !r.orderIds.slice(0, 2).some((orderId) => showsOrderId(r.approvedText, orderId)) &&
      r.approvedText.replace(/\D/g, '').includes('3333') &&
      showsOrderId(r.executionText, r.thirdOrderId) &&
      !/1\.000 m³\/s/.test(r.executionText) &&
      !/2\.222 m³\/s/.test(r.executionText);
  });

  await check('City and Plant render the current changed-command order, not superseded order history', async (detail) => {
    const r = await page.evaluate(async () => {
      const snap = FT.releaseOps.snapshot();
      const orders = Object.values(snap.orders).filter((item) => item.packageId === 'DP-stale-action');
      const current = orders.find((item) => item.eventId === snap.event.id && !item.supersededBy);
      const stale = orders.find((item) => item.supersededBy);
      if (!current) return { orders };
      FT.workspaces.navigate('city');
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const cityRowText = document.querySelector(`[data-city-timeline] [data-process-row][data-facility-id="${current.facilityId}"]`)?.textContent || '';
      FT.workspaces.navigate('plant', { facilityId: current.facilityId });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const approvedText = document.querySelector('[data-plant-approved-order]')?.textContent || '';
      const executionText = document.querySelector('[data-plant-execution]')?.textContent || '';
      return {
        currentOrderId: current.id,
        staleOrderId: stale && stale.id,
        currentCommandedCms: current.commandedCms,
        staleCommandedCms: stale && stale.commandedCms,
        currentSupersededBy: current.supersededBy || null,
        staleSupersededBy: stale && stale.supersededBy,
        cityRowText,
        approvedText,
        executionText,
        approvedDigits: approvedText.replace(/\D/g, ''),
        executionDigits: executionText.replace(/\D/g, ''),
      };
    });
    detail(r);
    return /^ORD-/.test(r.currentOrderId || '') &&
      /^ORD-/.test(r.staleOrderId || '') &&
      r.currentOrderId !== r.staleOrderId &&
      r.currentCommandedCms === 2222 &&
      r.staleCommandedCms === 1000 &&
      r.currentSupersededBy === null &&
      r.staleSupersededBy === r.currentOrderId &&
      showsOrderId(r.cityRowText, r.currentOrderId) &&
      !showsOrderId(r.cityRowText, r.staleOrderId) &&
      showsOrderId(r.approvedText, r.currentOrderId) &&
      !showsOrderId(r.approvedText, r.staleOrderId) &&
      r.approvedDigits.includes('2222') &&
      showsOrderId(r.executionText, r.currentOrderId) &&
      !showsOrderId(r.executionText, r.staleOrderId) &&
      !/1\.000 m³\/s/.test(r.executionText);
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
      const unknownBeforeAudit = FT.ops.audit.entries.length;
      const unknownBefore = RO.snapshot();
      const unknownChecklist = RO.setChecklist(order.id, 'downstreamNotice', true);
      const unknownAfter = RO.snapshot();
      const unknownAuditUnchanged = FT.ops.audit.entries.length === unknownBeforeAudit;
      const notified = RO.markNotified(order.id);
      const startBlockedAfterOne = RO.startExecution(order.id);
      const startChecks = RO.CHECKS.slice(0, 4);
      const startPrereqs = startChecks
        .filter((key) => key !== 'notifications-acknowledged')
        .map((key) => RO.setChecklist(order.id, key, true));
      const execution = RO.startExecution(order.id);
      const closeBeforeCompletion = RO.close(order.id);
      const facility = FT.facilities.get(order.facilityId);
      const snap = FT.hydro.at(FT.state.timeH);
      const derivedObservedCms = snap.reservoirs[facility.demoReservoirId].O;
      const observed = RO.recordObservedRelease(order.id, 999999);
      const observedOrder = RO.snapshot().orders[order.id];
      const closeChecks = RO.CHECKS.slice(4).map((key) => RO.setChecklist(order.id, key, true));
      const completionRule = RO.completionRule(order.id);
      const closed = RO.close(order.id);
      const closedSnap = RO.snapshot();
    const closedAuditBefore = FT.ops.audit.entries.length;
    const closedNotify = RO.markNotified(order.id);
    const closedExecution = RO.startExecution(order.id);
      const closedChecklist = RO.setChecklist(order.id, 'completion-confirmed', false);
      const closedObserved = RO.recordObservedRelease(order.id, 430);
    const closedAgain = RO.close(order.id);
    const snap2 = RO.snapshot();
      return {
        beforeAudit,
        afterAudit: FT.ops.audit.entries.length,
        checks: RO.CHECKS,
        checksFrozen: Object.isFrozen(RO.CHECKS),
        mutatedChecks: (() => { try { RO.CHECKS.push('mutated'); } catch (e) {} return RO.CHECKS.join('|'); })(),
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
        unknownChecklist,
        unknownChecklistAtomic: unknownAuditUnchanged &&
          JSON.stringify(unknownBefore.orders[order.id]) === JSON.stringify(unknownAfter.orders[order.id]),
        notified,
        startBlockedAfterOne,
        startPrereqs,
        execution,
        closeBeforeCompletion,
        derivedObservedCms,
        observed,
        observedOrder,
        closeChecks,
        completionRule,
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
      workflowAuditDetails: FT.ops.audit.entries.slice(beforeAudit)
        .filter((e) => /^release\./.test(e.action || ''))
        .map((e) => ({ action: e.action, eventId: e.detail && e.detail.eventId })),
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
    workflow.unknownChecklist === null &&
    workflow.unknownChecklistAtomic &&
    workflow.startBlockedAfterOne === null &&
    workflow.closeBeforeCompletion === null &&
    workflow.closedNotify === null &&
    workflow.closedExecution === null &&
    workflow.closedChecklist === null &&
    workflow.closedObserved === null &&
    workflow.closedAgain === null &&
    workflow.closedAtomic);

  await check('workflow mutators append audit entries and preserve prior snapshots', () =>
    workflow.afterAudit >= workflow.beforeAudit + 6 &&
    workflow.auditActions.includes('release.order.create') &&
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

  await check('workflow derives observed release from current demo telemetry, not caller input', (detail) => {
    detail({
      derivedObservedCms: workflow.derivedObservedCms,
      storedObservedCms: workflow.observedOrder && workflow.observedOrder.observedCms,
      actual: workflow.observedOrder && workflow.observedOrder.actual,
    });
    return Number.isFinite(workflow.derivedObservedCms) &&
      workflow.observed &&
      workflow.observedOrder &&
      workflow.observedOrder.observedCms === workflow.derivedObservedCms &&
      workflow.observedOrder.observedCms !== 999999 &&
      workflow.observedOrder.actual &&
      workflow.observedOrder.actual.observedCms === workflow.derivedObservedCms &&
      Number.isFinite(workflow.observedOrder.actual.deviationCms);
  });

  await check('workflow exposes the exact immutable checklist API and completion rule', (detail) => {
    detail({ checks: workflow.checks, mutatedChecks: workflow.mutatedChecks, completionRule: workflow.completionRule });
    return workflow.checksFrozen &&
      workflow.checks.join('|') === 'order-valid|notifications-acknowledged|plant-ready|outlet-ready|ramp-started|actual-recorded|downstream-monitored|completion-confirmed' &&
      workflow.mutatedChecks === workflow.checks.join('|') &&
      workflow.startPrereqs.every(Boolean) &&
      workflow.closeChecks.every(Boolean) &&
      workflow.completionRule.requiresObservedActual === true &&
      workflow.completionRule.requiredChecks.join('|') === 'ramp-started|actual-recorded|downstream-monitored|completion-confirmed';
  });

  await check('workflow audit details carry current event evidence for readiness', async (detail) => {
    const readiness = await page.evaluate(() => {
      FT.workspaces.navigate('city');
      const text = document.querySelector('[data-city-readiness] [data-city-kpi="workflow"] .cityKpiValue')?.textContent || '';
      const value = Number.parseInt(text.replace(/[^\d-]/g, ''), 10);
      return { text, value: Number.isFinite(value) ? value : null };
    });
    detail({ workflowAuditDetails: workflow.workflowAuditDetails, readiness });
    const byAction = new Map(workflow.workflowAuditDetails.map((entry) => [entry.action, entry.eventId]));
    const currentEvent = workflow.snap1Order && workflow.snap1Order.eventId;
    return currentEvent === 'EVT-oct2020' &&
      byAction.get('release.order.create') === currentEvent &&
      byAction.get('release.execution.start') === currentEvent &&
      byAction.get('release.checklist.set') === currentEvent &&
      byAction.get('release.observed') === currentEvent &&
      byAction.get('release.order.close') === currentEvent &&
      readiness.value >= 6;
  });

  await check('same package id across scenario events creates distinct current event orders', async (detail) => {
    const r = await page.evaluate(async () => {
      const FT = window.FT;
      const RO = FT.releaseOps;
      const packageId = 'DP-cross-event-collision';
      const select = document.getElementById('scenarioSelect');
      const chooseScenario = async (scenario) => {
        select.value = scenario;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      };
      await chooseScenario('oct2020');
      const octPkg = {
        kind: 'PROPOSAL',
        id: packageId,
        reservoir: { id: 'dakmi4' },
        action: { q0: 111, q1: 1111, tStart: 4, rampMax: 20, endCondition: 'oct event', gates: 'oct gates' },
      };
      const octProposal = RO.ingestProposal(octPkg);
      const octAudit = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: FT.ops.audit.actor.role,
        package: packageId,
        eventId: RO.snapshot().event.id,
        feasible: true,
      }, 'oct approval for cross-event collision regression');
      const octDecision = RO.recordDecision(octAudit);
      const octOrder = RO.createOrder(octProposal && octProposal.id, octAudit);

      await chooseScenario('yagi');
      const yagiPkg = {
        kind: 'PROPOSAL',
        id: packageId,
        reservoir: { id: 'dakmi4' },
        action: { q0: 222, q1: 2222, tStart: 8, rampMax: 40, endCondition: 'yagi event', gates: 'yagi gates' },
      };
      const yagiProposal = RO.ingestProposal(yagiPkg);
      const yagiAudit = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: FT.ops.audit.actor.role,
        package: packageId,
        eventId: RO.snapshot().event.id,
        feasible: true,
      }, 'yagi approval for cross-event collision regression');
      const yagiDecision = RO.recordDecision(yagiAudit);
      const yagiOrder = RO.createOrder(yagiProposal && yagiProposal.id, yagiAudit);
      const yagiDuplicate = RO.createOrder(yagiProposal && yagiProposal.id, yagiAudit);
      const afterYagi = RO.snapshot();
      const octStartOutsideEvent = RO.startExecution(octOrder && octOrder.id);
      FT.workspaces.navigate('plant', { facilityId: yagiOrder && yagiOrder.facilityId });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const approvedText = document.querySelector('[data-plant-approved-order]')?.textContent || '';
      const executionText = document.querySelector('[data-plant-execution]')?.textContent || '';
      await chooseScenario('oct2020');
      return {
        octDecision,
        octOrder,
        yagiDecision,
        yagiOrder,
        yagiDuplicate,
        afterYagiEvent: afterYagi.event.id,
        ordersForPackage: Object.values(afterYagi.orders)
          .filter((item) => item.packageId === packageId)
          .map((item) => ({
            id: item.id,
            eventId: item.eventId,
            proposalId: item.proposalId,
            facilityId: item.facilityId,
            commandedCms: item.commandedCms,
            supersededBy: item.supersededBy || null,
          })),
        octStartOutsideEvent,
        approvedText,
        executionText,
        restoredEventId: RO.snapshot().event.id,
      };
    });
    detail(r);
    return r.octDecision &&
      r.octOrder &&
      r.octOrder.id === 'ORD-DP-cross-event-collision' &&
      r.octOrder.eventId === 'EVT-oct2020' &&
      r.octOrder.commandedCms === 1111 &&
      r.yagiDecision &&
      r.yagiOrder &&
      r.yagiDuplicate &&
      r.yagiDuplicate.id === r.yagiOrder.id &&
      r.yagiOrder.id !== r.octOrder.id &&
      r.yagiOrder.eventId === 'EVT-yagi' &&
      r.yagiOrder.commandedCms === 2222 &&
      r.ordersForPackage.length === 2 &&
      r.ordersForPackage.some((item) => item.id === r.octOrder.id && item.eventId === 'EVT-oct2020' && item.commandedCms === 1111 && !item.supersededBy) &&
      r.ordersForPackage.some((item) => item.id === r.yagiOrder.id && item.eventId === 'EVT-yagi' && item.commandedCms === 2222 && !item.supersededBy) &&
      r.octStartOutsideEvent === null &&
      showsOrderId(r.approvedText, r.yagiOrder.id) &&
      !showsOrderId(r.approvedText, r.octOrder.id) &&
      r.approvedText.replace(/\D/g, '').includes('2222') &&
      showsOrderId(r.executionText, r.yagiOrder.id) &&
      !showsOrderId(r.executionText, r.octOrder.id) &&
      r.restoredEventId === 'EVT-oct2020';
  });

  await check('release store rejects cross-scenario and mismatched event approvals', async (detail) => {
    const r = await page.evaluate(async () => {
      const FT = window.FT;
      const RO = FT.releaseOps;
      const fake = { kind: 'PROPOSAL', id: 'DP-event-authority-oct', reservoir: { id: 'avuong' } };
      FT.state.scenario = 'oct2020';
      FT.hydro.rebuild();
      const proposal = RO.ingestProposal(fake);
      const beforeMismatchAudit = FT.ops.audit.entries.length;
      const mismatchDetailAudit = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: FT.ops.audit.actor.role,
        package: fake.id,
        eventId: 'EVT-yagi',
      }, 'mismatched detail event must not authorize');
      const afterMismatchAudit = FT.ops.audit.entries.length;
      const beforeMismatch = RO.snapshot();
      const mismatchDecision = RO.recordDecision(mismatchDetailAudit);
      const mismatchOrder = RO.createOrder(proposal.id, mismatchDetailAudit);
      const afterMismatch = RO.snapshot();

      const validAudit = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: FT.ops.audit.actor.role,
        package: fake.id,
      }, 'same event approval remains valid');
      const validDecision = RO.recordDecision(validAudit);
      const validOrder = RO.createOrder(proposal.id, validAudit);
      const validSnap = RO.snapshot();

      const select = document.getElementById('scenarioSelect');
      select.value = 'yagi';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const afterSwitch = RO.snapshot();

      const beforeYagiAudit = FT.ops.audit.entries.length;
      const yagiAudit = FT.ops.audit.log('decision.approve', {
        decision: 'D-03',
        actorRole: FT.ops.audit.actor.role,
        package: fake.id,
      }, 'current scenario audit must not authorize historical proposal');
      const afterYagiAudit = FT.ops.audit.entries.length;
      const beforeYagiAttempt = RO.snapshot();
      const yagiDecision = RO.recordDecision(yagiAudit);
      const yagiOrder = RO.createOrder(proposal.id, yagiAudit);
      const afterYagiAttempt = RO.snapshot();

      const beforeReplayAudit = FT.ops.audit.entries.length;
      const beforeReplay = RO.snapshot();
      const replayDecision = RO.recordDecision(validAudit);
      const replayOrder = RO.createOrder(proposal.id, validAudit);
      const afterReplay = RO.snapshot();

      return {
        proposalId: proposal && proposal.id,
        proposalEventId: proposal && proposal.eventId,
        mismatchDetailAuditEvent: mismatchDetailAudit && mismatchDetailAudit.detail && mismatchDetailAudit.detail.eventId,
        mismatchDecision,
        mismatchOrder,
        mismatchAuditCreated: afterMismatchAudit === beforeMismatchAudit + 1,
        mismatchStateUnchanged: JSON.stringify(beforeMismatch.orders) === JSON.stringify(afterMismatch.orders) &&
          JSON.stringify(beforeMismatch.decisions) === JSON.stringify(afterMismatch.decisions),
        validDecision,
        validOrder,
        validOrderEventId: validOrder && validOrder.eventId,
        validSnapOrderFrozen: validOrder && Object.isFrozen(validSnap.orders[validOrder.id]),
        afterSwitchEventId: afterSwitch.event.id,
        yagiAuditScenario: yagiAudit && yagiAudit.scenario,
        yagiDecision,
        yagiOrder,
        yagiAuditCreated: afterYagiAudit === beforeYagiAudit + 1,
        yagiStateUnchanged: JSON.stringify(beforeYagiAttempt.orders) === JSON.stringify(afterYagiAttempt.orders) &&
          JSON.stringify(beforeYagiAttempt.decisions) === JSON.stringify(afterYagiAttempt.decisions),
        replayDecision,
        replayOrder,
        replayAuditUnchanged: FT.ops.audit.entries.length === beforeReplayAudit,
        replayStateUnchanged: JSON.stringify(beforeReplay.orders) === JSON.stringify(afterReplay.orders) &&
          JSON.stringify(beforeReplay.decisions) === JSON.stringify(afterReplay.decisions),
      };
    });
    detail(r);
    return r.proposalEventId === 'EVT-oct2020' &&
      r.mismatchDetailAuditEvent === 'EVT-yagi' &&
      r.mismatchDecision === null &&
      r.mismatchOrder === null &&
      r.mismatchAuditCreated &&
      r.mismatchStateUnchanged &&
      r.validDecision &&
      r.validOrder &&
      r.validOrderEventId === 'EVT-oct2020' &&
      r.validSnapOrderFrozen &&
      r.afterSwitchEventId === 'EVT-yagi' &&
      r.yagiAuditScenario === 'yagi' &&
      r.yagiDecision === null &&
      r.yagiOrder === null &&
      r.yagiAuditCreated &&
      r.yagiStateUnchanged &&
      r.replayDecision === null &&
      r.replayOrder === null &&
      r.replayAuditUnchanged &&
      r.replayStateUnchanged;
  });

  await ctx.close();
}

async function approvalExecutionIntegration(browser) {
  step('RW · Approval, order, checklist and execution integration');
  const { ctx, page, errors } = await bootApp(browser, BASE);
  usePage(page);
  await setPolicy(page, 'mpc');
  const setRainFactor = async (targetPage, factor) => {
    await targetPage.evaluate((nextFactor) => {
      const input = document.getElementById('rainScale');
      if (!input) throw new Error('missing rain factor control');
      input.value = String(Math.round(nextFactor * 100));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, factor);
    await targetPage.waitForFunction((nextFactor) => Math.abs(FT.state.rainScale - nextFactor) < 0.001, factor);
    await targetPage.waitForTimeout(350);
  };
  const driveCandidateState = async (targetPage, candidate) => {
    await setScenario(targetPage, candidate.scenario);
    await setPolicy(targetPage, candidate.policy);
    await setRainFactor(targetPage, candidate.rainScale);
    await setTime(targetPage, candidate.t);
  };
  const scanApprovalCandidates = (targetPage) => targetPage.evaluate(() => {
    const start = (FT.hydro && Number.isFinite(FT.hydro.T0)) ? FT.hydro.T0 : -24;
    const end = (FT.hydro && Number.isFinite(FT.hydro.T1)) ? FT.hydro.T1 : 48;
    const candidates = [];
    for (let t = start; t <= end; t += 1) {
      const snap = FT.hydro.at(t);
      const pkg = FT.ops.package(snap);
      candidates.push({
        t,
        scenario: FT.state.scenario,
        policy: FT.state.policy,
        rainScale: FT.state.rainScale,
        kind: pkg && pkg.kind,
        feasible: pkg && pkg.feasible,
        packageId: pkg && pkg.id,
        eventId: `EVT-${FT.state.scenario}`,
        binding: pkg && pkg.binding && pkg.binding.id,
      });
    }
    const selected = candidates.find((item) => item.kind === 'PROPOSAL' && item.feasible === true);
    return { selected, candidates };
  });
  let approvalCandidate = { selected: null, candidates: [], attempts: [] };
  approvalCandidate = await scanApprovalCandidates(page);
  approvalCandidate.attempts = [{
    scenario: approvalCandidate.candidates[0] && approvalCandidate.candidates[0].scenario,
    policy: approvalCandidate.candidates[0] && approvalCandidate.candidates[0].policy,
    rainScale: approvalCandidate.candidates[0] && approvalCandidate.candidates[0].rainScale,
    candidates: approvalCandidate.candidates,
  }];
  if (!approvalCandidate.selected) {
    const scenarioIds = await page.evaluate(() => Object.keys(FT.data.SCENARIOS || {}));
    const rainFactors = [1.0, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 1.05, 1.1, 1.15, 1.2];
    for (const scenario of scenarioIds) {
      for (const policy of ['mpc', 'rule']) {
        for (const rainScale of rainFactors) {
          await setScenario(page, scenario);
          await setPolicy(page, policy);
          await setRainFactor(page, rainScale);
          const attempt = await scanApprovalCandidates(page);
          approvalCandidate.attempts.push({
            scenario,
            policy,
            rainScale,
            candidates: attempt.candidates,
          });
          approvalCandidate.candidates = attempt.candidates;
          approvalCandidate.selected = attempt.selected;
          if (attempt.selected) break;
        }
        if (approvalCandidate.selected) break;
      }
      if (approvalCandidate.selected) break;
    }
  }
  await check('approval integration chooses a feasible proposal package', (detail) => {
    const attempts = approvalCandidate.attempts.map((attempt) => {
      const counts = attempt.candidates.reduce((acc, item) => {
        acc[item.kind || 'UNKNOWN'] = (acc[item.kind || 'UNKNOWN'] || 0) + 1;
        return acc;
      }, {});
      return {
        scenario: attempt.scenario,
        policy: attempt.policy,
        rainScale: attempt.rainScale,
        counts,
        sample: attempt.candidates.slice(0, 4),
        proposals: attempt.candidates
          .filter((item) => item.kind === 'PROPOSAL')
          .map((item) => ({
            t: item.t,
            scenario: item.scenario,
            policy: item.policy,
            rainScale: item.rainScale,
            packageId: item.packageId,
            eventId: item.eventId,
            feasible: item.feasible,
            binding: item.binding,
          })),
      };
    });
    detail({
      selected: approvalCandidate.selected,
      attempts,
    });
    return !!approvalCandidate.selected &&
      approvalCandidate.selected.kind === 'PROPOSAL' &&
      approvalCandidate.selected.feasible === true;
  });
  if (!approvalCandidate.selected) {
    await ctx.close();
    return;
  }
  await driveCandidateState(page, approvalCandidate.selected);
  const selectedEventId = approvalCandidate.selected.eventId || `EVT-${approvalCandidate.selected.scenario}`;

  await check('the approval integration flow boots without application errors', (detail) => {
    const app = errors.filter((error) => !/overpass|arcgisonline|elevation-tiles-prod|jsdelivr|unpkg|cdn\./i.test(error));
    detail(app.slice(0, 4));
    return app.length === 0;
  });

  await check('selected approval package remains feasible at driven time', async (detail) => {
    const current = await page.evaluate(() => {
      const snap = FT.hydro.at(FT.state.timeH);
      const pkg = FT.ops.package(snap);
      return {
        t: FT.state.timeH,
        scenario: FT.state.scenario,
        policy: FT.state.policy,
        rainScale: FT.state.rainScale,
        kind: pkg && pkg.kind,
        feasible: pkg && pkg.feasible,
        packageId: pkg && pkg.id,
        eventId: `EVT-${FT.state.scenario}`,
        binding: pkg && pkg.binding && pkg.binding.id,
      };
    });
    detail(current);
    return current.t === approvalCandidate.selected.t &&
      current.scenario === approvalCandidate.selected.scenario &&
      current.policy === approvalCandidate.selected.policy &&
      Math.abs(current.rainScale - approvalCandidate.selected.rainScale) < 0.001 &&
      current.kind === 'PROPOSAL' &&
      current.feasible === true &&
      current.eventId === selectedEventId;
  });

  const rejectProbe = await bootApp(browser, BASE);
  usePage(rejectProbe.page);
  await driveCandidateState(rejectProbe.page, approvalCandidate.selected);
  await signOnRole(rejectProbe.page, ROLE.authority);
  const rejected = await rejectProbe.page.evaluate(async () => {
    const before = FT.releaseOps.snapshot();
    document.getElementById('dpReasonInput').value = 'authority rejects feasible package for rejection semantics test';
    document.getElementById('mpcReject').click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = FT.releaseOps.snapshot();
    const proposal = Object.values(after.proposals).find((item) => item.eventId === after.event.id);
    const rejectAudit = [...FT.ops.audit.entries].reverse().find((entry) => entry.action === 'release.proposal.reject');
    const decisionReject = [...FT.ops.audit.entries].reverse().find((entry) => entry.action === 'decision.reject');
    return {
      beforeProposals: Object.keys(before.proposals).length,
      beforeOrders: Object.keys(before.orders).length,
      afterOrders: Object.keys(after.orders).length,
      proposalStatus: proposal && proposal.status,
      proposalId: proposal && proposal.id,
      rejectedDecisionId: proposal && proposal.rejectedDecisionId,
      rejectAuditAction: rejectAudit && rejectAudit.action,
      rejectAuditProposalId: rejectAudit && rejectAudit.detail && rejectAudit.detail.proposalId,
      decisionRejectAction: decisionReject && decisionReject.action,
    };
  });

  await check('authority rejection records a rejected proposal and creates no order', (detail) => {
    detail(rejected);
    return rejected.beforeProposals === 0 &&
      rejected.beforeOrders === 0 &&
      rejected.afterOrders === 0 &&
      rejected.proposalStatus === 'REJECTED' &&
      /^PRP-/.test(rejected.proposalId || '') &&
      /^DEC-/.test(rejected.rejectedDecisionId || '') &&
      rejected.rejectAuditAction === 'release.proposal.reject' &&
      rejected.rejectAuditProposalId === rejected.proposalId &&
      rejected.decisionRejectAction === 'decision.reject';
  });
  await rejectProbe.ctx.close();
  usePage(page);

  const unscopedRefusal = await page.evaluate(async () => {
    FT.ops.audit.log('decision.refused', {
      actorRole: 'Legacy unscoped role',
      requiredRole: 'Legacy required role',
      package: 'DP-legacy',
    }, 'legacy unscoped refusal');
    FT.ops.audit.log('decision.refused', {
      actorRole: 'Yagi role',
      requiredRole: 'Yagi required role',
      package: 'DP-yagi',
      eventId: 'EVT-yagi',
    }, 'cross event refusal');
    FT.workspaces.navigate('city');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      eventId: FT.releaseOps.snapshot().event.id,
      cityText: document.querySelector('[data-city-readiness]')?.textContent || '',
    };
  });

  await check('City readiness ignores unscoped and cross-event refusal audit entries', (detail) => {
    detail(unscopedRefusal);
    return unscopedRefusal.eventId === selectedEventId &&
      /No approval has been refused in this event|Chưa có phê duyệt nào bị từ chối trong sự kiện này/i.test(unscopedRefusal.cityText) &&
      !/Legacy unscoped role|Yagi role|Most recent refusal|Lần từ chối gần nhất/i.test(unscopedRefusal.cityText);
  });

  const refused = await page.evaluate(async (role) => {
    const before = FT.releaseOps.snapshot();
    const select = document.getElementById('opsActor');
    for (const option of select.options) {
      if (option.value.includes('|' + role)) {
        select.value = option.value;
        select.dispatchEvent(new Event('change'));
        break;
      }
    }
    document.getElementById('dpReasonInput').value = 'reservoir engineer proposes, authority must approve';
    document.getElementById('mpcApprove').click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    FT.workspaces.navigate('city');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = FT.releaseOps.snapshot();
    const refusal = [...FT.ops.audit.entries].reverse().find((entry) => entry.action === 'decision.refused');
    return {
      beforeOrders: Object.keys(before.orders).length,
      afterOrders: Object.keys(after.orders).length,
      refusalAction: refusal && refusal.action,
      refusalEventId: refusal && refusal.detail && refusal.detail.eventId,
      cityText: document.querySelector('[data-city-readiness]')?.textContent || '',
    };
  }, ROLE.resEngineer);

  await check('reservoir engineer approval is refused, visible in City, and creates no order', (detail) => {
    detail(refused);
    return refused.beforeOrders === 0 &&
      refused.afterOrders === 0 &&
      refused.refusalAction === 'decision.refused' &&
      refused.refusalEventId === selectedEventId &&
      /Most recent refusal|no order could be created|Lần từ chối gần nhất|không tạo được lệnh/i.test(refused.cityText);
  });

  await signOnRole(page, ROLE.authority);
  await setTime(page, approvalCandidate.selected.t);
  const approved = await page.evaluate(async () => {
    const pkg = FT.ops && FT.ops._last;
    document.getElementById('dpReasonInput').value = 'authority approves pre flood drawdown for shared workflow';
    document.getElementById('mpcApprove').click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const snap = FT.releaseOps.snapshot();
    const order = Object.values(snap.orders).find((item) => item.eventId === snap.event.id);
    const decision = order && snap.decisions[order.decisionId];
    FT.workspaces.navigate('city');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const cityText = document.querySelector('.cityDashboard')?.textContent || '';
    if (order) {
      FT.workspaces.navigate('plant', { facilityId: order.facilityId });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
    const plantText = document.querySelector('.plantDashboard')?.textContent || '';
    const lastAudit = [...FT.ops.audit.entries].reverse().find((entry) => entry.action === 'decision.approve');
    return {
      pkgKind: pkg && pkg.kind,
      pkgId: pkg && pkg.id,
      pkgFeasible: pkg && pkg.feasible,
      actor: FT.ops.audit.actor,
      lastAudit,
      orderCount: Object.keys(snap.orders).length,
      orderId: order && order.id,
      facilityId: order && order.facilityId,
      commandedCms: order && order.commandedCms,
      decisionActor: decision && decision.actor,
      decisionReason: decision && decision.reason,
      cityText,
      plantText,
      plantTextDigits: plantText.replace(/\D/g, ''),
      locationSearch: location.search,
    };
  });

  await check('authority approval creates the same approved order in City and Plant', (detail) => {
    detail({ orderId: approved.orderId, facilityId: approved.facilityId, locationSearch: approved.locationSearch, approved });
    return /^ORD-/.test(approved.orderId) &&
      /Ban Chỉ huy PCTT&TKCN/.test(approved.decisionActor || '') &&
      /authority approves/.test(approved.decisionReason || '') &&
      approved.cityText.includes(approved.orderId) &&
      approved.plantText.includes(approved.orderId) &&
      approved.plantTextDigits.includes(String(Math.round(approved.commandedCms)));
  });
  if (!/^ORD-/.test(approved.orderId || '') || !approved.facilityId) {
    await ctx.close();
    return;
  }

  await openWorkspace(page, 'plant', approved.facilityId);
  await page.waitForFunction(() =>
    document.body.dataset.workspace === 'plant' &&
    document.querySelectorAll('[data-plant-checklist] input[data-check-key]').length === 8 &&
    document.querySelector('[data-plant-action="start-execution"]'));

  const execution = await page.evaluate(async (approved) => {
    const RO = FT.releaseOps;
    const startBefore = RO.startExecution(approved.orderId);
    const firstFour = RO.CHECKS.slice(0, 4);
    const boxesBefore = [...document.querySelectorAll('[data-plant-checklist] input[data-check-key]')]
      .map((input) => ({ key: input.dataset.checkKey, checked: input.checked, disabled: input.disabled }));
    for (const key of firstFour) {
      const input = document.querySelector(`[data-plant-checklist] input[data-check-key="${key}"]`);
      if (!input) return { missingInput: key, boxesBefore, checks: RO.CHECKS };
      input.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const startButton = document.querySelector('[data-plant-action="start-execution"]');
    const startEnabled = !!startButton && !startButton.disabled;
    startButton.click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const afterStart = RO.snapshot();
    FT.workspaces.navigate('city');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const cityRow = document.querySelector(`[data-city-timeline] [data-process-row][data-facility-id="${approved.facilityId}"]`);
    FT.workspaces.navigate('plant', { facilityId: approved.facilityId });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const closeBefore = document.querySelector('[data-plant-action="close-complete"]');
    const closeBeforeEnabled = closeBefore && !closeBefore.disabled;
    document.querySelector('[data-plant-action="record-actual"]').click();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const later = RO.CHECKS.slice(4);
    for (const key of later) {
      const input = document.querySelector(`[data-plant-checklist] input[data-check-key="${key}"]`);
      input.click();
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const rule = RO.completionRule(approved.orderId);
    const closeAfter = document.querySelector('[data-plant-action="close-complete"]');
    const closeAfterEnabled = closeAfter && !closeAfter.disabled;
    const actual = RO.actualVersusCommanded(approved.orderId);
    return {
      checks: RO.CHECKS,
      boxesBefore,
      startBefore,
      startEnabled,
      afterStartStatus: afterStart.orders[approved.orderId] && afterStart.orders[approved.orderId].status,
      cityState: cityRow && cityRow.dataset.state,
      cityText: cityRow && cityRow.textContent,
      closeBeforeEnabled,
      closeAfterEnabled,
      rule,
      actual,
      plantText: document.querySelector('[data-plant-execution]')?.textContent || '',
    };
  }, approved);

  await check('execution is refused before exact first-four checklist prerequisites, then starts from UI', (detail) => {
    detail({ checks: execution.checks, boxesBefore: execution.boxesBefore, startEnabled: execution.startEnabled, afterStartStatus: execution.afterStartStatus });
    return execution.startBefore === null &&
      execution.checks.join('|') === 'order-valid|notifications-acknowledged|plant-ready|outlet-ready|ramp-started|actual-recorded|downstream-monitored|completion-confirmed' &&
      execution.boxesBefore.length === 8 &&
      execution.boxesBefore.every((box) => box.disabled === false) &&
      execution.startEnabled &&
      execution.afterStartStatus === 'EXECUTING';
  });

  await check('City updates in place to EXECUTING and Plant renders actual-versus-commanded evidence', (detail) => {
    detail({ cityState: execution.cityState, actual: execution.actual, plantText: execution.plantText });
    return execution.cityState === 'EXECUTING' &&
      /Đang thực thi|Executing/.test(execution.cityText || '') &&
      !/\bEXECUTING\b/.test(execution.cityText || '') &&
      Number.isFinite(execution.actual.commandedCms) &&
      Number.isFinite(execution.actual.observedCms) &&
      Number.isFinite(execution.actual.deviationCms) &&
      ['ON_COMMAND', 'DEVIATING'].includes(execution.actual.status) &&
      execution.actual.provenance === 'ASSUMED_FOR_DEMO' &&
      /Tolerance between actual and commanded|Dung sai giữa thực tế và lệnh/i.test(execution.plantText);
  });

  await check('completion gate is explicit and remains locked until actual and later checks are present', (detail) => {
    detail({ closeBeforeEnabled: execution.closeBeforeEnabled, closeAfterEnabled: execution.closeAfterEnabled, rule: execution.rule });
    return execution.closeBeforeEnabled === false &&
      execution.closeAfterEnabled === true &&
      execution.rule.requiresObservedActual === true &&
      execution.rule.requiredChecks.join('|') === 'ramp-started|actual-recorded|downstream-monitored|completion-confirmed' &&
      /Close requires observed actual-versus-commanded evidence/.test(execution.rule.rule);
  });

  await ctx.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const srv = await listen(4310, ROOT);
  BASE = `http://127.0.0.1:${srv.address().port}`;
  console.log(`serving ${ROOT} on ${BASE}`);

  const browser = await launchGpu();
  const t0 = Date.now();
  try {
    await workspaceRouting(browser);
    await workspaceRendererIsolation(browser);
    await workspaceShellYield(browser);
    await governedFacilityRegistry(browser);
    await approvalExecutionIntegration(browser);
    await sharedReleaseWorkflowStore(browser);
  } finally {
    await browser.close();
    srv.close();
  }

  console.log(`\nran ${results.length} checks in ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(report('FloodTwin role workspace contracts') ? 1 : 0);
}
