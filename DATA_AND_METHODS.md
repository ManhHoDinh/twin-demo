# FloodTwin Q1 Demo — Dữ liệu & Phương pháp (reference chuẩn)

> Tài liệu gốc để biết demo dùng dữ liệu nào, đâu là **THẬT** / đâu là **TỔNG HỢP**, demo được dựng ra sao, và muốn chỉnh gì thì sửa ở đâu.
> Cặp tài liệu đi kèm: `HANDOVER.md` (cách chạy + kịch bản demo 3′) · `IMPROVEMENT_LOG.md` (lịch sử v1→v84 + kế hoạch sống) · `PLAN.md` (kiến trúc chi tiết).

---

## 1. Kiểm kê dữ liệu

### 1.1 Dữ liệu THẬT (tải trực tiếp từ nguồn công khai lúc chạy)

| Dữ liệu | Nguồn (URL trong code) | Dùng cho | Code |
|---|---|---|---|
| **Địa hình DEM** | AWS Terrain Tiles (Terrarium, s3 `elevation-tiles-prod`), z10–11 | Mesh địa hình 3D 384², nền cao độ 2D, độ sâu ngập, dòng chảy SWE | `js/geo.js` → `loadDEM`, `G.elevAt` |
| **Ảnh vệ tinh** | Esri World Imagery — z12 toàn miền, z14 5 cửa sổ đô thị, live-tile theo khung nhìn tới **z20** (~0,15 m/px) | Drape 3D, nền 2D, phát hiện nhà (pixel sáng ít sắc), lớp chi tiết cận cảnh | `js/geo.js` → `loadImagery`, `DETAIL_WINDOWS`, `G.detailPatches`, `G.tile("img")` |
| **Bản đồ đường (raster)** | Esri World_Transportation (mọi cấp đường + tên đường ở z cao) | Đường thật nướng vào nền 2D/3D; hẻm hiện ở zoom sâu | `js/geo.js` → `addTransportLayer`, `G.tile("rd")` |
| **Nhãn địa danh (raster)** | Esri World_Boundaries_and_Places | Tên địa danh thật trên live-tiles 2D + lớp detail 3D | `js/geo.js` → `G.tile("pl")` |
| **Đường vector OSM** | Overpass API (3 mirror) — major toàn miền (motorway→secondary); **mọi `highway=*`** (ngõ hẻm) + **móng nhà `building=*`** trong 5 cửa sổ đô thị | Ribbon trạng thái ngập theo hình học thật; hẻm 2D/3D; nhà 3D đúng đa giác móng | `js/geo.js` → `loadRoadsOSM`, `loadMinorRoadsOSM`, `loadBuildingsOSM` |
| **Tọa độ công trình** | Toạ độ thật (lon/lat) nhập tay từ bản đồ | 4 hồ chứa (A Vương, Sông Bung 4, Đắk Mi 4, Sông Tranh 2), trạm thủy văn (Ái Nghĩa, Câu Lâu, Cẩm Lệ, Thạnh Mỹ…), 8 đô thị, 12 khu giám sát, node/cạnh đường chính (QL1A, QL14B, CT ĐN–QN, ĐT603/608/609/610/611) kèm waypoint `via` men theo tuyến thật | `js/data.js` (mọi vị trí qua `FT.LL(lon,lat)`) |
| **Gazetteer** | 33 địa danh thật: 14 quận/huyện, 11 cầu (Rồng, Sông Hàn, Thuận Phước, Trần Thị Lý, Tiên Sơn, Cẩm Lệ, Cửa Đại, Câu Lâu, Giao Thủy, Hà Nha, Ái Nghĩa), 8 địa danh (Sân bay ĐN, Sơn Trà, Ngũ Hành Sơn, Bà Nà, Phố cổ Hội An, Mỹ Sơn…) | Nhãn 2D theo mức zoom + nhãn 3D theo khoảng cách camera | `js/data.js` → `PLACES` |
| **Mức báo động BĐ1/2/3** | Theo QĐ 05/2020/QĐ-TTg (Ái Nghĩa 6,5/8,0/9,0 m · Câu Lâu 2,0/3,0/4,0 m · Cẩm Lệ 1,0/1,7/2,5 m…) | Màu cảnh báo trạm, ngưỡng sự kiện, selftest | `js/data.js` → `GAUGES[].bd` |
| **Khung pháp quy** | QĐ 1865/QĐ-TTg (quy trình vận hành liên hồ Vu Gia–Thu Bồn), QĐ 740/QĐ-TTg | Ràng buộc trần/đáy mực nước hồ trong bài toán vận hành; nhãn UI | `js/hydro.js` (bounds), footer |

Bbox miền: **107,55–108,45°E / 15,30–16,16°N** (~96 × 95,5 km), quy đổi km bằng `FT.LL` (103,3 km/°lon · 111,1 km/°lat) — `js/geo.js` dòng đầu.

### 1.2 Dữ liệu TỔNG HỢP (minh hoạ phương pháp — KHÔNG dùng vận hành thật)

| Dữ liệu | Cách tạo | Code |
|---|---|---|
| **Mưa & cưỡng bức khí tượng** | Chuỗi mưa giải tích theo kịch bản (pulse chuẩn hoá ×9,5), gắn nhãn "GenCast/GraphCast + IMERG hiệu chỉnh" để minh hoạ pipeline của bài báo — số liệu KHÔNG phải tái phân tích thật | `js/data.js` → `SCENARIOS`, `js/hydro.js` |
| **Thủy văn & vận hành hồ** | Mô hình giải tích T−24→+48 h: runoff (gain 30, lag riêng từng trạm), routing hồ, 2 chính sách (Rule tĩnh vs FloodTwin MPC cắt đỉnh), ensemble quantile q05–q95; thông số hồ plausible theo công bố, KHÔNG phải telemetry | `js/hydro.js` |
| **Trường ngập 2D** | SWE virtual-pipes 144², CHỈ động trên đồng bằng (<28 m), đồng hoá mực trạm dọc hành lang sông, cap `floodCap` = max anomaly trạm +0,6 m | `js/world.js` |
| **Dân số** | Trường gaussian quanh đô thị, tổng khớp dân số thật từng thành phố | `js/world.js` → `buildPop` |
| **Giao thông** | Nhu cầu OD tổng hợp giữa hub, Dijkstra theo thời gian, đường đóng ≥30 cm, xe reroute | `js/traffic.js` |
| **Nhà ngoài vùng có OSM** | Suy từ pixel ảnh vệ tinh (sáng + ít sắc), xoay theo hướng đường gần nhất; trong 5 cửa sổ đô thị lấy mẫu ảnh z14 ~18 m | `js/scene3d.js` → `buildCities` |
| **Bản tin LLM, sự kiện, CRPS…** | Sinh từ trạng thái mô phỏng (template + số liệu sim) | `js/ui.js`, `js/charts.js` |

**Nguyên tắc gắn nhãn**: footer app luôn ghi "Dữ liệu tổng hợp minh hoạ phương pháp — không dùng cho vận hành thật" + ghi công Esri/AWS/OSM. Nút ℹ️ (modal Phương pháp) liệt kê thật/tổng hợp cho người xem.

---

## 2. Demo được dựng thế nào (tái tạo từ đầu)

**Stack**: web tĩnh, KHÔNG build step — 12 file IIFE cổ điển gắn vào `window.FT`, Three.js r165 qua CDN **import map** (chạy được cả `file://`). Mở `index.html` là chạy; cache-bust bằng `?v=N`.

**Thứ tự nạp** (trong `index.html`): `core → geo → data → hydro → world → traffic → zones → charts → map2d → scene3d → ui → main`.

**Pipeline boot** (`js/main.js`):
1. `await FT.geo.load(12000)` — tải DEM + ảnh + raster đường song song, có timeout; **offline vẫn chạy** bằng terrain/basemap procedural (fallback tự co giãn).
2. `world.build()` — heightfield từ DEM, sông khắc lòng, dân số, lưới đường (polyline `via`).
3. `hydro.precompute()` — chạy trước cả 2 chính sách + ensemble cho cả trục thời gian.
4. Dựng 3 renderer (scene3d / map2d / charts) + UI; vòng render rAF.
5. Nền: tải OSM vector (đường lớn → móng nhà → ngõ hẻm, tuần tự tránh nghẽn mirror) — có gì swap nấy, không chặn boot.
6. **`selfTestHydro()` chạy MỖI lần mở**: 4 khẳng định (MPC cắt đỉnh Ái Nghĩa; kịch bản 10/2020 vượt BĐ3 theo rule; thứ tự quantile; cân bằng khối/biên mực hồ) → console `[selftest] hydro PASS 4/4` + chip **H✓** ở footer; FAIL → toast đỏ.

**Chu trình chỉnh sửa chuẩn**: sửa file js → bump `?v=N` trong `index.html` → mở lại/reload → xem console (sạch + selftest PASS) → QA hình ảnh (zoom các mức) → ghi vào `IMPROVEMENT_LOG.md`.

---

## 3. Reference chỉnh sửa — muốn đổi gì, sửa ở đâu

| Muốn chỉnh | Sửa ở |
|---|---|
| Vùng địa lý khác | `js/geo.js`: `LON0/LON1/LAT0/LAT1`, `KM_PER_LON/LAT`; rồi cập nhật toạ độ trong `js/data.js` |
| Thêm/di chuyển cửa sổ chi tiết đô thị (ảnh z14 + OSM nhà/hẻm) | `js/geo.js` → `DETAIL_WINDOWS` (lon, lat, bán kính độ) |
| Thêm trạm thủy văn | `js/data.js` → `GAUGES` (ll, bd 3 mức, `localGain`, `lagH`, trọng số hồ `resW`) |
| Thêm hồ chứa | `js/data.js` → `RESERVOIRS` + cập nhật `resW` các trạm hạ lưu |
| Chỉnh tuyến đường/cầu | `js/data.js` → `NODE_LL`, `ROAD_EDGES` (thêm `via: [[lon,lat],…]` để men tuyến thật; `bridge: true` cho mặt cầu cao) |
| Thêm địa danh/cầu vào nhãn | `js/data.js` → `PLACES` (k: dist/bridge/lm; t: 1 hiện sớm, 2 hiện khi zoom) |
| Kịch bản mưa mới | `js/data.js` → `SCENARIOS`; độ mạnh qua pulse & hệ số trong `js/hydro.js` |
| Dải màu độ sâu ngập | `js/core.js` → `depthColor` (5 dải rời rạc) **và** shader bands trong `js/scene3d.js` (giữ khớp chú giải `index.html`) |
| Ngưỡng đóng đường | `js/core.js` → `roadClass` (0,15 / 0,30 m) |
| Trần zoom 2D / mức tile | `js/map2d.js`: cap `cam.scale ≤ 7000` px/km, `z < 20` trong `drawLiveTiles` |
| Độ chi tiết lớp cận cảnh 3D | `js/scene3d.js` → `DQ` (canvas 1024, lưới 64², cửa sổ `clamp(dist×1.15, 1.1, 30)` km, z 13–19) |
| Phóng đại chiều cao | `js/scene3d.js`: `elevToY` (20× vùng thấp) + `scene.scale.y = 1 − cf·0.9` (ghé sát ~2×) |
| Nguồn tile khác | `js/geo.js` → `TILE_URLS` (img/rd/pl) — giữ LRU 450 + retry + nhả cache 30 s |

### Quy tắc CHỐNG THOÁI LUI (đúc kết từ lỗi thật — xem chi tiết `IMPROVEMENT_LOG.md`)
1. **Không** tham chiếu `THREE.*` ở cấp module trong `scene3d.js` (chỉ trong hàm sau `init`) — vi phạm = chết cả IIFE, app rơi về 2D.
2. SWE chỉ động trên đồng bằng (<28 m); núi là diagnostic — bỏ giới hạn = "nhà máy nước" 400 m trên núi.
3. Không bơm xả hồ trực tiếp vào lưới nước (đã encode trong anomaly trạm) — bơm kép = úng 5 m giả ở cửa đồng bằng.
4. Metrics ngập luôn qua `hBase` + cap `W.floodCap`.
5. Thứ tự lớp theo trục Y: terrain < lớp detail (+0,015–0,035) < nước (+0,025–0,055) < đường (+0,1) — chỉnh độ nâng nào cũng phải giữ chuỗi này.
6. Màu đường 3D là RGBA (`itemSize 4`, cả `buildRoads` lẫn `buildOsmRoads`) — rebuild 3-thành-phần sẽ vỡ index ×4.
7. `updateWater` giữ 10 Hz (shimmer đã chạy bằng `uTime` trong shader) — đưa về mỗi-frame là tụt fps.
8. Bump `?v=N` mỗi lần sửa js, kiểm console + `[selftest] hydro PASS 4/4` trước khi coi là xong.

---

## 4. Ghi công & giới hạn
- Esri World Imagery / World_Transportation / World_Boundaries_and_Places · AWS Terrain Tiles · © OpenStreetMap contributors (Overpass API).
- GLO-30 · HydroSHEDS · IMERG · GenCast · GloFAS được nêu là **nguồn phương pháp của bài báo** — demo minh hoạ pipeline, không tải các bộ này trực tiếp.
- Demo phục vụ minh hoạ nghiên cứu (paper FloodTwin Q1) — **không dùng cho cảnh báo/vận hành thực tế**.
