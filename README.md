# FloodTwin Q1 Demo — Vu Gia–Thu Bồn Digital Twin

Production-ready demo web app cho paper **FloodTwin** (Q1): bản sao số lũ & liên hồ chứa nhận thức bất định, nền tảng pháp quy, mô phỏng **giao thông–lũ theo thời gian thực** trên 2D/3D.

> 🧪 **Kiểm thử đầu-cuối: [`tests/`](tests/README.md)** — `npm run e2e` (75 phép thử, tổ chức theo **quy trình vận hành** chứ không theo màn hình). Không cần cài đặt: tự tìm Playwright ở project kế bên. Lỗi sẽ kèm ảnh màn hình + trạng thái `FT` trong `tests/artifacts/`.

> 📚 **Bộ tài liệu sản phẩm (Product Knowledge Base): [`docs/`](docs/README.md)** — kiến thức chuyên ngành (thủy văn, thủy lực, vận hành hồ, an toàn đập, khí tượng, cảnh báo, pháp quy), mô hình thế giới, personas, 12 quy trình vận hành, cây quyết định, đặc tả engine hỗ trợ quyết định, 18 màn hình, PRD, NFR, KPI, phản biện đa vai, sổ rủi ro và lộ trình M0–M4. Bắt đầu ở [docs/README.md](docs/README.md); đối chiếu code ↔ yêu cầu ở [docs/99-appendix/demo-gap-analysis.md](docs/99-appendix/demo-gap-analysis.md).

## Tính năng

- **3D digital twin (Three.js)** — địa hình VGTB kiểu ảnh vệ tinh (rừng phủ sườn, ruộng patchwork, đô thị xám), 4 hồ bậc thang (A Vương, Sông Bung 4, Đắk Mi 4, Sông Tranh 2), mặt nước shader theo dòng chảy — **nước lũ overbank màu phù sa**, xe cộ di chuyển, mưa, nhãn địa danh. *(Chế độ Toàn quốc VN nằm trong `js/vndata|hydronat|nation.js`, hiện không nạp.)*
- **Zoom từng m²**: bản đồ 2D tự nạp tile ảnh vệ tinh + giao thông thật theo khung nhìn tới z19 (~0,3 m/px) — thấy từng nóc nhà, mọi ngõ hẻm.
- **Bản đồ vận hành 2D** kiểu Google Flood Hub — nền hypsometric + hillshade, lớp ngập theo độ sâu, hạt dòng chảy, trạng thái đường 4 mức, trạm thủy văn theo màu báo động BĐ1–3.
- **Mô phỏng nước thật**: shallow-water height-field (virtual pipes) 144², cưỡng bức bởi lệnh xả hồ + dòng chảy mặt, đồng hóa mực trạm — cấp độ sâu cho cả 3 lớp hiển thị và mạng giao thông.
- **Giao thông thời gian thực**: ~130 xe định tuyến Dijkstra theo thời gian, tự đổi lộ trình khi đường ngập ≥30 cm; ETA Đà Nẵng → Hội An cập nhật liên tục.
- **Dự báo xác suất**: hydrograph ensemble fan (5–95%, 25–75%, trung vị) trên nền quan trắc, đường báo động BĐ1/2/3; timeline T−24h → T+48h tua/kéo tự do.
- **Rule curve tĩnh ⇄ FloodTwin MPC**: so sánh trực tiếp hai chính sách vận hành; đề xuất **xả trước** kèm *gói quyết định* (bao ensemble, điều khoản QĐ 1865/QĐ-TTg, rủi ro tồn dư) — người trực **phê duyệt** thì hạ lưu thay đổi ngay.
- **Lớp LLM có kiểm soát**: bản tin tình huống & hỏi đáp cư dân với 100% mệnh đề kèm trích dẫn (RAG mô phỏng) — LLM không bao giờ tính thủy lực.
- **Song ngữ VI/EN**, dark theme chuẩn phòng điều hành, 60 fps.

## Trình diễn & deep-link

- Nút **🎬 Trình diễn** (góc phải trên): tour tự động ~60 giây kể trọn chuỗi *nước lên → đỉnh rule vượt BĐ3 → MPC đề xuất → phê duyệt → đỉnh giảm → bản tin LLM*; chạm/bấm phím bất kỳ để dừng.
- Deep-link: `index.html#tour` (tự chạy tour), `#2d` (mở bản đồ 2D), `#yagi` / `#monsoon` (kịch bản), `#en` (tiếng Anh).
- Di chuột trên hydrograph để đọc mực nước + dải 5–95% tại bất kỳ thời điểm nào; mỗi hồ có sparkline vào/xả với vạch thời điểm hiện tại.

## Chạy

```bash
cd FloodTwin_Q1_Demo
python3 -m http.server 4174
# mở http://127.0.0.1:4174/
```

Hoặc mở thẳng `index.html` (Three.js tải từ CDN; nếu offline app tự chuyển bản đồ 2D đầy đủ).

## Kiểm tra nhanh

```bash
for f in js/*.js; do node --check "$f"; done
```

## Cấu trúc

| File | Vai trò |
|---|---|
| `js/core.js` | namespace, state, event bus, i18n VI/EN, utils |
| `js/data.js` | địa lý VGTB, kịch bản (10/2020, Yagi, gió mùa), mạng đường, corpus trích dẫn |
| `js/hydro.js` | engine thủy văn giải tích: hồ chứa 2 chính sách, ensemble, sự kiện |
| `js/world.js` | địa hình, sông, SWE virtual-pipes, đồng hóa, lưới giao thông |
| `js/traffic.js` | agent xe, Dijkstra, re-route theo độ sâu |
| `js/map2d.js` | bản đồ 2D + hạt dòng chảy + tương tác |
| `js/scene3d.js` | Three.js: địa hình, nước shader, đập, xe, mưa |
| `js/charts.js` | hydrograph fan + timeline scrubber |
| `js/zones.js` | 12 khu vực giám sát: ngập, phơi nhiễm, tuyến EOC, hành động |
| `js/vndata.js` | hình học Việt Nam + 26 hồ thủy điện + bão theo kịch bản |
| `js/hydronat.js` | engine quốc gia đa yếu tố (bão·mưa·đất·routing·triều) |
| `js/nation.js` | scene 3D toàn quốc + panel vận hành + drill-down |
| `js/ui.js` | panels, KPI, modal, brief LLM, toasts |
| `js/main.js` | bootstrap + vòng lặp mô phỏng/render |

**Dữ liệu tổng hợp minh hoạ phương pháp — không dùng cho vận hành thật.**
