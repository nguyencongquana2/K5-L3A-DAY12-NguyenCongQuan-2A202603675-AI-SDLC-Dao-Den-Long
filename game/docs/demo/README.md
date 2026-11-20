# Demo video

`demo.mp4` is a 15-second, 1280×720 MP4/AVC recording of the actual production WebGL canvas. The recording script opens an ordinary Night 1 run and sends the same keyboard events as a player: movement, dash, interact and pulse. It is under the five-minute release limit.

The automated test, headless, benchmark and soak evidence shown alongside the demo is stored in [`../proof/phase-4`](../proof/phase-4); the video is intentionally not edited to fake terminal output.

Re-record with:

```bash
npm --prefix game run demo -- --duration 15 --out game/docs/demo/demo.mp4
```
