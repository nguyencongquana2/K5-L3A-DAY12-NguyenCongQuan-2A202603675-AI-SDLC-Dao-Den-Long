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
| `E` | Nạp đom đóm vào đèn gần nhất |
| `Q` | Tỏa sáng |
| `Esc` / `P` | Tạm dừng / tiếp tục |

Mây có 3 Ngọn Lửa và mang tối đa 10 đom đóm. Tỏa sáng tốn 2 đom đóm. Bùa Gió tăng tốc chạy lên 7,2 m/s trong 600 tick và bỏ hồi chiêu Lướt. Thua sẽ chơi lại Đêm hiện tại; thắng Đêm 3 mở màn hình Bình Minh và tổng điểm.

## Điểm chuẩn Phase 2

| Sự kiện | Điểm |
|---|---:|
| Nạp một đom đóm | 10 |
| Thắp một Đèn Lồng Lớn | 100 |
| Mỗi Bóng Mực trúng Tỏa Sáng | 5 |
| Bonus thắng | `floor(giây còn lại) × 2 + Ngọn Lửa × 50` |

Tổng điểm game là tổng điểm của các Đêm đã thắng. Các số gameplay nằm tại [`game.contract.json`](../game.contract.json).

## Headless — Test Contract v1.1

```bash
node game/src/headless/cli.js --seed 1 --night 3 --scenario game/tests/fixtures/phase2-performance-scenario.json --ticks 21600 --snapshot-every 3600 --out output.jsonl
```

`--night` nhận `1`, `2`, `3`. Logic chạy cố định 60 tick/giây; pause chỉ tăng wall `tick`, còn `sim_tick`, timer, cooldown, TTL và spawn đứng yên. File scenario/input sai trả mã thoát 2.

## Kiểm chứng

```bash
npm --prefix game run verify
npm --prefix game run build
```

- Spec, assumptions và acceptance criteria: [`docs/notes/phase-2.md`](docs/notes/phase-2.md)
- Bằng chứng Phase 2: [`docs/proof/phase-2`](docs/proof/phase-2)
- Bằng chứng Phase 1: [`docs/proof/phase-1`](docs/proof/phase-1)

Lần đo Phase 2: 21.600 tick Đêm 3 hoàn thành trong 0,096 giây; output hai lần chạy cùng seed giống hệt từng byte; bản thường đạt 119,32 FPS tại viewport 1280×720 bằng Chrome/D3D11.

## Nội dung và nguồn

Game dùng Three.js và hình học thủ tục; âm thanh được tổng hợp bằng WebAudio, không dùng asset ngoài. Mã nguồn phát hành theo [MIT License](LICENSE), chi tiết tại [CREDITS.md](CREDITS.md).
