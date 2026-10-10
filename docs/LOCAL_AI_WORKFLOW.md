# Quy trình AI local và đánh giá có thể lặp lại

Ngày 2026-10-08. Không cần API key; không gọi OpenAI. Dữ liệu mặc định là tổng hợp, không phải dữ liệu đã tải từ IMERG, ERA5 hay trạm VGTB.

## Chạy và tái lập

1. Cài dependency Node từ lockfile bằng `npm ci`; cài trình duyệt bằng `npx playwright install chromium` khi cần. Python 3.11 đã được dùng để kiểm thử.
2. Cài API bằng `python -m pip install -r scripts/requirements.txt`. Muốn xuất hình, dùng `scripts/requirements-plot.txt` thay thế.
3. Chạy `npm run serve`; mở `/`, `/ai-demo.html` hoặc `/phase2-training.html` tại cổng 4310. Các trang AI chạy độc lập, không thay thế engine vận hành của trang chính.
4. Chạy `npm run train:local` cho fixture theo giờ, seed 42, một trạm, LSTM 8 units, tối đa 12 epochs, sequence 12 giờ và target trung bình một giờ tiếp theo. Early stopping dùng validation; test không dùng chọn mô hình.
5. Dataset riêng: `node scripts/run-phase2.cjs --dataset dataset.json --gauge aiNghia --seed 42 --sequence 12 --horizon 1 --epochs 12 --output artifacts/local-ai`. Tham số horizon của training tính bằng số bước dataset, không mặc định là giờ.
6. `python scripts/plot-validation.py artifacts/local-ai` tạo PNG/SVG từ CSV held-out và history thật. Không sinh hoặc chèn thêm quan trắc.
7. API: `npm run serve:ai`. Mặc định tank ensemble tại loopback cổng 5000. Muốn dùng artifact, đặt biến môi trường `FLOODTWIN_MODEL_PATH` đến đường dẫn tuyệt đối `model.json` trước khi chạy. API chỉ hỗ trợ artifact hourly, target một giờ, sequence 1..168 và đúng trạm huấn luyện.
8. `npm test` chạy bộ kiểm thử nội bộ. `npm run test:external-docs` chạy ba hợp đồng với repository sản phẩm bên ngoài, không được xem là đã xác minh khi thiếu repository đó.

## Hợp đồng dataset

Tệp JSON có các trường sau; đây là cấu trúc dữ liệu, không phải fixture đã được chứng nhận.

| Trường | Nội dung |
|---|---|
| forcing.dates | Mảng timestamp ISO có múi giờ; tăng nghiêm ngặt, bước thời gian cố định |
| forcing.precipitation | mm trong mỗi bước; giá trị số hữu hạn, không âm |
| forcing.temperature | °C; có thể âm |
| forcing.humidity | Tỉ phần 0..1 |
| forcing.radiation | W/m², không âm |
| forcing.wind | m/s, không âm |
| observations.dates | Timestamp cùng độ dài và cùng epoch với forcing.dates |
| observations.gauges.<gaugeId>.discharge | Lưu lượng m³/s; không âm; null là thiếu, zero là quan trắc bằng không |
| resolution | hourly hoặc daily; generator trong browser chỉ tạo daily |
| metadata.stepHours | 1 với hourly, 24 với daily; phải khớp timestamp |
| metadata.source | Nguồn, phiên bản, quy trình QC và quyền sử dụng do bên cung cấp khai báo |
| metadata.synthetic | true cho dữ liệu tổng hợp; false chỉ khi người cung cấp có bằng chứng nguồn thực |

Các mảng phải cùng độ dài. Loader loại cửa sổ có trên 20% target thiếu; target là trung bình các quan trắc hữu hạn trong cửa sổ. Input không tự điền dữ liệu thiếu. Mỗi model gắn một gauge; không ghép nhiều target trạm khác nhau với cùng input mà thiếu định danh trạm.

## Phương pháp và artifact

Model có một tầng LSTM tiêu chuẩn, readout softplus trong không gian log1p(m³/s), loss MSE log discharge, BPTT đầy đủ và Adam. Không có batch normalization, dropout giả hoặc pretraining CAMELS. Các trọng số input/recurrent/readout đều có gradient; kiểm thử đối chiếu finite differences.

Chia theo thứ tự thời gian và loại các cửa sổ input/target chồng qua ranh giới. Validation dùng early stopping; test giữ riêng. Script xuất lại trọng số tốt nhất trên validation trước khi tính test. Các sample trong cùng tập có thể chồng cửa sổ; không xem là mẫu thống kê độc lập để suy confidence interval. CSI mặc định dùng mean + standard deviation quan trắc của tập đánh giá; so sánh nghiên cứu thực cần chốt trước một ngưỡng vận hành độc lập, thống nhất đơn vị.

| Artifact | Ý nghĩa |
|---|---|
| model.json | schemaVersion 2, lstm-baseline, outputTransform log1p-m3s, config, weights, metadata trạm/timestep/target/seed/period/source |
| validation.json | Các split, số mẫu, lịch sử loss, metric và các claim chưa được chứng minh |
| predictions.csv | Timestamp target, gauge, observed/predicted m³/s, validation/test |
| validation.md | Bảng chỉ số thật, có nhãn SYNTHETIC hoặc USER-SUPPLIED/UNVERIFIED |
| parity.json | Một input test và output JS để đối chiếu Python |
| validation-figures.png/.svg | Hydrograph, scatter và loss history từ các artifact trên |

NSE/KGE/PBIAS có mẫu số bằng không trả null; null không được đánh dấu đạt ngưỡng. PBIAS trong code dùng 100 × sum(predicted − observed)/sum(observed): dương là dự báo cao. Không so với báo cáo dùng dấu ngược nếu chưa đổi quy ước.

## Hợp đồng API

`GET /health`; `POST /predict`, `/assess-risk`, `/batch-predict`. Request JSON dùng `forcing.precipitation` theo giờ và các mảng forcing còn lại nếu có; horizon là số nguyên 1..168 giờ, gauge_id là một trong bốn trạm. Từ chối NaN/Infinity, boolean thay số, độ dài lệch, mưa âm, humidity ngoài 0..1, timestep khác giờ và artifact khác trạm. Khi dùng LSTM phải đủ sequenceLength của artifact.

q05/q95 là phân vị 5%/95% của ensemble tham số, tạo khoảng trung tâm 90%, chưa hiệu chuẩn. lower_95/upper_95 giữ lại để tương thích client cũ và có cùng giá trị; không phải confidence bounds 95%. Một LSTM đơn không có ensemble: phân vị trùng nhau và xác suất vượt ngưỡng trả null. Tương quan thời gian, persistence mưa và rating curve đều là giả định được ghi ở model_info. Rủi ro API chỉ dùng forcing và ngưỡng trạm, không xuất thiệt hại/population giả như quan trắc.

## Điều kiện để hoàn thành nghiên cứu/vận hành

Cần dữ liệu có nguồn và QC, split theo sự kiện để tránh leakage, ngưỡng flood chốt trước, baseline persistence/rating curve và hydraulic benchmark chạy cùng input/horizon/phần cứng. Nếu yêu cầu MC-LSTM theo bài báo, cần triển khai và kiểm chứng kiến trúc đó riêng; tank bảo toàn nước và LSTM tiêu chuẩn hiện tại không thay thế chứng cứ này. Hiệu chuẩn uncertainty cần coverage/sharpness trên quan trắc độc lập. Feed thật, xác thực backend, deploy/SLO và bài báo/nộp bài cần các đầu vào đã nêu trong roadmap.

Nguồn phương pháp: [MC-LSTM, Hoedt et al. 2021](https://proceedings.mlr.press/v139/hoedt21a.html), [Ensemble Kalman Filter, Evensen 2003](https://www.ecmwf.int/en/elibrary/74424-ensemble-kalman-filter-theoretical-formulation-and-practical-implementation), [serial square-root filter, Whitaker & Hamill 2002](https://twister.caps.ou.edu/OBAN2019/Whitaker_HamilMWR2002.pdf).
