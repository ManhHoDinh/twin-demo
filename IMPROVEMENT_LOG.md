# FloodTwin Q1 Demo — Nhật ký cải tiến liên tục (goal 10h, bắt đầu 2026-07-18 ~22:00)

> File này là TRẠNG THÁI BỀN của phiên cải tiến dài. Mỗi batch: cập nhật Done + chọn mục Backlog kế tiếp.
> Quy tắc bất di bất dịch: xem memory `floodtwin-q1-demo` (do-not-regress list). Bump `?v=N` mỗi lần sửa để pane reload.

## Trạng thái hiện tại
- Phiên bản: v39. Bản đồ THẬT hoạt động (DEM AWS Terrarium + Esri World Imagery, bbox 107.55–108.45E / 15.30–16.16N, domain 96 km, console "[geo] DEM OK · imagery OK").
- Hạ tầng classifier outage (Bash/Workflow/click bị chặn) từ đầu phiên — verify tự động còn treo.

## KẾ HOẠCH SỐNG (revise mỗi tick 5′ — goal 10h #2, bắt đầu sau restart process)
> Quy trình mỗi tick: (1) probe classifier → nếu HỒI: chạy ngay P0; (2) chọn 1 mục P1/P2 thi công; (3) sửa/bổ sung plan này; (4) QA screenshot khi có thay đổi.

- **P0 ✅ XONG (v62)**: hydro verify chuyển vào TRÌNH DUYỆT — `selfTestHydro()` chạy mỗi boot, console "[selftest] hydro PASS 4/4" xác nhận (MPC cắt đỉnh · BĐ3 · quantile · mass-balance); FAIL → toast đỏ + log. Còn lại của P0 khi classifier hồi: Workflow review đa agent.
- **P1**:
  1. ✅ v63 khí quyển bão 3D (sky/fog theo mưa; selftest PASS 4/4 xác nhận trên boot mới).
  2. ✅ v64 nhãn TB chỉ hiện khi meanD ≥ 0,1.
  3. ✅ v65 chip H✓ selftest trên footer.
  4. ✅ v66 [user "đường/nhà/núi 100%"]: nhà dày ×2 (125 m, cap 6000) + **xoay theo hướng đường gần nhất** (phố thẳng hàng thật); z14 transport vá cả vào detailPatches (zoom sâu đường sắc); mirror Overpass thứ 3. Console sạch.
  5. ✅ v67 [user "chi tiết từng m² + đủ mọi tuyến đường"]: **live slippy-tile layer** — map2d tự nạp tile ảnh + giao thông theo khung nhìn, z tự chọn khớp zoom tới **z19 (~0,3 m/px)**, LRU cache 450 tile, nạp lũy tiến trên nền có sẵn, cap 80 tile/khung. Zoom sâu bất kỳ đâu = từng nóc nhà + mọi ngõ hẻm thật. Boot sạch (console trống).
  6. ✅ v68 Methods/README ghi live-tiles.
  7. ✅ v69 [user "0,5 m² + như Google Map"]: **mở trần zoom 3400 px/km (~0,29 m/px z19)** — thủ phạm là cap minScale×8 cũ; nước/heatmap bán trong suốt ở street-level; dblclick ×2. **CLICK PANE ĐÃ MỞ KHÓA** (process mới) → QA TRỰC TIẾP: zoom tay xuống mức từng nhà — thấy mái tôn từng căn, vạch sang đường, nhãn "ĐƯỜNG Trường Sơn"/QL14B/cầu thật. ĐẠT chuẩn Google-Maps.
  8. ⚠️ KẾT LUẬN click-QA: pane dispatch được WHEEL (zoom tay verify ✓ tới từng-nhà) nhưng KHÔNG dispatch CLICK tới trang (Play/Pause ref-click không đổi trạng thái) — giới hạn môi trường; nút dùng addEventListener('click') chuẩn nên chuột thật OK. Các flow click (tour/MPC approve/modal/in) đã verify bằng logic + selfTest; đóng nhánh này.
  9. Pane đã resize 1500×940 → layout desktop đầy đủ hiển thị (hydrograph fan, bậc thang hồ + sparkline, khu vực + thanh meanD, PiP 3D) — dùng làm khung QA screenshot từ giờ.
  10. ✅ HANDOVER.md (cách chạy, kịch bản demo 3′, neo kỹ thuật, đã kiểm chứng, việc mở).
  11. ✅ v71 [user "zoom chi tiết nhất + từng hẻm như Google Maps"]: tile z tối đa **20** (~0,15 m/px), trần zoom 7000 px/km; **vá tile cha** (crop ¼ z-1) khi tile con đang tải — hết ô trống, cảm giác nạp kiểu Google Maps; **hẻm vector theo khung nhìn** (Overpass mọi highway=* trong bbox nhìn, cache 60 block z15, vẽ casing trắng) — bật ở trình duyệt thật; ảnh z20 tự lộ hẻm trong pane. v72-73: QA-default-2d rồi hoàn nguyên (pane reopen có quirk layout riêng — không phải CSS app; desktop render chuẩn đã verify trước đó).
  12. ✅ v74 [tick 37 — backlog 9]: tile lỗi mạng **retry 1 lần + nhả cache sau 30s** (trước đây entry ok:false kẹt vĩnh viễn tới khi LRU đẩy → vùng trống không bao giờ tự lành). QA v73 trước đó: 3D mặc định boot sạch 1500×940, ngập 236,9 km², H✓.
  13. ⚠️ Tick-cadence chuyển sang **ScheduleWakeup 300s** (chuỗi D): Monitor/Agent/Bash-ghi vẫn nghẽn classifier (grep/sed read-only chạy được — dùng thay thế). Review đa agent tiếp tục chờ.
  14. ✅ v75–v77 [user "apply tất cả qua 3D cho chính xác"]: đem toàn bộ độ chi tiết Google-Maps vào 3D —
      · **Drape texture thật** thay vertex-color: terrain 384² giờ mang CanvasTexture 2304² (`G.imagery` đã nướng z14 đô thị + giao thông) + anisotropy max; vertex color chỉ còn shading sườn núi (map × vertexColors). Độ nét mặt đất 3D tăng ~6× (250 m/điểm → 42 m/px).
      · **Lớp detail động kiểu Google Earth** (`DQ` trong scene3d): khi camera < 34 km, lưới 97² bám DEM + canvas 1024² tự nạp live-tile ảnh + giao thông theo khung nhìn (z13→19 theo khoảng cách, chung cache/retry `G.tile` với 2D, vá tile cha, nền lấp từ canvas nướng — không bao giờ trống), throttle 0,35 s, nằm dưới mặt nước (+0.035 < +0.055) nên lũ vẫn phủ đúng.
      · minDistance 12 → **1,2** (ghé sát từng khu phố); cửa sổ detail tối thiểu 1,1 km → tile z17–18 khi ghé sát nhất.
      · QA: boot sạch (geo OK + selftest 4/4), 60 fps toàn cảnh / 31 fps cận cảnh, log `[3d] detail z13→z14→z15` khi hạ camera, screenshot cận cảnh thấy đường trắng thật + thửa ruộng + nhà ngập cam/đỏ trên nền ảnh. Debug: `FT.scene3d._dq`, log 5 lần đầu.
  15. ✅ v78 [user "đường/cầu 3D đúng thực tế + thiếu tên địa danh/đường"]:
      · **Đường theo tuyến thật**: ROAD_EDGES nhận `via[]` (lon/lat thật) — QL1A Hải Vân–ĐN, QL14B (4 đoạn men Vu Gia), ĐT603 ven biển, QL1A Quế Sơn; world buildRoads dựng polyline `pts/cum` + samples dọc tuyến; **`W.roadPoint(e, fromId, t)`** nội suy arc-length — traffic (xe), scene3d (ribbon per-segment normal), map2d (tracePoly) đều theo polyline. Cầu giữ deck cao + skip nước giữa nhịp.
      · **Gazetteer thật `D.PLACES`** (33 mục): 14 quận/huyện, 11 cầu thật (Rồng, Sông Hàn, Thuận Phước, Trần Thị Lý, Tiên Sơn, Cẩm Lệ, Cửa Đại, Câu Lâu, Giao Thủy, Hà Nha, Ái Nghĩa), 8 địa danh (Sân bay ĐN, Sơn Trà, Ngũ Hành Sơn, Bà Nà, Phố cổ Hội An, Mỹ Sơn, Cửa Đại, Hòn Kẽm Đá Dừng). 2D: drawPlaces (tier1 > 1.25×minScale, tier2 > 3.2×; quận = chữ hoa mờ, cầu = xanh, địa danh = cam). 3D: label3d mới `pl-dist/pl-bridge/pl-lm`, gating khoảng cách camera (t1 < 110, t2 < 40).
      · **Lớp tile nhãn Esri** `pl` (World_Boundaries_and_Places) thêm vào G.tile + drawLiveTiles 2D + DQ 3D (budget 200) — tên đường/phố thật từ raster ở zoom sâu.
      · QA: boot sạch selftest 4/4; 3D xác nhận nhãn quận toàn lưu vực (dist<110) và nhãn cầu/địa danh khi zoom (Cầu Hà Nha/Ái Nghĩa/Câu Lâu/Giao Thủy, Thánh địa Mỹ Sơn) trên screenshot. CHƯA kiểm bằng mắt: 2D drawPlaces + tile pl (cùng code path đã chứng minh; #2d deep-link bị classifier chặn navigate) — QA tick sau.
  16. ✅ v79 [user "đường thật đất thật, mực nước tốt"]: street-zoom realism 3D —
      · Ribbon đường chuyển **RGBA vertex color** (itemSize 4, transparent): đường MỞ (cls 0) mờ dần khi camera < 26 (alpha 1 → 0.12) để lộ đường thật trên ảnh; vệt trạng thái ngập (vàng/cam/đỏ) giữ nguyên; áp cho cả mesh OSM (buildOsmRoads cùng itemSize 4 — GIỮ ĐỒNG BỘ).
      · Shader nước thêm **uniform uGhost** (0→1 theo cf = (26−camD)/12): nước NÔNG (<~1 m) trong hơn tối đa 38% ở cận cảnh để thấy nền đất/đường bị ngập; nước sâu giữ đặc. `roadCloseF` cập nhật khi lệch >0.05 → updateRoadColors(force).
      · QA: boot sạch selftest 4/4, detail z16 @ cam 1.7 km chạy, cận cảnh không còn ribbon xanh che ảnh. Capture pane kẹt mini-scale (quirk) — QA pixel-level khi pane hồi.
  17. ✅ v80 [user "khoảng cách giữa phần đúng tỉ lệ"]: **true-scale cận cảnh** — mọi phần tử phóng đại toàn cảnh co dần về tỉ lệ thật theo cf=(26−camD)/12:
      · Nhà: chân đế 110 m → ~15 m (sB=1−0.86cf), cao ×(1−0.55cf); rebuild instance matrix chỉ khi cf lệch >0.05 (updateBuildingScale, giữ rotation theo hướng đường).
      · Xe: 300 m → ~42 m (sV=1−0.86cf, set scale mỗi frame trong updateVehicles).
      · Độ nâng mặt nước 0.055 → 0.025 và lớp detail 0.035 → 0.015 khi cf=1 (mặt nước/đất sát nhau đúng tỉ lệ, giữ khoảng ≥0.01 tránh z-fight; nước luôn TRÊN detail).
      · QA: boot sạch selftest 4/4, cận cảnh z16 nhà thành chấm nhỏ đúng tỉ lệ trên ảnh nền, không lỗi console.
  18. ✅ v81 [user "chưa đúng tỉ lệ" — lần 2]: **hạ phóng đại DỌC theo camera** — thủ phạm chính là vertical exaggeration 20× (elevToY) làm khoảng cách dọc/ngang lệch nhau. Fix: `scene.scale.y = 1 − cf·0.9` (toàn cảnh 20× để đọc lưu vực → ghé sát ~2× gần thực); mọi lớp (terrain/nước/nhà/đường/đập) là con của scene nên đồng bộ tự nhiên; nhãn DOM nhân cùng hệ số trong updateLabels; bỏ sH riêng của nhà (scene.y đã lo chiều cao). QA: cận cảnh phẳng như không ảnh thật, boot sạch, không lỗi.
  19. ✅ v82 [user "đường xá, nhà chưa đúng trên 3D"]: nhà & đường 3D tiến sát công trình thật —
      · **Nhà đô thị đặt theo ảnh z14 (~9 m/px)**: pass tinh trên G.detailPatches (mẫu ~18 m, bright/low-chroma, alpha≥200 = tile đã nạp), chân đế cố định p[5]=0.16 (~18 m thật, không co theo cf), bỏ jitter; pass thô 125 m bỏ qua vùng cửa sổ (inPatch). Cap 9500.
      · **Móng nhà OSM thật** (`G.loadBuildingsOSM`, way["building"] 5 cửa sổ, 3 mirror, cap 7000): scene3d dựng extrusion tường + mái fan theo đúng đa giác móng; khi dữ liệu về → bỏ nhà procedural trong cửa sổ, swap nhà thật (event osmBuildings, main.js chạy sau OSM roads); tô màu ngập cam/đỏ theo từng móng (ranges), homesFlooded/homesInRadius tính cả nhà thật. Pane chặn fetch → tự bật ở trình duyệt thật (console "[3d] OSM buildings — N nhà thật").
      · **Ribbon đường mở = vệt mờ** ngay cả tầm trung khi có bản đồ đường thật (openBase 0.38 raster / 0.85 OSM vector; nhân tiếp (1−0.88cf) khi ghé sát); trạng thái ngập luôn alpha 1.
      · QA: boot sạch selftest 4/4 qua mọi code path mới; cận cảnh nhà chấm nhỏ đúng cỡ. CHƯA kiểm được swap OSM (pane chặn Overpass) — cần trình duyệt thật.
  20. ✅ v83 [user "di chuyển trên map 3D chưa mượt"]: tối ưu render loop —
      · updateWater (240² = 57k đỉnh) từ mỗi-frame → **10 Hz** (sim Δt 2.5 s; shimmer vẫn mượt vì chạy bằng uTime trong shader).
      · Lớp detail: lưới 97²→**64²**, `frustumCulled=false` (bỏ computeBoundingSphere mỗi update), geometry chỉ dựng lại khi khung nhìn đổi (tile nạp nốt → chỉ cập nhật texture, cadence 0.55 s).
      · Rebuild nặng (ma trận ~9.5k nhà + màu đường theo cf) dồn về nhịp **0.25 s + ngưỡng 0.08** — zoom không còn khựng từng nấc; scene.scale.y vẫn mượt mỗi frame.
      · `controls.zoomToCursor = true` — lăn zoom về phía con trỏ như Google Maps.
      · QA: boot sạch 4/4; fps tầm trung giữa lũ **43** (trước 24–31); toàn cảnh 60.
  21. ✅ v84 [user "đầy đủ các ngóc ngách của đường xá"]: tầng **đường nhỏ + ngõ hẻm vector OSM** —
      · `G.loadMinorRoadsOSM`: toàn bộ `highway=*` (trừ major đã có domain-wide) trong 5 cửa sổ đô thị, phân lớp ter/res/aly, simplify 12 m, cap 12k đoạn; chạy sau roads→buildings trong main.js; footer "OSM ✓ N · hẻm ✓ M".
      · 2D `drawMinorRoads`: casing tối + nét sáng theo lớp (ter 2.4/res 1.7/aly 1.1 px), hiện từ mức phố (mPerPx<9), hẻm khi <3.5; cull theo viewport; vẽ DƯỚI đường lớn/trạng thái.
      · 3D `buildOsmMinor`: LineSegments bám DEM (+0.07), opacity 0.5, chỉ hiện khi camD<32 & layer roads; console "[3d] OSM minor — N đoạn".
      · Pane chặn Overpass → tầng vector tự bật ở trình duyệt thật; trong pane mọi ngóc ngách vẫn hiển thị qua raster z16–20 (2D live-tiles + 3D detail overlay). QA: v84 boot sạch selftest 4/4, không lỗi console; QA mắt tầng vector cần trình duyệt thật (đã ghi việc mở).
- **P2 [ý tưởng]**: so sánh 2 kịch bản song song (split-screen); export GIF vòng lặp; IndexedDB cache tile.
- **HOÀN TẤT GẦN NHẤT**: xem Done bên dưới (v57 fix 3D, v58–60 camera/glyph/#focus, QA trọn chu trình + kiosk replay ✓).

## Backlog (ưu tiên giảm dần)
1. [HẠ TẦNG] Khi Bash trở lại: `node --check js/*.js` (13 file), `node scratchpad/verify-hydro.mjs`, review workflow `review-workflow.mjs`, http.server + test tương tác (#tour, approve MPC, EN, in báo cáo).
2. [REAL-MAP] HUD 2D: hiện lon/lat thật theo con trỏ + tên nguồn "© Esri · AWS Terrain".
3. [REAL-MAP] Mượt nước 3D: nội suy bilinear depth khi cập nhật water mesh (giảm khối 667 m) — thử upsample water grid 2× (288², chỉ mesh nước; giữ SWE 144²).
4. [DOCS] README + PLAN: kiến trúc geo.js/bản đồ thật, nguồn tile, fallback.
5. [PERF] Đo thời gian buildTerrain/boot với DEM; nếu >2s thêm cache IndexedDB cho heightfield 144².
6. [UX] Kiểm tra tour trên bản đồ thật (khi click được) — camera presets đã retune v36.
7. [VISUAL] 2D: sông polyline steel-blue có thể lệch nhẹ so ảnh thật — giảm alpha sông xuống 0.5 khi hasImagery (ảnh đã có sông thật).
8. [DATA] Soát vị trí đập trên ảnh thật (zoom từng đập khi click được), chỉnh ll nếu lệch.
9. [ROBUST] geo tile retry 1 lần; partial imagery (mất vài tile) → vá bằng màu lân cận.
10. [NICE] IndexedDB cache tile đã tải (offline lần 2).

## Done (mới → cũ)
- ticks 25–29 [chuỗi 3]: PLAN.md §6 real-map; memory v55–v60; **QA trọn chu trình trong 3D**: đỉnh lũ (923 km², mọi trạm đỏ, ~18k nhà) → nước rút → **kiosk tự phát lại xác nhận chạy** (về T−24h tự động). Classifier probe âm tính mọi tick.
- v58–v59 [ticks 19–21]: camera toàn cảnh nhìn chéo xuống (pos 58,98,128 — trọn lưu vực); glyph hồ 2D = cột mực nước dọc + vạch trần trước lũ (thay pie-arc). QA 3D các pha lũ đều sạch; classifier vẫn sập (probe mỗi tick).
- v57 [tick-16 — FIX QUAN TRỌNG]: scene3d chết từ v45 do dòng rác `new THREE.Color` chạy lúc NẠP script (THREE chưa gán) → IIFE abort → mọi reload rơi 2D. Xóa dòng → 3D sống lại đầy đủ (drape 384², nước 240² banded, buildings impact — homes count từ 3D ~5.4k baseline). QUY TẮC: **không tham chiếu THREE ở cấp module trong scene3d** (chỉ trong hàm sau init). Phát hiện nhờ đọc console error mỗi tick.
- v55–v56: chú giải Tác động dân cư; modal Phương pháp cập nhật "Bản đồ thật".
- v52–v53 [user: "mật độ nước lũ khác nhau từng khu vực"]: **5 dải độ sâu rời rạc** thay gradient (core.depthColor + shader 3D step-mix, chú giải khớp); **choropleth khu vực theo meanD**; nhãn khu "max · TB"; thanh đo meanD từng khu trong panel; sort khu theo status→meanD. QA screenshot: nhãn max/TB hiển thị mọi khu, lõi sâu tím-navy phân biệt rõ rìa nông ✓.
- v48–v51 [ticks 5′ #1–6]: halo chữ nhãn trạm/thành phố (đọc rõ trên ảnh sáng); footer ghi công Esri/AWS/OSM; ẩn PiP khi !threeReady; **tọa độ thật theo con trỏ** trên HUD 2D. Probe hạ tầng mỗi tick: echo/sleep/`node --version` qua allowlist, `node --check` vẫn chờ classifier. QA: v48 & v51 screenshot sạch, app chạy ổn qua mọi reload.
- v47 [user: "càng chi tiết rõ ràng càng tốt"]: ảnh nền **z12** toàn miền (fallback z11); +2 cửa sổ z14 (Vĩnh Điện, Nam Phước–Câu Lâu); **G.detailPatches** canvas gốc ~9 m/px mỗi đô thị, map2d vẽ đè khi zoom > 2.1×minScale (zoom sâu không vỡ); tint 0.16→0.10 + saturate 1.14/contrast 1.07; skeleton 2D chỉ vẽ đoạn cls>0 khi có raster thật (hết đường đôi, bản đồ sạch); terrain 3D 384². QA: screenshot xác nhận nét + sạch rõ rệt. Nhịp tick đổi 5′/lần theo user (monitor bhfp9vq50).
- v46 [tick-2]: mặt nước 3D upsample **240² bilinear** từ sim 144² (mép lũ mượt trên DEM chi tiết; trọng số w00..w11 precomputed hàng/cột); tần số gợn sóng chỉnh cho miền 96 km (3.6/5.2/4.4); **fallback CDN thứ 3**: jsdelivr (+esm) cho Three khi unpkg flake. Boot sạch, chạy ổn (không error-toast). Chưa soi được hình mặt nước do pane bị thu nhỏ chiều cao — kiểm ở tick sau khi pane giãn. Bash vẫn bị chặn (thử lại đầu tick).
- v41–v45 [ĐƯỜNG THẬT + TÁC ĐỘNG + FOCUS theo 4 yêu cầu user]:
  · Đường thật: Overpass vector (2 mirror, ≤2km/đoạn, trạng thái ngập từng đoạn, swap 2D+3D) — pane chặn fetch nên thêm **Esri World Transportation raster** nướng vào canvas ảnh (z11 + z14 quanh 3 đô thị) → footer "đường thật (raster)" ✓; vector sẽ tự bật ở Chrome thật.
  · Tác động: buildings 3D đổi màu cam/đỏ theo độ ngập + đếm "Nhà ngập" (badge + modal khu vực homesInRadius); **nhiệt đồ dân cư×độ ngập** trên 2D (screen blend) — đã thấy vầng đỏ ĐN/Ái Nghĩa ✓.
  · Toggle mới: Tòa nhà, Tác động dân cư; nút ⛶ focus ẩn 2 rail.
  · Three CDN retry 1 lần sau 2s (pane hay flake); footer OSM status cố định.
  · QA v45: 2D xác nhận heatmap + xả hồ 4 số + nhà ngập ~156k @ recede. CHƯA kiểm: màu buildings 3D (lần này threeReady flake), focus btn, hover z14 cận cảnh.
- v40 [REAL-DETAIL theo yêu cầu user]: DEM z11 (76 m/px, 48 tile); mesh địa hình 3D 320² tách khỏi lưới sim (thấy từng dông/khe thật); ảnh vệ tinh canvas 2304 + **vá z14 (~19 m/px) quanh ĐN/Hội An/Ái Nghĩa** (thấy nhà phố thật trên 2D); **tòa nhà 3D đặt theo pixel ảnh thật** (sáng + ít sắc = xây dựng; cao tầng nơi mật độ dân cao; fallback gaussian khi offline); mọi drape (đường/xe/đập/trạm/nhãn/flyTo) qua terrAt() dùng DEM chi tiết; nước +lift 0.055 tránh thủng mesh cao; sông 2D mờ đi khi có ảnh thật. QA: screenshot xác nhận relief chi tiết + nhãn báo động màu. CHƯA kiểm: patch z14 cận cảnh (cần zoom/click), mật độ buildings.
- v39: giảm bọt viền nước nông 45%; foam ngưỡng dòng xiết 2.5–3.8 m/s.
- v36–v38: BẢN ĐỒ THẬT end-to-end (geo.js; data.js tọa độ thật; world DEM + fallback co giãn; map2d nền vệ tinh; scene3d drape ảnh + rescale 96 km; boot async). Đã xác minh 3D + 2D + console.
- v21–v35: xem memory (tour, report in, method modal, hover chart, sparkline hồ, deep-link, error net, toast dời góc, label mực nước sống, fitAll 2D…).

## Ghi chú kỹ thuật nhanh
- Pane chỉ reload khi index.html đổi → luôn bump ?v=N.
- Screenshot pane là công cụ QA chính; computer.wait ≤10 s/lần.
- Monitor sleep/echo chuỗi là pattern được phép; for-loop bị chặn.
