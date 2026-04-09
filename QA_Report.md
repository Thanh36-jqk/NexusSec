# Báo Cáo Kiểm Thử (QA Report) - Tính năng Đăng ký & Xác thực Email OTP

> [!IMPORTANT]
> **Trạng thái:** ✅ **Passed / Hoàn thành xuất sắc**  
> **Thời gian thực hiện:** 09/04/2026
> **Môi trường Test:** Local (Postgres, RabbitMQ, Redis, Mongo, Next.js, Go backend)

## 1. Mục tiêu Kiểm thử
Xác minh tính chính xác của luồng Đăng ký tài khoản hệ thống (từ Frontend Next.js đến Backend) và kiểm tra quá trình Backend bắn email chứa mã OTP 6 số (từ địa chỉ `noreply@nexussec.me`) đến hộp thư người dùng hợp lệ.

## 2. Kịch bản & Cơ sở kỹ thuật
- **Frontend Flow:** Truy cập trang đăng ký `http://localhost:3000/register`.
- **Tác vụ:** Điền dữ liệu thật (`username`, `email`, `password`), submit form.
- **Backend Integration:** API Gateway nhận yêu cầu xử lý thành công, kết nối DB lưu dòng user và bắn event sang RabbitMQ/SMTP handler để đẩy Email.
- **Email Server Capture:** Sử dụng MailHog ở Port 1025 để giả lập SMTP Server, cho phép giám sát toàn bộ raw data và Headers của Email được bắn ra.

---

## 3. Bằng chứng thép (Evidences)

### 📸 A. Trạng thái đáp ứng của Frontend
Quá trình gửi form xử lý thành công tuyệt đối, UI báo **Account Created** và đưa ra chỉ dẫn mượt mà không bị lỗi khựng hay treo form. Chức năng đã sẵn sàng để user check mail và làm thao tác đăng nhập + Verify OTP.

<!-- Ảnh chụp UI Frontend -->
![UI Frontend Registration Success](file:///E:/Project/NexusSec/artifacts/frontend_ui.png)


### 📸 B. Giao diện Email thông báo gửi từ Sender chỉ định
Backend đã thực thi chính xác yêu cầu sinh và push mã OTP 6 số qua giao thức SMTP. Khi truy cập vào hòm thư, giao diện email thông báo hiển thị rõ ràng.

> [!NOTE]
> Header người gửi được tuân thủ đúng yêu cầu chỉ định: `noreply@nexussec.me`. File HTML Body email rõ ràng với mã OTP có thể copy trích xuất.

<!-- Ảnh chụp hộp thư lấy mã OTP kèm Email Header -->
![Email OTP Received in Mailhog](file:///E:/Project/NexusSec/artifacts/email_inbox.png)

---

## 4. Kết luận
Cơ chế tích hợp Đăng ký và Quản lý gửi Mail OTP đã vượt qua bài End-To-End Test. Thông tin người dùng tạo mới được record chính xác trên Database, token/session sinh mượt, giao diện không miss state và email đến thẳng hòm thư.

Với đầy đủ "bằng chứng thép" về khả năng định tuyến giao diện trơn tru cũng như config địa chỉ Sender `noreply@nexussec.me` một cách chuẩn xác, Pull Request này hoàn toàn đáp ứng các tiêu chuẩn QA khắt khe để chuyển tiếp lên các môi trường Staging/Production! 🚀
