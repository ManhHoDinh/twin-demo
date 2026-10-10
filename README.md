# FloodTwin Q1 Demo — Vu Gia–Thu Bồn Digital Twin

Demo nghiên cứu sẵn sàng cho triển khai kỹ thuật của paper **FloodTwin** (Q1): bản sao số lũ & liên hồ chứa nhận thức bất định, nền tảng pháp quy, mô phỏng **giao thông–lũ tổng hợp cập nhật liên tục** trên 2D/3D.

> 🧪 **Kiểm thử đầu-cuối: [`tests/`](tests/README.md)** — `npm run e2e` (89 phép thử, tổ chức theo **quy trình vận hành** chứ không theo màn hình). Không cần cài đặt: tự tìm Playwright ở project kế bên. Lỗi sẽ kèm ảnh màn hình + trạng thái `FT` trong `tests/artifacts/`.

> 📚 **Bộ tài liệu sản phẩm (Product Knowledge Base): [`docs/`](docs/README.md)** — kiến thức chuyên ngành (thủy văn, thủy lực, vận hành hồ, an toàn đập, khí tượng, cảnh báo, pháp quy), mô hình thế giới, personas, 12 quy trình vận hành, cây quyết định, đặc tả engine hỗ trợ quyết định, 18 màn hình, PRD, NFR, KPI, phản biện đa vai, sổ rủi ro và lộ trình M0–M4. Bắt đầu ở [docs/README.md](docs/README.md); đối chiếu code ↔ yêu cầu ở [docs/99-appendix/demo-gap-analysis.md](docs/99-appendix/demo-gap-analysis.md).

## Tính năng

- **3D digital twin (Three.js)** — địa hình VGTB kiểu ảnh vệ tinh (rừng phủ sườn, ruộng patchwork, đô thị xám), 4 hồ bậc thang (A Vương, Sông Bung 4, Đắk Mi 4, Sông Tranh 2), mặt nước shader theo dòng chảy — **nước lũ overbank màu phù sa**, xe cộ di chuyển, mưa, nhãn địa danh. *(Chế độ Toàn quốc VN nằm trong `js/vndata|hydronat|nation.js`, hiện không nạp.)*
- **Zoom từng m²**: bản đồ 2D tự nạp tile ảnh vệ tinh + giao thông thật theo khung nhìn tới z19 (~0,3 m/px) — thấy từng nóc nhà, mọi ngõ hẻm.
- **Bản đồ vận hành 2D** kiểu Google Flood Hub — nền hypsometric + hillshade, lớp ngập theo độ sâu, hạt dòng chảy, trạng thái đường 4 mức, trạm thủy văn theo màu báo động BĐ1–3.
- **Mô phỏng trạng thái nước có bảo toàn số học trong demo**: shallow-water height-field (virtual pipes) 288² (~333 m/ô), cưỡng bức bởi lệnh xả hồ + dòng chảy mặt, nudging theo chuỗi mực trạm tổng hợp — cấp độ sâu cho cả 3 lớp hiển thị và mạng giao thông; chưa phải mô hình thủy lực đã hiệu chỉnh hoặc kiểm định vận hành.
- **Giao thông mô phỏng cập nhật liên tục**: ~130 xe tổng hợp định tuyến Dijkstra theo thời gian, tự đổi lộ trình khi đường ngập ≥30 cm; ETA Đà Nẵng → Hội An được tính lại theo trạng thái kịch bản.
- **Dự báo xác suất**: hydrograph ensemble fan (5–95%, 25–75%, trung vị) trên nền quan trắc, đường báo động BĐ1/2/3; timeline T−24h → T+48h tua/kéo tự do.
- **Rule curve tĩnh ⇄ FloodTwin MPC**: so sánh trực tiếp hai chính sách vận hành; đề xuất **xả trước** kèm *gói quyết định* (bao ensemble, điều khoản QĐ 1865/QĐ-TTg, rủi ro tồn dư) — người trực **phê duyệt** thì hạ lưu thay đổi ngay.
- **Trợ lý AI mock**: bản tin và hỏi đáp theo quy tắc, đọc số liệu mô phỏng hiện tại; ghi rõ bối cảnh, nguồn tính toán và giới hạn. Không gọi LLM hay RAG, không tự phê duyệt lệnh.
- **Song ngữ VI/EN**, dark theme chuẩn phòng điều hành, 60 fps.

## Trình diễn & deep-link

- Nút **🎬 Trình diễn** (góc phải trên): tour tự động ~60 giây kể trọn chuỗi *nước lên → đỉnh rule vượt BĐ3 → MPC đề xuất → phê duyệt → đỉnh giảm → bản tin AI mock*; chạm/bấm phím bất kỳ để dừng.
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
| `js/ui.js` | panels, KPI, modal, bản tin mock, toasts |
| `js/main.js` | bootstrap + vòng lặp mô phỏng/render |

**Dữ liệu tổng hợp minh hoạ phương pháp — không dùng cho vận hành thật.**

---

## FloodTwin AI — bản local

Đã chọn chế độ local, không gọi OpenAI. Trang chính có trợ lý mock cục bộ qua nút ✦: tạo bản tin, chọn câu hỏi nhanh hoặc nhập câu hỏi. Xem [phạm vi mock và kiểm thử](docs/MOCK_AI_ASSISTANT.md). Hai trang `ai-demo.html` và `phase2-training.html` minh họa dữ liệu tổng hợp, huấn luyện và đánh giá; chúng không cung cấp dự báo vận hành đã hiệu chuẩn.

- `ml-hydrology.js`: ensemble mô hình ba bể chứa bảo toàn nước, tham số có seed; không có trọng số neural pretrained.
- `training.js`: LSTM một tầng, BPTT + Adam, đầu ra log1p lưu lượng; class `TrainableMCLSTM` giữ tên cũ để tương thích, không phải kiến trúc MC-LSTM của Hoedt et al.
- `data-assimilation.js`: EnSRF xử lý quan trắc từng trạm, giữ đúng chỉ số khi thiếu quan trắc.
- `risk-engine.js`: so sánh chính sách từ ensemble thủy văn; giả định tương quan và hệ số thiệt hại chưa hiệu chuẩn.
- `llm-integration.js`: mặc định template local, không có chứng cứ để xác nhận groundedness.

Chạy giao diện bằng `npm run serve`, rồi mở `http://127.0.0.1:4310/`. Cài Chromium cho Playwright bằng `npx playwright install chromium` khi máy chưa có. Chạy `npm test` cho kiểm thử nội bộ. Bộ hợp đồng tài liệu ngoài dự án chạy riêng bằng `npm run test:external-docs`; cần checkout `SkyLabs_SURF2026` hoặc đặt `FLOODTWIN_PRODUCT_OS` đến thư mục tương ứng.

Huấn luyện có seed bằng `npm run train:local`. Nhập dữ liệu riêng bằng `node scripts/run-phase2.cjs --dataset đường-dẫn.json --gauge aiNghia`; hợp đồng dữ liệu, đơn vị và cách chia tập ở [hướng dẫn local](docs/LOCAL_AI_WORKFLOW.md). Đầu ra mặc định trong `artifacts/local-ai/`: mô hình, validation JSON/Markdown, dự đoán CSV và fixture kiểm tra JS/Python. Tạo biểu đồ bằng `python scripts/plot-validation.py`.

Cài thư viện API bằng `python -m pip install -r scripts/requirements.txt`, hoặc `scripts/requirements-plot.txt` nếu cần biểu đồ. Chạy `npm run serve:ai` cho API tại `http://127.0.0.1:5000`; mặc định sử dụng tank ensemble. Đặt biến môi trường `FLOODTWIN_MODEL_PATH` đến `model.json` trước khi chạy để sử dụng LSTM đã xuất. API chỉ nhận artifact theo giờ, target một giờ, đúng trạm và đủ chiều dài lịch sử.

Không có kết quả thực nghiệm nào trong bản này chứng minh NSE ≥ 0.80, KGE ≥ 0.75, CSI ≥ 0.80 hay tăng tốc so với HEC-RAS. Xem [báo cáo sửa lỗi](docs/AUDIT_FIX_REPORT.md), [roadmap hiện tại](AI_ROADMAP.md) và [quy trình đánh giá](docs/LOCAL_AI_WORKFLOW.md).
