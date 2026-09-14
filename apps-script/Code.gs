/**
 * Code.gs — Backend Google Apps Script cho ứng dụng "Khảo Sát Việc Làm Sinh Viên VKU"
 *
 * Chức năng:
 *  - Nhận dữ liệu 1 phiên phỏng vấn (JSON) từ PWA qua HTTP POST.
 *  - Nếu có ảnh hiện trường (base64), lưu ảnh vào một thư mục Google Drive
 *    rồi lấy link công khai, ghi link đó vào cột "Ảnh hiện trường".
 *  - Ghi 1 dòng dữ liệu mới vào Google Sheet (Sheet đóng vai trò CSDL).
 *
 * Cách triển khai: xem hướng dẫn chi tiết trong README.md — Bước 3 & 4.
 */

const SHEET_NAME = "KhaoSat"; // Tên sheet (tab) sẽ được tạo/dùng để lưu dữ liệu
const DRIVE_FOLDER_NAME = "VKU_KhaoSat_AnhHienTruong"; // Thư mục Drive lưu ảnh

const HEADERS = [
  "Thời gian ghi nhận",
  "Tên phiên phỏng vấn",
  "Tên người phỏng vấn",
  "Vĩ độ (Lat)",
  "Kinh độ (Lng)",
  "Bản đồ",
  "Câu hỏi",
  "Câu trả lời",
  "Ảnh hiện trường",
];

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({ success: true, message: "VKU Survey API đang hoạt động." })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet_();

    let photoUrl = "";
    if (data.photoBase64) {
      photoUrl = savePhotoToDrive_(data.photoBase64, data.photoMime, data.sessionName);
    }

    const mapLink =
      data.lat && data.lng ? `https://maps.google.com/?q=${data.lat},${data.lng}` : "";

    sheet.appendRow([
      data.timestamp ? new Date(data.timestamp) : new Date(),
      data.sessionName || "",
      data.interviewerName || "",
      data.lat || "",
      data.lng || "",
      mapLink,
      data.question || "",
      data.answer || "",
      photoUrl,
    ]);

    return jsonResponse_({ success: true, message: "Đã lưu vào Google Sheet." });
  } catch (err) {
    return jsonResponse_({ success: false, message: String(err) });
  }
}

/** Lấy sheet theo tên, tạo mới kèm dòng tiêu đề nếu chưa tồn tại. */
function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Lưu ảnh base64 vào Drive, trả về link xem công khai. */
function savePhotoToDrive_(base64Data, mimeType, sessionName) {
  const folder = getOrCreateFolder_(DRIVE_FOLDER_NAME);
  const mime = mimeType || "image/jpeg";
  const ext = mime.split("/")[1] || "jpg";
  const fileName = `${(sessionName || "khaosat").replace(/[^\w\-]/g, "_")}_${Date.now()}.${ext}`;

  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mime, fileName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

/** Lấy thư mục Drive theo tên, tạo mới nếu chưa có. */
function getOrCreateFolder_(name) {
  const folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}
