# FloodTwin Q1 Demo — Nhật ký cải tiến liên tục (goal 10h, bắt đầu 2026-07-18 ~22:00)

> File này là TRẠNG THÁI BỀN của phiên cải tiến dài. Mỗi batch: cập nhật Done + chọn mục Backlog kế tiếp.
> Quy tắc bất di bất dịch: xem memory `floodtwin-q1-demo` (do-not-regress list). Bump `?v=N` mỗi lần sửa để pane reload.

## v133 — Hội An không có một ngôi nhà nào khi OSM sập, và quét lỗi bản đồ

Thêm `tests/map-errors.mjs` (`npm run test:map-errors`, đã nối vào `npm test`): lái bản đồ
như người dùng — 3D bay tới 4 thành phố × 3 mức zoom, deep zoom, preset camera, orbit,
bật/tắt **mọi** layer, scrub suốt trận lũ, chuyển 2D và bay tiếp, rồi kiểm tra sức khoẻ
WebGL — và **đỏ khi có bất kỳ console error / pageerror / request hỏng cùng gốc nào**.

Lý do cần nó: các suite khác kiểm *kết quả* (e2e kiểm state, earth-map kiểm hợp đồng view,
zoom-visual kiểm pixel). Không cái nào đỏ khi app **nuốt** một exception, mà app này nuốt
có chủ ý (`try { buildOsmRoads() } catch { console.warn(...) }`) — nên một lớp 3D hỏng
trông y hệt mạng chậm. Tile 504 của bên thứ ba được **báo nhưng không làm đỏ**: đó là thời
tiết bình thường của app này, và một suite đỏ vì CDN người khác sẽ bị bỏ qua.

**Kết quả quét: không có lỗi nào phía app.** Nhưng log lộ ra `overpass-api.de`
**ERR_CONNECTION_REFUSED** — Overpass từ chối kết nối thường xuyên, nên nhà OSM hay không
về. Lần theo đó tìm ra hai lỗi thật:

**1. Hội An — thành phố trọng tâm của demo — có ĐÚNG 0 ngôi nhà khi OSM sập**, dù 9500 nhà
procedural vẫn được vẽ. Hạn mức 9500 là **ngân sách chung, ai đến trước lấy trước**; cửa sổ
Đà Nẵng (lớn nhất, xét đầu tiên) ăn sạch phần còn lại. Nay mỗi cửa sổ được chia đều phần
còn dư, tính lại theo từng cửa sổ nên suất chưa dùng hết tự động dồn sang cửa sổ sau.

**2. Nhà dồn hết lên mép trên mỗi vùng quét.** Sau khi sửa (1), cửa sổ Hội An có 909 nhà mà
quanh phố cổ **vẫn 0**. Tôi đoán là bộ lọc màu loại mái ngói ấm — **đo thì sai**: bộ lọc vẫn
nhận 2664 pixel quanh đó. Nguyên nhân thật là ngân sách bị tiêu **theo thứ tự quét từ trên
xuống**, hết sạch trước khi quét tới phố cổ. Nay có một lượt **đếm mật độ trước**, rồi nhận
một tỉ lệ cố định trải đều toàn vùng.

Đo sau khi sửa: Hội An **0 → 422 nhà** trong bán kính 3 km; phân bố giữa 5 cửa sổ đều hẳn
(1566–2190 thay vì 700/909/700/1192/701); và hộp bao nhà kéo dài tới z = 76,6 km thay vì
47,2 — **nam lưu vực trước đây chưa bao giờ được quét tới**, cùng một lỗi thứ-tự-quét.

## v132 — Xe cộ 300 m, marker trạm đo 310 m, và nước lũ vẽ chìm trong sườn đồi

Ba khiếm khuyết còn lại ở tầm zoom toà nhà, tìm bằng cách **loại trừ từng layer** chứ không
phải đoán — tôi đã đoán sai ba lần liên tiếp về những "mảng nâu" này (nghi nhà, nghi đường,
nghi vòng cảnh báo vùng) trước khi tắt đúng layer `traffic` và thấy chúng biến mất sạch.

**1. Xe cộ vẽ to 300 m — và hệ số co ĐÃ CÓ trong code nhưng là code chết.**
`BoxGeometry(0.3, 0.11, 0.14)` tính bằng km, tức mỗi "chiếc xe" dài 300 m rộng 140 m,
bằng cả một khối phố. Trong `updateVehicles`:

```js
const sV = 1 - roadCloseF * 0.86;
vehDummy.scale.set(sV, sV, sV);      // tính đúng hệ số co theo zoom…
const s = v.type === "moto" ? 0.5 : ...;
vehDummy.scale.set(s, 1, s);         // …rồi bị ghi đè ngay, sV bị vứt đi
```

Dòng thứ hai ghi đè toàn bộ vector nên `sV` **chưa bao giờ có tác dụng**. Hai hệ số phải
nhân với nhau, không phải gán hai lần. Đây là nguồn của tất cả "mảng nâu/đỏ" đè lên thành
phố ở street zoom — nâu là do ribbon đường (renderOrder 3) phủ lên xe màu đỏ bên dưới.

**2. Marker trạm đo là hình cầu đường kính 310 m trên cột 1,1 km.** Cỡ đó để tìm được trạm
trên miền 96 km, nhưng ghé sát thì nó là vệt vàng phủ kín một khu phố. Giờ co theo cùng hệ
số cận cảnh: **310 m → 93 m**. Tầm tổng quan không đổi (`roadCloseF = 0`).

**3. Nước lũ vẽ chìm trong sườn đồi.** Solver chạy trên lưới sim 288², người xem nhìn lưới
DEM 384². Chỗ mặt đất hiển thị cao hơn mặt nước mô phỏng thì nước bị vẽ **bên trong** quả
đồi và biến mất — đo được **26,9% số đỉnh ướt**. Nâng mặt nước lên mặt đất nhìn thấy, nhưng
**có trần `WATER_LIFT_CAP = 4 m`**.

Cái trần mới là điểm mấu chốt, và số liệu theo vành đai địa hình quyết định nó:

| Vành đai | Chìm trước | Chìm sau |
|---|---|---|
| Đồng bằng (< 25 m) — nơi ra quyết định | 8,3% | **2,6%** |
| Đồi (25–200 m) | 68,5% | 56,5% |
| Núi (> 200 m) | 86,9% | 83,3% |

Ở đồng bằng hai lưới lệch nhau vài mét → nâng lên là **sửa lỗi render**. Ở núi chúng lệch
tới **291 m** → nâng lên sẽ **bịa ra nước trên sườn núi**. Đó là giới hạn dữ liệu, không
phải lỗi hiển thị, và không được che đi. Nên vùng núi gần như không đổi, đúng chủ ý.
Đo hiệu năng sau khi sửa: **59,9 fps** ở street zoom, không hồi quy.

**4. Gate tự bắt lớp bug này về sau — và tôi đã phải sửa chính cái gate.**
Đã tìm thủ công **năm lần** cùng một lớp lỗi (drape, chân đế nhà 110 m, ribbon đường 600 m,
xe 300 m, marker trạm đo 310 m), nên `zoom-visual` giờ có kiểm tra: ở street zoom, không đối
tượng nào được vẽ rộng quá **250 m**.

Bản đầu của cái gate **vô dụng và suýt ship**: nó lấy `instance 0` làm đại diện, mà các slot
xe chưa dùng được "cất" ở scale 0,001 — slot 0 vô tình rỗng thì gate đọc 0,3 m và cho một
chiếc xe 300 m đi qua. Tôi phát hiện bằng cách **tái tạo đúng lỗi cũ trên một bản sao** và
thấy gate vẫn báo xanh. Sau khi quét max trên mọi instance (bỏ qua sentinel), bản sao hỏng
báo đúng `instanced[BoxGeometry] 390m`, bản đã sửa vẫn xanh.

Bản đầu còn có **dương tính giả**: nó đo bounding box cả mesh, nên mesh đường gộp trải 79 km
bị báo dù mỗi ribbon chỉ 108 m. Giờ chỉ đo instanced mesh và marker đơn (Sphere/Plane/…),
là những chỗ bbox đúng bằng kích thước đối tượng. Marker thanh mức của đập cũng được co theo
cùng hệ số; thân đập là công trình vật lý nên giữ nguyên.

## v131 — Nước lũ không còn xoá mặt đất, mà diện ngập vẫn rõ (P5)

Ở street zoom nước lũ sâu vẽ ở alpha **0,90** với màu chàm sẫm → xoá sạch thành phố bên
dưới; sông/biển `(0.05, 0.28, 0.41)` alpha 0,64 đọc như vệt đen cắt qua đô thị.

Làm nhạt **ruột** (hệ số fade khi ghé sát 0,40 → 0,58) và nâng `natural` + dải sâu `c5`
khỏi vùng gần đen. Nhưng làm nhạt ruột **chỉ chấp nhận được nếu ranh giới ngập vẫn rõ**.

**Lần một tôi làm sai và ảnh so sánh đã bắt được.** Viền dựa theo độ sâu
(`vDepth < 0.3 m`) không bao giờ xuất hiện ở chỗ nước sâu 6,5 m — tức là mất hẳn viền
đúng nơi ngập nặng nhất. Diện ngập mờ đi trông thấy: một hồi quy thật, đổi thông tin
lấy độ trong.

**Lần hai:** thuộc tính đỉnh **`aEdge`** tính trong `updateWater` — đỉnh ướt có ít nhất
một hàng xóm 4-lân cận khô. Ranh giới là thuộc tính của *mép*, mà fragment shader không
thấy hàng xóm, nên phải tính ở CPU. Shader vẽ viền sáng tại đó với alpha **độc lập
`uGhost`**: ruột nhạt đi, diện ngập vẫn đọc được.

Hệ số fade giờ đi từ `WATER_STYLE` vào shader **qua uniform**. Trước đó cùng cặp số nằm
ở hai nơi — đúng kiểu để `waterPresentation()` báo cho `earth-map` contract một con số
mà scene không hề vẽ. Contract vẫn giữ nguyên: `closeOpacity < farOpacity`,
`boundaryOpacity ≥ 0,72`, `flowOpacity ≥ 0,72`, permanent ≠ simulated.

**Hai bài học đo lường, đáng nhớ hơn cả bản sửa:**

1. **Sim tự chạy trong lúc harness đo** — mỗi lượt đo một thời điểm lũ khác nhau. Đây
   chính là nguồn dao động `district` 44,7 → 33,1 mà tôi từng tưởng do code gây ra.
   Giờ ghim `SIM_TIME_H = 12` (đủ sâu trong lũ — đo cách nước hiển thị thì phải có nước
   trong khung).
2. **Ngưỡng gate phải đặt DƯỚI hiệu ứng đo được, không phải ngay tại nó.** Tôi đặt claim
   `detail ≥ 0.4` *trước* khi đo; hai lượt sau cho **0,43 rồi 0,35** — ngưỡng nằm đúng
   trên trung bình, gate sẽ hỏng khoảng một nửa số lần. Tôi **không** hạ ngưỡng cho vừa
   rồi thôi: `detail` tăng thật nhưng chỉ ~0,4 ± 0,05 và không tăng ở mọi khung, nên nó
   được in ra để xem, còn gate đặt trên `murkPct` ở mức 1,5 điểm mà cả hai lượt đều vượt
   xa. Metric mới `detail` (gradient Sobel trung bình) vẫn hữu ích: nó biến câu hỏi "còn
   nhìn thấy thành phố dưới nước không" thành một con số.

Kill-switch **`?waterlegacy`**; `npm run zoom:compare` giờ nhận `--compare=<switch>` và
mỗi switch tự khai báo metric + hướng nó phải dịch chuyển.

## v130 — Nhà hiện lại, ánh sáng cự ly gần, ribbon đường co theo zoom (P2 + P3)

Tiếp nối v129. Bốn thay đổi, trong đó **một là sửa hệ quả phụ do chính v129 gây ra**.

**1. v129 đã chôn nhà — đã sửa.** Nâng drape lên `max(DEM, mặt-địa-hình)` khiến drape cao hơn
DEM trung vị **1,27 m**, p95 **3,95 m**, tối đa **12,18 m**. Nhà OSM chỉ cao 4–15 m, nên phần lớn
bị ngập dưới drape và gần như biến mất ở street zoom. Sửa bằng cách đưa **mọi thứ đứng trên mặt
đất** về cùng một mốc `groundY(x, y) = max(elevToY(DEM), mặt-địa-hình)`: nhà, đường, xe, trạm đo,
đập, vòng vùng, nhãn, vòng chọn. Trước đây mỗi chỗ tự lấy `elevToY(terrAt(...))` riêng.
Mặt nước **cố ý giữ nguyên** neo cũ — đó là vòng lặp 10 Hz trên WN² đỉnh, thêm truy vấn mặt
địa hình vào đó cần có số đo trước (xem P5).

**2. Ánh sáng cự ly gần.** Rig hoàng hôn (`0x081726`, hemisphere ground `0x18261f`, **không
ambient**) làm mọi mặt tường quay lưng đèn key rơi xuống gần đen khi ghé sát. Thêm
`AmbientLight` chỉ sáng lên theo độ gần (`cf * 0.42`), hemisphere `0.85 → 1.2`, sky lerp về màu
mù ban ngày, và `fog.near/far` nhân theo `26/camD` — sương chỉnh cho tầm 96 km vốn nuốt mất
trung cảnh của một khung nhìn 5 km. Tầm tổng quan **không đổi** (`cf = 0` ở mọi mức ≥ 26).

**3. Khối nhà đọc được.** Mái và tường giờ có **đỉnh riêng**, không dùng chung vòng đỉnh nữa:
trước đây `computeVertexNormals()` trộn normal ngang của tường với normal dọc của mái nên mọi
cạnh bo tròn và khối nhoè thành vệt. Mái sáng hơn tường (1,24 / 0,92) và hệ số này được giữ qua
cả lượt tô lại theo mức ngập.

**4. Ribbon đường co theo zoom.** Nửa bề rộng 0,11–0,30 km (~20× thật) để nhìn được ở tầm 96 km;
ghé sát thì thành mảng 600 m nằm đè lên thành phố. Cách giảm mờ sẵn có **không đủ** vì đường
*ngập* cố ý giữ alpha 1 — đúng những mảng nâu/cam to nhất. Giờ lưu tim đường + vector lệch mỗi
đỉnh, co bề rộng còn 0,18× khi ghé sát, theo đúng nhịp 0,25 s của lượt tô màu. Đo được:
**600 m → 108 m**. Áp dụng cho cả nhánh OSM lẫn nhánh procedural.

**Một lớp bug lặp lại, đáng nhớ:** mesh dựng lại theo sự kiện mạng (`osmRoads`, `osmBuildings`)
chỉ được áp scale/bề rộng khi mức zoom **thay đổi**. Camera đang đứng yên ở cự ly gần lúc dữ liệu
về thì mesh giữ nguyên kích thước dựng sẵn — nhà 110 m, đường 600 m. Cả `swapOsmBuildings`,
`buildOsmRoads` và `buildRoads` giờ đều áp ngay sau khi dựng.

**Harness:** `zoom-visual` giờ báo `hasImagery/hasDEM/hasOSMBldg`, **bỏ qua gate** và **từ chối
ghi baseline** khi lượt chạy bị suy giảm. Lý do rất thực tế: tile Esri/OSM 504 đủ thường xuyên để
một lượt đo trên cảnh **không có ảnh vệ tinh nào** — số đo đó vô nghĩa khi so với baseline, và
đóng băng nó làm baseline thì mọi lượt sau đều so với một cảnh hỏng.

Kết quả (lượt có ảnh vệ tinh, so với baseline v129): hoian/street murk **31,6 → 19,9**,
danang/street **36,6 → 30,9**, meanLuma street tăng 145 → 151 / 147 → 145 / 124 → 127.
`npm test` xanh toàn bộ, physics PASS.

Còn để ngỏ: **P5 tương phản nước** — mặt nước lũ hiện phủ mảng tím/lam khá dày, che nền ở
street zoom; và bề rộng đường 108 m vẫn ~5× thật, muốn hẹp nữa thì phải cân với yêu cầu nhìn rõ
trạng thái ngập của tuyến.

## v129 — Zoom cận cảnh hết mảng đen: lưới địa hình thô không còn đâm thủng drape

Người dùng báo "zoom vào chi tiết từng toà nhà thì đất, nhà và nước rất khó nhìn, có phần bị
màu đen và bị màu tối". Đây là lỗi **hình học**, không phải lỗi màu.

Ở `dist ≤ 34` app phủ lớp drape deep-zoom `DQ` (tile z13–z19) lên mặt đất. Drape bám **DEM**,
còn lưới địa hình bên dưới render ở **lưới thô 384² (~250 m/ô)**. Giữa hai nút lưới thô, tam
giác phẳng của nó nằm *cao hơn* DEM đang cong bên dưới; drape chỉ được nhấc ~1,75 m nên **địa
hình thô chọc thủng qua drape**. Chỗ chọc thủng là ảnh z12 mờ + shading Lambert → mảng xám đen
loang lổ khắp thành phố.

- `terrainSurfaceY()` nội suy **đúng mặt tam giác lưới địa hình đang vẽ** (cùng cách chia tam
  giác với index buffer) thay vì đọc DEM; `terrainSurfaceMax()` lấy thêm 4 điểm cách nửa ô
  drape, phủ trường hợp drape mới là lưới thô hơn. Cao độ drape = `max(DEM, mặt-địa-hình) + lề`.
- Cả hai đường dựng terrain (hi-res 384² và fallback theo lưới sim) đều nạp `terrGrid`.
- Kill-switch **`?drapelegacy`** khôi phục cao độ drape cũ (theo quy ước `?classic`), để so sánh
  trước/sau là phép đo hai nhánh code và để rollback.
- Harness mới `tests/zoom-visual.mjs` (`npm run test:zoom`, đã nối vào `npm test`;
  `npm run zoom:compare` in hai cột cạnh nhau).

Đo được: murk giảm trung bình **12,6 điểm**. Hội An street 48,0% → 28,1%; Ái Nghĩa street
40,3% → 23,1%; Đà Nẵng street 47,8% → 36,3%. meanLuma tăng đều 9–16 điểm. Mức `district`
không đổi — đúng kỳ vọng vì drape chỉ bật khi `dist ≤ 34`.

**Hai bẫy đo lường đã trả giá, đừng lặp lại:**
1. Không đọc được canvas bằng `drawImage` — renderer không bật `preserveDrawingBuffer`, mọi
   metric **im lặng trả về 0**. Phải qua `page.screenshot()` rồi `createImageBitmap` trong page.
2. Metric "đếm pixel tối" **không bắt được lỗi này**: mảng lỗi là xám xỉn chứ không đen, ngưỡng
   `luma < 55` đọc ~1% ở cả khung lỗi lẫn khung sạch. Metric dùng được là `murkPct` (tỉ lệ pixel
   luma 64–112), chọn bằng hiệu chỉnh trên cặp ảnh cùng góc máy: 35,3% vs 19,8%.

Gate là **chống hồi quy theo baseline**, không phải ngưỡng cố định: `murkPct` phản ánh cả nội
dung cảnh (Đà Nẵng 36% mà khung hoàn toàn sạch — sông Hàn + vịnh nằm đúng dải luma đó; Ái Nghĩa
trong đất liền chỉ 23%). Một con số cố định qua được cái này thì trượt cái kia.

**Ba giả thuyết đã bị bác bằng thực nghiệm** (chi tiết trong `PLAN_ZOOM_LEGIBILITY.md`): nhà
OSM/thủ tục (tắt layer `bldg` → mảng tối còn nguyên); mặt nước lũ (tắt `water` → còn nguyên);
normal địa hình bị lật do `scene.scale.y` (0/147456 đỉnh có `ny ≤ 0`, `minNy = 0.138`).

Còn để ngỏ: P2 ánh sáng cự ly gần, P3 khối nhà, P5 tương phản nước.

## v118–v119 — Thẩm quyền quyết định (RACI) được thực thi, không còn là tài liệu

Tệp mới `js/roles.js`. Trước đây app đã từ chối quyết định **vô danh**, nhưng vẫn nhận quyết
định từ **sai người**: ai đã định danh cũng phê duyệt được xả trước, trong khi D-03 thuộc thẩm
quyền Ban Chỉ huy PCTT&TKCN còn kỹ sư vận hành hồ chỉ được ĐỀ XUẤT. Mã hoá bảng RACI chính là
thứ biến "ai đang đăng nhập" thành "ai được quyết", tức là khác nhau giữa một nhật ký *có ghi
tên* và một nhật ký *bảo vệ được*.

- 12 quyết định D-01…D-16 với đúng một vai **chịu trách nhiệm (A)** mỗi quyết định, kèm vai
  thực hiện (R) và tham vấn (C).
- 6 vai trong bộ chọn trực ban (thêm **Kỹ sư an toàn đập** và **Chỉ huy ứng phó**).
- `decisionForProposal()`: cùng một hành động đổi mã quyết định theo trạng thái hồ —
  xả trước là **D-03**, trên trần đón lũ thành **D-05**, trên mực nước lũ thiết kế thành
  **D-06** và rời khỏi tay Ban Chỉ huy hoàn toàn.
- **Đảo thẩm quyền an toàn đập** được mã hoá: ở D-06, Ban Chỉ huy chỉ còn là bên *được thông
  báo*; đó chính là điểm mấu chốt của ưu tiên hạng-1 nên không để thành thông lệ ngầm.
- Thực thi ở 3 chỗ: phê duyệt gói quyết định, phát thông tin ra công chúng (**D-14**), lệnh
  sơ tán (**D-10**). Từ chối **nêu đích danh vai có thẩm quyền** và **được ghi vào nhật ký
  kiểm toán** — một lần phê duyệt hụt bởi sai cấp chính là thứ hội đồng điều tra sẽ hỏi.
- Panel "Thẩm quyền quyết định" hiện **trước** các nút, để người trực biết ngay quyết định này
  có phải của mình không, thay vì phát hiện bằng cách bị từ chối.

Kiểm chứng: 6/6 vai được thử — chỉ **authority** phê duyệt được D-03, năm vai còn lại bị từ
chối và mỗi lần đều có bản ghi.

**Ba phép thử E2E đỏ sau thay đổi này là ĐÚNG:** fixture đang đăng nhập sai vai. Sửa fixture
(thêm `signOnRole`), **không nới quyền**.

**Một phép thử được siết chặt hơn thay vì nới:** "boot không có lỗi console" từng đỏ vì
Overpass (dịch vụ bên thứ ba) từ chối kết nối. Lỗi ứng dụng phải bằng 0; lỗi nạp **lớp tăng
cường tuỳ chọn** là chuyện khác — app vốn thiết kế để chạy không cần nó. Nay tách làm hai:
lỗi ứng dụng = 0, và **thêm** một phép thử rằng khi lớp bên thứ ba hỏng thì app vẫn sống và
**nói ra điều đó** ở footer.

E2E **81/81** · UX **0 MUST** · selftest **16/16**. `?v=119` · `styles.css?v=21`.

## v113–v117 — Audit UI/UX bằng Playwright: 6 vi phạm MUST → 0

Tệp mới `tests/ux-audit.mjs` (37 phép đo) — chấm ứng dụng theo đúng chuẩn mà chính dự án
đặt ra trong `docs/05-product/04-ux-principles.md` + điều khoản tiếp cận trong NFR.
Chạy `npm run ux`. **Đây là ĐO, không phải soi**: tỉ lệ tương phản tính từ màu trình duyệt
thực sự vẽ ra (hợp thành mọi lớp trong suốt và gradient xuống tới nền trang), cỡ chữ / tràn
khung / tab order / focus đọc thẳng từ layout sống.

Phân mức **MUST** (vi phạm ⇒ exit 1) và **SHOULD** (báo cáo, không chặn).

**Lần chạy đầu: 6 vi phạm MUST. Bốn cái là thật, hai cái là lỗi của chính audit** — phải tách
bạch, vì một audit không thể sai thì không đo cái gì cả.

Lỗi THẬT của ứng dụng, đã sửa:
| Phát hiện | Đo được | Sửa |
|---|---|---|
| Không hề có chỉ báo focus bàn phím | 0 control có outline | `:focus-visible` outline + ring toàn bộ control |
| Chữ dưới ngưỡng đọc được | **317 node < 11 px** | nâng mọi khai báo lên ≥ 11 px; sửa lại chuẩn (A1) |
| Chữ cảnh báo trượt AA trên thẻ nền tint | 14 node ở **3,44–4,30:1** | làm sáng bảng màu cảnh báo trong gói quyết định |
| Số phơi nhiễm hiện chính xác giả | `1.603 người` | làm tròn về độ phân giải mô hình (trăm gần nhất) |
| Không hỗ trợ `prefers-reduced-motion` | thiếu | đã thêm |

Lỗi của AUDIT, đã sửa trong audit:
- **Nền gradient bị báo `ratio 1.0`** — `backgroundColor` của gradient là trong suốt nên hàm
  đi ngược lên lấy nhầm lớp. Lần sửa đầu lại quá tay: coi màu chặn đầu của gradient là ĐỤC,
  trong khi nó thường là `rgba(47,134,255,0.14)` → báo oan 134 node vốn đọc tốt. Nay hợp
  thành mọi lớp theo đúng alpha thật.
- **`element.focus()` không kích hoạt `:focus-visible`** trong Chromium (pseudo-class này gắn
  với heuristic tương tác bàn phím) → audit báo thiếu focus trong khi nó có. Nay bấm `Tab` thật.
- **`new Set()` trên mảng không khử trùng lặp** → 5 dải độ sâu rời rạc bị đếm thành 8 và
  đọc ra như thang màu liên tục.

**Sửa CHUẨN chứ không hạ chuẩn (A1).** Quy tắc cũ ghi "tối thiểu 14 px, giá trị chính 24 px+"
— đo ra 317 node vi phạm. Nâng tất cả lên 14 px sẽ phá chính yêu cầu "mật độ trước cái đẹp"
nằm ngay trên đó. Con số 14/24 px đúng cho **màn hình treo tường xem ở 2 m**, không đúng cho
**console vận hành để bàn xem ở 50–70 cm**. Chuẩn nay tách theo bề mặt, sàn tuyệt đối **11 px**
ở mọi bề mặt. Ghi thành *amendment* kèm lý do, không sửa lén.

**Một SHOULD còn lại, cố ý không dập:** gói quyết định nằm trong rail phải cuộn được
(R-28). Cách sửa đúng là nâng S-05 thành màn hình riêng — thay đổi kiến trúc thông tin, không
phải thay CSS. Giảm nhẹ: mọi tín hiệu quyết định *thường trực* (chế độ · escalation · sức khoẻ
dữ liệu · κ · P(vượt) · hạn quyết định) nằm ở global chrome và được kiểm là thấy được không
cần cuộn, mỗi lần chạy audit.

Kết quả: **36/37 đạt · 0 MUST · 1 SHOULD**. E2E vẫn **75/75**, selftest **16/16**.
`?v=117` · `styles.css?v=20`.

## v111–v112 — Bộ kiểm thử đầu-cuối Playwright (75 phép thử)

Thư mục mới `tests/`: `serve.mjs` · `browser.mjs` · `harness.mjs` · `e2e.mjs` + `README.md`.
Chạy `npm run e2e` (đầy đủ) hoặc `npm run e2e:quick`. **Không cần cài đặt** — `browser.mjs`
tự tìm Playwright ở project kế bên (SkyLabs_SURF2026 / SafeMove) khi project này chưa có
`node_modules`.

**Kế thừa từ harness cũ (SkyLabs_SURF2026/scripts) — phần đắt giá nhất:**
- **Cờ GPU trong `browser.mjs`.** Chromium headless vẽ WebGL bằng SwiftShader (CPU) → cảnh 3D
  chạy ~0 fps và click quá hạn 30 s trong khi ứng dụng hoàn toàn đúng. Có ANGLE/Metal thì
  ~60 fps, click ~186 ms. Không có nó thì bộ test chập chờn mà không rõ nguyên nhân.
- `serve.mjs` không phụ thuộc, có fallback `EADDRINUSE`.
- Bộ `step/ok/bad/check`, bắt console + `pageerror`, báo cáo theo nhóm, exit code.

**Cải tiến so với bản cũ:**
1. **Chờ tín hiệu boot thay vì `sleep` cứng.** Bản cũ `waitForTimeout(22000)` — vừa chậm trên
   máy khoẻ vừa thiếu trên máy yếu, đúng kiểu "flaky" tự tạo. Nay chờ dòng `[selftest]` do
   chính ứng dụng phát ra.
2. **Bằng chứng khi lỗi**: ảnh màn hình + dump trạng thái `FT` vào `tests/artifacts/`.
3. **Điều khiển thời gian tất định** (`setTime`): scrub → resettle world → zones → tick, đúng
   như ứng dụng làm, nên không phép thử nào đua với vòng render.
4. **Kiểm bất biến chứ không chỉ kiểm thao tác**: tính tất định, trạng thái là hàm thuần của t,
   nhất quán số liệu trong bản tin, tính khả thi ràng buộc.
5. **`report.json`** để so sánh giữa các lần chạy.

**Tổ chức theo QUY TRÌNH VẬN HÀNH, không theo màn hình** — 14 nhóm: WF-01 boot/honesty ·
WF-03 gói quyết định · WF-07 cổng phê duyệt · DT-7 suy giảm L0–L4 · WF-05 an toàn hồ ·
WF-09 chuỗi thông báo · DT-8 triết lý cảnh báo · WF-10 sơ tán · Domain (máy trạng thái, sự
kiện, tất định) · WF-12 báo cáo · FR-29 tiểu lưu vực · Map · liên-tầng · ma trận kịch bản.

**Bộ test bắt được 1 lỗi thật ngay lần chạy đầu:** khu vực **chỉ có một tuyến đường** bị loại
khỏi danh sách sơ tán — code thêm chúng vào danh sách *trước* `slice(0, 7)` nên đúng những
cộng đồng cô lập sớm nhất lại bị cắt, trái với chính chú thích của nó. Sửa: cắt trước, rồi
đảm bảo luôn có mặt.
Một phép thử của chính tôi cũng sai: khẳng định "nhà nhiều tầng luôn hợp lệ" — nhưng nhà 2
tầng nền thấp CÓ THỂ ngập quá tầng trú thật. Viết lại bất biến theo `refugeLost` thay vì số
tầng; ứng dụng đúng, phép thử sai.

Kết quả: **75/75 đạt**. `?v=112`.

## v105–v110 — Tiểu lưu vực, độ ẩm trước lũ, máy trạng thái + dòng sự kiện, báo cáo

Tệp mới `js/domain.js` + `js/reports.js`. Hoàn tất toàn bộ §3 của gap-analysis.

**Mưa theo tiểu lưu vực (FR-29).** 8 tiểu lưu vực với hệ số địa hình `oro` **chuẩn hoá về
trung bình 1,0 theo trọng số** — phân bố lại cưỡng bức chứ không âm thầm thổi phồng, nên
hiệu chỉnh cũ được giữ nguyên. Mưa thượng nguồn → dòng vào hồ (**điều tiết được**), mưa khu
giữa/đồng bằng → thẳng vào trạm (**không điều tiết**). Đây mới là cơ sở thật của κ.

**Độ ẩm trước lũ.** API (k=0,9/ngày) → **chỉ số bão hoà 0–1** (không phải mm trần trụi) →
hệ số ướt, **chuẩn hoá theo trung bình sự kiện** nên tổng lượng không đổi mà chỉ đổi HÌNH
DẠNG: đợt mưa đầu sinh dòng chảy ít (đất khô), các đợt sau nhiều hơn (đất bão hoà). Đó chính
là bài học 10/2020.

**Máy trạng thái + dòng sự kiện (domain.js).** Hồ chứa 7 trạng thái với đồ thị chuyển hợp lệ;
trạm, đường, khu vực cũng có vòng đời. **124 sự kiện tất định** dựng sẵn cho cả T−24→T+48,
hiển thị thành dải sự kiện dưới thanh thời gian, bấm để nhảy tới thời điểm.
Hai nguyên tắc bắt buộc: **trạng thái là hàm thuần của (đối tượng, t)** và **dòng sự kiện được
SUY RA chứ không tích luỹ** — nhờ vậy tua ngược cho kết quả y hệt tua xuôi.

**Báo cáo (FR-33).** Tình huống · **hồ sơ vận hành công khai** · báo cáo sau lũ tự dựng lại từ
dòng sự kiện + nhật ký kiểm toán. Tất cả đều mang dấu chế độ và phiên bản mô hình.

**Ba lỗi thật phát hiện khi dựng và đã sửa:**
1. **Đồ thị chuyển trạng thái hồ sai.** Máy quét báo `PASS_THROUGH→FLOOD_CONTROL` và
   `EMERGENCY_RELEASE→CONTROLLED_RELEASE` là bất hợp lệ. Cả hai đều CÓ THẬT: lũ nhiều đợt
   (10/2020 có 4 đợt) khiến hồ quay lại cắt lũ đợt sau; nước rút thì hạ cấp từ xả khẩn cấp về
   xả điều tiết. Sửa đồ thị, không sửa vật lý.
2. **Trạng thái điểm trú không phải hàm thuần của t** — trộn độ sâu SWE hiện tại với dị thường
   tại t bất kỳ, khiến dòng sự kiện báo "mất điểm trú" ở T−19h, trước cả khi có lũ.
3. **Hiển thị API thô ~2.700 mm** — con số không nhà thuỷ văn nào chấp nhận. Đổi sang **chỉ số
   bão hoà 0–1** kèm mốc tham chiếu, và **nêu thẳng** vấn đề hiệu chỉnh mưa lên màn hình (R-26:
   tổng mưa kịch bản 2.700–3.800 mm/72h, cao hơn dải hợp lý 1.000–1.500 mm/72h).

**Self-test 13 → 16** (thêm: không có chuyển trạng thái bất hợp lệ; dòng sự kiện tất định khi
dựng lại; trạng thái điểm trú độc lập với vị trí SWE). `[selftest] PASS 16/16`.

Đã quét hồi quy **6 tổ hợp kịch bản × chính sách**: không lỗi, không chuyển trạng thái bất hợp
lệ. `?v=110` · `styles.css?v=16`.

## v91–v104 — Lớp vận hành: tuyến theo thời gian, điểm trú, cảnh báo, thông báo hạ du

Tệp mới `js/forecast.js` + `js/alerts.js` (vẫn CỘNG THÊM — `opsui.js` bọc `FT.ui.tick`).

**Dự báo theo thời điểm sử dụng (FR-22/24).** `world.js` **nghịch đảo** chính `eqTarget()` một
lần lúc dựng để mỗi cạnh đường có mức dị thường trạm làm nó ngập ⇒ giờ đóng đường chỉ là tra
cứu trên chuỗi mực nước đã tính sẵn, tất định và an toàn khi tua. Vì công thức nghịch đảo là
**cân bằng** còn trường SWE thì có tắt dần và bị cap, mô hình đóng đường SỚM hơn mô phỏng
(khớp 78–100%, lệch một chiều) → `forecast.calibrate()` neo lại `a0` từng cạnh theo độ sâu
quan trắc mỗi chu kỳ, snap khi người dùng tua. **Đo lại: khớp 100%** tại thời điểm hiện tại.
Sinh ra: `open_until`, "đi trước HH:MM", giờ cô lập từng khu vực, cờ **"1 tuyến"** cho khu chỉ
có một đường vào (Cẩm Kim – Cửa Đại).

**Điểm sơ tán (FR-23).** 12 điểm thật + số tầng/sức chứa/cao độ nền. Hợp lệ = **tầng trú còn
trên mặt nước**, không phải "tầng trệt khô" — sơ tán theo chiều đứng là như vậy. Mất tầng trệt
⇒ giảm sức chứa ×0,45, không loại. Vẽ trên bản đồ 2D với trạng thái sống (lớp `shelters`).

**Cảnh báo (FR-44, DT-8).** Một điều kiện một cảnh báo; gộp theo nguyên nhân gốc; chặn bão
cảnh báo; xác nhận từng cái có định danh; **an toàn đập miễn trừ gộp/tự xoá**.

**Thông báo hạ du (FR-20).** MỘT bản ghi → kịch bản gọi điện · SMS · loa xã · thẻ dân cư · CAP,
kèm ma trận người nhận và theo dõi **xác nhận** từng nhóm. Kênh gửi là **hộp cát, không gửi thật**.

**Năm lỗi thật phát hiện khi dựng và đã sửa:**
1. Hợp lệ của điểm trú phụ thuộc EOC có tới được không → nơi trú mất liên lạc với EOC vẫn là nơi
   trú của dân quanh đó; đó là bài toán **tiếp tế**. Tách `valid` và `warn: no-resupply`
   (3/12 → 9/12 hợp lệ lúc đỉnh).
2. Bản tin ghi "Giao Thủy ~10,23 m, trên BĐ1 0,03 m" — 10,23 m tại trạm đó là **trên BĐ3 1,43 m**.
   Mức báo động nay được suy lại từ đúng trạm và mực nước mà bản tin trích dẫn; có assertion.
3. SMS còn dấu, còn `m³/s` và gạch ngang dài, dài 214 ký tự → ép ASCII và **tách thành nhiều
   phần ≤160**, đánh số, không cắt cụt.
4. 11 cảnh báo cô lập gần giống nhau → gộp còn một cảnh báo/nguyên nhân, liệt kê khu vực.
5. Nhà nhiều tầng bị loại khi ngập tầng trệt → tầng trên CHÍNH LÀ nơi trú.

**Self-test 10 → 13** (thêm: mức báo động khớp mực nước trích dẫn; SMS thuần ASCII và mọi phần
≤160; cảnh báo an toàn đập không bị gộp). Console: `[selftest] PASS 13/13`.

Đã chạy tay toàn chuỗi trực ban: đăng nhập → xác nhận cảnh báo → soạn → phát → xã xác nhận →
nhật ký ghi `alarm.raise · alarm.ack · notify.dispatch · notify.ack`. `?v=104` · `styles.css?v=13`.

## v87–v90 — Bộ tài liệu sản phẩm `docs/` + lớp quyết định vận hành

Toàn bộ Product Knowledge Base nằm ở **[`docs/`](docs/README.md)** (26 tài liệu: nền tảng chuyên ngành,
mô hình thế giới, personas, quy trình vận hành, cây quyết định, đặc tả engine, màn hình, PRD, NFR, KPI,
phản biện đa vai, sổ rủi ro, lộ trình M0–M4, đối chiếu code). Tệp mới `js/decision.js` + `js/opsui.js`.

**Lớp mới (cộng thêm — `opsui.js` BỌC `FT.ui.tick`, không sửa đường render cũ):**
- **Thanh ops thường trực**: chế độ (DỮ LIỆU TỔNG HỢP), thang leo thang L0–L5, sức khỏe dữ liệu L0–L4,
  hệ số điều tiết κ, **đồng hồ đếm ngược hạn quyết định** (= giờ xả − thông báo 2h − phê duyệt 0,5h).
- **Gói quyết định S-05**: hành động 6 trường · kiểm tra ràng buộc C1–C10 kèm biên và trạng thái ·
  **phản thực (không hành động)** · phương án thay thế tính CHÍNH XÁC từ tính tuyến tính của mô hình trạm ·
  hối tiếc hai chiều · mức tin cậy kèm lý do · phiên bản mô hình.
- **Biên an toàn hồ**: chiều cao an toàn, dZ/dt làm trơn 1h, dung tích còn trống, thời gian đầy trần,
  thời điểm hết khả năng cắt lũ.
- **Nhật ký kiểm toán chỉ-ghi-thêm** (localStorage + hash ảnh chụp): phê duyệt phải có **định danh người trực**
  và **lý do ghi nhận**, nếu thiếu thì chặn.
- **Suy giảm dữ liệu có kiểm chứng**: L2/L3 → VÔ HIỆU bộ tối ưu, nêu rõ thiếu gì và do đó KHÔNG tính gì;
  L4 → **TỪ CHỐI đưa đề xuất**, chuyển sang EAP + danh bạ.

**Hai lỗi thật của engine cũ, phát hiện khi đấu nối và đã sửa:**
1. `buildProposal` chọn hồ căng nhất bất kể hồ đó có ảnh hưởng tới trạm khống chế hay không — đề xuất vận hành
   Sông Tranh 2 rồi báo cắt đỉnh tại Ái Nghĩa, nơi trọng số định tuyến của hồ này bằng 0. Nay chọn **cặp
   (hồ, trạm khống chế)** có tích ứng suất × trọng số lớn nhất và báo đúng trạm đó.
2. Mô hình trạm chặn ở `g.max`; kịch bản Yagi khiến CẢ HAI chính sách chạm trần ⇒ chênh đỉnh = 0 ⇒ hệ thống
   báo "không cần hành động" đúng vào kịch bản xấu nhất. Nay phát hiện bão hoà và báo **KHÔNG SO SÁNH ĐƯỢC**,
   độ tin cậy **UNUSABLE**.

**Self-test mở rộng 4 → 10 khẳng định** (thêm: có phản thực, có danh sách ràng buộc, không khả thi không bị
đánh dấu khả thi, có nêu ràng buộc quyết định, L2 vô hiệu tối ưu, L4 từ chối, tin cậy không vượt LOW ở bản
tổng hợp, bão hoà không bị báo là "không cần hành động"). Console: `[selftest] PASS 10/10`.

`?v=90` · `styles.css?v=10`. Đã kiểm trong trình duyệt: không lỗi console, 5 mức suy giảm hoạt động đúng,
chặn phê duyệt vô danh, ghi nhật ký có định danh + lý do.

## v86 — Hồ sơ quyết định (EP-03, mốc M0 của SkyLabs_SURF2026)

Mục A3 + A4 trong `product-os/backlog/BL-01-master-backlog.md`. Tệp mới `js/record.js`.

- **Tuần tự hoá tất định + SHA-256 tự cài.** Khoá sắp xếp mọi tầng, số làm tròn sáu chữ số
  thập phân rồi in bằng `String` (thuật toán Number-to-String của ECMAScript, giống nhau ở
  mọi runtime). Không dùng `crypto.subtle` vì nó bất đồng bộ và chỉ chạy trong ngữ cảnh an
  toàn, trong khi demo phải mở được từ tệp cục bộ — và một cách cài đặt riêng cho phép cổng
  kiểm đối chiếu chéo với `node:crypto`.
- **Ảnh chụp đóng băng tại thời điểm bấm**, không phải lúc dựng tài liệu. `H.at()` trả về một
  đối tượng dùng chung nên phải sao từng trường ra, đừng giữ tham chiếu.
- **Ba kết cục chung một sổ chỉ ghi thêm**: phê duyệt, từ chối, bị thay thế. Đổi kịch bản hoặc
  đổi chính sách khi đang có quyết định mở sẽ sinh bản ghi bị thay thế trỏ về bản ghi trước.
  Kéo thanh trượt mưa thì **không** sinh, nếu không sổ sẽ ngập bản ghi rác.
- **In một trang A4** dùng lại `#printReport` và khối `@media print` sẵn có; phụ lục sang trang
  riêng. Dấu chìm `DEMO · CHƯA KÝ` để màu vô sắc nên sống sót bản photocopy đen trắng.
- **Cổng kiểm** `SkyLabs_SURF2026/scripts/verify-record.mjs`, 48 phép kiểm.

### Bẫy gặp phải, đừng lặp lại

- **Đo bản in phải ở 718 px.** Đo ở bề rộng khung nhìn 1440 px thì cả chiều cao trang lẫn phép
  kiểm tràn lề đều cho kết quả sai. Cổng kiểm nay `setViewportSize` về 718 px trước khi đo.
- **`scrollWidth` không thấy phần tử con tràn hai bên.** Dấu chìm căn giữa trong flex tràn cả
  trái lẫn phải, `scrollWidth` chỉ đếm phía phải nên báo bình thường. Phải bọc chữ trong `span`
  rồi so `getBoundingClientRect` của nó với khổ trang.
- **Băm lại chính đối tượng vừa băm không chứng minh gì.** Thứ tự khoá còn nguyên nên bộ tuần tự
  hoá quên `.sort()` vẫn qua. Phép kiểm thật là đảo ngược thứ tự khoá ở mọi tầng rồi băm lại.
- **Cổng kiểm mở demo phải dùng `launchGpu`.** Chromium không đầu vẽ WebGL bằng CPU, cảnh 3D tụt
  gần 0 khung hình/giây và `page.click` quá hạn trong khi ứng dụng hoàn toàn đúng.

### Điều tìm ra khi in tài liệu ra giấy, không phải khi đọc mã

Bao ensemble tại Ái Nghĩa là **5,87–11,96 m quanh trung vị 9,86 m**, trong khi cùng màn hình
ghi xác suất giữ dưới báo động 3 (9,0 m) là **8%**. Hai con số không thể cùng mô tả một phân bố.
Nguyên nhân: `pBelow` trong `hydro.js` là công thức đóng, không đọc thang phân vị. Lỗi này có
sẵn từ trước, không do hồ sơ quyết định gây ra; in cả hai lên một trang chỉ làm nó lộ ra.
**Chưa sửa** vì con số 8% được trích trong `business/PITCH_GLOBAL_5MIN.md`. Đã ghi thành R-33
trong `BL-02` và A25 trong `BL-01`, chặn M2. Phụ lục hồ sơ nói thẳng hai con số chưa hoà giải.

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
