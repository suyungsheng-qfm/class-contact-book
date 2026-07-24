/*
 * Unified backend for the class contact book.
 * This is the only .gs file that should contain doGet and doPost.
 * Required script properties: TEACHER_ACCOUNT and TEACHER_PASSWORD.
 */

const SPREADSHEET_ID = '1slDTFiHYy0UGum8xE587Ao-ZojHBTa67jFcN0OlBJCw';
const ROSTER_SHEET_NAME = '\u540d\u55ae';
const CHAT_IMAGE_FOLDER_ID = '14a4Xt03WZnJ7vmjlgjvkBjXUa_mdc0xv';
const CLASS_PHOTO_FOLDER_ID = '1Eb9BCTpHxIcENIxoYQEOGJh6uG9kC9qS';
const SESSION_TTL_SECONDS = 60 * 60 * 6;

function doGet(e) {
  const page = String((e && e.parameter && e.parameter.page) || 'index').toLowerCase();
  const allowedPages = { index: true, teacher: true, guardians: true };
  return HtmlService.createTemplateFromFile(allowedPages[page] ? page : 'index')
    .evaluate()
    .setTitle('\u73ed\u7d1a\u806f\u7d61\u7c3f')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(data.action || '');

    if (action === 'unifiedLogin') return jsonResponse(unifiedLogin(data));
    if (action === 'validateSession') return jsonResponse(validateSession(data.sessionToken));

    const session = getSession(data.sessionToken);
    if (!session) return jsonResponse({ success: false, message: 'Session expired. Please sign in again.' });

    if (action === 'uploadImage') {
      if (session.role === 'parent' && String(data.studentId || '') !== String(session.user.studentId)) {
        return jsonResponse({ success: false, message: 'Not authorized to upload for this student.' });
      }
      return jsonResponse(uploadChatImage(data));
    }

    if (action === 'uploadClassPhoto') {
      if (session.role !== 'teacher') {
        return jsonResponse({ status: 'error', message: 'Teacher access is required.' });
      }
      return jsonResponse(uploadClassPhoto(data));
    }

    return jsonResponse({ success: false, message: 'Unsupported action.' });
  } catch (error) {
    return jsonResponse({ success: false, status: 'error', message: error.message || String(error) });
  }
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function unifiedLogin(data) {
  const account = String(data.account || '').trim();
  const password = String(data.password || '').trim();
  if (!account || !password) return { success: false, message: 'Account and password are required.' };

  if (isTeacherCredential(account, password)) {
    const user = { name: '\u6559\u5e2b', role: 'teacher' };
    return {
      success: true,
      role: 'teacher',
      user: user,
      students: fetchAllStudents(),
      sessionToken: createSession({ role: 'teacher', account: account, user: user }).token
    };
  }

  const student = verifyStudentLogin(account, password);
  if (!student) return { success: false, message: 'Account or password is incorrect.' };
  return {
    success: true,
    role: 'parent',
    user: student,
    sessionToken: createSession({ role: 'parent', account: account, user: student }).token
  };
}

function validateSession(token) {
  const session = getSession(token);
  if (!session) return { success: false, message: 'Session expired.' };
  const result = { success: true, role: session.role, user: session.user };
  if (session.role === 'teacher') result.students = fetchAllStudents();
  return result;
}

function createSession(sessionData) {
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('session:' + token, JSON.stringify(sessionData), SESSION_TTL_SECONDS);
  return { token: token };
}

function getSession(token) {
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('session:' + String(token));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function isTeacherCredential(account, password) {
  const properties = PropertiesService.getScriptProperties();
  const teacherAccount = properties.getProperty('TEACHER_ACCOUNT');
  const teacherPassword = properties.getProperty('TEACHER_PASSWORD');
  return Boolean(teacherAccount && teacherPassword && account === teacherAccount && password === teacherPassword);
}

function fetchAllStudents() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ROSTER_SHEET_NAME);
  if (!sheet) return [];
  const values = sheet.getDataRange().getDisplayValues();
  const students = [];
  for (let row = 1; row < values.length; row++) {
    const [seatNo, name, studentId] = values[row];
    if (String(studentId || '').trim() && String(name || '').trim()) {
      students.push({ seatNo: String(seatNo || '').trim(), name: String(name).trim(), studentId: String(studentId).trim() });
    }
  }
  return students;
}

function verifyStudentLogin(account, password) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(ROSTER_SHEET_NAME);
  if (!sheet) throw new Error('Roster sheet was not found.');
  const values = sheet.getDataRange().getDisplayValues();
  for (let row = 1; row < values.length; row++) {
    const [seatNo, name, studentId, idCard] = values[row];
    if (String(studentId || '').trim() === account && String(idCard || '').trim() === password) {
      return { seatNo: String(seatNo || '').trim(), name: String(name || '').trim(), studentId: String(studentId).trim() };
    }
  }
  return null;
}

function uploadChatImage(data) {
  const fileName = safeFileName(data.fileName || data.name || 'image');
  const mimeType = String(data.mimeType || 'image/jpeg');
  const base64Data = String(data.base64Data || data.base64 || data.data || '').replace(/^data:[^;]+;base64,/, '');
  const studentId = String(data.studentId || 'unknown');
  const chatType = String(data.chatType || 'group');
  if (!base64Data) return { success: false, message: 'Image data was not found.' };

  const baseFolder = DriveApp.getFolderById(CHAT_IMAGE_FOLDER_ID);
  let folder = baseFolder;
  if (chatType === 'private' && studentId) {
    folder = getOrCreateSubFolder(baseFolder, studentId);
  } else if (chatType === 'group') {
    const groupFolder = getOrCreateSubFolder(baseFolder, 'group');
    const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    folder = getOrCreateSubFolder(groupFolder, today);
  }

  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return {
    success: true,
    imageUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000',
    fileId: file.getId()
  };
}

function uploadClassPhoto(data) {
  const fileName = safeFileName(data.name || 'class-photo');
  const mimeType = String(data.mimeType || 'image/jpeg');
  const base64Data = String(data.data || '').replace(/^data:[^;]+;base64,/, '');
  const folderName = String(data.folderName || 'unclassified');
  if (!base64Data) return { status: 'error', message: 'Image data was not found.' };
  if (!/^\d{4}_\d{2}_\d{2}$/.test(folderName)) return { status: 'error', message: 'Invalid photo date.' };

  const folder = getOrCreateSubFolder(DriveApp.getFolderById(CLASS_PHOTO_FOLDER_ID), folderName);
  const file = folder.createFile(Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName));
  return { status: 'success', fileId: file.getId(), fileUrl: file.getUrl(), message: 'Photo uploaded.' };
}

function getOrCreateSubFolder(parentFolder, folderName) {
  const folders = parentFolder.getFoldersByName(folderName);
  return folders.hasNext() ? folders.next() : parentFolder.createFolder(folderName);
}

function safeFileName(fileName) {
  return String(fileName).replace(/[\\/:*?"<>|]/g, '_').slice(0, 180) || 'image';
}
