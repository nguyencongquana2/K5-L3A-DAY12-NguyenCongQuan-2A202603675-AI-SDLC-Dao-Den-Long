# Đảo Đèn Lồng

Game phiêu lưu 3D gồm ba Đêm. Bạn điều khiển Mây thu thập đom đóm, thắp Đèn Lồng Lớn, tránh Bóng Mực và giành lại bình minh.

## Chạy game

Yêu cầu Node.js 24+:

```bash
npm --prefix game ci
npm --prefix game run dev
```

Mở địa chỉ Vite in ra terminal, thường là `http://localhost:5173`. Build production bằng `npm --prefix game run build`.

## Điều khiển

| Phím | Hành động |
|---|---|
| `WASD` / phím mũi tên | Di chuyển theo camera |
| Chuột | Xoay camera |
| `Space` | Nhảy |
| `Shift` | Lướt 14 m/s trong 12 tick |
| `E` | Thắp, thắp lại hoặc châm dầu cho đèn gần nhất có thể nhận đom đóm |
| `Q` | Tỏa sáng |
| `Esc` / `P` | Tạm dừng / tiếp tục |

Mây có 3 Ngọn Lửa. Sức chứa bắt đầu ở 10, tăng 2 sau mỗi lần thắp thành công và tối đa 20. Đèn tiêu hao dầu, có thể tắt và cần được châm; Bóng Mực có thể hút dầu của đèn yếu. Mục tiêu là sống tới bình minh và giữ sáng ít nhất 60% số đèn. Tỏa sáng tốn 2 đom đóm. Bùa Gió tăng tốc chạy lên 7,2 m/s trong 600 tick và bỏ hồi chiêu Lướt.

## Điểm chuẩn Phase 3

| Sự kiện | Điểm |
|---|---:|
| Mỗi đom đóm nạp vào đèn | 5 |
| Thắp lần đầu / thắp lại | 100 / 40 |
| Bóng Mực trúng Tỏa Sáng | 5; nếu đang hút dầu thì tổng 15 |
| Bình minh khi thắng | Mỗi đèn sáng: `50 + floor(dầu)`; mỗi Ngọn Lửa: 50 |

Tổng điểm game là tổng điểm của các Đêm đã thắng. Các số gameplay nằm tại [`game.contract.json`](../game.contract.json).

## Headless — Test Contract v1.2

```bash
node game/src/headless/cli.js --seed 1 --night 3 --scenario game/tests/fixtures/phase2-performance-scenario.json --ticks 21600 --snapshot-every 3600 --out output.jsonl
```

`--night` nhận `1`, `2`, `3`. Logic chạy cố định 60 tick/giây; pause chỉ tăng wall `tick`, còn `sim_tick`, timer, cooldown, TTL và spawn đứng yên. File scenario/input sai trả mã thoát 2.

## Kiểm chứng

```bash
npm --prefix game run verify
npm --prefix game run build
```

- Quyết định thiết kế, assumptions và acceptance criteria: [`docs/notes/phase-3.md`](docs/notes/phase-3.md)
- Bằng chứng Phase 3: [`docs/proof/phase-3`](docs/proof/phase-3)
- Bằng chứng Phase 2: [`docs/proof/phase-2`](docs/proof/phase-2)
- Bằng chứng Phase 1: [`docs/proof/phase-1`](docs/proof/phase-1)

Phase 3 giữ deterministic core 60 Hz và toàn bộ regression Phase 1–2. Kết quả verify mới nhất được ghi trong [`docs/proof/phase-3/README.md`](docs/proof/phase-3/README.md).

## Nội dung và nguồn

Game dùng Three.js và hình học thủ tục; âm thanh được tổng hợp bằng WebAudio, không dùng asset ngoài. Mã nguồn phát hành theo [MIT License](LICENSE), chi tiết tại [CREDITS.md](CREDITS.md).
