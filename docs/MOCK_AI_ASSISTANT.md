# Trợ lý AI mock trên trang chính

Trạng thái: mock cục bộ theo quy tắc. Không gọi OpenAI, LLM hoặc RAG. Không thay thế mô hình thủy văn bằng AI đã huấn luyện. Mọi số liệu là mô phỏng, chưa được kiểm định cho vận hành thực tế.

## Cách thử

Chạy `npm run serve`, mở trang chính, bấm nút **✦**. Có thể tạo bản tin, chọn câu hỏi nhanh, hoặc nhập câu hỏi về mực trạm, hồ chứa, giao thông, bất định và nguồn dữ liệu. **Hỏi về Hội An** minh họa cách trả lời câu hỏi vượt độ phân giải hiện có: hiển thị Câu Lâu và giới hạn, không suy diễn độ sâu hay xác suất ngập đường nhà.

Kết quả giữ nguyên số liệu tại thời điểm trả lời. Nếu thời gian, kịch bản, forcing, bất định, trạm được chọn, phương án xem thử, chính sách vận hành hoặc tình trạng dữ liệu thay đổi, nhãn yêu cầu cập nhật sẽ xuất hiện. Tạo lại bản tin hoặc gửi lại câu hỏi để lấy bối cảnh mới. Đổi VI/EN chỉ đổi cách diễn đạt của kết quả đã chụp.

## Hợp đồng dữ liệu và tính toán

- `js/ai/mock-assistant.js` chụp bối cảnh bất biến từ engine. Không ghi vào state, snapshot dùng chung của hydro hoặc quyết định vận hành.
- Mực trạm và mực/lưu lượng hồ được nội suy từ đúng selection Rule/MPC của từng hồ. Phương án xem thử được ghi rõ; không đồng nghĩa đã phê duyệt.
- Khoảng triển vọng là `[t, min(t + 12, T1)]`. Đỉnh trung vị là giá trị lớn nhất trên đoạn này, xét cả hai đầu đoạn và các nút của chuỗi nội suy tuyến tính. Tại T1 không đưa dự báo tiếp theo. Không kéo dài chuỗi ngoài miền mô hình.
- P05/P95 lấy tại cùng thời điểm đỉnh đường trung vị. Đây không phải phân vị của đỉnh lũ trong cả khoảng thời gian, hoặc xác suất ngập đường. Dải giả định của engine chưa hiệu chuẩn, phụ thuộc thời gian tính từ T=0; tại T≤0 dải bằng đường mô phỏng.
- Đỉnh bị chặn tại giới hạn mô hình và dung tích hồ vượt sức chứa được nêu rõ. Không coi số bị chặn là đỉnh lũ thực hoặc số liệu vận hành khả thi.
- Giao thông đọc thống kê mạng đường của thế giới vận hành đang hiển thị, ghi riêng phạm vi này khi xem thử phương án thủy văn. Mock không giả định đã mô phỏng lại đường cho selection xem thử, không chỉ dẫn tuyến an toàn khi thiếu vị trí.
- Dữ liệu không hợp lệ hoặc L4: từ chối tổng hợp/dự báo. Từ L2: chỉ mô tả trạng thái lưu, ngừng đưa triển vọng tương lai. L1 ghi rõ suy giảm.
- Câu hỏi không có quy tắc: từ chối theo phạm vi. Yêu cầu phê duyệt/thực thi: không thực hiện; luồng quyết định hiện có vẫn chịu trách nhiệm định danh, lý do, khả thi và phê duyệt.
- Các nhãn nguồn là đường tính toán nội bộ, không phải chứng cứ nghiên cứu, bản tin trực tiếp hoặc kết quả kiểm định groundedness.

## Kiểm thử

`npm run test:mock-ai` chạy trên trang chính với engine thực của demo. Kiểm tra tính bất biến và khớp số liệu; đỉnh/dải tại biên thời gian; selection hỗn hợp; suy giảm và NaN; giới hạn câu hỏi cư dân; form, cập nhật bối cảnh; thoát HTML đầu vào; VI/EN; bố cục di động và không gọi endpoint AI. Kiểm thử cũng được đưa vào `npm run test:regressions`.

Ảnh kiểm tra được ghi trong `tests/artifacts/mock-ai-desktop.png` và `mock-ai-mobile.png`. Các tài liệu về LSTM và API local mô tả nhánh nghiên cứu riêng, chưa được tích hợp vào trợ lý mock này.
