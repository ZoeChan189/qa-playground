# Hướng dẫn từng thành viên chạy và triển khai QA Lab

Repository công khai: https://github.com/ZoeChan189/qa-playground

**Cả bốn thành viên phải tự làm trên máy riêng.** Mỗi người tải cùng mã nguồn
từ GitHub, chạy web local, chạy k6 với Stress, Spike, Soak
của chính mình. Chỉ mở link Render hoặc xem kết quả của người khác chưa phải là
tự test.

## 1. Cài công cụ trên mỗi máy Windows

1. Cài [Node.js 20 trở lên](https://nodejs.org/en/download). Mở Command Prompt
   mới, gõ `node -v` và `npm -v`. Cả hai phải hiện phiên bản.
2. Cài [Grafana k6](https://grafana.com/docs/k6/latest/set-up/install-k6/).
   Mở Command Prompt mới, gõ `k6 version`. Phải thấy phiên bản k6.
3. Không cần cài Grafana Dashboard, WPS, database hoặc Gemini để làm bài
   Performance. Nếu lệnh vẫn báo không tìm thấy sau khi cài, đóng terminal cũ
   và mở lại.

## 2. Tải mã nguồn từ GitHub

1. Vào https://github.com/ZoeChan189/qa-playground .
2. Bấm **Code > Download ZIP**. Không cần cài Git.
3. Giải nén file vừa tải. Mở thư mục có `package.json`, `start-windows.cmd`
   và `run-performance-windows.cmd`. Không chạy các file này ngay bên trong ZIP.

GitHub có [hướng dẫn Download ZIP](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-files-from-github)
nếu bạn chưa quen giao diện.

## 3. Tự chạy web và ba bài test trên máy mình

1. Nhấp đúp `start-windows.cmd`. Lần đầu cần Internet để cài thư viện. Giữ
   cửa sổ đen này mở. Trên **cùng máy đó**, vào http://localhost:4173/ .
2. Trên web local vào **Performance**, chọn **Stress** rồi bấm **Run local k6**.
   Chờ dòng trạng thái báo hoàn tất. Xem số request, p95, Error rate, số HTTP
   503 và từng giai đoạn ở ngay bên dưới. Chụp ảnh màn hình làm bằng chứng.
3. Làm tương tự với **Spike** và **Soak**, mỗi lần chỉ chạy một bài. Sau mỗi
   lần hoàn tất, kiểm tra thời gian **Completed at** và tên bài đã đổi sang
   lần test mới, không dùng lại số liệu từ lần trước.
4. Nếu cần **file JSON** để nộp, nhấp đúp `run-performance-windows.cmd`, chọn
   **5**. Ba bài sẽ chạy lần lượt và lưu JSON vào `results/`. Web local sẽ tự
   hiện bản mới nhất; **Open summary** chỉ dùng khi muốn đọc một file cũ.

Thích gõ lệnh hơn thì mở Command Prompt thứ hai trong thư mục dự án và chạy
lần lượt `npm run perf:stress`, `npm run perf:spike`, `npm run perf:soak`.
Muốn đổi mức người dùng ảo, nhập **Local peak VUs** trên trang Performance rồi
chép lệnh được tạo, ví dụ `npm run perf:stress -- --vus 100`, hoặc bấm
**Run local k6** trên web local. Giới hạn thực hành là 200 VU. Nếu p95 vẫn thấp nhưng Error rate vượt ngưỡng,
kết quả tổng thể vẫn là **FAIL**. API nhận tối đa 24 job cùng lúc, nên tải cao
có thể sinh HTTP 503 rất nhanh thay vì làm p95 tăng lên 900 ms.

**Đừng nhầm:** chọn tab Stress/Spike/Soak chỉ xem kế hoạch; **Run probe** chỉ
gửi một request; **Run local k6** mới tạo tải thật; **Open summary** chỉ đọc
file JSON cũ. Bốn người đều dùng địa chỉ `localhost:4173`, nhưng mỗi địa
chỉ trỏ về chính máy của người đó.

**Không chạy k6 vào link Render công khai.** Các script trong repository mặc
định gửi tải tới `127.0.0.1:4173` trên máy đang chạy k6. Link Render chỉ để
chia sẻ giao diện và demo nhẹ.

Nếu k6 chạy xong, tạo JSON và web hiện `LIMIT BREACHED`, bạn **đã thực hiện
bài test**, nhưng kết quả đo vượt ngưỡng của kịch bản. Đây không tự động là
lỗi cài đặt. Đọc thêm tài liệu Word
[`QA_Lab_Performance_Huong_dan_de_hieu.docx`](QA_Lab_Performance_Huong_dan_de_hieu.docx)
để hiểu Work factor, p95, Error rate và các chữ viết tắt.

## 4. Mỗi người đưa code lên GitHub của mình

Code đã có trên GitHub công khai; không cần upload từng file. Nếu mỗi người
muốn một repository riêng để nối với Render:

1. Đăng nhập GitHub rồi mở https://github.com/ZoeChan189/qa-playground .
2. Bấm **Fork** ở góc trên. Chọn tài khoản của mình làm Owner và bấm
   **Create fork**. Có thể đổi tên repo nếu muốn.
3. Mở repo mới dưới tài khoản của bạn, ví dụ
   `https://github.com/ten-ban/qa-playground`. Xác nhận `package.json`,
   `src/`, `public/`, `k6/` nằm ở gốc.

Đây là bản code riêng trên GitHub của bạn. Xem [hướng dẫn Fork của GitHub](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo).
Không đưa `node_modules/`, `results/`, `.env`, mật khẩu hoặc Gemini API key
lên repo.

## 5. Mỗi người deploy web riêng trên Render

1. Đăng nhập https://dashboard.render.com/ và liên kết GitHub nếu Render hỏi.
2. Chọn **New > Web Service**, rồi chọn repository **vừa fork của mình**.
   Không chọn Static Site vì QA Lab có API Node.
3. Chọn tên dịch vụ tùy ý, Language/Runtime **Node**, Branch **main**.
   Để **Root Directory trống** vì `package.json` ở gốc repo.
4. Build Command: `npm ci`. Start Command: `npm start`.
5. Chọn gói Free nếu tài khoản hiện cho phép và bạn không muốn phát sinh phí.
   Trong Environment/Advanced thêm biến `NODE_ENV` với giá trị `production`.
   Health Check Path nếu có: `/api/health`.
6. Bấm **Create Web Service** hoặc **Deploy**. Chờ trạng thái Live. Mở link
   `https://...onrender.com` của riêng bạn. Mở tiếp
   `https://...onrender.com/api/health`; nếu có JSON `status: ready` và
   `service: qa-lab` thì API đã chạy.

Nếu deploy lỗi, kiểm tra repo có `package.json` ở gốc, hai lệnh `npm ci` và
`npm start`, rồi xem Logs trên Render. Tham khảo [hướng dẫn Node/Express của
Render](https://render.com/docs/deploy-node-express-app).

**Deploy link riêng không thay thế bài Performance local.** Cả bốn bạn vẫn
chạy Stress, Spike, Soak trên máy mình và chụp kết quả hoặc lưu ba JSON của mình.

## 6. Lỗi thường gặp

- Thiếu Node/npm: cài Node.js 20+, mở terminal mới và chạy lại.
- Thiếu k6: cài Grafana k6, mở terminal mới và chạy lại.
- Không mở được localhost: giữ cửa sổ `start-windows.cmd` đang chạy; kiểm tra
  không có chương trình khác chiếm cổng 4173.
- k6 không tìm thấy QA Lab: mở `start-windows.cmd` trước khi chạy bài test.
- k6 báo threshold failed: mở JSON để xem số đo; có thể bài test không đạt
  ngưỡng chứ không phải cài đặt hỏng.
- Render build lỗi: xem Logs, kiểm tra Build/Start và thư mục gốc repository.
