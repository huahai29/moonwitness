// Host-side recorder only. All consistency decisions stay in MoonBit.
export class Recorder {
  #tick = 0;
  #pending = 0;
  #failed = false;
  #operations = [];
  constructor(model = 'register', initial = 0) { this.model = model; this.initial = initial; }
  async record(description, action) {
    const start = this.#tick++;
    this.#pending++;
    try {
      const output = await action();
      const end = this.#tick++;
      this.#operations.push({ ...description, start, end, output });
      return output;
    } catch (error) {
      // A rejected call can still have taken effect. Do not silently omit it.
      this.#failed = true;
      throw error;
    } finally { this.#pending--; }
  }
  history() {
    if (this.#pending || this.#failed) throw new Error('Cannot export a completed history with pending or failed/uncertain operations');
    return { model: this.model, initial: this.initial, operations: [...this.#operations].sort((a, b) => a.start - b.start).map(op => ({ ...op })) };
  }
}
