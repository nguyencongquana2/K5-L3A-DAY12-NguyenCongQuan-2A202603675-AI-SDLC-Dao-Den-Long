# Retro — Đảo Đèn Lồng, bốn phase

## Tổng kết theo phase

Phase 1 hiệu quả nhất khi biến PRD thành deterministic core 60 Hz và public CLI trước khi làm đồ họa. Điều đó tạo một đường kiểm chứng rẻ: movement, input edge, score và terminal state đều có thể chạy không GPU. Phase 2 khó hơn vì mở rộng ba bản đồ, pause, dash, wind và nhiều entity; cấu hình Night tách khỏi simulation giúp tránh nhét tọa độ vào logic. Phase 3 là thay đổi kiến trúc thực sự: trạng thái đèn vĩnh viễn trở thành lifecycle có dầu, outage và relight. ADR và integer fuel units đã ngăn lỗi số thực ở ranh giới bình minh. Phase 4 buộc dự án trở thành sản phẩm: công cụ đo độc lập, soak, persistence, accessibility, tài liệu cài sạch và artifact phát hành.

## Làm việc với AI: điều hiệu quả

Yêu cầu cụ thể, invariants trong `AGENTS.md`, và completion gate `npm run verify` là ba phần hữu ích nhất. Việc yêu cầu AI đọc contract/core/test trước khi sửa giảm nhiều lần viết lại. Các test nhỏ theo từng luật giúp phát hiện lỗi sớm hơn browser playthrough. Tách web khỏi core cho phép AI thay HUD và renderer mà output headless không đổi. Những script tự tạo (`verify-determinism`, benchmark CDP và soak) có giá trị hơn lời mô tả vì chúng tạo bằng chứng lặp lại được.

## Những lần AI sai và cách phát hiện

- Một fixture Phase 3 đặt Mây ngoài bán kính đảo; nhân vật rơi và làm Shade ngừng drain. Assertion fuel sai đã chỉ ra lỗi fixture, không phải core.
- Một test web ban đầu kiểm tra tên biến quá cứng (`lantern.everLit` thay vì biến thực tế). Full test suite bắt được trước completion gate.
- Vite config đầu tiên làm esbuild duyệt tới thư mục bị sandbox chặn. Production build đỏ; plugin leaderboard được chuyển sang launcher runtime nên build tĩnh lại sạch.
- Benchmark ban đầu ghi mốc load ngay trước frame đầu thay vì trong callback frame. Review định nghĩa `load_ms` dẫn tới sửa mốc ở `requestAnimationFrame` đầu tiên.
- Các test Phase 1–3 chứa kỳ vọng version/hardcoded key cũ. Chúng được cập nhật có chủ đích theo luật thay thế; không test nào bị skip âm thầm.

## Harness và kiểm soát rủi ro

`AGENTS.md` giữ các invariant quan trọng nhất: contract là nguồn thật, core không wall-clock, headless không GPU, pause đóng băng gameplay timer, entity mới không tương tác cùng tick và verify phải xanh. Git diff/status ngăn ghi đè thay đổi ngoài phạm vi. Generated JSON proof luôn được tạo qua CLI thay vì sửa tay. Các bước release chỉ diễn ra sau test, determinism, soak, benchmark và build.

## Token/chi phí ước tính

Ứng dụng không cung cấp số token/billing chính xác. Dựa trên độ dài hội thoại, log và số lần đọc mã, ước tính bốn phase dùng khoảng 300.000–450.000 token tổng cộng. Công việc chạy trong gói Codex/ChatGPT của lớp nên chi phí API trực tiếp ghi nhận là 0 USD; không nên diễn giải đây là giá API tương đương. Token được tiết kiệm bằng cách dùng `rg` để chọn vùng mã, chạy nhiều kiểm tra trong một lệnh, giữ core tập trung trong một file, tái sử dụng fixtures và chỉ tải tài liệu liên quan.

## Nếu làm lại

Tôi sẽ thiết kế version gates và leaderboard storage ngay từ Phase 1, tạo benchmark mode trước khi số entity tăng, và dùng component UI nhỏ thay cho một file web lớn. Tôi cũng sẽ chuẩn bị pipeline quay demo cùng CI sớm hơn, vì video và release artifact khó tự động hóa hơn unit test. Dù vậy, ưu tiên deterministic core rồi mới trang trí vẫn là quyết định đúng: nó giúp mọi change request sau đó đo được và hồi quy rõ ràng.
