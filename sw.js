/**
 * sw.js — Service Worker
 * Vòng đời: Install -> Activate -> Fetch (đúng theo mô hình bài giảng Tuần 3)
 *
 * - Install: pre-cache toàn bộ "App Shell" (HTML/CSS/JS/icon) để app mở được
 *   kể cả khi không có mạng (chiến lược Cache-First).
 * - Activate: dọn các cache phiên bản cũ.
 * - Fetch: Cache-First cho App Shell, Network-Only (không can thiệp) cho các
 *   request tới Google Apps Script / API bên ngoài.
 * - Sync: lắng nghe sự kiện Background Sync để tự đồng bộ dữ liệu offline
 *   ngay khi thiết bị có mạng trở lại, kể cả khi không mở app.
 */

importScripts("js/config.js", "js/db.js");

const CACHE_VERSION = "v1";
const CACHE_NAME = `vku-survey-${CACHE_VERSION}`;

const APP_SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "css/style.css",
  "js/config.js",
  "js/db.js",
  "js/app.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

// ---------- INSTALL: pre-cache app shell ----------
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// ---------- ACTIVATE: dọn cache cũ ----------
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---------- FETCH: áp dụng chiến lược caching ----------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isGet = event.request.method === "GET";

  // Chỉ can thiệp cache cho GET request cùng gốc (app shell).
  // Các request tới Google Apps Script (POST) luôn đi thẳng ra mạng (Network-Only).
  if (!isGet || !isSameOrigin) {
    event.respondWith(fetch(event.request).catch(() => new Response(null, { status: 503 })));
    return;
  }

  // Cache-First cho App Shell: có trong cache thì trả về ngay, không thì fetch mạng rồi lưu lại.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => cached);
    })
  );
});

// ---------- BACKGROUND SYNC: tự động đồng bộ khi có mạng trở lại ----------
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-interviews") {
    event.waitUntil(syncInterviewsInBackground());
  }
});

async function sendRecordToServer(record) {
  const payload = {
    sessionName: record.sessionName,
    interviewerName: record.interviewerName,
    timestamp: record.timestamp,
    lat: record.lat ?? "",
    lng: record.lng ?? "",
    question: record.question,
    answer: record.answer,
    photoBase64: record.photoBase64 || "",
    photoMime: record.photoMime || "",
  };

  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "sync failed");
  return data;
}

async function syncInterviewsInBackground() {
  const pending = await SurveyDB.getUnsyncedRecords();
  let successCount = 0;

  for (const record of pending) {
    try {
      await sendRecordToServer(record);
      await SurveyDB.markSynced(record.localId);
      successCount++;
    } catch (err) {
      console.warn("[SW] Đồng bộ thất bại cho bản ghi", record.localId, err);
      // Ném lỗi để hệ thống tự lên lịch thử lại (retry) Background Sync
      throw err;
    }
  }

  if (successCount > 0) {
    // Thông báo cho người dùng biết đã đồng bộ xong
    self.registration.showNotification("Khảo Sát Việc Làm VKU", {
      body: `Đã đồng bộ thành công ${successCount} phiên phỏng vấn lên Google Sheet.`,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
    });

    // Báo cho các tab đang mở để làm mới danh sách trên giao diện
    const clientsList = await self.clients.matchAll();
    clientsList.forEach((client) => client.postMessage({ type: "SYNC_DONE", count: successCount }));
  }
}

// Cho phép trang gọi self.registration.showNotification khi cần
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsList) => {
      if (clientsList.length > 0) return clientsList[0].focus();
      return self.clients.openWindow("./index.html");
    })
  );
});
