[ROLE - VAI TRÒ]
Hãy đóng vai là một Senior Frontend Engineer & GIS Developer chuyên nghiệp (có kinh nghiệm sâu về React/Vue, Three.js, CesiumJS/Mapbox GL JS, và Tailwind CSS). Bạn có tư duy UX/UI sắc bén, am hiểu việc tối ưu hiệu năng đồ họa 3D và xây dựng các hệ thống Giám sát & Dự báo Thiên tai (GIS Dashboard).

[TASK - NHIỆM VỤ CHÍNH]
Xây dựng giao diện Web Dashboard Giám sát Map3D và Theo dõi/Dự báo Lũ bão dựa trên khung thiết kế UI/UX đã định hình.
Ứng dụng hiện tại tập trung hoàn thiện phần Bản đồ 3D và Hệ thống UI theo dõi. Cấu trúc được thiết kế sẵn sàng để tích hợp các mô hình AI dự báo trong tương lai.

[CONTEXT - BỐI CẢNH ỨNG DỤNG]

- Loại ứng dụng: Hệ thống Giám sát & Dự đoán Lũ Bão (Flood & Typhoon Tracking System).
- Phong cách UI: Glassmorphism (Panel bán trong suốt, hiện đại, tối giản), Dark mode chuyên dụng cho Trung tâm điều hành (Operations Center).
- Trải nghiệm người dùng (UX): Màn hình chính cực kỳ sạch sẽ, chỉ tập trung vào Map 3D. Các thông tin chi tiết chỉ hiển thị khi bấm chọn (Contextual Inspector) hoặc gom nhóm trong các Panel có thể thu gọn (Collapsible Panels).

[UI/UX SPECIFICATIONS & MAPPING]
Hãy dựng layout theo đúng chuẩn phân bổ các khu vực sau:

1. KHU VỰC BẢN ĐỒ 3D (CENTER & BACKGROUND):
   - Bản đồ 3D thực tế (Real-world 3D Terrain), thể hiện rõ độ cao địa hình, sông hồ, bờ biển và thềm lục địa.
   - Hỗ trợ chiếu sáng tĩnh/động (Lighting/Shadows) khớp với độ sâu địa hình.
   - Tọa độ & Nhãn 3D (3D Pin/Labels) gắn trực tiếp lên môi trường 3D (VD: CANAL 34, RIVER 22, Điểm theo dõi bão/lũ).
   - Thanh Timeline 3D dưới cùng màn hình (Bottom Center): Cho phép trượt xem lại lịch sử di chuyển của bão hoặc mực nước lũ theo mốc thời gian (00:00 - 24:00).

2. PANEL BÊN TRÁI (LEFT SIDEBAR):
   - [Top Left] MAP LAYERS: Tùy chỉnh lớp bản đồ (Realistic Terrain, Satellite Overlays, Data Overlays, Vessel/Storm Traffic) bằng công tắc Toggle.
   - [Middle Left] SYSTEM OVERVIEW: Thẻ chỉ số tổng quan (Active Assets, Critical Alerts, Network Load) dùng thiết kế Bento-grid nhỏ gọn.
   - [Bottom Left] FILTER & TYPHOON TRACKING: Bộ lọc chọn đối tượng (Tàu thuyền, Trạm đo mưa, Tâm bão, Vùng nguy cơ lũ quét).

3. PANEL BÊN PHẢI (RIGHT SIDEBAR):
   - [Top Right] ALERT CENTER: Danh sách cảnh báo khẩn cấp (Sức gió, Mực nước vượt ngưỡng, Cảnh báo lũ) có phân cấp độ nghiêm trọng (Severity: High/Medium/Low) kèm nút 'Quick-action' và 'Delete'.
   - [Bottom Right] CONTEXTUAL INSPECTOR (Panel thông minh):
     - Mặc định ẩn hoặc thu gọn.
     - CHỈ HIỆN KHI NGƯỜI DÙNG CLICK VÀO CẢNH BÁO/TÂM BÃO/TRẠM ĐO.
     - Chứa 4 Tab: [Overview] | [Telemetry - Khí tượng] | [History - Lịch sử] | [Maintenance/Forecast].

[FUNCTIONAL REQUIREMENTS - TÍNH NĂNG THEO DÕI BÃỜ & LŨ]

1. Hệ thống Tracking Bão (Typhoon Tracking):
   - Hiển thị tâm bão, bán kính ảnh hưởng (Vùng gió mạnh R15/R25) dưới dạng hình tròn/polygon bán trong suốt trên Map 3D.
   - Vẽ đường đi dự báo của bão (Forecast Track/Polyline) kèm các điểm mốc dự báo tương lai.
2. Hệ thống Theo dõi & Cảnh báo Lũ (Flood Monitoring):
   - Hiển thị các Trạm đo mực nước (Hydro Stations) trên sông/kênh rạch với trạng thái màu sắc (Xanh: An toàn, Vàng: Báo động 1-2, Đỏ: Báo động 3/Lũ cực đại).
   - Hiển thị thông số khí tượng trong Contextual Inspector khi chọn trạm: Mực nước hiện tại, Lưu lượng xả lũ, Sức gió, Lượng mưa 24h.
3. Sẵn sàng tích hợp AI (AI-Ready Architecture):
   - Thiết kế sẵn Data Model/State cho phần "AI Prediction": Dự báo đường đi bão trong 24h/48h tới, Dự báo vùng có nguy cơ ngập lụt cục bộ (Flood Hazard Mapping).

[TECHNICAL STACK RECOMMENDATION]

- Tech Stack: React (hoặc Next.js) / TypeScript / Tailwind CSS.
- Map Engine: Mapbox GL JS 3D (hoặc CesiumJS / Three.js).
- State Management: Zustand hoặc Redux Toolkit để quản lý trạng thái các Panel và đối tượng được chọn (Selected Object).
- Icons: Lucide-react / Heroicons.

[CONSTRAINTS - QUY TẮC CODE]

1. Code viết theo dạng Mô-đun sạch (Clean Architecture), tách riêng các thành phần UI (Panel) và thành phần Map 3D.
2. Responsive tốt trên màn hình Desktop/Operations Monitor (tối thiểu 1080p).
3. Đảm bảo giao diện tối giản, hiệu ứng hover/click mượt mà, bóng mờ Glassmorphism (`backdrop-blur-md`, màu nền `bg-slate-900/60`, viền `border-white/10`).

[ACTION - HÀNH ĐỘNG]
Trước khi viết mã nguồn hoàn chỉnh, hãy:

1. Đề xuất cấu trúc thư mục (Folder Structure) tối ưu cho dự án này.
2. Khai báo Data Structures (TypeScript Interfaces) cho dữ liệu Bão (Typhoon), Trạm đo lũ (HydroStation), và Cảnh báo (Alert).
3. Sau đó tiến hành viết Code mẫu cho khung giao diện chính (Main Dashboard Layout) kèm hiệu ứng Glassmorphism.
