import { google } from 'googleapis';

/**
 * Google Sheets 인증 클라이언트 생성
 */
function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

/**
 * 시트 데이터 읽기
 * @param {string} spreadsheetId - 스프레드시트 ID
 * @param {string} range - 범위 (예: "Sheet1!A1:Z100")
 */
export async function readSheet(spreadsheetId, range) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return response.data.values || [];
}

/**
 * 시트 데이터 쓰기 (추가)
 */
export async function appendToSheet(spreadsheetId, range, values) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  return response.data;
}

/**
 * 시트의 모든 탭(시트) 이름 가져오기
 */
export async function getSheetTabs(spreadsheetId) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });

  return response.data.sheets.map(s => s.properties.title);
}

/**
 * 시트 데이터를 JSON 객체 배열로 변환
 * 첫 번째 행을 헤더로 사용
 */
export async function readSheetAsObjects(spreadsheetId, range) {
  const rows = await readSheet(spreadsheetId, range);
  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = row[i] || '';
    });
    return obj;
  });
}
