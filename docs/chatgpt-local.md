# Đăng nhập ChatGPT trong QA Lab local

## 1. Hai cách dùng AI khác nhau

- **Group API / My API key:** dùng Gemini API như trước; có thể dùng trên Render hoặc local. Cần API key và quyền của dự án Google.
- **ChatGPT sign-in:** dùng tài khoản ChatGPT của chính bạn theo luồng đăng nhập chính thức của OpenAI dành cho app cá nhân/local đủ điều kiện. Không cần nhập OpenAI API key vào QA Lab. Đăng nhập ở trang OpenAI, không nhập mật khẩu vào QA Lab.

Đây không phải cách nhúng toàn bộ trang ChatGPT vào QA Lab. QA Lab gửi yêu cầu tạo test case tới endpoint chính thức bằng quyền bạn đã đồng ý cấp. Luồng này có điều kiện tài khoản, vùng, workspace, hạn mức và rollout của OpenAI. Không cam kết tài khoản nào cũng sử dụng được; đăng nhập không khắc phục được mọi lỗi mạng hoặc quota. Không tự đổi sang API tính phí khi bị từ chối.

## 2. Cài và đăng nhập từng bước

1. Đóng QA Lab cũ đang chạy, nhất là bản trong Downloads. Tải bản mới ở [GitHub nhóm](https://github.com/ZoeChan189/qa-playground), giải nén rồi chạy `setup-windows.cmd` trong đúng thư mục đó. Giữ thư mục này ở vị trí cố định.
2. Chạy `start-windows.cmd`, giữ cửa sổ mở. Vào [AI local](http://127.0.0.1:4173/#ai). Nếu đã dùng Connect k6 thành công trên Render, bộ chạy local có thể đã mở sẵn.
3. Chọn **AI-assisted > ChatGPT sign-in**. Nếu đang xem Render, bấm **Open local QA Lab** trước; Render không được nhận token đăng nhập của bạn.
4. Ô **ChatGPT account** chọn **New account** ở lần đầu. Bấm **Continue with ChatGPT**. Trình duyệt mở trang `auth.openai.com`. Nếu tab mới bị chặn, bấm **Open OpenAI sign-in** hiện bên dưới.
5. Tự đăng nhập và xem quyền app yêu cầu. Chỉ đồng ý nếu bạn muốn QA Lab dùng gói ChatGPT của mình. Không gửi mật khẩu hoặc token cho bạn khác.
6. Sau khi thấy trang thông báo kết nối hoàn tất, quay lại tab QA Lab. Phải hiện **Signed in** và **ChatGPT plan use is enabled** mới gọi model được. **Signed in** nhưng chưa được quyền dùng gói thì chưa chạy AI được.
7. Bấm **Load models**, chọn một model được tài khoản trả về. Không tự gõ tên model đoán chừng. Điền Requirement, chọn Target topic, bấm **Generate test cases**.
8. Đợi bản nháp xuất hiện. Bảng Measured result ghi HTTP, model và dữ liệu hợp lệ. AI chỉ đề xuất test; bạn vẫn phải đọc và chạy test thật trong công cụ tương ứng.
9. Các lần sau chọn tài khoản đã lưu và đăng nhập lại nếu phiên hết hiệu lực. **New account** để thêm tài khoản/workspace khác. Mỗi đăng ký giữ riêng, kể cả khi email giống nhau.
10. Bấm **Sign out** trước khi cho người khác dùng máy. QA Lab xóa token local và thử thu hồi phiên phía OpenAI. Nếu mạng lỗi, trang báo chưa xác nhận thu hồi; vào [ChatGPT Settings > Usage](https://chatgpt.com/settings/usage) hoặc Settings > Apps để kiểm tra/ngắt quyền.

## 3. Cách đọc trạng thái và kết quả

| Hiện trên web | Nghĩa và cách xử lý |
| --- | --- |
| Not signed in | Chưa có phiên. Bấm Continue with ChatGPT. |
| Waiting for OpenAI sign-in | Đang đợi bạn hoàn tất trong tab OpenAI. Phiên chờ hết hạn sau 10 phút. |
| Signed in, plan use not granted | Nhận diện được tài khoản nhưng chưa được phép dùng gói cho inference. Đăng nhập lại và kiểm tra quyền, hoặc dùng Gemini API. |
| Account model list | Danh sách thực của tài khoản, không phải danh sách tên model gắn cứng trong code. |
| Generation HTTP 200 + usable text/model | Yêu cầu tạo bản nháp hoàn tất. Không đồng nghĩa test được AI viết đã PASS. |
| NOT VERIFIED | Chưa có bằng chứng đã chạy các test được AI đề xuất. Checklist do người dùng tự đánh dấu. |
| HTTP 401 | Phiên/quyền không được chấp nhận hoặc đã hết hiệu lực. Đăng nhập lại tài khoản đã lưu. |
| HTTP 403 / user_not_eligible | Tài khoản, workspace, khu vực hoặc tích hợp chưa được OpenAI cho phép. Không bấm liên tục; kiểm tra chính sách hoặc chuyển Gemini API. |
| HTTP 429 / usage_limit_exceeded | Chạm hạn mức gói hoặc hạn mức riêng của app. Vào Manage usage. Đăng nhập lại không reset quota. |
| HTTP 503 | Hạ tầng/routing đang không sẵn sàng hoặc chưa bật cho tài khoản. Thử lại sau; giữ thông tin lỗi. |
| Stream incomplete | Phản hồi đang gửi bị ngắt hoặc kết thúc chưa hoàn chỉnh. QA Lab không nhận một đoạn trả lời dở là thành công. |
| No local service / HTML instead of JSON | Có thể đang chạy QA Lab cũ/sai cổng hoặc server trả trang lỗi. Cập nhật, dừng server cũ và chạy lại. |

## 4. Dữ liệu được giữ ở đâu

Trên Windows, thông tin phiên nằm trong `%LOCALAPPDATA%\QA Lab\chatgpt\credentials.dat`, mã hóa bằng Windows DPAPI theo tài khoản Windows hiện tại. Không đưa file này lên GitHub/Drive, không gửi cả thư mục AppData cho thành viên khác. Trên Linux/macOS, file nằm dưới `~/.config/QA Lab/chatgpt/`, quyền đọc/ghi riêng cho chủ sở hữu. Không có token trong localStorage, mã nguồn, ảnh bằng chứng hoặc phản hồi API cho trình duyệt. Khởi động lại QA Lab có thể dùng phiên đã lưu; mỗi người đăng nhập tài khoản của mình.

Nhật ký lỗi bộ kết nối tại `%LOCALAPPDATA%\QA Lab\logs`. Không cần gửi API key/token khi báo lỗi; chỉ gửi thông báo, HTTP status, phiên bản QA Lab và thời điểm xảy ra.

## 5. Kiểm thử và giới hạn xác nhận

Kiểm thử tự động dùng dữ liệu OAuth/provider giả lập để kiểm tra PKCE, state, nonce, chặn sai tài khoản, quyền thiếu, refresh, đăng xuất, catalog model, lỗi quota và stream chưa hoàn tất. Kiểm tra giao diện có cả desktop/mobile. Chỉ sau khi chính bạn đăng nhập thành công và tạo được bản nháp bằng tài khoản thật mới xác nhận được quyền thực tế của tài khoản đó. Không mượn token của Codex hay lấy cookie của trình duyệt.

Tài liệu chính thức được dùng khi triển khai: [đăng ký và đăng nhập](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [model và inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference), [phiên và refresh](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions), [lỗi và cách xử lý](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery), [giới hạn preview](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
