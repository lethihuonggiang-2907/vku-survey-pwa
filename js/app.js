/**
 * app.js
 * Logic chính: nhập liệu, lấy vị trí, chụp ảnh, lưu offline (IndexedDB),
 * và đồng bộ lên Google Sheet khi có mạng.
 */

// Cấu hình APPS_SCRIPT_URL nằm trong js/config.js (dùng chung cho app.js và sw.js)

// ---------- Tham chiếu phần tử DOM ----------
const form = document.getElementById("surveyForm");
const timeDisplay = document.getElementById("timeDisplay");
const getLocationBtn = document.getElementById("getLocationBtn");
const locationText = document.getElementById("locationText");
const photoInput = document.getElementById("photoInput");
const photoFileName = document.getElementById("photoFileName");
const photoPreview = document.getElementById("photoPreview");
const submitBtn = document.getElementById("submitBtn");
const netDot = document.getElementById("netDot");
const netText = document.getElementById("netText");
const pendingBadge = document.getElementById("pendingBadge");
const syncNowBtn = document.getElementById("syncNowBtn");
const historyList = document.getElementById("historyList");
const toastEl = document.getElementById("toast");

let currentLocation = null; // { lat, lng }
let currentPhotoBase64 = null; // ảnh dạng base64 (không kèm tiền tố data:)
let currentPhotoMime = null;

// ---------- Tiện ích ----------
function showToast(message, type = "default", duration = 3200) {
  toastEl.textContent = message;
  toastEl.className = "toast show " + type;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toastEl.className = "toast";
  }, duration);
}

function formatTime(date) {
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function updateNetworkStatus() {
  const online = navigator.onLine;
  netDot.className = "dot " + (online ? "online" : "offline");
  netText.textContent = online ? "Đang có kết nối mạng" : "Đang ngoại tuyến (offline)";
  if (online) {
    // Tự động thử đồng bộ khi có mạng trở lại
    syncPending(true);
  }
}

// ---------- Đồng hồ hiển thị thời gian hiện tại ----------
function tickClock() {
  timeDisplay.textContent = formatTime(new Date());
}
tickClock();
setInterval(tickClock, 1000 * 30);

// ---------- Lấy vị trí GPS ----------
getLocationBtn.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    showToast("Thiết bị không hỗ trợ định vị.", "error");
    return;
  }
  locationText.textContent = "Đang lấy vị trí…";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      currentLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      locationText.textContent = `✅ ${currentLocation.lat.toFixed(5)}, ${currentLocation.lng.toFixed(5)}`;
    },
    (err) => {
      locationText.textContent = "Không lấy được vị trí.";
      showToast("Lỗi định vị: " + err.message, "error");
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

// ---------- Chụp / chọn ảnh hiện trường ----------
photoInput.addEventListener("change", () => {
  const file = photoInput.files[0];
  if (!file) return;
  photoFileName.textContent = file.name;
  currentPhotoMime = file.type || "image/jpeg";

  const reader = new FileReader();
  reader.onload = () => {
    // reader.result dạng "data:image/jpeg;base64,AAAA..."
    const fullDataUrl = reader.result;
    currentPhotoBase64 = fullDataUrl.split(",")[1];
    photoPreview.src = fullDataUrl;
    photoPreview.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
});

// ---------- Gửi 1 bản ghi lên Google Sheet (qua Apps Script) ----------
async function sendToServer(record) {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("DÁN_URL")) {
    throw new Error("Chưa cấu hình APPS_SCRIPT_URL trong js/app.js");
  }
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

  // Dùng content-type text/plain để trình duyệt KHÔNG gửi preflight OPTIONS
  // (Google Apps Script Web App không xử lý OPTIONS mặc định).
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error("Máy chủ trả về lỗi: " + res.status);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Đồng bộ thất bại");
  return data;
}

// ---------- Đồng bộ tất cả bản ghi đang chờ ----------
let isSyncing = false;
async function syncPending(silent = false) {
  if (isSyncing) return;
  if (!navigator.onLine) {
    if (!silent) showToast("Không có mạng, chưa thể đồng bộ.", "error");
    return;
  }
  const pending = await SurveyDB.getUnsyncedRecords();
  if (pending.length === 0) {
    if (!silent) showToast("Không có dữ liệu nào cần đồng bộ.");
    await refreshUI();
    return;
  }

  isSyncing = true;
  syncNowBtn.textContent = "Đang đồng bộ…";
  syncNowBtn.disabled = true;

  let successCount = 0;
  for (const record of pending) {
    try {
      await sendToServer(record);
      await SurveyDB.markSynced(record.localId);
      successCount++;
    } catch (err) {
      console.error("Lỗi đồng bộ bản ghi", record.localId, err);
      // Dừng lại nếu mất mạng giữa chừng, các bản ghi còn lại chờ lần sau
      if (!navigator.onLine) break;
    }
  }

  isSyncing = false;
  syncNowBtn.textContent = "Đồng bộ ngay";
  syncNowBtn.disabled = false;

  if (successCount > 0) {
    showToast(`✅ Đã đồng bộ thành công ${successCount} phiên phỏng vấn lên Google Sheet.`, "success", 4000);
    notifyUser(`Đã đồng bộ ${successCount} phiên phỏng vấn thành công.`);
  } else if (!silent) {
    showToast("Đồng bộ chưa thành công. Sẽ thử lại sau.", "error");
  }

  await refreshUI();
}

function notifyUser(message) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification("Khảo Sát Việc Làm VKU", {
          body: message,
          icon: "icons/icon-192.png",
          badge: "icons/icon-192.png",
        });
      });
    }
  }
}

// ---------- Nộp form ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const record = {
    sessionName: document.getElementById("sessionName").value.trim(),
    interviewerName: document.getElementById("interviewerName").value.trim(),
    timestamp: new Date().toISOString(),
    lat: currentLocation ? currentLocation.lat : null,
    lng: currentLocation ? currentLocation.lng : null,
    question: document.getElementById("question").value.trim(),
    answer: document.getElementById("answer").value.trim(),
    photoBase64: currentPhotoBase64,
    photoMime: currentPhotoMime,
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "Đang lưu…";

  try {
    // Luôn lưu vào IndexedDB trước tiên — đảm bảo không bao giờ mất dữ liệu
    const localId = await SurveyDB.addRecord(record);

    if (navigator.onLine) {
      try {
        await sendToServer({ ...record, localId });
        await SurveyDB.markSynced(localId);
        showToast("✅ Đã lưu và đồng bộ thành công lên Google Sheet!", "success", 4000);
        notifyUser("Đã đồng bộ 1 phiên phỏng vấn thành công.");
      } catch (err) {
        console.error(err);
        showToast("Đã lưu trên máy. Đồng bộ thất bại, sẽ tự thử lại sau.", "error");
      }
    } else {
      showToast("📴 Đang offline — đã lưu vào máy, sẽ tự đồng bộ khi có mạng.");
    }

    // Đăng ký Background Sync (nếu trình duyệt hỗ trợ) để đồng bộ ngầm
    registerBackgroundSync();

    form.reset();
    tickClock();
    currentLocation = null;
    currentPhotoBase64 = null;
    currentPhotoMime = null;
    locationText.textContent = "Chưa lấy vị trí";
    photoFileName.textContent = "Chưa có ảnh";
    photoPreview.classList.add("hidden");
    photoPreview.src = "";

    await refreshUI();
  } catch (err) {
    console.error(err);
    showToast("Có lỗi khi lưu dữ liệu: " + err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Lưu & Gửi phiên phỏng vấn";
  }
});

syncNowBtn.addEventListener("click", () => syncPending(false));

// ---------- Đăng ký Background Sync API (nếu hỗ trợ) ----------
function registerBackgroundSync() {
  if ("serviceWorker" in navigator && "SyncManager" in window) {
    navigator.serviceWorker.ready
      .then((reg) => reg.sync.register("sync-interviews"))
      .catch((err) => console.warn("Background Sync không đăng ký được:", err));
  }
}

// ---------- Vẽ lại danh sách lịch sử + số lượng chờ đồng bộ ----------
async function refreshUI() {
  const records = await SurveyDB.getAllRecords();
  const unsynced = records.filter((r) => !r.synced);

  if (unsynced.length > 0) {
    pendingBadge.textContent = `${unsynced.length} chờ đồng bộ`;
    pendingBadge.classList.remove("hidden");
  } else {
    pendingBadge.classList.add("hidden");
  }

  if (records.length === 0) {
    historyList.innerHTML = '<p class="empty-state">Chưa có phiên phỏng vấn nào.</p>';
    return;
  }

  historyList.innerHTML = records
    .slice(0, 30)
    .map((r) => {
      const time = new Date(r.timestamp).toLocaleString("vi-VN");
      const statusClass = r.synced ? "synced" : "pending";
      const statusLabel = r.synced ? "Đã đồng bộ" : "Chờ đồng bộ";
      return `
        <div class="history-item">
          <div class="history-item-main">
            <p class="history-item-title">${escapeHtml(r.sessionName || "(Chưa đặt tên)")}</p>
            <p class="history-item-sub">${escapeHtml(r.interviewerName || "")} · ${time}</p>
            <p class="history-item-q">❓ ${escapeHtml(r.question || "")}</p>
          </div>
          <span class="status-pill ${statusClass}">${statusLabel}</span>
        </div>`;
    })
    .join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Lắng nghe trạng thái mạng ----------
window.addEventListener("online", updateNetworkStatus);
window.addEventListener("offline", updateNetworkStatus);

// ---------- Lắng nghe tin nhắn từ Service Worker (khi background sync xong) ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SYNC_DONE") {
      refreshUI();
    }
  });
}

// ---------- Khởi tạo khi tải trang ----------
async function init() {
  updateNetworkStatus();
  await refreshUI();

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }

  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("sw.js");
    } catch (err) {
      console.error("Đăng ký Service Worker thất bại:", err);
    }
  }
}

init();
