# Make Tour Plan — nhiều người dùng với Firebase (chưa kích hoạt)

**Mục tiêu:** 100 người dùng khác nhau có thể đăng nhập Google, mỗi người chỉ thấy các chuyến đi của mình và tiếp tục sử dụng trên những thiết bị khác nhau. Đây là tài liệu và quy tắc bảo mật để triển khai; **bản GitHub Pages hiện vẫn đang dùng localStorage và tùy chọn GitHub Gist, chưa có Google Sign-in**.

## Hạ tầng cần có

1. Chủ sở hữu app tạo Firebase project trong tài khoản Google của chính mình tại https://console.firebase.google.com/ và đăng ký **Web app**.
2. Bật **Authentication > Sign-in method > Google**, điền email hỗ trợ.
3. Trong **Authentication > Settings > Authorized domains**, thêm **thanhlampro1012.github.io** (chỉ hostname, không có đường dẫn).
4. Bật **Cloud Firestore** ở chế độ production/deny-by-default, chọn vùng phù hợp và triển khai đúng file `firestore.rules` trong repo trước khi sử dụng. **Không chọn test mode cho app công khai.**
5. Cấp cho ứng dụng các trường cấu hình web: `apiKey`, `authDomain`, `projectId`, `appId` (và các trường Firebase SDK yêu cầu). Cấu hình web Firebase không phải khóa admin. **Không commit service-account JSON, private keys, PAT, mật khẩu hay tài liệu người dùng** vào GitHub.

## Mô hình dữ liệu an toàn

`users/{firebaseAuthUid}/trips/{tripId}`

Mỗi bản ghi có `ownerUid`, `revision` (số nguyên tăng dần), `updatedAt: serverTimestamp()`, `deleted` và `trip` (nội dung chuyến đi). Firestore Rules trong `firestore.rules` chỉ cho phép Firebase Auth UID trùng với UID ở đường dẫn đọc/ghi; khi sửa, `revision` phải tăng đúng 1. Xóa bằng `deleted: true, trip: null` và tăng revision để không hồi sinh lịch bị xóa khi máy cũ lên mạng.

Để hỗ trợ nhiều người an toàn, client đăng nhập cần:
- Đợi `onAuthStateChanged` hoàn tất trước khi hiển thị dữ liệu từng người. Không dùng cache localStorage chung để hiển thị lịch của tài khoản khác.
- Dùng `signInWithPopup` và `GoogleAuthProvider` (GitHub Pages là host tĩnh). Không yêu cầu người dùng cung cấp tài khoản Google/mật khẩu cho ChatGPT.
- Lưu cache trên thiết bị gắn với UID, xóa/khóa cache của UID cũ khi đăng xuất hoặc đổi tài khoản. Không tự đưa dữ liệu khách hoặc dữ liệu người A lên tài khoản người B.
- Khi tài khoản mới đăng nhập, cho chọn **nhập dữ liệu khách một lần** hoặc tải lịch riêng của tài khoản, không tự động trộn dữ liệu cũ.
- Đồng bộ theo từng trip và `revision`, dùng Firestore transactions để phát hiện sửa trùng. Khi có xung đột, giữ cả hai bản hoặc xuất JSON và yêu cầu người dùng lựa chọn; không âm thầm ghi đè.
- Bắt buộc kiểm tra/giới hạn dung lượng mỗi trip vì Firestore có giới hạn kích thước mỗi document; không dùng một document chứa toàn bộ backup ~1,8 MB.
- Không đưa dữ liệu cá nhân lên repository, GitHub Pages hoặc file source public. Các đoạn `firebaseConfig` của web là định danh project và không thay thế cho Firestore Security Rules.

## Kiểm thử cần hoàn thành trước khi bật đăng nhập thật

- 2 tài khoản Google độc lập: A chỉ đọc/ghi A, B bị từ chối đọc/ghi A kể cả dùng API trực tiếp.
- Đăng xuất A, đăng nhập B trên cùng máy: tuyệt đối không lộ lịch A hoặc đồng bộ nhầm dữ liệu sang B.
- Cùng một tài khoản trên điện thoại và máy tính: cập nhật thấy trên cả hai.
- Hai thiết bị sửa cùng một lịch khi offline: cảnh báo xung đột, giữ dữ liệu cho đến khi người dùng quyết định.
- Google popup bị chặn, token hết hạn, mạng lỗi, hết quota Firestore, xóa dữ liệu: trạng thái chính xác, dữ liệu cục bộ không mất.
- Sao lưu/nhập JSON cũ và dữ liệu ở bản GitHub Gist: chuyển đổi chỉ khi chủ sở hữu xác nhận.

## Trạng thái triển khai

File `firestore.rules` chỉ là **cấu hình nguồn** chưa được đẩy vào dự án Firebase nào. Chưa có quyền truy cập Firebase của chủ sở hữu nên **không thể tự bật Google Sign-in hay xác nhận phân quyền trên hệ thống thật**. Không được giới thiệu app hiện tại là đã hỗ trợ đăng nhập Google/đồng bộ nhiều tài khoản.

Tài liệu chính thức: https://firebase.google.com/docs/auth/web/google-signin ; https://firebase.google.com/docs/firestore/security/rules-conditions ; https://firebase.google.com/docs/firestore/manage-data/transactions
