# Hướng dẫn QA Lab cho từng thành viên

Repo chung: https://github.com/ZoeChan189/qa-playground

Mỗi thành viên tải cùng mã nguồn nhưng **chạy QA Lab và k6 trên máy của mình**. Trang Render chỉ để xem giao diện và gửi vài request thử; nút **Run local k6** bị khóa ở đó. Để làm bài Stress, Spike và Soak thật, mở địa chỉ `http://localhost:4173/` trên chính máy đang chạy ứng dụng.

## 1. Cài đặt một lần trên mỗi máy Windows

1. Cài [Node.js 20 trở lên](https://nodejs.org/en/download). Mở **Command Prompt mới**, gõ `node -v` rồi `npm -v`. Cả hai lệnh phải hiện phiên bản.
2. Cài [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/). Mở Command Prompt mới, gõ `k6 version`. Lệnh phải hiện phiên bản. Không cần tài khoản Grafana hoặc cài Grafana Dashboard.
3. Mở [repo GitHub](https://github.com/ZoeChan189/qa-playground), bấm **Code > Download ZIP**, rồi **giải nén**. Mở thư mục có `package.json`, `start-windows.cmd` và `run-performance-windows.cmd`. Không chạy ứng dụng từ bên trong file ZIP.
4. Nhấp đúp `start-windows.cmd`. Lần đầu máy cần Internet để cài thư viện. Giữ cửa sổ lệnh này mở và vào [http://localhost:4173/](http://localhost:4173/) trên **cùng máy**. Mỗi thành viên có một `localhost` riêng.

Nếu k6 là file `k6.exe` tải rời, chưa thêm vào PATH, hãy mở Command Prompt tại thư mục dự án, đặt `K6_BIN` rồi chạy script trong **cùng cửa sổ**:

```cmd
set "K6_BIN=C:\duong-dan\den\k6.exe"
start-windows.cmd
```

Thay đường dẫn ví dụ bằng đường dẫn thật tới `k6.exe`. Nếu nút vẫn bị khóa, đóng server, mở Command Prompt mới rồi chạy lại. Chỉ cài k6 mà mở link Render sẽ **không** làm nút trên Render sáng lên.

## 2. Chạy bài test trên web local

1. Vào **Performance**, chọn **Stress**, **Spike** hoặc **Soak**. Chọn tab chỉ đổi kế hoạch tải; chưa chạy test.
2. Giữ **Local peak VUs** mặc định ở lượt đầu. Bấm **Run local k6**. Trạng thái chuyển sang đang chạy và kết quả cũ được ẩn.
3. Chờ đến khi thấy **Latest test completed**. Stress mất khoảng 34 giây, Spike khoảng 22 giây, Soak khoảng 100 giây. Có thể mất thêm ít thời gian để k6 kết thúc và trang cập nhật.
4. Đọc bảng ở ngay dưới nút: **Scenario, Requests, p95, Error rate, Peak active, Heap range, Thresholds**, rồi **Measured details**, **Threshold decisions**, **Phase comparison**. Kiểm tra **Completed at** để chắc đó là lượt mới nhất. Chụp màn hình nếu cần bằng chứng.
5. Chạy tiếp kịch bản khác, mỗi lần **chỉ một bài**. Không mở hai lượt đồng thời vì chúng làm sai phép đo của nhau.

Muốn thử mức tải khác, nhập **Local peak VUs** trước khi bấm. Khoảng cho phép là **1–200 VUs**, riêng Spike cần **5–200 VUs**. Đây là số người dùng ảo tối đa theo kế hoạch, **không phải** số request/giây. Mức mặc định: Stress 40, Spike 45, Soak 10. Máy yếu có thể bắt đầu với số nhỏ; kết quả của hai máy khác nhau không phải lúc nào cũng so trực tiếp được.

**Run probe** chỉ gửi **một request** với Work factor bạn nhập rồi hiện HTTP status và thời gian bên dưới. Nó không chạy Stress/Spike/Soak, không có bảng k6 đầy đủ và không tạo JSON. **Run local k6** tạo bài test thật; kết quả tự hiện trên web nhưng chỉ ở trong bộ nhớ của server local, nên sẽ mất khi tắt server.

### Khi cần file JSON để nộp hoặc lưu lâu dài

Giữ `start-windows.cmd` đang chạy, rồi nhấp đúp `run-performance-windows.cmd`; chọn **2** Stress, **3** Spike, **4** Soak, hoặc **5** để chạy cả ba lần lượt. K6 lưu file mới trong `results/`, tên dạng `stress-...json`. Web local cũng tự đọc **file mới nhất**; nút **Open summary** dùng để mở một file cũ hay file của bài khác. Đừng nhầm file cũ với lần vừa test: kiểm tra tên file và **Completed at**.

## 3. Hiểu các số ở phần trên trang

| Trên web | Có nghĩa là gì |
| --- | --- |
| API online | Server đang phản hồi; **chưa** chứng minh bài performance đạt. |
| Active jobs / of 24 capacity | Số công việc API đang xử lý lúc này / giới hạn 24 công việc cùng lúc. |
| Completed, Rejected | Số job xử lý xong và số request bị từ chối HTTP 503 **từ khi server khởi động**, không phải riêng lượt k6 mới nhất. |
| Server p95 | 95% trong tối đa 1.000 job được nhận gần nhất có thời gian xử lý server không vượt quá số này. Khác p95 HTTP mà k6 đo. |
| Node heap, Live heap trend | Bộ nhớ heap của tiến trình Node và các mẫu gần đây khi trang đang mở; không phải toàn bộ RAM. Đường tăng trong một lần chạy **chưa chứng minh rò rỉ bộ nhớ**. |
| Load profile, Peak users | Đường biểu diễn số VU **dự kiến** theo thời gian, không phải throughput đã đo. |
| PBKDF2 work | Mức tính toán cho mỗi request được nhận. Stress/Spike dùng 60.000 vòng; Soak 25.000 vòng; Load 20.000 vòng. |
| p95 limit, Error limit | Hai ngưỡng đánh giá của kịch bản, không phải số liệu đang đo. |

### Work factor và Run probe

Work factor nhận **số nguyên 1–100**. API nhân số này với 1.000 vòng PBKDF2 cho **một request**. Nhập **1** nghĩa là 1.000 vòng; **60** là 60.000 vòng; **100** là 100.000 vòng. Số lớn thường tốn công tính hơn, nhưng không thể đoán chính xác sẽ mất bao nhiêu ms vì phụ thuộc máy và mức bận lúc đó. Nhập 0, số trên 100, số lẻ hoặc bỏ trống thì web báo sai và không gửi probe. Thay Work factor ở đây **không thay đổi** work của kịch bản k6.

Trong kết quả probe, **client ms** là thời gian phía trình duyệt quan sát, còn **server ms** là thời gian API tự đo. HTTP 200 nghĩa là request này được xử lý; HTTP 503 nghĩa là API đang đầy. Một probe HTTP 200 không chứng minh cả bài Stress đạt.

## 4. Đọc bảng k6 sau khi chạy xong

| Chỉ số | Cách hiểu ngắn gọn |
| --- | --- |
| Scenario, Completed at, Configured peak | Tên bài test, thời điểm kết quả hoàn tất và số VU cao nhất đã cấu hình. Dùng để phân biệt lần mới với lần cũ. |
| Requests | Tổng request HTTP k6 đã gửi trong lượt này. |
| Requests per second | Trung bình số request hoàn tất mỗi giây trong **cả lượt**; không đồng nghĩa số VU. |
| Failed requests, Error rate | Số request lỗi và tỷ lệ lỗi trên tổng request. Ví dụ 15 lỗi / 100 request = 15%. |
| HTTP 200 / HTTP 503 / Other status | Số phản hồi thành công / bị API từ chối vì đầy / phản hồi khác hoặc timeout. Nếu loại nào không xảy ra trong bài mới, web hiển thị 0. |
| Latency min, average, median, p90, p95, max | Thời gian HTTP nhanh nhất, trung bình, trung vị, mốc 90%, mốc 95% và chậm nhất. p95 = 200 ms nghĩa là khoảng 95% request có latency **không quá** 200 ms. |
| Iterations | Số vòng lặp k6 hoàn tất; trong script hiện tại mỗi vòng gửi một request rồi nghỉ ngắn. |
| Data received | Tổng dữ liệu HTTP nhận về, đơn vị MB. |
| Peak active | Mức job đồng thời cao nhất **k6 quan sát được từ các phản hồi thành công**; có thể khác bộ đếm server ở đầu trang. |
| Heap range | Khoảng heap thấp nhất–cao nhất k6 lấy được từ các phản hồi thành công. Không thể kết luận leak chỉ từ khoảng này. |
| Phase comparison | Request, p95 và tỷ lệ lỗi theo từng cửa sổ thời gian của bài. Stress so các nấc tăng tải; Spike so Baseline/Burst/Recovery; Soak so Early/Late hold. Một phase xấu có thể bị trung bình cả bài che đi. |

**Threshold decisions** có hai hàng: **p95 latency** và **Failed requests**. Cả hai phải **nhỏ hơn** ngưỡng, không được bằng, thì kết luận chung là **WITHIN LIMITS**. Chỉ một hàng FAIL thì thành **LIMIT BREACHED**. Đây là tiêu chí demo của app, không phải chuẩn chung cho mọi hệ thống.

| Kịch bản | Work/request | p95 phải dưới | Lỗi phải dưới |
| --- | ---: | ---: | ---: |
| Load | 20.000 vòng | 300 ms | 1% |
| Stress | 60.000 vòng | 900 ms | 15% |
| Spike | 60.000 vòng | 1.000 ms | 15% |
| Soak | 25.000 vòng | 500 ms | 1% |

Ví dụ Stress: p95 **800 ms**, Error rate **4%** thì đạt cả hai. p95 **900 ms** hoặc Error rate **15%** là **không đạt** vì phải nhỏ hơn ngưỡng. Tăng VU có thể khiến API trả HTTP 503 rất nhanh tại giới hạn 24 job: khi đó p95 vẫn thấp nhưng lỗi vượt ngưỡng. **FAIL là kết quả đo hợp lệ**, không có nghĩa k6 cài sai. Hãy nói rõ bài nào, số VU, p95, lỗi và phase nào xấu.

Các chữ viết tắt: **VU** = Virtual User (người dùng ảo); **p95/p90** = phân vị 95/90; **ms** = mili giây; **MB** = megabyte; **API** = giao diện nhận request của server; **HTTP 200** = xử lý thành công; **HTTP 429** = bị giới hạn tốc độ trên host công khai; **HTTP 503** = server từ chối vì đầy; **PBKDF2** = phép tính lặp dùng làm tải CPU; **heap** = vùng nhớ của chương trình Node; **JSON** = định dạng file kết quả.

## 5. Render và GitHub dùng để làm gì

Mã nguồn mới nhất nằm ở repo chung. Các bạn chỉ cần **Download ZIP** để tự chạy; không cần Fork hay tự deploy nếu thầy không yêu cầu. Muốn có repo GitHub riêng thì dùng **Fork**; không đưa `node_modules/`, `results/`, `.env` hoặc API key lên GitHub.

Bản Render có thể cho người khác mở giao diện và **Run probe** nhẹ. Nó **không thể gọi `k6.exe` trên máy người xem**, nên **Run local k6 bị khóa**, và bảng kết quả k6 trống cho đến khi chọn **Open summary**. Để mỗi bạn tự chạy bài thật và thấy bảng tự cập nhật, dùng **web local** như mục 2. Không gửi tải Stress/Spike/Soak vào Render công khai; server chung có thể bị ảnh hưởng hoặc phát sinh chi phí.

Nếu thầy yêu cầu mỗi người deploy một bản riêng: Fork repo, vào Render tạo **Web Service** Node từ repo vừa Fork, Build Command `npm ci`, Start Command `npm start`, đặt `NODE_ENV=production`, rồi kiểm tra `/api/health`. **Deploy riêng vẫn không thay thế bài k6 local.**

## 6. Khi có lỗi

| Hiện tượng | Cách xử lý |
| --- | --- |
| `node` hoặc `npm` không nhận | Cài Node.js 20+, đóng Command Prompt cũ và mở cửa sổ mới. |
| `k6 version` không nhận | Cài k6, mở terminal mới; hoặc đặt `K6_BIN` trỏ đúng `k6.exe` trước khi chạy server. |
| Không mở được localhost | Giữ cửa sổ `start-windows.cmd` đang chạy; xem thông báo lỗi hoặc cổng 4173 có bị chiếm không. |
| Run local k6 mờ/không bấm được | Kiểm tra bạn đang ở **localhost**, không phải Render. Nếu đã ở localhost, kiểm tra k6 và khởi động lại server. |
| Bấm Run probe nhưng không có bảng/JSON | Đúng thiết kế: probe chỉ có một request. Dùng **Run local k6** hoặc script để chạy bài đầy đủ. |
| Bấm Run local k6 mà không thấy file JSON | Nút này chỉ tự hiện kết quả trên web. Dùng `run-performance-windows.cmd` nếu cần file trong `results/`. |
| Kết quả có vẻ là lượt cũ | Khi chạy bài mới, bảng cũ ẩn đi. Chờ **Latest test completed**, xem **Completed at**; thử tải lại trang local nếu cần. |
| LIMIT BREACHED hoặc k6 báo threshold failed | Đọc hai hàng Threshold decisions và Phase comparison. Bài đã chạy, nhưng ít nhất một ngưỡng không đạt. |
