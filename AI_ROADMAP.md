# FloodTwin — trạng thái và roadmap

Cập nhật 2026-10-08. Phạm vi được chọn: hoàn thiện bản local, không gọi OpenAI. Trạng thái dựa trên [báo cáo audit](docs/AUDIT_FIX_REPORT.md), không dựa trên số dòng code.

| Phase | Đã hoàn thành tại máy | Phần chưa hoàn thành và đầu vào cần thiết |
|---|---|---|
| 1 — Prototype | Sửa 19 lỗi audit; đồng bộ engine/UI/phê duyệt; tank ensemble bảo toàn nước; EnSRF quan trắc thiếu; template local; risk ensemble cùng cơ sở thủy văn | Hiệu chuẩn mô hình thủy lực/thiệt hại và xác minh pháp lý chưa có dữ liệu |
| 2 — Data & training | Timestamp/đơn vị thống nhất; nhận dataset JSON local; BPTT + Adam cho LSTM baseline; chia train/validation/test không chồng cửa sổ; xuất weights, dự đoán và chỉ số | Chưa có chuỗi VGTB/IMERG thực, quyền sử dụng, QC, pretraining CAMELS hoặc MC-LSTM theo bài báo; các ngưỡng nghiên cứu chưa đạt |
| 3 — Integration | API Flask loopback; kiểm tra input; nạp artifact đúng schema/trạm/timestep; đối chiếu suy luận JS/Python; baseline không có credential; CLI huấn luyện lặp lại | Chưa có feed quan trắc thực, backend xác thực, vận hành retraining, môi trường triển khai, SLO và điều kiện nghiệm thu; OpenAI không bật theo lựa chọn người dùng |
| 4 — Validation & publication | Kiểm thử hồi quy; đánh giá held-out; JSON/CSV/Markdown; script xuất PNG/SVG; quy trình thực nghiệm có thể lặp lại | Chưa có đánh giá thực địa, hydraulic benchmark tương đương, bài báo có kết quả thực, venue/tác giả và chỉ thị nộp bài |

“Hoàn thành local” không đồng nghĩa hoàn thành các yêu cầu nghiên cứu hoặc đưa vào vận hành. Không tự tạo quan trắc, trọng số pretrained, citation pháp lý, chỉ số đạt mục tiêu hay kết quả benchmark để đánh dấu xong phase.

Các kiểm thử hợp đồng với repository `SkyLabs_SURF2026` vẫn giữ nguyên yêu cầu kiểm tra và chạy riêng qua `test:external-docs`; cần cung cấp repository đó hoặc đường dẫn `FLOODTWIN_PRODUCT_OS`.
