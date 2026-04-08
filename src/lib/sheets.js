import { google } from 'googleapis';

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

export async function readSheet(spreadsheetId, range) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return response.data.values || [];
}

export async function appendToSheet(spreadsheetId, range, values) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.append({
    spreadsheetId, range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });
  return response.data;
}

export async function getSheetTabs(spreadsheetId) {
  const auth = getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: 'sheets.properties.title',
  });
  return response.data.sheets.map(s => s.properties.title);
}

export async function readSheetAsObjects(spreadsheetId, range) {
  const rows = await readSheet(spreadsheetId, range);
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, i) => { obj[header] = row[i] || ''; });
    return obj;
  });
}
