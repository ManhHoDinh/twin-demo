# FloodTwin Q1 Demo — Ghi chú bàn giao (v77)

> v70–v77: 2D zoom tới z20 (~0,15 m/px) với vá tile cha + hẻm Overpass; **3D nhận toàn bộ chi tiết thật** — drape texture 2304² (thay vertex-color) + lớp detail động nạp live-tile z13→19 theo khoảng cách camera (kiểu Google Earth), ghé sát tới 1,2 đơn vị; tile lỗi mạng tự retry + tự lành sau 30 s.

> **Reference chuẩn về dữ liệu & chỉnh sửa: xem `DATA_AND_METHODS.md`** (kiểm kê thật/tổng hợp, pipeline dựng demo, bảng "muốn chỉnh gì sửa ở đâu", quy tắc chống thoái lui).

## Chạy ngay
- **Double-click `index.html`** (Chrome/Edge/Safari). Cần internet lần đầu để tải Three.js + bản đồ thật (~5–15 s, hiện "tải DEM…"); offline vẫn chạy đủ tính năng với bản đồ procedural.
- Deep-link: `index.html#tour` (tự trình diễn 60 s) · `#2d` · `#focus` (toàn bản đồ) · `#yagi` · `#monsoon` · `#en`.

## Kịch bản demo 3 phút (gợi ý)
1. Mở `#tour` — tour tự kể: nước lên → đỉnh rule vượt BĐ3 → MPC đề xuất → **Phê duyệt** → đỉnh giảm (ghost line so sánh) → bản tin LLM có trích dẫn.
2. Tab **Bản đồ 2D**: lăn chuột zoom vào Đà Nẵng/Hội An tới **từng nóc nhà (~0,3 m/px)** — đường, cầu, nhãn QL14B thật; lớp lũ bán trong suốt đè lên.
3. Click 1 khu trong "Khu vực giám sát" → hồ sơ chi tiết (sparkline, nhà ngập, tuyến EOC, hành động) → "Đến vị trí".
4. 🖨 **Xuất báo cáo** → PDF tình huống. ℹ️ ở thẻ chỉ số → minh bạch thật/tổng hợp.

## Điểm neo kỹ thuật
- **Bản đồ thật**: DEM AWS z11 · Esri Imagery z12 + live-tiles theo khung nhìn tới z19 · Esri Transportation (raster) + OSM vector (3 mirror, tự bật ở trình duyệt thật — footer "OSM ✓ N") · tọa độ đập/trạm/đường/khu là thật · ghi công ở footer.
- **Mô phỏng**: SWE virtual-pipes 144² trên đồng bằng (<28 m) + đồng hóa mực trạm; hydrology giải tích T−24→+48 h, 2 chính sách (Rule/MPC) + ensemble; giao thông Dijkstra đóng ≥30 cm; 12 khu giám sát; tác động (nhà ngập theo pixel ảnh, nhiệt đồ dân×ngập, 5 dải mật độ nước, max·TB).
- **Tự kiểm định**: mỗi lần mở app chạy `selfTestHydro` (MPC cắt đỉnh · BĐ3 · quantile · cân bằng khối) — footer hiện **H✓**; FAIL sẽ toast đỏ.
- Quy tắc chống thoái lui + lịch sử chi tiết: `IMPROVEMENT_LOG.md`, `PLAN.md`, memory nội bộ `floodtwin-q1-demo`.

## Đã kiểm chứng
- Boot sạch console qua 69 phiên bản; chu trình lũ trọn vòng (lên → đỉnh BĐ3 923 km² → rút) + kiosk tự phát lại nhiều vòng; zoom tay tới mức từng-nhà (ảnh chụp trong phiên); selftest PASS 4/4 mọi boot.
- Lưu ý môi trường QA: pane nội bộ không dispatch click chuột (wheel OK) — các flow nút bấm (tour/approve/modal/in) hoạt động với chuột thật vì dùng sự kiện `click` chuẩn.

## Việc mở nếu cần tiếp
- OSM building footprints (từng căn thật) — cần trình duyệt thật/Overpass; khung đã sẵn (mirror list).
- Review đa agent (`scratchpad/review-workflow.mjs`) khi hạ tầng classifier hoạt động.
- Nếu muốn tab Toàn quốc VN trở lại: thêm 3 script `vndata/hydronat/nation.js` + nút tab + `canvasNation` (mã còn nguyên).
