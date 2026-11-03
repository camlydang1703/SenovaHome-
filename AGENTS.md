# SenNova Home - Quy tắc làm việc & Bối cảnh

## 1. Bối cảnh
- Quản trị tồn kho Min/Max động cho SenNova Home (5 kho x 11 SKU, mô phỏng 84 ngày từ 2026-08-01 đến 2026-10-23).
- Chỉ có RFQ (không có PO), thời gian chỉ đi tới.
- Nguồn sự thật: các file CSV trong `data/`.

## 2. Luật làm việc bắt buộc
1. KHÔNG mở trình duyệt, KHÔNG chạy Edge/Chrome `--dump-dom`, KHÔNG tạo `edge_dump.html`.
2. KHÔNG đọc cả file lớn. Dùng grep/đọc có chọn lọc (tối đa 80 dòng mỗi lần).
3. KHÔNG tạo script kiểm tra rải rác. Script tạm chỉ đặt trong `tools/` và xóa khi xong.
4. KHÔNG sinh lại file HTML bừa bãi. Mã nguồn mô đun nằm trong `src/`, file đích đóng gói bằng `build.py` ra `dist/sennova_ims.html`.
5. Đảm bảo các mô đun JS engine độc lập DOM để có thể kiểm thử tự động.
6. Làm theo từng pha, báo cáo ngắn gọn (tối đa 10 dòng), dừng chờ xác nhận trước khi qua pha tiếp theo.
7. Mỗi pha làm trên một nhánh git riêng (`phase-a-structure`, `phase-b-bugs`, `phase-c-warehouse-tabs`).
