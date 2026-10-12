# QA Calculator: demo Mobile trên web và Android

## App này là gì?

QA Calculator là máy tính đơn giản để nhóm demo mobile testing. Bản web mở từ mục Mobile của QA Lab hoặc `/calculator/index.html`. APK là ứng dụng Android hybrid dùng Capacitor; giao diện bên trong và engine mathjs được đóng gói từ **chính các file của bản web**, không tải lại trang Render. Vì vậy APK tính được khi không có mạng. Đây không phải máy Casio chính thức, không phải app Android viết toàn bộ giao diện native và không phải bản cho iPhone.

Chức năng: cộng/trừ/nhân/chia, ngoặc, số thập phân, căn bậc hai, bình phương/lũy thừa, phần trăm, sin/cos/tan, log/ln, hằng số pi/e, DEG/RAD, Ans, AC, xóa ký tự và lịch sử tối đa 10 phép tính. Lịch sử và chế độ góc lưu riêng trên thiết bị; không gửi lên server. AC xóa phép tính hiện tại, không xóa lịch sử hoặc Ans. Chọn Clear history để xóa lịch sử.

Trên màn hình nhỏ, các phím khoa học mặc định ẩn để bàn phím cơ bản gọn hơn. Tick **Scientific** để mở sin/cos/tan, căn, lũy thừa và log; bỏ tick không xóa biểu thức đang nhập. Khi thư viện toán đang tải, các nút bị khóa và hiện Loading calculator; đợi đến khi nút được bật rồi tính.

## Cài trên điện thoại

1. Dùng điện thoại **Android 7.0 trở lên**, mở QA Lab, chọn **Mobile**.
2. Bấm **Download Android APK**, chờ tải xong `qa-calculator.apk`.
3. Mở file trong Downloads. Nếu Android chặn, cho phép trình duyệt/trình quản lý file đó **Install unknown apps / Cài ứng dụng không rõ nguồn gốc**, rồi mở APK lại. Chỉ cho phép đối với nguồn bạn tin cậy; có thể tắt quyền này sau khi cài.
4. Chọn Install, rồi Open. Tên app là **QA Calculator**.
5. Bấm `2 + 3 × 4 =`, kết quả phải là **14**. Tắt Wi-Fi/dữ liệu di động và lặp lại; app vẫn phải tính được.

Người chỉ cài APK **không cần** tải source, Node.js, k6, Java hoặc Android Studio. Giữ Android System WebView / Chrome được cập nhật, nhất là trên máy Android cũ. Nếu app báo không khởi động được, cập nhật hai thành phần này từ Play Store rồi mở lại app. APK này debug-signed cho bài tập, không phải bản phát hành Play Store. Không cần trả tiền hoặc đăng nhập tài khoản.

Nếu báo không cài được: kiểm tra Android 7+, dung lượng trống và file đã tải đủ; tải lại từ repo chính. Nếu đã cài một bản tự build có chữ ký khác, cần gỡ bản cũ trước khi cài (lịch sử trên bản cũ sẽ mất). Cùng giao diện/engine không có nghĩa web và APK đồng bộ lịch sử: mỗi nơi có dữ liệu riêng. Việc Android cảnh báo nguồn ngoài cửa hàng không tự chứng minh app bị lỗi.

## Cách demo cho thầy

1. Mở cùng phép tính trên web và APK; giữ cùng chế độ DEG hoặc RAD.
2. Bấm **Run key cases** ở cả hai nơi: mỗi dòng có Input, Expected, Actual và Result. Cần **14/14** kết quả khớp.
3. Demo `1/0`: app phải báo **DIVIDE_BY_ZERO**, không bị thoát hoặc treo. Đây là kết quả đúng mong đợi, nên case xử lý lỗi vẫn PASS.
4. Xoay điện thoại khi đang nhập `(2+3)*4`, tiếp tục tính; kết quả phải là 20, các nút vẫn bấm được.
5. Tắt mạng rồi tính trên APK. Không dùng thao tác tắt mạng của browser để khẳng định APK đã được kiểm tra.
6. Đóng/mở lại APK: lịch sử và chế độ góc vẫn được giữ. Phép tính chưa bấm bằng và Ans không được lưu qua lần đóng app; đây là phạm vi hiện tại, không phải cam kết lưu toàn bộ trạng thái.

## Expected / Actual / PASS / FAIL

| Case | Input | Expected |
| --- | --- | --- |
| C01 Addition | 2+3 | 5 |
| C02 Precedence | 2+3*4 | 14 |
| C03 Parentheses | (2+3)*4 | 20 |
| C04 Decimals | 0.1+0.2 | 0.3 |
| C05 Negative number | -5+2 | -3 |
| C06 Square root | sqrt(81) | 9 |
| C07 Power | 2^10 | 1024 |
| C08 Percent | 200*percent(10) | 20 |
| C09 DEG | sin(30), DEG | 0.5 |
| C10 RAD | sin(pi/2), RAD | 1 |
| C11 Logarithm | log(100) | 2 |
| C12 Division by zero | 1/0 | DIVIDE_BY_ZERO |
| C13 Negative root | sqrt(-1) | DOMAIN |
| C14 Invalid expression | 2+ | SYNTAX |

**Expected** là đáp án mình mong đợi trước khi chạy. **Actual** là đáp án app thực sự trả về. **PASS** khi hai giá trị đúng như nhau; **FAIL** khi khác nhau. Tạo ra Error không luôn là test FAIL: ví dụ `1/0` báo DIVIDE_BY_ZERO là xử lý đúng.

**DEG** dùng độ; **RAD** dùng radian. sin(30) ở hai chế độ không cùng đáp án. **Ans** là kết quả chính xác của phép tính thành công gần nhất trong lần mở app. **Expression** là biểu thức nhập vào. **Result** là đáp án, hiển thị tối đa 14 chữ số có nghĩa; phép tính bên trong dùng BigNumber với precision 64. Phần trăm ở đây là chia cho 100, không mô phỏng toàn bộ quy tắc phần trăm của mọi máy tính thương mại.

Nút **Check layout** trong QA Lab chỉ kiểm tra browser: overflow phải 0 px, các control được đo phải ít nhất 24x24 px. Nó không kiểm tra cài APK, xoay Android, hoặc chứng nhận app chạy trên mọi thiết bị. Các nút phép tính được thiết kế ít nhất 44x44 px ở chiều rộng từ 320 px; vẫn nên bấm thử trên điện thoại thực tế.

## Source và cách build lại (không cần cho người chỉ cài APK)

- UI/engine dùng chung: `public/calculator/`.
- Android project: `mobile/calculator/android/`.
- Chuẩn bị assets: `mobile/calculator/prepare-web.mjs`; file hash đi kèm chứng minh assets được đóng gói.
- Android tests: `CalculatorTest.java`; cài APK trên emulator, kiểm tra keypad, decimals/DEG, lỗi, bộ case và rotation khi Wi-Fi/data tắt.
- Workflow: `.github/workflows/android-calculator.yml`; chỉ publish APK sau khi build và các test Android đạt. Artifact giữ báo cáo test. APK và SHA256SUMS có trong GitHub Releases.

Nếu muốn tự build, cần Node.js 22+, JDK 21 và Android SDK API 36. Trong thư mục repo chạy `npm ci`; vào `mobile/calculator` chạy `npm ci` và `npm run sync`; vào `android` chạy `gradlew.bat assembleDebug` trên Windows hoặc `./gradlew assembleDebug` trên Linux. APK nằm ở `android/app/build/outputs/apk/debug/app-debug.apk`. Source không chứa mật khẩu hoặc keystore cá nhân. File APK tự build dùng chữ ký của máy build nên có thể cần gỡ bản đã cài trước đó.

Để phát hành bản mới, đổi version trong mobile package, versionName/versionCode Android và link download tương ứng trong `src/app.js`, rồi chạy workflow. Không tự ghi đè APK đã kiểm tra cùng một tag. Website tiếp tục deploy trên Render; APK tải từ GitHub Releases để không làm nặng server web.
