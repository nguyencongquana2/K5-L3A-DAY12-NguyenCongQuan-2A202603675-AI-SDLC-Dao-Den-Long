export class SeededRng {
  constructor(seed) {
    this.state = Number(seed) >>> 0;
  }

  next() {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  range(min, max) {
    return min + (max - min) * this.next();
  }
}
