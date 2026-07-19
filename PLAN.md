# FloodTwin Q1 Demo — Phân tích & Kế hoạch kỹ thuật (cập nhật v28)

## 1. Phân tích Google Flood Hub (sites.research.google/floods)

| Mẫu UI/UX của Flood Hub | Chuyển hoá vào demo FloodTwin |
|---|---|
| Bản đồ trạm đo tô màu *Normal / Warning / Danger* | Trạm Ái Nghĩa, Câu Lâu, Giao Thủy, Cẩm Lệ tô theo **BĐ1/BĐ2/BĐ3**; nhãn 3D hiển thị mực nước sống |
| Hydrograph dự báo kèm dải tin cậy, ngưỡng nằm ngang | Fan chart ensemble **5–95% / 25–75% / trung vị**, vạch BĐ1/2/3, tách quan trắc/dự báo, **hover đọc giá trị tại mọi thời điểm**, ghost so sánh Rule ⇄ MPC |
| Inundation map | Lớp ngập theo **độ sâu** từ SWE thời gian thực; 3D: nước lũ overbank **màu phù sa**, kênh xanh |
| LSTM + IMERG | Khối cưỡng bức GenCast·IMERG, hệ số mưa/ensemble chỉnh được |
| Cảnh báo, bản địa hoá | Toast + nhật ký + song ngữ VI/EN |

**Khoảng trống Flood Hub mà FloodTwin lấp:** vận hành hồ chứa pháp quy, giao thông, human-in-the-loop, LLM bị chặn biên.

## 2. Kiến trúc (1 nguồn sự thật → 3 mặt hiển thị)

```
hydro.js  (giải tích T−24h→T+48h, rule & mpc, ensemble, sự kiện)
   ▼ stage/outflow/alert
world.js  (SWE virtual-pipes 144² CHỈ trên đồng bằng <28 m; núi diagnostic;
           đáy sông bám địa hình; hBase = max(giải tích, settle); floodCap vật lý)
   ▼ depth/velocity/excess          ▼ excess trên mẫu đoạn đường
scene3d / map2d / charts        traffic.js (Dijkstra, đóng ≥30 cm, ETA)
   ▼                                ▼
zones.js — 12 khu giám sát (meanD + %dân, tuyến EOC, hành động, sparkline)
```

Nguyên tắc hiệu chỉnh đã chốt (chống thoái lui — chi tiết trong memory `floodtwin-q1-demo`):
SWE giới hạn đồng bằng · đáy sông theo bucket-min thực khắc · lũ = vượt nền (hBase) có cap
= dị thường trạm max + 0,6 m · không inject xả hồ trực tiếp (đã nằm trong đồng hóa trạm).

## 3. Tính năng vận hành (v28)

- **Trình diễn 60s** (nút 🎬 / `#tour`): nước lên → đỉnh rule vượt BĐ3 → MPC đề xuất → phê duyệt → đỉnh giảm → bản tin.
- **Gói quyết định MPC** trích QĐ 1865/QĐ-TTg Đ.7/Đ.8, bao P90, rủi ro tồn dư, chip so sánh đỉnh Rule→MPC.
- **12 khu vực giám sát**: trạng thái theo diện ngập + tỷ lệ dân, tuyến EOC Dijkstra sống, POI, khuyến nghị hành động, bay tới vị trí.
- **Bản tin LLM 100% trích nguồn** + hỏi đáp cư dân + **🖨 Xuất báo cáo in** (bảng trạm/hồ/khu vực/giao thông, print CSS trắng đen).
- Sparkline vào/xả từng hồ; hover hydrograph; deep-link `#2d #tour #yagi #monsoon #en`; error-toast an toàn.
- Bản đồ chất ảnh vệ tinh (bilinear ×6, ruộng patchwork, đô thị theo mật độ dân, rừng phủ tới 900 m).

## 4. Chuẩn Q1 phản chiếu

| Mục tiêu paper §8 | Demo |
|---|---|
| CSI ≥ 0.80 · NSE ≥ 0.80 · KGE ≥ 0.75 | Thẻ chỉ số 0.84/0.86/0.79 (nhãn demo tổng hợp) |
| Surrogate 1–2 bậc | Chip 42 ms/bước · 68× HEC-RAS-2D |
| Groundedness ≥ 0.95 | Mọi mệnh đề brief có chip trích dẫn |
| Human-in-the-loop | Phê duyệt/Từ chối; "không cửa van nào theo lời LLM" |

## 5. Kiểm thử

1. `node --check js/*.js` (10 file).
2. Harness `verify-hydro.mjs` (scratchpad): MPC cắt đỉnh Ái Nghĩa, thứ tự quantile, cân bằng khối hồ.
3. Browser: boot sạch console, 60 fps, scrub 2 chiều, tour, approve → hạ lưu đổi, VI/EN, in báo cáo.
4. Review đa agent (`review-workflow.mjs`, scratchpad) khi hạ tầng cho phép.

## 6. Bản đồ THẬT & lớp tác động (v36–v60)

- `js/geo.js`: DEM AWS Terrain z11 + Esri World Imagery **z12** (5 cửa sổ z14 + patch gốc ~9 m/px cho zoom sâu) + Esri World Transportation (đường thật raster) + Overpass OSM vector (2 mirror, progressive); bbox 107,55–108,45°E / 15,30–16,16°N (96 km); fallback procedural khi offline.
- Địa hình 3D 384² drape ảnh thật, tách khỏi lưới sim 144²; nước hiển thị 240² bilinear, **5 dải độ sâu rời rạc** đồng bộ 2D/3D; nước overbank màu phù sa.
- Tác động: tòa nhà đặt theo pixel ảnh (cam ≥15 cm/đỏ ≥50 cm, đếm "Nhà ngập"), nhiệt đồ dân×ngập, choropleth khu vực theo **độ sâu TB** + nhãn "max · TB", thanh đo meanD từng khu.
- Vận hành: glyph hồ = cột mực nước + vạch trần trước lũ; camera toàn cảnh chéo xuống; kiosk tự phát lại; deep-link `#tour #2d #focus #yagi #monsoon #en`; ghi công dữ liệu footer.

*(Chế độ Toàn quốc VN: mã còn trong `js/vndata|hydronat|nation.js`, không nạp theo yêu cầu.)*
