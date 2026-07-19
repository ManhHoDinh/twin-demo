/* FloodTwin Q1 Demo — data: VGTB geography (REAL lon/lat), scenarios, network, corpus
   All positions are real-world coordinates converted to km via FT.LL(lon, lat)
   over the geo.js bbox (107.55–108.45°E, 15.30–16.16°N ≈ 96 km domain).
   Hydraulic parameters remain synthetic-but-plausible; clearly labelled demo data. */
(function () {
  "use strict";
  const FT = window.FT;
  const LL = FT.LL;

  const DOMAIN = { sizeKm: FT.geo.SZ, N: 144, cellKm: FT.geo.SZ / 144, seaLevel: 0 };

  /* ---------- scenarios (unchanged hydrology shapes) ---------- */
  const SCENARIOS = {
    oct2020: {
      key: "scenario.oct2020",
      anchor: { y: 2020, m: 10, d: 11, h: 7 },
      seed: 20201011,
      pulses: [
        { t0: -18, dur: 10, peak: 18 },
        { t0: 2, dur: 9, peak: 62 },
        { t0: 12, dur: 12, peak: 88 },
        { t0: 30, dur: 10, peak: 24 },
      ],
      inflowGain: 1.0,
      surgeGain: 1.0,
      stormName: "Linfa–Nangka (10/2020)",
    },
    yagi: {
      key: "scenario.yagi",
      anchor: { y: 2024, m: 9, d: 7, h: 13 },
      seed: 20240907,
      pulses: [
        { t0: -14, dur: 8, peak: 30 },
        { t0: 0, dur: 8, peak: 90 },
        { t0: 9, dur: 10, peak: 128 },
        { t0: 22, dur: 12, peak: 55 },
      ],
      inflowGain: 1.35,
      surgeGain: 1.25,
      stormName: "Yagi-class (worst credible)",
    },
    monsoon: {
      key: "scenario.monsoon",
      anchor: { y: 2025, m: 11, d: 3, h: 7 },
      seed: 20251103,
      pulses: [
        { t0: -20, dur: 14, peak: 12 },
        { t0: 4, dur: 14, peak: 34 },
        { t0: 26, dur: 12, peak: 18 },
      ],
      inflowGain: 0.55,
      surgeGain: 0.6,
      stormName: "NE monsoon surge",
    },
  };

  /* ---------- reservoir cascade (REAL dam positions) ---------- */
  const RESERVOIRS = [
    { id: "avuong", name: "A Vương", ll: LL(107.59, 15.805), dead: 340, ceil: 376, fsl: 380, capM: 344, deadM: 74, turbine: 78, spillMax: 3400, lagH: 3.0, catch: 0.9, river: "avuong" },
    { id: "songbung4", name: "Sông Bung 4", ll: LL(107.68, 15.745), dead: 205, ceil: 217.5, fsl: 222.5, capM: 510, deadM: 110, turbine: 166, spillMax: 5800, lagH: 3.5, catch: 1.25, river: "vugia" },
    { id: "dakmi4", name: "Đắk Mi 4", ll: LL(107.79, 15.44), dead: 240, ceil: 255, fsl: 258, capM: 312, deadM: 66, turbine: 128, spillMax: 4200, lagH: 4.0, catch: 1.05, river: "dakmi" },
    { id: "songtranh2", name: "Sông Tranh 2", ll: LL(108.12, 15.345), dead: 140, ceil: 172, fsl: 175, capM: 730, deadM: 190, turbine: 110, spillMax: 6500, lagH: 4.5, catch: 1.4, river: "thubon" },
  ].map((r) => ({ ...r, x: r.ll[0], y: r.ll[1] }));

  /* ---------- rivers (REAL courses, upstream → mouth) ---------- */
  const mkRiver = (id, name, w, depth, lls) => ({ id, name, w, depth, pts: lls.map((p) => LL(p[0], p[1])) });
  const RIVERS = [
    mkRiver("avuong", "Sông A Vương", 0.5, 6, [[107.59, 15.805], [107.66, 15.79], [107.73, 15.775], [107.79, 15.765]]),
    mkRiver("dakmi", "Sông Đắk Mi (Cái)", 0.55, 6, [[107.79, 15.44], [107.845, 15.53], [107.86, 15.63], [107.85, 15.72], [107.835, 15.755]]),
    mkRiver("vugia", "Sông Vu Gia", 0.9, 8,
      [[107.68, 15.745], [107.755, 15.755], [107.83, 15.765], [107.895, 15.79], [107.95, 15.815], [108.025, 15.85], [108.105, 15.882], [108.145, 15.875]]),
    mkRiver("yen", "Sông Yên → Hàn", 0.75, 7, [[108.145, 15.875], [108.17, 15.915], [108.19, 15.965], [108.20, 16.005], [108.215, 16.05], [108.225, 16.09]]),
    mkRiver("quanghue", "Sông Quảng Huế", 0.45, 5, [[108.13, 15.868], [108.132, 15.845], [108.135, 15.822]]),
    mkRiver("thubon", "Sông Thu Bồn", 1.0, 8,
      [[108.12, 15.345], [108.095, 15.46], [108.105, 15.58], [108.10, 15.68], [108.135, 15.785], [108.17, 15.82], [108.21, 15.845], [108.262, 15.858], [108.31, 15.872], [108.375, 15.878]]),
    mkRiver("vinhdien", "Sông Vĩnh Điện", 0.4, 4, [[108.25, 15.90], [108.245, 15.955], [108.235, 16.00], [108.22, 16.035]]),
  ];
  const DIVERSION = { from: LL(107.79, 15.44), to: LL(108.05, 15.44), name: "Tuyến năng lượng Đắk Mi 4 → Thu Bồn" };

  /* ---------- gauges (REAL stations; BĐ levels are the real alert stages) ---------- */
  const GAUGES = [
    { id: "aiNghia", name: "Ái Nghĩa", river: "Vu Gia", ll: LL(108.105, 15.882), bd: [6.5, 8.0, 9.0], base: 3.2, max: 11.5, resW: { avuong: 0.32, songbung4: 0.42, dakmi4: 0.18, songtranh2: 0 }, localGain: 1.6, lagH: 2.5 },
    { id: "cauLau", name: "Câu Lâu", river: "Thu Bồn", ll: LL(108.262, 15.858), bd: [2.0, 3.0, 4.0], base: 0.7, max: 5.6, resW: { avuong: 0.05, songbung4: 0.08, dakmi4: 0.12, songtranh2: 0.5 }, localGain: 0.8, lagH: 3.5 },
    { id: "giaoThuy", name: "Giao Thủy", river: "Thu Bồn", ll: LL(108.135, 15.788), bd: [6.2, 7.7, 8.8], base: 2.6, max: 10.8, resW: { avuong: 0, songbung4: 0.05, dakmi4: 0.2, songtranh2: 0.62 }, localGain: 1.8, lagH: 2.8 },
    { id: "camLe", name: "Cẩm Lệ", river: "Sông Hàn", ll: LL(108.20, 16.005), bd: [1.0, 1.7, 2.5], base: 0.4, max: 3.4, resW: { avuong: 0.22, songbung4: 0.28, dakmi4: 0.1, songtranh2: 0 }, localGain: 0.5, lagH: 4.0 },
  ].map((g) => ({ ...g, x: g.ll[0], y: g.ll[1] }));

  /* ---------- cities / population clusters (REAL positions) ---------- */
  const CITIES = [
    { id: "danang", name: "Đà Nẵng", ll: LL(108.21, 16.06), size: 3.6, pop: 1100000 },
    { id: "hoian", name: "Hội An", ll: LL(108.328, 15.878), size: 1.9, pop: 120000 },
    { id: "vinhdien", name: "Vĩnh Điện", ll: LL(108.248, 15.92), size: 1.3, pop: 45000 },
    { id: "namphuoc", name: "Nam Phước", ll: LL(108.258, 15.838), size: 1.2, pop: 38000 },
    { id: "aiNghiaT", name: "Ái Nghĩa (Đại Lộc)", ll: LL(108.10, 15.888), size: 1.1, pop: 32000 },
    { id: "thanhmy", name: "Thạnh Mỹ", ll: LL(107.83, 15.765), size: 0.8, pop: 12000 },
    { id: "hiepduc", name: "Hiệp Đức", ll: LL(108.105, 15.58), size: 0.7, pop: 10000 },
    { id: "duyxuyen", name: "Duy Xuyên", ll: LL(108.22, 15.80), size: 0.9, pop: 26000 },
  ].map((c) => ({ ...c, x: c.ll[0], y: c.ll[1] }));

  /* ---------- road network (REAL alignments, same topology/ids as before) ---------- */
  const NODE_LL = {
    n_ql1_n: [108.135, 16.14], dn_s: [108.21, 16.03], hoaphuoc: [108.225, 15.955],
    vinhdien: [108.248, 15.92], caulau_b: [108.262, 15.862], namphuoc: [108.258, 15.838],
    ql1_s1: [108.20, 15.70], ql1_s: [108.155, 15.56],
    ct_n: [108.185, 16.01], ct_1: [108.165, 15.90], ct_2: [108.145, 15.79], ct_3: [108.125, 15.67], ct_s: [108.10, 15.55],
    dn_w: [108.17, 16.02], tuyloan: [108.12, 15.975], aiNghia: [108.10, 15.885],
    hanha: [107.95, 15.815], thanhmy: [107.83, 15.765],
    hcm_1: [107.81, 15.62], hcm_2: [107.80, 15.50], hcm_s: [107.90, 15.43],
    dn_e: [108.245, 16.05], coast_1: [108.28, 15.975], coast_2: [108.305, 15.925], hoian: [108.328, 15.878],
    dt608m: [108.29, 15.895], cuadai: [108.37, 15.868],
    duyxuyen: [108.22, 15.798], myson: [108.12, 15.765], giaothuy_b: [108.14, 15.782],
    dt611m: [108.145, 15.66], hiepduc: [108.105, 15.58],
  };
  const ROAD_NODES = {};
  for (const [id, ll] of Object.entries(NODE_LL)) { const p = LL(ll[0], ll[1]); ROAD_NODES[id] = { x: p[0], y: p[1] }; }

  const ROAD_EDGES = [
    { a: "n_ql1_n", b: "dn_s", name: "QL1A · Hải Vân–ĐN", type: "hw", via: [[108.152, 16.098], [108.177, 16.062]] },
    { a: "dn_s", b: "hoaphuoc", name: "QL1A · Hòa Phước", type: "hw" },
    { a: "hoaphuoc", b: "vinhdien", name: "QL1A · Điện Bàn", type: "hw" },
    { a: "vinhdien", b: "caulau_b", name: "QL1A · cầu Câu Lâu", type: "hw", bridge: true },
    { a: "caulau_b", b: "namphuoc", name: "QL1A · Nam Phước", type: "hw" },
    { a: "namphuoc", b: "ql1_s1", name: "QL1A · Quế Sơn", type: "hw", via: [[108.236, 15.772]] },
    { a: "ql1_s1", b: "ql1_s", name: "QL1A · Nam", type: "hw" },
    { a: "ct_n", b: "ct_1", name: "CT ĐN–QN · đoạn 1", type: "exp" },
    { a: "ct_1", b: "ct_2", name: "CT ĐN–QN · đoạn 2", type: "exp" },
    { a: "ct_2", b: "ct_3", name: "CT ĐN–QN · đoạn 3", type: "exp" },
    { a: "ct_3", b: "ct_s", name: "CT ĐN–QN · đoạn 4", type: "exp" },
    { a: "dn_s", b: "ct_n", name: "Nhánh nối CT bắc", type: "prov" },
    { a: "ct_1", b: "hoaphuoc", name: "Nhánh nối Hòa Phước", type: "prov" },
    { a: "ct_2", b: "vinhdien", name: "Nhánh nối Điện Bàn", type: "prov" },
    { a: "ct_3", b: "ql1_s1", name: "Nhánh nối Quế Sơn", type: "prov" },
    { a: "dn_w", b: "dn_s", name: "Vành đai ĐN tây", type: "urban" },
    { a: "dn_w", b: "tuyloan", name: "QL14B · Túy Loan", type: "hw", via: [[108.152, 16.003], [108.135, 15.988]] },
    { a: "tuyloan", b: "aiNghia", name: "QL14B · Đại Hiệp", type: "hw", via: [[108.113, 15.942], [108.104, 15.912]] },
    { a: "aiNghia", b: "hanha", name: "QL14B · Hà Nha", type: "hw", via: [[108.052, 15.868], [108.001, 15.838]] },
    { a: "hanha", b: "thanhmy", name: "QL14B · Thạnh Mỹ", type: "hw", via: [[107.905, 15.792]] },
    { a: "thanhmy", b: "hcm_1", name: "Đường HCM · B1", type: "hw" },
    { a: "hcm_1", b: "hcm_2", name: "Đường HCM · B2", type: "hw" },
    { a: "hcm_2", b: "hcm_s", name: "Đường HCM · B3", type: "hw" },
    { a: "hcm_s", b: "hiepduc", name: "ĐT nối Hiệp Đức", type: "prov" },
    { a: "dn_s", b: "dn_e", name: "Cầu sông Hàn khu Đông", type: "urban", bridge: true },
    { a: "dn_e", b: "coast_1", name: "ĐT603 ven biển", type: "prov", via: [[108.268, 16.018]] },
    { a: "coast_1", b: "coast_2", name: "ĐT603 · Điện Ngọc", type: "prov" },
    { a: "coast_2", b: "hoian", name: "ĐT603 · Hội An", type: "prov" },
    { a: "vinhdien", b: "dt608m", name: "ĐT608 · Thanh Hà", type: "prov" },
    { a: "dt608m", b: "hoian", name: "ĐT608 · Hội An", type: "prov" },
    { a: "hoian", b: "cuadai", name: "Đường Cửa Đại", type: "urban", bridge: true },
    { a: "aiNghia", b: "vinhdien", name: "ĐT609 · bờ bắc Vu Gia", type: "prov" },
    { a: "namphuoc", b: "duyxuyen", name: "ĐT610 · Duy Xuyên", type: "prov" },
    { a: "duyxuyen", b: "myson", name: "ĐT610 · Mỹ Sơn", type: "prov" },
    { a: "myson", b: "giaothuy_b", name: "Cầu Giao Thủy", type: "prov", bridge: true },
    { a: "giaothuy_b", b: "aiNghia", name: "ĐT609B · Đại Lộc", type: "prov" },
    { a: "ql1_s1", b: "dt611m", name: "ĐT611 · Quế Sơn", type: "prov" },
    { a: "dt611m", b: "hiepduc", name: "ĐT611 · Hiệp Đức", type: "prov" },
  ];
  const ROAD_SPEED = { hw: 60, exp: 90, prov: 45, urban: 35 };

  const TRAFFIC_HUBS = [
    { node: "dn_s", w: 4 }, { node: "dn_e", w: 2.5 }, { node: "hoian", w: 2.5 },
    { node: "vinhdien", w: 1.6 }, { node: "namphuoc", w: 1.4 }, { node: "aiNghia", w: 1.4 },
    { node: "thanhmy", w: 0.8 }, { node: "hiepduc", w: 0.6 }, { node: "n_ql1_n", w: 1.8 }, { node: "ql1_s", w: 1.6 },
    { node: "duyxuyen", w: 0.9 }, { node: "cuadai", w: 0.7 },
  ];
  const MAIN_ROUTE = { from: "dn_s", to: "hoian", label: "ĐN → Hội An" };

  /* ---------- gazetteer: real districts, bridges & landmarks (labels 2D+3D) ----------
     kind: dist (quận/huyện) · bridge (cầu thật) · lm (địa danh) — tier 1 hiện sớm, tier 2 khi zoom gần */
  const PLACES = [
    { n: "Q. Hải Châu", k: "dist", t: 1, ll: [108.212, 16.047] },
    { n: "Q. Thanh Khê", k: "dist", t: 1, ll: [108.187, 16.064] },
    { n: "Q. Sơn Trà", k: "dist", t: 1, ll: [108.244, 16.083] },
    { n: "Q. Ngũ Hành Sơn", k: "dist", t: 1, ll: [108.251, 16.008] },
    { n: "Q. Cẩm Lệ", k: "dist", t: 1, ll: [108.193, 16.008] },
    { n: "Q. Liên Chiểu", k: "dist", t: 1, ll: [108.135, 16.09] },
    { n: "H. Hòa Vang", k: "dist", t: 1, ll: [108.088, 16.02] },
    { n: "TX Điện Bàn", k: "dist", t: 1, ll: [108.22, 15.90] },
    { n: "H. Đại Lộc", k: "dist", t: 1, ll: [108.02, 15.862] },
    { n: "H. Duy Xuyên", k: "dist", t: 1, ll: [108.17, 15.788] },
    { n: "H. Quế Sơn", k: "dist", t: 1, ll: [108.13, 15.678] },
    { n: "H. Nông Sơn", k: "dist", t: 1, ll: [108.018, 15.70] },
    { n: "H. Nam Giang", k: "dist", t: 1, ll: [107.79, 15.68] },
    { n: "H. Hiệp Đức", k: "dist", t: 1, ll: [108.088, 15.565] },
    { n: "Cầu Thuận Phước", k: "bridge", t: 2, ll: [108.2226, 16.0937] },
    { n: "Cầu Sông Hàn", k: "bridge", t: 2, ll: [108.2273, 16.0721] },
    { n: "Cầu Rồng", k: "bridge", t: 2, ll: [108.2266, 16.0612] },
    { n: "Cầu Trần Thị Lý", k: "bridge", t: 2, ll: [108.2255, 16.0505] },
    { n: "Cầu Tiên Sơn", k: "bridge", t: 2, ll: [108.2296, 16.0364] },
    { n: "Cầu Cẩm Lệ", k: "bridge", t: 2, ll: [108.2004, 16.0069] },
    { n: "Cầu Cửa Đại", k: "bridge", t: 2, ll: [108.3706, 15.8776] },
    { n: "Cầu Câu Lâu", k: "bridge", t: 2, ll: [108.262, 15.862] },
    { n: "Cầu Giao Thủy", k: "bridge", t: 2, ll: [108.14, 15.782] },
    { n: "Cầu Hà Nha", k: "bridge", t: 2, ll: [107.952, 15.816] },
    { n: "Cầu Ái Nghĩa", k: "bridge", t: 2, ll: [108.108, 15.88] },
    { n: "Sân bay Đà Nẵng", k: "lm", t: 2, ll: [108.201, 16.044] },
    { n: "Bán đảo Sơn Trà", k: "lm", t: 1, ll: [108.30, 16.115] },
    { n: "Ngũ Hành Sơn", k: "lm", t: 2, ll: [108.263, 16.004] },
    { n: "Bà Nà", k: "lm", t: 1, ll: [107.996, 15.995] },
    { n: "Phố cổ Hội An", k: "lm", t: 2, ll: [108.327, 15.877] },
    { n: "Thánh địa Mỹ Sơn", k: "lm", t: 2, ll: [108.124, 15.764] },
    { n: "Cửa Đại", k: "lm", t: 2, ll: [108.39, 15.885] },
    { n: "Hòn Kẽm Đá Dừng", k: "lm", t: 2, ll: [108.03, 15.677] },
  ].map((p) => { const q = LL(p.ll[0], p.ll[1]); return { ...p, x: q[0], y: q[1] }; });

  /* ---------- monitored zones (REAL centres) ---------- */
  const ZONES = [
    { id: "z_ainghia", name: "TT Ái Nghĩa (Đại Lộc)", ll: LL(108.10, 15.885), r: 2.2, pop: 32000, node: "aiNghia", pois: [{ n: "BV Đại Lộc", t: "hosp", ll: LL(108.095, 15.892) }, { n: "Cầu Ái Nghĩa", t: "bridge", ll: LL(108.108, 15.88) }] },
    { id: "z_vinhdien", name: "Vĩnh Điện (Điện Bàn)", ll: LL(108.248, 15.92), r: 2.4, pop: 45000, node: "vinhdien", pois: [{ n: "BV Điện Bàn", t: "hosp", ll: LL(108.252, 15.915) }, { n: "Nút QL1–ĐT609", t: "road", ll: LL(108.248, 15.923) }] },
    { id: "z_hoian", name: "Hội An – phố cổ", ll: LL(108.328, 15.878), r: 2.0, pop: 60000, node: "hoian", pois: [{ n: "Chùa Cầu (di sản)", t: "herit", ll: LL(108.326, 15.877) }, { n: "Chợ Hội An", t: "market", ll: LL(108.332, 15.877) }] },
    { id: "z_cuadai", name: "Cẩm Kim – Cửa Đại", ll: LL(108.37, 15.868), r: 2.2, pop: 25000, node: "cuadai", pois: [{ n: "Cầu Cửa Đại", t: "bridge", ll: LL(108.368, 15.87) }] },
    { id: "z_namphuoc", name: "Nam Phước (Duy Xuyên)", ll: LL(108.258, 15.838), r: 2.2, pop: 38000, node: "namphuoc", pois: [{ n: "Cầu Câu Lâu (QL1)", t: "bridge", ll: LL(108.262, 15.862) }] },
    { id: "z_camle", name: "Cẩm Lệ – Hòa Xuân", ll: LL(108.205, 15.995), r: 2.6, pop: 110000, node: "hoaphuoc", pois: [{ n: "BV Cẩm Lệ", t: "hosp", ll: LL(108.21, 15.99) }, { n: "Trường THPT Hòa Xuân", t: "school", ll: LL(108.20, 16.0) }] },
    { id: "z_danang", name: "Đà Nẵng – trung tâm", ll: LL(108.20, 16.055), r: 3.2, pop: 400000, node: "dn_s", pois: [{ n: "BV Đà Nẵng", t: "hosp", ll: LL(108.208, 16.052) }, { n: "EOC PCTT", t: "eoc", ll: LL(108.195, 16.06) }] },
    { id: "z_hanha", name: "Đại Hồng – Hà Nha", ll: LL(107.95, 15.82), r: 2.2, pop: 15000, node: "hanha", pois: [{ n: "Cầu Hà Nha", t: "bridge", ll: LL(107.95, 15.817) }] },
    { id: "z_giaothuy", name: "Giao Thủy – Đại An", ll: LL(108.14, 15.79), r: 2.2, pop: 14000, node: "giaothuy_b", pois: [{ n: "Cầu Giao Thủy", t: "bridge", ll: LL(108.14, 15.783) }] },
    { id: "z_duyxuyen", name: "Duy Xuyên – Mỹ Sơn", ll: LL(108.21, 15.798), r: 2.2, pop: 26000, node: "duyxuyen", pois: [{ n: "Trường THCS Duy Xuyên", t: "school", ll: LL(108.215, 15.80) }] },
    { id: "z_thanhmy", name: "Thạnh Mỹ (Nam Giang)", ll: LL(107.83, 15.765), r: 2.0, pop: 12000, node: "thanhmy", pois: [{ n: "Trạm điều hành QL14B", t: "road", ll: LL(107.832, 15.767) }] },
    { id: "z_hiepduc", name: "Hiệp Đức", ll: LL(108.105, 15.58), r: 2.0, pop: 10000, node: "hiepduc", pois: [{ n: "BV Hiệp Đức", t: "hosp", ll: LL(108.108, 15.578) }] },
  ].map((z) => ({ ...z, x: z.ll[0], y: z.ll[1], pois: z.pois.map((p) => ({ ...p, x: p.ll[0], y: p.ll[1] })) }));
  const EOC_NODE = "dn_s";

  /* ---------- bounded-LLM citation corpus (mock RAG sources) ---------- */
  const CORPUS = {
    d1865_a7: { id: "QĐ 1865/QĐ-TTg · Điều 7", text_vi: "Trong mùa lũ, mực nước hồ không vượt mực nước trước lũ; khi dự báo lũ lớn, chủ hồ hạ dần mực nước để đón lũ theo lệnh Ban chỉ huy PCTT&TKCN tỉnh.", text_en: "During flood season reservoir stage shall not exceed the pre-flood ceiling; when a major flood is forecast the operator shall draw the reservoir down to receive it, under provincial flood-control command." },
    d1865_a8: { id: "QĐ 1865/QĐ-TTg · Điều 8", text_vi: "Vận hành giảm lũ cho hạ du phải giữ mực nước tại trạm Ái Nghĩa và Câu Lâu không vượt báo động 3 trong khả năng cắt lũ của hồ.", text_en: "Flood-mitigation operation shall keep Ai Nghia and Cau Lau gauges below alert level 3 within the cascade's cut-flood capability." },
    nchmf: { id: "NCHMF · bản tin 18:00", text_vi: "Bản tin dự báo thủy văn NCHMF phát 18:00 — lũ các sông từ Quảng Bình đến Quảng Ngãi lên nhanh trong 24–48 giờ tới.", text_en: "NCHMF 18:00 hydrological bulletin — rivers from Quang Binh to Quang Ngai rising rapidly over the next 24–48 h." },
    gencast: { id: "GenCast 50-member · 06Z", text_vi: "Ensemble GenCast 50 thành viên chu kỳ 06Z, hiệu chỉnh IMERG; CRPS 24h = 0,42.", text_en: "GenCast 50-member ensemble, 06Z cycle, IMERG bias-corrected; 24-h CRPS = 0.42." },
    surrogate: { id: "FNO surrogate · v2.3", text_vi: "Bộ giải thay thế FNO v2.3 — 42 ms/bước lưới 144², CSI 0,84 so với HEC-RAS-2D.", text_en: "FNO surrogate v2.3 — 42 ms per 144² step, CSI 0.84 vs HEC-RAS-2D reference." },
    sensor: { id: "SCADA hồ · realtime", text_vi: "Trạng thái SCADA: mực hồ, độ mở cửa van, lưu lượng xả cập nhật 5 phút/lần.", text_en: "Reservoir SCADA state: stage, gate opening and discharge refreshed every 5 minutes." },
    dem: { id: "Copernicus GLO-30 / SRTM", text_vi: "Địa hình hiển thị lấy từ DEM toàn cầu (AWS Terrain Tiles) và ảnh Esri World Imagery cho đúng lưu vực VGTB.", text_en: "Displayed terrain comes from a global DEM (AWS Terrain Tiles) with Esri World Imagery for the actual VGTB basin." },
  };

  const TARGETS = { csi: 0.80, nse: 0.80, kge: 0.75, grounded: 0.95, dtPeakH: 3 };

  FT.data = { DOMAIN, SCENARIOS, RESERVOIRS, RIVERS, DIVERSION, GAUGES, CITIES, PLACES, ROAD_NODES, ROAD_EDGES, ROAD_SPEED, TRAFFIC_HUBS, MAIN_ROUTE, ZONES, EOC_NODE, CORPUS, TARGETS };
})();
