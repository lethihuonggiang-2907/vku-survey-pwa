/**
 * db.js
 * Lớp bao (wrapper) đơn giản cho IndexedDB, dùng để lưu các phiên phỏng vấn
 * ngay trên thiết bị khi không có mạng. Mỗi bản ghi có cờ "synced" để biết
 * đã đẩy lên Google Sheet hay chưa.
 */

const DB_NAME = "vku-survey-db";
const DB_VERSION = 1;
const STORE_NAME = "interviews";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "localId",
          autoIncrement: true,
        });
        store.createIndex("synced", "synced", { unique: false });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

const SurveyDB = {
  /** Thêm một phiên phỏng vấn mới vào IndexedDB. Trả về localId vừa tạo. */
  async addRecord(record) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.add({ ...record, synced: false, createdAt: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  /** Lấy toàn bộ bản ghi, mới nhất lên trước. */
  async getAllRecords() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result || []).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  },

  /** Lấy các bản ghi chưa đồng bộ lên Google Sheet. */
  async getUnsyncedRecords() {
    const all = await this.getAllRecords();
    return all.filter((r) => !r.synced);
  },

  /** Đánh dấu một bản ghi đã đồng bộ thành công. */
  async markSynced(localId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(localId);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (!record) return resolve();
        record.synced = true;
        record.syncedAt = Date.now();
        const putReq = store.put(record);
        putReq.onsuccess = () => resolve();
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  },

  /** Đếm số bản ghi chưa đồng bộ. */
  async countUnsynced() {
    const unsynced = await this.getUnsyncedRecords();
    return unsynced.length;
  },
};
