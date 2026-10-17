// Promise execution stays in Node; capture state and ordering are MoonBit-owned.
import { capture_new, capture_begin, capture_finish, capture_fail, capture_history } from '../web/engine.mjs';
export class Recorder {
  #state;
  constructor(model = 'register', initial = 0) {
    this.model = model; this.initial = initial;
    this.#state = capture_new(model, initial);
  }
  async record(description, action) {
    const token = capture_begin(this.#state, JSON.stringify(description));
    try {
      const output = await action();
      capture_finish(this.#state, token, JSON.stringify(output) ?? 'null');
      return output;
    } catch (error) {
      capture_fail(this.#state);
      throw error;
    }
  }
  history() {
    const result = JSON.parse(capture_history(this.#state));
    if (result.error) throw new Error(result.error);
    return result;
  }
}
