# Zoom cận cảnh: đất / nhà / nước bị tối và khó phân biệt

Trạng thái: **P0, P1, P2, P3, P5 ĐÃ XONG** (2026-07-31). P4 đã huỷ (không cần).
Phạm vi đã đụng: `js/scene3d.js`, `tests/zoom-visual.mjs` (mới), `package.json`.
Không đụng: `js/hydro.js`, `js/world.js`, hiệu chỉnh thuỷ văn/SWE.

---

## Chẩn đoán — bản đầu tiên đã SAI, ghi lại để không lặp lại

Phán đoán ban đầu quy lỗi cho `scene.scale.y = 1 - cf*0.9` ([scene3d.js:1554](js/scene3d.js:1554))
làm nén dọc 10× và lật normal của lưới địa hình. **Đo thì thấy không phải:**
không có normal nào có `ny ≤ 0` (`minNy = 0.138`), và nén dọc chỉ đẩy normal
hướng lên nhiều hơn chứ không lật. Ba giả thuyết bị bác bằng thực nghiệm:

| Giả thuyết | Cách bác |
|---|---|
| Nhà OSM / nhà thủ tục là mảng đen | Tắt layer `bldg` → mảng tối vẫn còn nguyên |
| Mặt nước lũ phủ lên gây tối | Tắt layer `water` → mảng tối vẫn còn nguyên |
| Normal địa hình bị lật do nén dọc | Đếm normal: 0/147456 đỉnh có `ny ≤ 0` |

## Nguyên nhân thật

Ở `dist ≤ 34` app bật lớp **drape deep-zoom** `DQ` — lưới 65×65 phủ tile
z13–z19 tươi lên trên địa hình ([scene3d.js:1160+](js/scene3d.js:1160)). Lớp này
lấy cao độ từ **DEM**, trong khi **lưới địa hình bên dưới lại render ở lưới thô
384² (~250 m/ô)**. Giữa hai nút lưới thô, tam giác phẳng của nó nằm **cao hơn**
DEM đang cong bên dưới. Drape chỉ được nhấc lên `0.035 - roadCloseF*0.02`
≈ 1,75 m, không đủ để vượt sai số chia lưới đó, nên **địa hình thô đâm xuyên
qua drape**. Chỗ đâm xuyên hiện ra là ảnh z12 mờ, tối, có shading Lambert,
tương phản hẳn với drape sáng nét — đúng những mảng xám đen loang lổ.

Kiểm chứng dứt điểm: ẩn riêng lưới địa hình thô ở street zoom → **toàn bộ mảng
tối biến mất**, lộ ra ảnh vệ tinh z18 sắc nét.

## P0 — Harness đo được (XONG)

`tests/zoom-visual.mjs`, đăng ký `npm run test:zoom` và đã nối vào `npm test`.
Bay tới Hội An / Đà Nẵng / Ái Nghĩa × 3 mức zoom, chụp vùng nền (bỏ HUD), rồi đo.

Hai cái bẫy đã gặp và đã xử lý, ghi lại vì rất dễ mắc lại:

1. **Không đọc được canvas bằng `drawImage`.** Renderer không bật
   `preserveDrawingBuffer`, nên color buffer không xác định ngoài frame rAF của
   chính nó — mọi metric im lặng trả về 0. Phải đi qua `page.screenshot()` rồi
   giải mã PNG lại bằng `createImageBitmap` trong page.
2. **Metric "đếm pixel tối" không bắt được lỗi này.** Mảng lỗi là xám xỉn
   (luma 64–112), không phải đen: ngưỡng `luma < 55` đọc ~1% ở cả khung lỗi lẫn
   khung sạch. Metric đúng là **`murkPct`** — tỉ lệ pixel trong dải luma 64–112 —
   chọn bằng cách hiệu chỉnh trên cặp ảnh cùng góc máy: 35,3% (lỗi) so với
   19,8% (sạch), trong khi `meanLuma` chỉ nhích 138 → 156.

Gate là **gate chống hồi quy theo baseline**, không phải ngưỡng cố định, vì
`murkPct` phản ánh cả nội dung cảnh: Đà Nẵng 36% murk mà khung hoàn toàn sạch
(sông Hàn + vịnh nằm đúng dải luma đó), còn Ái Nghĩa trong đất liền chỉ 23%.
Một con số cố định qua được cái này thì trượt cái kia.

## P1 — Sửa drape đâm xuyên (XONG)

`terrainSurfaceY(x, y)` nội suy **đúng mặt tam giác mà lưới địa hình đang vẽ**
(cùng cách chia tam giác với index buffer), thay vì đọc DEM. `terrainSurfaceMax`
lấy thêm 4 điểm cách nửa ô drape để phủ trường hợp drape mới là lưới thô hơn.
Cao độ drape thành `max(DEM, mặt-địa-hình) + lề`. Cả hai đường dựng terrain
(hi-res 384² và fallback theo lưới sim) đều nạp `terrGrid`.

Kill-switch **`?drapelegacy`** khôi phục cao độ drape cũ, theo đúng quy ước
`?classic` sẵn có — để so sánh trước/sau là phép đo trực tiếp hai nhánh code
chứ không phải so với file cũ, và để rollback nếu cần.

### Kết quả đo (`npm run zoom:compare`)

| Khung | murk sau | murk `?drapelegacy` | meanLuma sau / trước |
|---|---|---|---|
| hoian/street | **31,4%** | 48,0% | 140,1 / 123,8 |
| hoian/asset | **36,7%** | 46,0% | 122,3 / 114,2 |
| danang/street | **37,0%** | 47,8% | 146,6 / 133,4 |
| danang/asset | **23,6%** | 28,4% | 122,1 / 113,5 |
| aiNghiaT/street | **23,1%** | 40,8% | 124,3 / 111,2 |
| aiNghiaT/asset | **29,5%** | 44,5% | 129,3 / 113,9 |

Trung bình giảm **12,4 điểm** murk. Mức `district` không đổi (đúng như kỳ vọng:
drape chỉ bật khi `dist ≤ 34`). Lệch giữa các lần chạy ~0,3 điểm nên dung sai
±5 điểm của gate là chắc chắn.

---

## P2 — ánh sáng cự ly gần (XONG)

`AmbientLight` sáng theo độ gần (`cf * 0.42`), hemisphere `0.85 → 1.2`, sky lerp về
màu mù ban ngày, `fog.near/far` nhân `26/camD`. Tầm tổng quan không đổi vì `cf = 0`
ở mọi khoảng cách ≥ 26. **Không** bật `ACESFilmicToneMapping`: drape deep-zoom là
`MeshBasicMaterial` không nhận đèn, tone mapping sẽ làm tối/nhạt chính lớp vừa được
sửa cho nét ở P1, và rủi ro hồi quy tầm tổng quan không đáng.

## P3 — khối nhà + ribbon đường (XONG)

- **Hệ quả phụ của P1 đã sửa:** drape nâng trung vị 1,27 m / p95 3,95 m / max 12,18 m
  đã chôn nhà cao 4–15 m. Mọi vật đứng trên đất giờ dùng chung mốc `groundY()`.
- Mái và tường có đỉnh riêng → normal phẳng, khối đọc được; mái sáng hơn tường và
  giữ được tỉ lệ đó qua lượt tô lại theo mức ngập.
- Ribbon đường co 600 m → 108 m khi ghé sát (cả nhánh OSM lẫn procedural).
- Mesh dựng lại theo sự kiện mạng giờ áp scale/bề rộng **ngay**, không đợi zoom đổi.

`skipPatchProcedural` **không** cần mở rộng như kế hoạch cũ: đo thấy quanh Hội An đã
có 0 nhà thủ tục trong bán kính 1,5 km khi OSM về, cơ chế hiện tại đã đúng.

## P5 — nước dễ đọc (XONG)

Vấn đề: ở street zoom nước lũ sâu vẽ ở alpha 0,90 với màu chàm sẫm → **xoá sạch
mặt đất bên dưới**; sông/biển ở `(0.05, 0.28, 0.41)` alpha 0,64 đọc như vệt đen.

Làm nhạt **ruột** (hệ số fade khi ghé sát 0,40 → 0,58), nâng `natural` và dải sâu
`c5` khỏi vùng gần đen. Nhưng làm nhạt ruột chỉ chấp nhận được nếu **ranh giới ngập
vẫn rõ**, và ranh giới là thuộc tính của *mép* — fragment shader không thấy hàng xóm.

Lần một tôi làm viền theo **độ sâu** (`vDepth < 0.3 m`). **Sai:** chỗ nước sâu 6,5 m
thì cả mảng đều xa dải nông nên viền không bao giờ xuất hiện đúng nơi ngập nặng nhất.
Ảnh so sánh cho thấy diện ngập mờ hẳn đi — một hồi quy thật.

Lần hai: tính thuộc tính đỉnh **`aEdge`** trong `updateWater` — đỉnh ướt có ít nhất
một hàng xóm 4-lân cận khô. Shader vẽ viền sáng tại đó, alpha **độc lập với `uGhost`**.
Giờ ruột nhạt đi mà diện ngập vẫn đọc được.

Ràng buộc từ `earth-map` contract đã tuân thủ: `closeOpacity < farOpacity`,
`boundaryOpacity ≥ 0,72`, `flowOpacity ≥ 0,72`, màu permanent ≠ simulated.
Hệ số fade giờ đi từ `WATER_STYLE` vào shader **qua uniform** — trước đó cùng cặp số
nằm ở hai nơi, đúng kiểu để `waterPresentation()` báo một con số mà scene không hề vẽ.

### Bài học đo lường (quan trọng hơn bản sửa)

1. **Sim đang tự chạy trong lúc đo.** Mỗi lượt harness đo một thời điểm lũ khác nhau —
   đó là nguồn dao động `district` tôi từng thấy (44,7 → 33,1) và tưởng là do code.
   Giờ ghim `SIM_TIME_H = 12`.
2. **Ngưỡng gate phải đặt DƯỚI hiệu ứng đo được, không phải ngay tại nó.** Tôi đặt
   claim `detail ≥ 0.4` *trước* khi đo; hai lượt sau đó cho **0,43 và 0,35** — ngưỡng
   nằm đúng trên trung bình, gate sẽ hỏng ~50% số lần. `detail` có tăng nhưng chỉ
   ~0,4 ± 0,05 và không tăng ở mọi khung, nên nó được **in ra để xem** còn gate thì
   đặt trên `murkPct` (mức 1,5 điểm, cả hai lượt đều vượt xa).

## P6 — Quét lại toàn cảnh sau P5 (XONG)

Một **lớp bug lặp đi lặp lại** đã lộ rõ: *thứ được định cỡ cho tầm tổng quan 96 km mà
không bao giờ co lại khi ghé sát*. Đến giờ đã tìm được năm trường hợp — drape/địa hình,
chân đế nhà 110 m, ribbon đường 600 m, **xe cộ 300 m**, **marker trạm đo 310 m**.
Khi soi cái tiếp theo, hãy tìm theo dấu hiệu này trước.

- **Xe cộ 300 m.** Hệ số co `sV` đã được tính đúng trong `updateVehicles` nhưng bị dòng
  `scale.set(s, 1, s)` ngay dưới **ghi đè**, nên chưa bao giờ có tác dụng. Đây là nguồn
  của mọi "mảng nâu/đỏ" phủ lên thành phố. Tôi đã đoán sai ba lần (nhà, đường, vòng vùng)
  trước khi loại trừ đúng layer `traffic`.
- **Marker trạm đo** 310 m → 93 m khi ghé sát; tầm tổng quan giữ nguyên.
- **Nước vẽ chìm trong sườn đồi** (26,9% đỉnh ướt) → nâng lên mặt đất nhìn thấy với trần
  4 m. Đồng bằng 8,3% → 2,6%; núi gần như không đổi (86,9% → 83,3%) **có chủ ý**, vì ở đó
  hai lưới lệch tới 291 m và nâng lên sẽ bịa ra nước trên sườn núi. 59,9 fps, không hồi quy.

## P7 — Quét lỗi bản đồ (XONG)

`tests/map-errors.mjs` lái bản đồ như người dùng và đỏ khi có bất kỳ lỗi phía app nào.
Quét sạch — nhưng log tile lộ ra `overpass-api.de` **ERR_CONNECTION_REFUSED**, dẫn tới
hai lỗi thật về mật độ nhà:

1. **Ngân sách nhà là chung, ai đến trước lấy trước** → cửa sổ Đà Nẵng ăn hết, Hội An
   còn 0 nhà khi OSM sập. Nay chia đều theo từng cửa sổ.
2. **Ngân sách tiêu theo thứ tự quét từ trên xuống** → nhà dồn lên mép trên, tâm phố cổ
   vẫn trống dù cửa sổ đã có 909 nhà. Tôi **đoán sai** là do bộ lọc màu loại mái ngói ấm;
   đo ra bộ lọc vẫn nhận 2664 pixel quanh đó. Nay đếm mật độ trước rồi nhận tỉ lệ cố định
   trải đều. Cùng lỗi này khiến **nam lưu vực chưa bao giờ được quét tới**.

Đo: Hội An **0 → 422 nhà** trong bán kính 3 km; 5 cửa sổ cân bằng (1566–2190).

## Còn lại (chưa làm)

- **Bề rộng đường 108 m vẫn ~5× thật.** Hẹp nữa là đánh đổi với yêu cầu nhìn rõ
  trạng thái ngập của tuyến — cần người quyết, không nên tự chỉnh.
- **Đập:** thanh trạng thái và tia xả là marker `0.22 × 1.1 km`, cùng lớp bug với trạm đo,
  nhưng đập nằm trên núi nên hiếm khi xem ở tầm toà nhà → ưu tiên thấp, chưa đụng.
- **2,6% đỉnh ướt ở đồng bằng vẫn chìm** — khe hở vượt trần 4 m. Nâng trần sẽ sửa nốt
  nhưng bắt đầu lấn sang vùng "bịa nước"; nên để nguyên trừ khi có yêu cầu rõ.
- **P4 — KHÔNG CẦN LÀM.** Kế hoạch cũ đề xuất "đưa tile z14 vào terrain 3D";
  thực tế lớp `DQ` đã làm việc đó từ trước, tốt hơn thế (z13–z19 theo yêu cầu).
  Vấn đề chưa bao giờ là thiếu ảnh nét, mà là ảnh nét bị lưới thô đâm thủng.
