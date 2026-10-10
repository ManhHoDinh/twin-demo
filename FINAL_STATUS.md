# Trạng thái hiện tại — 2026-10-08

Đã triển khai sửa lỗi và hoàn thiện pipeline local; không gọi OpenAI. Trạng thái chi tiết, bằng chứng và giới hạn ở [AUDIT_FIX_REPORT](docs/AUDIT_FIX_REPORT.md).

Các tuyên bố trước đây về pretrained MC-LSTM, production readiness, groundedness 95% và tăng tốc 6800 lần không có bằng chứng kiểm chứng. Chúng không còn là kết luận hiện tại.

LSTM hiện là baseline một tầng; tank ensemble là mô hình riêng có bảo toàn nước. Dữ liệu mặc định là tổng hợp. Mục tiêu nghiên cứu chưa đạt và chưa có xác nhận thực địa. Xem [roadmap](AI_ROADMAP.md) và [quy trình local](docs/LOCAL_AI_WORKFLOW.md).
