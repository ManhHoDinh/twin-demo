(function () {
  'use strict';
  const FT = window.FT;
  if (Object.prototype.hasOwnProperty.call(FT, 'facilities')) {
    throw new Error('FT.facilities registry is already initialized');
  }

  const SOURCE_SCOPE = Object.freeze({
    id: 'dn-doit-2026-03-05',
    asOf: '2026-03-05',
    total: 44,
    status: Object.freeze({ operating: 34, construction: 6, investment: 4 }),
  });

  const rows = [
    ['tra-linh-1', 'Trà Linh 1', 'not-generating'],
    ['tak-le', 'Tăk Lê', 'not-generating'],
    ['tra-leng-2', 'Trà Leng 2', 'not-generating'],
    ['a-vuong-5', 'A Vương 5', 'not-generating'],
    ['an-diem-2-expansion', 'An Điềm II (mở rộng)', 'not-generating'],
    ['song-bung-3a', 'Sông Bung 3A', 'not-generating'],
    ['tr-hy', "Tr'Hy", 'not-generating'],
    ['nuoc-che', 'Nước Chè', 'not-generating'],
    ['song-bung-4', 'Sông Bung 4', 'operating'],
    ['song-bung-2', 'Sông Bung 2', 'operating'],
    ['dak-pring', 'Đăk Pring', 'operating'],
    ['tra-linh-3', 'Trà Linh 3', 'operating'],
    ['tra-linh-2', 'Trà Linh 2', 'operating'],
    ['dak-di-1-2', 'Đăk Di 1, 2', 'operating'],
    ['nuoc-bieu', 'Nước Biêu', 'operating'],
    ['nuoc-buou', 'Nước Bươu', 'operating'],
    ['song-con-2', 'Sông Côn 2', 'operating'],
    ['dak-mi-4', 'Đắk Mi 4', 'operating'],
    ['dak-mi-2', 'Đắk Mi 2', 'operating'],
    ['dak-mi-3', 'Đắk Mi 3', 'operating'],
    ['khe-dien', 'Khe Diên', 'operating'],
    ['tam-phuc', 'Tầm Phục', 'operating'],
    ['song-tranh-2', 'Sông Tranh 2', 'operating'],
    ['dak-sa', 'Đăk Sa', 'operating'],
    ['za-hung', 'Za Hung', 'operating'],
    ['song-bung-5', 'Sông Bung 5', 'operating'],
    ['song-bung-6', 'Sông Bung 6', 'operating'],
    ['song-tranh-3', 'Sông Tranh 3', 'operating'],
    ['song-tranh-4', 'Sông Tranh 4', 'operating'],
    ['a-vuong', 'A Vương', 'operating'],
    ['song-bung-4a', 'Sông Bung 4A', 'operating'],
    ['an-diem', 'An Điềm', 'operating'],
    ['ta-vi', 'Tà Vi', 'operating'],
    ['a-vuong-3', 'A Vương 3', 'operating'],
  ];

  const demo = Object.freeze({
    'a-vuong': 'avuong',
    'song-bung-4': 'songbung4',
    'dak-mi-4': 'dakmi4',
    'song-tranh-2': 'songtranh2',
  });

  const DECISION_1865 = Object.freeze({
    id: 'decision-1865-qd-ttg',
    asOf: '2019-12-23',
    names: Object.freeze([
      'A Vương',
      'A Vương 3',
      'Sông Bung 2',
      'Sông Bung 4',
      'Sông Bung 4A',
      'Sông Bung 5',
      'Sông Bung 6',
      'Đăk Pring',
      'Đắk Mi 2',
      'Đắk Mi 3',
      'Đắk Mi 4',
      'Đắk Mi 4A',
      'Khe Diên',
      'Sông Tranh 2',
      'Sông Tranh 3',
      'Sông Tranh 4',
      'Trà Linh 2',
      'Trà Linh 3',
      'An Điềm',
    ]),
  });

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  const facilities = Object.freeze(rows.map(([id, name, inspectionStatus]) => Object.freeze({
    id,
    name,
    entityType: 'HydropowerFacility',
    inspectionStatus,
    evidenceState: 'SOURCE_DATED',
    sourceId: 'dn-inspection-2026-05-06',
    validFrom: '2026-05-06',
    validTo: null,
    demoReservoirId: demo[id] || null,
    operationalDataState: demo[id] ? 'ASSUMED_FOR_DEMO' : 'NOT_IN_CURRENT_DEMO',
  })));

  const byId = new Map(facilities.map((item) => [item.id, item]));
  const byName = new Map(facilities.map((item) => [normalize(item.name), item]));
  const conflicts = Object.freeze({
    'dak-mi-4a': Object.freeze({
      status: 'CONFLICTING_SOURCES',
      facility: null,
      sourceIds: Object.freeze([DECISION_1865.id, SOURCE_SCOPE.id]),
      reason: 'Decision 1865 names Dak Mi 4A, but the municipal source does not resolve it as dak-mi-4.',
    }),
  });

  const API = Object.freeze({
    scope: SOURCE_SCOPE,
    decision1865: DECISION_1865,
    all: () => facilities.slice(),
    get: (id) => byId.get(id) || null,
    coverage: () => Object.freeze({
      total: SOURCE_SCOPE.total,
      named: facilities.length,
      unresolved: SOURCE_SCOPE.total - facilities.length,
      complete: false,
    }),
    decision1865ReservoirNames: () => DECISION_1865.names.slice(),
    resolveName: (name) => {
      const key = normalize(name);
      if (conflicts[key]) return conflicts[key];
      const facility = byId.get(key) || byName.get(key) || null;
      return Object.freeze({ status: facility ? 'MATCHED' : 'UNRESOLVED', facility });
    },
  });

  Object.defineProperty(FT, 'facilities', {
    value: API,
    enumerable: true,
    writable: false,
    configurable: false,
  });
})();
