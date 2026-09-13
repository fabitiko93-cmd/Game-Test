import { SAVE } from "./config.js?v=3";

export class SaveStore {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  read() {
    try {
      const value = JSON.parse(this.storage.getItem(SAVE.key));
      if (!value || value.version !== SAVE.version) return null;
      return value;
    } catch (_) {
      return null;
    }
  }

  has() {
    return Boolean(this.read());
  }

  write(state) {
    try {
      this.storage.setItem(SAVE.key, JSON.stringify({ ...state, version: SAVE.version }));
      return true;
    } catch (_) {
      return false;
    }
  }

  clear() {
    try {
      this.storage.removeItem(SAVE.key);
      return true;
    } catch (_) {
      return false;
    }
  }
}
