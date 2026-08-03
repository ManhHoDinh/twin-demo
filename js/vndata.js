/* FloodTwin Q1 Demo — vndata: national-scale Vietnam geometry & hydropower fleet
   Coordinates: [lon, lat] degrees. Scene mapping: x = (lon−102)·111·cos(16°) km/°,
   z = (23.6−lat)·111 km/° (north up). All specs approximate, labelled synthetic. */
(function () {
  "use strict";
  const FT = window.FT;

  /* ---------- outline: coast (Móng Cái → Cà Mau → Hà Tiên) then land border back north ---------- */
  const COAST = [
    [108.05, 21.54], [107.8, 21.35], [107.55, 21.2], [107.35, 21.05], [107.1, 20.95], [106.9, 20.92],
    [106.75, 20.85], [106.62, 20.68], [106.55, 20.55], [106.5, 20.25], [106.32, 20.1],
    [106.15, 19.95], [105.95, 19.75], [105.82, 19.4], [105.75, 19.05], [105.72, 18.65], [105.9, 18.35],
    [106.1, 18.1], [106.3, 17.9], [106.5, 17.7], [106.75, 17.4], [107.05, 17.05], [107.25, 16.85],
    [107.55, 16.6], [107.85, 16.35], [108.12, 16.2], [108.32, 16.12], [108.22, 16.05], [108.25, 15.95],
    [108.38, 15.7], [108.5, 15.45], [108.68, 15.28], [108.8, 15.1], [108.95, 14.8],
    [109.05, 14.55], [109.15, 14.15], [109.25, 13.75], [109.32, 13.4], [109.35, 13.1], [109.28, 12.85],
    [109.25, 12.6], [109.14, 12.42], [109.2, 12.25], [109.1, 12.1], [109.0, 11.9], [108.98, 11.55],
    [108.75, 11.3], [108.5, 11.15], [108.28, 11.02], [108.1, 10.93], [107.8, 10.72], [107.55, 10.6],
    [107.25, 10.42], [107.08, 10.35], [106.9, 10.28], [106.8, 10.15], [106.6, 9.75], [106.4, 9.65],
    [106.2, 9.55], [105.98, 9.3], [105.75, 9.0], [105.4, 8.75], [105.1, 8.65], [104.8, 8.62],
    [104.85, 9.2], [104.95, 9.8], [105.1, 10.0], [104.75, 10.22], [104.46, 10.42],
  ];
  const BORDER = [
    [104.46, 10.42], [105.05, 10.9], [105.35, 10.85], [105.85, 11.65], [106.4, 11.7], [106.45, 12.0],
    [107.35, 12.35], [107.6, 13.0], [107.35, 13.6], [107.35, 14.4], [107.55, 15.15], [107.15, 15.8],
    [107.35, 16.05], [106.65, 16.9], [106.25, 17.25], [105.6, 17.8], [105.1, 18.4], [103.9, 19.3],
    [104.45, 19.65], [104.85, 19.8], [104.4, 20.4], [103.65, 20.65], [103.15, 20.85], [102.65, 21.3],
    [102.15, 21.35], [102.5, 21.7], [102.85, 21.9], [103.3, 22.75], [103.95, 22.5], [104.55, 22.85],
    [104.85, 23.15], [105.35, 23.35], [105.9, 23.0], [106.75, 22.8], [107.1, 22.4], [107.55, 21.6],
    [108.05, 21.54],
  ];

  /* ---------- mountain ridges: gaussian-tube [lon,lat,peak elev m, radius °] ---------- */
  const RIDGES = [
    { pts: [[103.3, 22.7], [103.8, 22.3], [104.2, 21.9]], h: 2900, r: 0.55 },       // Hoàng Liên Sơn
    { pts: [[102.5, 21.6], [103.2, 21.2], [103.9, 20.9]], h: 1600, r: 0.6 },        // Tây Bắc
    { pts: [[105.3, 22.9], [106.1, 22.5], [107.0, 21.9]], h: 1100, r: 0.6 },        // Đông Bắc arc
    { pts: [[104.2, 19.6], [104.9, 19.0], [105.4, 18.4]], h: 1800, r: 0.5 },        // Pu Mát / Tây Nghệ An
    { pts: [[105.7, 17.9], [106.3, 17.2], [106.9, 16.6]], h: 1400, r: 0.42 },       // Trường Sơn Bắc
    { pts: [[107.1, 16.3], [107.5, 15.7], [107.7, 15.1]], h: 1700, r: 0.5 },        // Bạch Mã–Ngọc Linh N
    { pts: [[107.7, 15.1], [108.1, 14.4], [108.35, 13.7]], h: 1500, r: 0.55 },      // Ngọc Linh–Kon Tum
    { pts: [[108.3, 13.2], [108.6, 12.4], [108.5, 11.9]], h: 1600, r: 0.6 },        // Đà Lạt plateau rim
  ];
  const PLATEAUS = [
    { c: [107.9, 13.9], r: 0.9, h: 650 },                                            // Kon Tum–Gia Lai
    { c: [108.1, 12.7], r: 0.9, h: 550 },                                            // Đắk Lắk
    { c: [108.35, 11.95], r: 0.55, h: 1100 },                                        // Lâm Viên
  ];

  /* ---------- major river systems (upstream → mouth). flowKey groups a routed chain ---------- */
  const NRIVERS = [
    { id: "da", name: "Sông Đà", pts: [[102.6, 22.4], [103.0, 22.06], [103.4, 21.7], [103.75, 21.33], [104.5, 21.1], [105.32, 20.82], [105.45, 21.15]] },
    { id: "thao", name: "Sông Hồng (Thao)", pts: [[103.85, 22.5], [104.4, 22.15], [104.85, 21.85], [105.4, 21.32], [105.85, 21.02], [106.2, 20.6], [106.5, 20.26]] },
    { id: "logam", name: "Sông Lô-Gâm", pts: [[104.98, 22.83], [105.25, 22.5], [105.4, 22.36], [105.3, 21.9], [105.42, 21.35]] },
    { id: "chay", name: "Sông Chảy", pts: [[104.3, 22.6], [104.7, 22.15], [104.97, 21.76], [105.2, 21.5]] },
    { id: "ma", name: "Sông Mã", pts: [[103.7, 20.6], [104.3, 20.5], [104.85, 20.45], [105.4, 20.1], [105.9, 19.78]] },
    { id: "ca", name: "Sông Cả", pts: [[103.95, 19.32], [104.45, 19.32], [104.9, 19.1], [105.35, 18.85], [105.72, 18.68]] },
    { id: "huong", name: "Sông Hương", pts: [[107.25, 16.15], [107.45, 16.32], [107.58, 16.47], [107.62, 16.57]] },
    { id: "vgtb", name: "Vu Gia-Thu Bồn", pts: [[107.65, 15.65], [107.85, 15.75], [108.0, 15.85], [108.25, 15.9], [108.35, 15.88]], drill: true },
    { id: "trakhuc", name: "Sông Trà Khúc", pts: [[108.35, 14.95], [108.55, 15.05], [108.8, 15.12]] },
    { id: "ba", name: "Sông Ba", pts: [[108.35, 14.35], [108.65, 13.95], [108.6, 13.4], [108.75, 13.05], [109.1, 13.05], [109.32, 13.08]] },
    { id: "sesan", name: "Sê San", pts: [[108.0, 14.6], [107.85, 14.45], [107.75, 14.22], [107.6, 14.1], [107.5, 13.95], [107.35, 13.95]] },
    { id: "srepok", name: "Srêpốk", pts: [[108.35, 12.35], [108.05, 12.45], [107.9, 12.5], [107.65, 12.65], [107.4, 12.8]] },
    { id: "dongnai", name: "Đồng Nai", pts: [[108.45, 11.95], [108.1, 11.9], [107.9, 11.85], [107.5, 11.4], [107.0, 11.1], [106.8, 10.95], [106.72, 10.78], [107.0, 10.45]] },
    { id: "tien", name: "Sông Tiền", pts: [[105.2, 10.85], [105.85, 10.6], [106.35, 10.35], [106.7, 10.25], [106.85, 10.1]] },
    { id: "hau", name: "Sông Hậu", pts: [[105.1, 10.7], [105.45, 10.4], [105.78, 10.03], [106.1, 9.75], [106.3, 9.55]] },
    { id: "gianh", name: "Sông Gianh", pts: [[105.85, 17.85], [106.15, 17.75], [106.45, 17.72]] },
    { id: "thachhan", name: "Thạch Hãn", pts: [[106.85, 16.55], [107.05, 16.7], [107.25, 16.85]] },
    { id: "cainhatrang", name: "Sông Cái Nha Trang", pts: [[108.85, 12.35], [109.0, 12.3], [109.19, 12.26]] },
  ];

  /* ---------- hydropower / multipurpose reservoirs (order = cascade position) ---------- */
  const NRES = [
    { id: "laichau", name: "Lai Châu", river: "da", ord: 0, ll: [103.0, 22.06], capM: 1215, mw: 1200, region: "taybac" },
    { id: "sonla", name: "Sơn La", river: "da", ord: 1, ll: [103.75, 21.33], capM: 9260, mw: 2400, region: "taybac" },
    { id: "hoabinh", name: "Hòa Bình", river: "da", ord: 2, ll: [105.32, 20.82], capM: 9450, mw: 1920, region: "taybac" },
    { id: "tuyenquang", name: "Tuyên Quang", river: "logam", ord: 0, ll: [105.4, 22.36], capM: 2245, mw: 342, region: "dongbac" },
    { id: "thacba", name: "Thác Bà", river: "chay", ord: 0, ll: [104.97, 21.76], capM: 2940, mw: 120, region: "dongbac" },
    { id: "trungson", name: "Trung Sơn", river: "ma", ord: 0, ll: [104.85, 20.45], capM: 348, mw: 260, region: "bactrungbo" },
    { id: "banve", name: "Bản Vẽ", river: "ca", ord: 0, ll: [104.45, 19.32], capM: 1834, mw: 320, region: "bactrungbo" },
    { id: "binhdien", name: "Bình Điền", river: "huong", ord: 0, ll: [107.35, 16.25], capM: 423, mw: 44, region: "trungtrungbo" },
    { id: "avuong_n", name: "A Vương", river: "vgtb", ord: 0, ll: [107.78, 15.75], capM: 344, mw: 210, region: "trungtrungbo", drill: true },
    { id: "songbung4_n", name: "Sông Bung 4", river: "vgtb", ord: 1, ll: [107.9, 15.78], capM: 510, mw: 156, region: "trungtrungbo", drill: true },
    { id: "dakmi4_n", name: "Đắk Mi 4", river: "vgtb", ord: 2, ll: [107.85, 15.55], capM: 312, mw: 190, region: "trungtrungbo", drill: true },
    { id: "songtranh2_n", name: "Sông Tranh 2", river: "vgtb", ord: 3, ll: [108.1, 15.35], capM: 730, mw: 190, region: "trungtrungbo", drill: true },
    { id: "dakdrinh", name: "Đăkđrinh", river: "trakhuc", ord: 0, ll: [108.35, 14.95], capM: 249, mw: 125, region: "namtrungbo" },
    { id: "ankhe", name: "An Khê-Ka Nak", river: "ba", ord: 0, ll: [108.65, 13.95], capM: 313, mw: 173, region: "namtrungbo" },
    { id: "bahha", name: "Sông Ba Hạ", river: "ba", ord: 1, ll: [108.75, 13.05], capM: 349, mw: 220, region: "namtrungbo" },
    { id: "pleikrong", name: "Plei Krông", river: "sesan", ord: 0, ll: [107.85, 14.45], capM: 1048, mw: 100, region: "taynguyen" },
    { id: "yaly", name: "Yaly", river: "sesan", ord: 1, ll: [107.75, 14.22], capM: 1037, mw: 720, region: "taynguyen" },
    { id: "sesan4", name: "Sê San 4", river: "sesan", ord: 2, ll: [107.5, 13.95], capM: 893, mw: 360, region: "taynguyen" },
    { id: "buonkuop", name: "Buôn Kuốp", river: "srepok", ord: 0, ll: [107.9, 12.5], capM: 63, mw: 280, region: "taynguyen" },
    { id: "srepok3", name: "Srêpốk 3", river: "srepok", ord: 1, ll: [107.65, 12.65], capM: 219, mw: 220, region: "taynguyen" },
    { id: "daininh", name: "Đại Ninh", river: "dongnai", ord: 0, ll: [108.45, 11.95], capM: 320, mw: 300, region: "dongnambo" },
    { id: "dongnai3", name: "Đồng Nai 3", river: "dongnai", ord: 1, ll: [107.9, 11.85], capM: 1690, mw: 180, region: "dongnambo" },
    { id: "hamthuan", name: "Hàm Thuận-Đa Mi", river: "dongnai", ord: 2, ll: [107.85, 11.3], capM: 695, mw: 475, region: "dongnambo" },
    { id: "trian", name: "Trị An", river: "dongnai", ord: 3, ll: [107.0, 11.1], capM: 2765, mw: 400, region: "dongnambo" },
    { id: "thacmo", name: "Thác Mơ", river: "dongnai", ord: 1, ll: [107.0, 11.85], capM: 1360, mw: 150, region: "dongnambo" },
    { id: "dautieng", name: "Dầu Tiếng (thủy lợi)", river: "dongnai", ord: 2, ll: [106.35, 11.35], capM: 1580, mw: 0, region: "dongnambo" },
  ];

  /* ---------- regions ---------- */
  const NREGIONS = [
    { id: "taybac", name: "Tây Bắc", c: [103.6, 21.6] },
    { id: "dongbac", name: "Đông Bắc", c: [105.9, 22.2] },
    { id: "dbsh", name: "ĐB sông Hồng", c: [106.0, 20.7] },
    { id: "bactrungbo", name: "Bắc Trung Bộ", c: [105.4, 19.0] },
    { id: "trungtrungbo", name: "Trung Trung Bộ (VGTB)", c: [107.9, 15.9], drill: true },
    { id: "namtrungbo", name: "Nam Trung Bộ", c: [108.9, 13.6] },
    { id: "taynguyen", name: "Tây Nguyên", c: [107.9, 13.4] },
    { id: "dongnambo", name: "Đông Nam Bộ", c: [106.9, 11.2] },
    { id: "dbscl", name: "ĐB sông Cửu Long", c: [105.6, 9.9] },
  ];

  /* ---------- key cities & delta gauges ---------- */
  const NCITIES = [
    { name: "Hà Nội", ll: [105.85, 21.02], big: 1 }, { name: "Hải Phòng", ll: [106.68, 20.86] },
    { name: "Thanh Hóa", ll: [105.9, 19.8] }, { name: "Vinh", ll: [105.7, 18.68] },
    { name: "Huế", ll: [107.58, 16.47] }, { name: "Đà Nẵng", ll: [108.22, 16.07], big: 1 },
    { name: "Quảng Ngãi", ll: [108.8, 15.12] }, { name: "Quy Nhơn", ll: [109.22, 13.77] },
    { name: "Tuy Hòa", ll: [109.3, 13.08] }, { name: "Nha Trang", ll: [109.19, 12.25] },
    { name: "Buôn Ma Thuột", ll: [108.05, 12.67] }, { name: "Pleiku", ll: [108.0, 13.97] },
    { name: "Đà Lạt", ll: [108.44, 11.94] }, { name: "TP. HCM", ll: [106.7, 10.78], big: 1 },
    { name: "Cần Thơ", ll: [105.78, 10.03] }, { name: "Cà Mau", ll: [105.15, 9.18] },
  ];

  /* ---------- national water-level stations (BĐ = alert stages, m — realistic) ---------- */
  const NGAUGES = [
    { id: "g_hanoi", name: "Hà Nội (Long Biên)", river: "thao", ll: [105.86, 21.03], base: 2.2, bd: [9.5, 10.5, 11.5], amp: 12.5, region: "dbsh" },
    { id: "g_giang", name: "Giàng (Thanh Hóa)", river: "ma", ll: [105.85, 19.85], base: 1.0, bd: [4.0, 5.5, 6.5], amp: 7.6, region: "bactrungbo" },
    { id: "g_namdan", name: "Nam Đàn (Sông Cả)", river: "ca", ll: [105.5, 18.75], base: 1.5, bd: [5.4, 6.9, 7.9], amp: 8.8, region: "bactrungbo" },
    { id: "g_gianh", name: "Mai Hóa (Gianh)", river: "gianh", ll: [106.2, 17.75], base: 0.8, bd: [3.0, 5.0, 6.5], amp: 7.8, region: "bactrungbo" },
    { id: "g_hue", name: "Kim Long (Huế)", river: "huong", ll: [107.55, 16.45], base: 0.3, bd: [1.0, 2.0, 3.5], amp: 4.4, region: "trungtrungbo" },
    { id: "g_caulau", name: "Câu Lâu (Thu Bồn)", river: "vgtb", ll: [108.28, 15.87], base: 0.7, bd: [2.0, 3.0, 4.0], amp: 4.6, region: "trungtrungbo", drill: true },
    { id: "g_trakhuc", name: "Trà Khúc (Q.Ngãi)", river: "trakhuc", ll: [108.78, 15.12], base: 1.2, bd: [3.5, 5.0, 6.5], amp: 7.2, region: "namtrungbo" },
    { id: "g_phulam", name: "Phú Lâm (Tuy Hòa)", river: "ba", ll: [109.28, 13.07], base: 0.6, bd: [1.7, 2.7, 3.7], amp: 4.3, region: "namtrungbo" },
    { id: "g_bienhoa", name: "Biên Hòa (Đồng Nai)", river: "dongnai", ll: [106.82, 10.95], base: 0.9, bd: [1.6, 1.8, 2.0], amp: 1.5, region: "dongnambo" },
    { id: "g_tanchau", name: "Tân Châu (Mekong)", river: "tien", ll: [105.25, 10.8], base: 1.5, bd: [3.5, 4.0, 4.5], amp: 3.6, region: "dbscl" },
    { id: "g_cantho", name: "Cần Thơ (Hậu)", river: "hau", ll: [105.78, 10.03], base: 1.2, bd: [1.9, 2.0, 2.1], amp: 1.1, region: "dbscl", tidal: true },
  ];

  /* national storm tracks per scenario: [lon, lat, tH] control points + intensity profile */
  const NSTORMS = {
    oct2020: {
      name: "ATNĐ dồn dập Trung Bộ",
      track: [[111.5, 15.2, -24], [110.3, 15.5, -8], [109.2, 15.7, 4], [108.4, 15.8, 14], [107.6, 15.9, 26], [106.8, 16.1, 40]],
      peak: 1.0, rMax: 2.4, monsoon: 0.35, surge: ["trungtrungbo", "namtrungbo"],
    },
    yagi: {
      name: "Siêu bão kiểu Yagi",
      track: [[112.0, 19.4, -24], [110.5, 20.0, -10], [108.6, 20.6, 0], [107.2, 21.0, 8], [105.9, 21.3, 16], [104.6, 21.7, 28], [103.6, 22.0, 40]],
      peak: 1.5, rMax: 2.8, monsoon: 0.2, surge: ["dongbac", "dbsh"],
    },
    monsoon: {
      name: "Gió mùa Tây Nam + triều cường",
      track: null,
      peak: 0, rMax: 0, monsoon: 0.85, surge: ["dbscl", "dongnambo"],
    },
  };

  FT.vndata = { COAST, BORDER, RIDGES, PLATEAUS, NRIVERS, NRES, NREGIONS, NCITIES, NGAUGES, NSTORMS };
})();
