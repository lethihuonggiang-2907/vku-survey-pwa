# Khảo Sát Việc Làm Sinh Viên VKU — PWA Offline-First

Ứng dụng phỏng vấn thực địa: nhập tên phiên, người phỏng vấn, câu hỏi/trả lời, chụp ảnh hiện
trường và lấy vị trí GPS. Hoạt động được **hoàn toàn offline**, dữ liệu lưu tạm trên máy
(IndexedDB) và **tự động đồng bộ lên Google Sheet** khi có mạng trở lại.

Hướng dẫn này viết cho người **chưa biết gì**, làm theo từng bước là chạy được.

---

## 0. Cấu trúc project

```
pwa-survey/
├── index.html              → Giao diện chính (form + lịch sử)
├── manifest.json            → Khai báo PWA (tên, icon, chế độ standalone)
├── sw.js                    → Service Worker (cache, offline, background sync)
├── css/style.css            → Giao diện (tông tím nhạt kiểu Google Form)
├── js/config.js             → 🔧 Nơi bạn dán URL Google Apps Script
├── js/db.js                 → Lưu/đọc dữ liệu offline bằng IndexedDB
├── js/app.js                → Logic chính: form, GPS, camera, đồng bộ
├── icons/                   → Icon app (192px, 512px)
└── apps-script/Code.gs      → Mã backend dán vào Google Apps Script
```

Bạn cần làm theo thứ tự: **(1) Tạo Google Sheet → (2) Tạo Apps Script → (3) Deploy Apps Script
lấy URL → (4) Dán URL vào config.js → (5) Đưa web lên hosting HTTPS → (6) Cài lên điện thoại
→ (7) Test offline.**

---

## Bước 1 — Tạo Google Sheet làm cơ sở dữ liệu

1. Vào [sheets.google.com](https://sheets.google.com) → **Blank spreadsheet** (Bảng tính trống).
2. Đặt tên file, ví dụ: `CSDL_KhaoSatVieclam_VKU`.
3. Bạn **không cần** tự tạo cột tiêu đề — script ở Bước 2 sẽ tự tạo sheet con tên `KhaoSat`
   kèm tiêu đề khi có dữ liệu đầu tiên gửi lên.
4. (Tuỳ chọn) Nếu thầy yêu cầu Sheet public để cả nhóm xem: vào **Share** (Chia sẻ) → **General
   access** → chọn **Anyone with the link** → quyền **Viewer**.

---

## Bước 2 — Gắn mã Apps Script vào Sheet

1. Trong Google Sheet vừa tạo, vào menu **Extensions (Tiện ích mở rộng) → Apps Script**.
2. Xoá hết đoạn code mẫu `function myFunction() {}` đang có sẵn.
3. Mở file `apps-script/Code.gs` trong project này, **copy toàn bộ nội dung**, dán vào cửa sổ
   Apps Script.
4. Nhấn biểu tượng 💾 (Save project), đặt tên project ví dụ `VKU Survey API`.

---

## Bước 3 — Deploy thành Web App để lấy URL

1. Trong Apps Script, góc trên phải nhấn **Deploy → New deployment**.
2. Nhấn biểu tượng ⚙️ cạnh "Select type" → chọn **Web app**.
3. Điền:
   - **Description**: `VKU Survey API v1`
   - **Execute as**: `Me (tài khoản của bạn)`
   - **Who has access**: `Anyone` *(bắt buộc chọn Anyone thì app mới gọi được từ điện thoại
     mà không cần đăng nhập Google)*
4. Nhấn **Deploy**.
5. Google sẽ yêu cầu **Authorize access** (Cấp quyền) → chọn tài khoản Google của bạn → nếu
   hiện cảnh báo "Google hasn't verified this app", nhấn **Advanced (Nâng cao) → Go to VKU
   Survey API (unsafe)** → **Allow**. *(Đây là cảnh báo bình thường vì đây là script cá nhân
   của bạn, không phải ứng dụng công khai.)*
6. Sau khi deploy xong, Google cho bạn một **Web app URL** dạng:
   ```
   https://script.google.com/macros/s/AKfycb.........../exec
   ```
   **Copy URL này lại** — đây chính là "địa chỉ API" để app gửi dữ liệu tới.

> ⚠️ Mỗi khi bạn **sửa lại code trong Code.gs**, bạn phải **Deploy → Manage deployments →
> nhấn ✏️ (Edit) → chọn Version "New version" → Deploy lại** thì thay đổi mới có hiệu lực.
> URL vẫn giữ nguyên.

---

## Bước 4 — Dán URL vào ứng dụng

Mở file `js/config.js`, thay dòng:

```js
const APPS_SCRIPT_URL = "DÁN_URL_GOOGLE_APPS_SCRIPT_CỦA_BẠN_VÀO_ĐÂY";
```

thành URL bạn vừa copy, ví dụ:

```js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycb.........../exec";
```

Lưu file lại.

---

## Bước 5 — Chạy thử trên máy tính (trước khi đưa lên mạng)

PWA (Service Worker) **bắt buộc chạy trên HTTPS**, nhưng riêng `localhost` thì được miễn.
Cách nhanh nhất để test tại chỗ:

**Cách A — Dùng VS Code:**
1. Cài extension **Live Server**.
2. Mở thư mục `pwa-survey` trong VS Code.
3. Chuột phải vào `index.html` → **Open with Live Server**.

**Cách B — Dùng Python (nếu máy có sẵn Python):**
```bash
cd pwa-survey
python3 -m http.server 8000
```
Rồi mở trình duyệt vào `http://localhost:8000`.

Thử điền form, bấm "Lưu & Gửi" → mở Google Sheet kiểm tra xem dòng dữ liệu có xuất hiện không.

---

## Bước 6 — Đưa ứng dụng lên mạng (HTTPS công khai)

Để cài lên điện thoại thật và nộp bài cho thầy, bạn cần 1 link HTTPS công khai. Cách dễ nhất
cho người mới — **GitHub Pages**:

1. Tạo tài khoản [github.com](https://github.com) nếu chưa có.
2. Tạo repository mới (Public), ví dụ tên `vku-survey-pwa`.
3. Upload toàn bộ nội dung thư mục `pwa-survey/` lên repo đó (dùng nút **Add file → Upload
   files**, kéo thả cả thư mục vào).
4. Vào **Settings → Pages** → mục **Branch** chọn `main` → **Save**.
5. Đợi khoảng 1 phút, GitHub sẽ cho bạn link dạng:
   ```
   https://<tên-tài-khoản>.github.io/vku-survey-pwa/
   ```

*(Nếu quen dùng Vercel/Cloudflare Pages như slide thầy gợi ý thì càng tốt — chỉ cần kéo thả
thư mục vào là xong, cách làm tương tự.)*

---

## Bước 7 — Cài ứng dụng lên điện thoại & kiểm tra offline

1. Mở link HTTPS ở trên bằng **Chrome trên điện thoại Android** (hoặc Safari trên iPhone).
2. Chrome sẽ hiện gợi ý **"Thêm vào Màn hình chính" / "Install app"** → bấm cài đặt. App sẽ
   có icon riêng, mở lên không còn thanh địa chỉ trình duyệt (chế độ `standalone`).
3. **Kiểm tra offline:** bật **Chế độ máy bay** → mở lại app → vẫn nhập được phiên phỏng vấn,
   chụp ảnh, lấy vị trí (vị trí GPS vẫn hoạt động offline). Bấm "Lưu & Gửi" → app báo "Đang
   offline — đã lưu vào máy".
4. Tắt chế độ máy bay (có mạng lại) → app tự động đồng bộ trong vài giây → có thông báo
   "Đã đồng bộ thành công" → kiểm tra Google Sheet thấy dòng dữ liệu mới xuất hiện, kèm link
   ảnh trong Google Drive.
5. Nếu muốn đồng bộ ngay lập tức thay vì chờ, bấm nút **"Đồng bộ ngay"** ở đầu trang.

---

## Cách hoạt động (giải thích kỹ thuật ngắn gọn)

| Thành phần | Vai trò |
|---|---|
| `manifest.json` | Cho phép cài app lên màn hình chính, chạy như app thật (tiêu chí *Installable*) |
| `sw.js` | Cache toàn bộ giao diện (App Shell) theo chiến lược **Cache-First** → mở app được cả khi mất mạng |
| `js/db.js` (IndexedDB) | Lưu tạm từng phiên phỏng vấn (kể cả ảnh) ngay trên máy khi chưa có mạng |
| `js/app.js` | Khi bấm Lưu: **luôn lưu vào IndexedDB trước**, nếu đang online thì gửi lên Google Sheet ngay, nếu offline thì để đó |
| Background Sync (`sw.js`) | Khi có mạng trở lại, tự động gửi các bản ghi còn "chờ đồng bộ" lên server, kể cả khi người dùng chưa mở lại app (trên trình duyệt hỗ trợ — Chrome Android hỗ trợ tốt; Safari/iOS sẽ tự đồng bộ khi mở lại app nhờ sự kiện `online`) |
| `apps-script/Code.gs` | Nhận dữ liệu, lưu ảnh vào Google Drive, ghi 1 dòng vào Google Sheet |

---

## Xử lý sự cố thường gặp

- **Bấm Lưu & Gửi báo lỗi "Chưa cấu hình APPS_SCRIPT_URL"** → bạn quên làm Bước 4.
- **Đồng bộ báo lỗi nhưng Sheet không có dữ liệu** → kiểm tra lại Bước 3: mục "Who has access"
  phải là **Anyone**, và bạn đã **Deploy phiên bản mới nhất** sau khi sửa code.
- **Không thấy nút "Cài đặt app"** → PWA chỉ hiện nút cài khi chạy trên **HTTPS** (hoặc
  localhost), không hoạt động khi mở trực tiếp file `index.html` bằng `file://`.
- **Ảnh không lên Sheet** → lần đầu deploy, Google có thể yêu cầu cấp quyền truy cập Google
  Drive — làm lại thao tác cấp quyền ở Bước 3, mục 5.
- **Muốn đổi câu hỏi mặc định, thêm nhiều câu hỏi/1 phiên** → hiện tại mỗi lần Lưu & Gửi là
  1 câu hỏi + 1 câu trả lời (1 dòng Sheet). Nếu muốn 1 phiên có nhiều câu hỏi, có thể lặp lại
  form nhiều lần với cùng "Tên phiên phỏng vấn" — mình có thể sửa lại thành form nhiều câu hỏi
  trong 1 lần gửi nếu bạn cần.

---

## Gợi ý viết Báo cáo kỹ thuật (2–4 trang, theo yêu cầu Mini-Project 1)

1. Mục tiêu & bài toán thực tế.
2. Kiến trúc hệ thống (vẽ sơ đồ luồng: Form → IndexedDB → Service Worker → Background Sync →
   Google Apps Script → Google Sheet/Drive).
3. Giải thích 5 tiêu chí PWA áp dụng trong bài (Installable, Offline-First, Fast, Engaging,
   Secure).
4. Chiến lược caching đã dùng (Cache-First cho App Shell, Network-Only cho API).
5. Demo ảnh chụp màn hình: cài app, test offline, dữ liệu lên Sheet.
6. Hạn chế & hướng phát triển (ví dụ: Background Sync API chưa được Safari hỗ trợ đầy đủ).
