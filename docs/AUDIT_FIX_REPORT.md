# FloodTwin — sửa lỗi audit và hoàn thiện local

Ngày 2026-10-08. Người dùng cho phép sửa code và chọn phương án 1: hoàn thiện bản local, không gọi OpenAI. Không deploy, không nộp bài, không tạo dữ liệu thực hoặc chứng cứ nghiên cứu giả.

## Các lỗi đã xử lý

| # | Lỗi | Thay đổi và bằng chứng |
|---|---|---|
| 1 | Modal/tour vượt chốt phê duyệt | Card và modal dùng chung authorizeDecision; kiểm tra danh tính, lý do, RACI, deadline, khả thi và loại package; tour không tự duyệt. Browser regression thử từ chối và phê duyệt có danh tính |
| 2 | Cắt storage ở capacity làm mất nước | Không cắt storage phía trên; giới hạn withdrawal theo nước có sẵn; công bố capacityExceeded. Kiểm tra mass balance từng bước kể cả bước đầu, mọi kịch bản × rainScale × policy |
| 3 | Decision và hydro dùng local runoff khác nhau | stageSeries/gaugeParts dùng chung nguồn và công thức tiểu lưu vực. Kiểm tra giá trị bằng nhau ở từng timestep và từng trạm |
| 4 | Tuyến chỉ an toàn ở lúc vào cạnh | Kiểm tra cả thời gian đi qua cạnh, các nút timestep và lúc ra; tính lại duration khi slowdown. Kiểm tra đóng đường giữa hành trình, đóng rồi mở lại; shelter được xét lúc đến |
| 5 | Training sai kích thước weights, NaN | LSTM một tầng với input/recurrent gates đúng chiều, BPTT và Adam thật; kiểm tra load schema/shape/finite; đối chiếu gradient finite differences và loss giảm |
| 6 | Date identity làm lệch dataset; null/zero nhập nhằng | Ghép/sắp xếp theo epoch, revive Date trong cache; giữ zero, giữ null; kiểm tra timestamp đều và đơn vị. Fixture 10 ngày × 4 trạm ở cache lạnh/ấm |
| 7 | EnKF sai chỉ số quan trắc thưa | Serial EnSRF ánh xạ đúng trạm và sai số riêng; validate kích thước; tiêu thụ quan trắc theo thời gian một lần. Kiểm tra lần lượt mỗi trạm đều finite, innovation giảm |
| 8 | Preview SINGLE/PAIR hiển thị all-MPC | Map, hydrograph, timeline và reservoir spark dùng selection đầy đủ từng hồ; RECOVERY theo rule. Browser/unit đối chiếu mixed selection |
| 9 | Export Rule nhận nhãn đã duyệt theo global flag | Approval liên kết package/audit/event/forcing; export compare luôn là RECOMMENDATION. Kiểm tra package không liên quan và thay forcing |
| 10 | Sigma suy từ q95 đã cắt | Giữ sigma gốc trước clipping; xác suất dùng Gaussian gốc. Record giữ sigma và nêu rõ bất định tổng hợp chưa hiệu chuẩn |
| 11 | Xe blocked không chạy lại khi đường mở | Requeue khi topology mở lại. Browser regression xác nhận 130 xe blocked thoát blocked |
| 12 | AI pages thiếu geo dependency | Nạp geo trước data; initialize hydro khi cần. Cả hai trang được kiểm tra boot và training/validation local trên browser |
| 13 | Ensemble giống nhau, reset mất trạng thái | Seed tham số khác nhau; commit đúng một forcing step, forecast branch rồi restore; ledger nước. Mô hình được ghi đúng là conservative tank ensemble |
| 14 | briefGen không được kết nối | Manager nối briefGen; mặc định template local dùng context, không giả số liệu/groundedness. Test chặn mọi network call |
| 15 | Validation Date 1970, numeric metric bị đọc như object | Dùng endTime thật, raw discharge/expm1 đúng một lần, so sánh numeric; metric suy biến trả null; bỏ benchmark HEC-RAS giả |
| 16 | API nhận NaN, mưa âm, interval sai, ngưỡng sai | Flask validate input, timestep, trạm và artifact; tank giữ toàn bộ lịch sử forcing đã cung cấp; conservative mass ledger; q05/q95 có semantics 90% sensitivity, alias cũ được chú thích; ngưỡng khớp bốn trạm. Python contracts và JS/Python inference parity |
| 17 | Record version cũ/người duyệt giả | Build version lấy từ asset đang chạy; seal lấy actor/reason/audit_seq từ audit lưu; UI hiển thị danh tính/lý do đã escape. Hồ sơ demo không được coi là chữ ký số |
| 18 | Mobile place sheet chồng ops strip | Bỏ top cố định gây đè; kiểm tra shell layout desktop/mobile và earth-map |
| 19 | npm test phụ thuộc repository sibling không có | Giữ nguyên ba hợp đồng ngoài repo trong test:external-docs, có đường dẫn cấu hình; npm test chỉ chạy kiểm thử nội bộ. Không đánh dấu các hợp đồng ngoài là đã pass |

Các lỗi bổ sung phát hiện trong vòng kiểm thử cũng được xử lý: capacity shelter phải hợp lệ tại arrival, risk vượt từng ngưỡng phải có thời điểm riêng, tank state riêng từng gauge, validation không làm tiến trạng thái model đang dùng, tái khởi tạo tắt feature không giữ model cũ, record/modal không dùng nhãn phê duyệt chung, deadline không áp dụng có nhãn rõ ràng và trạng thái SATURATED có nhãn độ tin cậy không xác định.

## Phạm vi kiểm chứng

- Unit regression: 15 nhóm, gồm mass balance từng timestep, mixed selection, sigma, routing, shelter arrival, timestamp/cache, split/units, shape/gradient/training, sparse EnSRF, tank state/mass, metrics/risk và local brief.
- Python API: 6 test methods với nhiều subcase invalid input, batch, mass/interval/risk và export/inference parity. Kiểm tra prediction đầu tiên của API bằng output JS, thiếu lịch sử bị từ chối.
- Browser regression: 7 nhóm, gồm approval modal/audit, preview/export, forcing invalidation, blocked traffic và hai trang AI.
- E2E chính: 89/89; City/Plant: 76/76; explainability: 43/43; compare: 18/18.
- UX: 41/41, không còn MUST/SHOULD violations sau khi bổ sung confidence cho SATURATED và deadline không áp dụng.
- Kiểm tra cú pháp: 73 tệp JS/MJS/CJS, 3 inline scripts (có module) và 5 tệp Python đều đạt.
- Shell smoke/interaction/layout đã chạy và đạt; kiểm tra bố cục có desktop và mobile 390 px.
- Lượt npm test tích hợp xác nhận các gate đầu; có một assertion E2E cũ yêu cầu deadline là dấu gạch ngang, mâu thuẫn với UX yêu cầu trạng thái rõ ràng. Đã cập nhật assertion để vẫn bắt buộc REFUSAL tại L4 và nhãn KHÔNG ÁP DỤNG/NOT APPLICABLE, rồi chạy lại E2E đạt 89/89. Các gate còn lại được chạy tiếp theo đúng thứ tự của npm test; không bỏ kiểm tra lỗi.
- Earth Map: 26/26; zoom: 9/9; map-error sweep không có lỗi phía ứng dụng, WebGL context không mất và glError = 0. Các endpoint OSM bên ngoài có 23 sự kiện request/CORS/abort trong lượt này; fallback hoạt động, không coi kết nối bên ngoài là đã được nghiệm thu.
- Physics gate đạt: sai số mass balance SWE lớn nhất 0,000141%, nhỏ hơn giới hạn 0,01%; không có depth âm hoặc NaN/Infinity. DEM base z12 khoảng 36,8 m/px, không có fine overlay trong lượt chạy. Chuỗi UX → shell → Earth Map → zoom → map-errors → physics kết thúc exit 0.
- Build AI kết thúc exit 0; git diff --check không có lỗi whitespace. Các test unit/API được chạy lại sau thay đổi validation/serving cuối và đều đạt.

Log cục bộ trong tests/artifacts được git-ignore. Mỗi kiểm thử có phạm vi cụ thể; các kết quả này không chứng minh không còn mọi lỗi có thể xảy ra, không chứng nhận mô hình dự báo thực địa hoặc bảo mật vận hành.

## Những phần local đã hoàn thiện

Pipeline có seed: dataset theo giờ → LSTM baseline → early stopping validation → held-out test → schema-2 model → Python inference. Xuất model.json, validation.json/.md, predictions.csv, parity.json và script PNG/SVG. Chạy mặc định đã hoàn thành; có 564 train, 66 validation, 54 test sau khi purge cửa sổ. Chia tập không dùng test để chọn mô hình.

| Held-out test, synthetic | Kết quả |
|---|---:|
| NSE | 0.276789 |
| KGE | 0.517496 |
| CSI | 0.153846 |
| RMSE (m³/s) | 2470.165850 |
| PBIAS (%) | −12.978583 |

Các chỉ số chưa đạt mục tiêu nghiên cứu. Biểu đồ thể hiện kết quả thật, không thay bằng đường dự báo minh họa đẹp hơn. Artifact thử nghiệm nằm trong artifacts/local-ai (git-ignore); có thể tạo lại bằng các lệnh trong [LOCAL_AI_WORKFLOW](LOCAL_AI_WORKFLOW.md).

## Các phase còn phụ thuộc đầu vào bên ngoài

Chưa có dữ liệu VGTB/IMERG thực được cấp quyền/QC, pretraining CAMELS, MC-LSTM đúng kiến trúc bài báo, hiệu chuẩn uncertainty, benchmark thủy lực tương đương, feed vận hành, backend xác thực, deployment target/SLO, tác giả/venue và chỉ thị nộp bài. Các yêu cầu này vẫn mở ở [AI_ROADMAP](../AI_ROADMAP.md). Không thể hoàn thành trung thực bằng cách đổi nhãn synthetic thành measured hoặc đánh dấu tất cả phase DONE.

Đã sửa các tuyên bố tài liệu mâu thuẫn: README, module README, FINAL_STATUS, AI_COMPLETION_REPORT và roadmap dùng trạng thái thực; các bản nháp lịch sử được gắn nhãn đã thay thế. Hai trang AI nêu rõ synthetic/local và không gọi OpenAI. Browser regression đi qua nút Initialize/Risk/Brief/Dashboard, các bước Validate/Report và xác nhận pipeline không tạo báo cáo khi validation lỗi. Local approval dùng danh tính khai báo và append-only audit trong trình duyệt; không cung cấp bảo đảm xác thực máy chủ hay chữ ký pháp lý.

Giữ storage vượt capacity giúp bảo toàn nước và phát hiện infeasibility; mức nước ngoại suy ngoài capacity chưa phải mô hình tràn đỉnh đập. Tuyến an toàn được kiểm tra theo độ phân giải mô hình; cần quan trắc và hiệu chuẩn trước dùng cho sơ tán thật. Gaussian hydro/risk và tank spread đều là giả định chưa hiệu chuẩn. Nguồn phương pháp và protocol ở [LOCAL_AI_WORKFLOW](LOCAL_AI_WORKFLOW.md).
