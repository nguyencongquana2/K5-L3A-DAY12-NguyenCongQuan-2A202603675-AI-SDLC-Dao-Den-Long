# Đảo Đèn Lồng

> Video demo: sẽ được đính kèm vào GitHub Release `v1.0.0` ở Phase 4.

Game phiêu lưu 3D góc nhìn thứ ba. Bạn điều khiển Mây thu thập đom đóm, thắp năm Đèn Lồng Lớn và xua Bóng Mực trước khi bình minh đến.

## Chạy game

Yêu cầu Node.js 24+. Chạy trên Windows, macOS hoặc Linux:

```bash
npm ci
npm run dev
```

Mở địa chỉ Vite in ra terminal. Bản production tạo bằng `npm run build` và nằm trong `dist/`.

## Điều khiển

| Phím | Hành động |
|---|---|
| `WASD` / phím mũi tên | Di chuyển theo hướng camera |
| Chuột | Xoay camera góc nhìn thứ ba |
| `Space` | Nhảy |
| `E` | Nạp toàn bộ ánh sáng cần thiết vào đèn gần nhất |
| `Q` | Tỏa sáng: tốn 1 đom đóm, đẩy lùi và làm choáng Bóng Mực |
| `Esc` | Thả chuột |

Mây có 3 ngọn lửa sinh lực. Thắp đủ năm đèn để thắng; hết lửa hoặc hết 5 phút thì thua. Sau màn hình kết quả có thể chơi lại ngay.

## Điểm số

| Sự kiện | Điểm |
|---|---:|
| Nhặt một đom đóm | 10 |
| Thắp một Đèn Lồng Lớn | 100 |
| Làm choáng một Bóng Mực | 20 |
| Mỗi giây còn lại khi thắng | 5 |
| Mỗi ngọn lửa còn lại khi thắng | 50 |

Các giá trị gameplay đầy đủ nằm trong [`game.contract.json`](game.contract.json). Pulse dùng đom đóm đang mang; ngọn lửa chỉ là sinh lực. Khi bị chạm, Mây mất một ngọn lửa và đánh rơi `floor(50%)` số đom đóm đang mang.

## Headless — Test Contract v1.0

Ví dụ chạy 600 tick, xuất snapshot mỗi 10 tick:

```bash
node src/headless/cli.js --seed 1 --night 1 --scenario tests/fixtures/determinism-scenario.json --inputs tests/fixtures/determinism-inputs.json --ticks 600 --snapshot-every 10 --out output.jsonl
```

Không truyền `--scenario` hoặc `--inputs` thì dùng màn mặc định/người chơi đứng yên. Logic chạy cố định 60 tick/giây, không mở cửa sổ, không cần GPU. File sai định dạng trả mã thoát 2.

## Kiểm chứng

```bash
npm run verify
npm run build
```

`verify` chạy unit/integration test rồi chạy cùng seed, scenario và inputs hai lần để so sánh output từng byte. CI cũng chạy hai lệnh này sau mỗi lần push.

- Giả định, acceptance criteria và nhật ký AI: [`docs/notes/phase-1.md`](docs/notes/phase-1.md)
- Bằng chứng Phase 1: [`docs/proof/phase-1`](docs/proof/phase-1)
- Hướng dẫn agent: [`AGENTS.md`](AGENTS.md)

## Sáng tạo của tôi

- Đảo sáng dần theo số Đèn Lồng Lớn đã thắp.
- Mỗi đèn tạo một vòng ánh sáng an toàn mà Bóng Mực không thể đi vào.
- Mây có nón lá cùng chiếc đèn lồng nhỏ phát sáng; toàn bộ cảnh quan low-poly được dựng bằng hình học thủ tục, không dùng asset ngoài.

Những chi tiết này chỉ thuộc lớp hiển thị hoặc dùng đúng thông số contract; chúng không thay đổi output headless ngoài các luật đã khai báo.

## Giấy phép và nguồn

Mã nguồn phát hành theo [MIT License](LICENSE). Nguồn công cụ và nội dung được ghi tại [CREDITS.md](CREDITS.md). Không có model, texture, nhạc hoặc âm thanh bên ngoài trong Phase 1.
