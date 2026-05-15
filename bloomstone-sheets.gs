// ============================================================
// BLOOMSTONE PMS — Google Sheets Sync Backend
// Version 1.0
//
// HOW TO SET UP:
// 1. Open Google Sheets → Extensions → Apps Script
// 2. Paste this entire file into the editor (replace any existing code)
// 3. Click "Save" (Ctrl+S)
// 4. Click "Deploy" → "New Deployment"
//    - Type: Web App
//    - Execute as: Me
//    - Who has access: Anyone  (or "Anyone with Google Account" for private)
// 5. Click "Deploy" → copy the Web App URL
// 6. In Bloomstone → System → Integrations → Google Sheets section
//    → paste the URL and click "Connect"
//
// SHEET TABS CREATED AUTOMATICALLY:
//   Bookings | Properties | Platforms | Expenses | SyncLog
// ============================================================

'use strict';

// ── Column definitions ──────────────────────────────────────
const HEADERS = {
  Bookings: [
    'ID','Guest','Check-in','Check-out','Nights','Platform','Property',
    'Rate','Promo','Booking Fee','Service Fee','Platform Commission',
    'Extra Guests','Extra Guest Fee','Total (excl. Extra Guests)','Net Revenue',
    'Adjustments Total','Store Sales','Cleaning Fee',
    'Deposit','Dep Collected','Dep Refunded','Payment','Status',
    'Guest Count','Notes','Created At','Updated At'
  ],
  Properties: [
    'ID','Name','City','Address','Beds',
    'Base Guests','Max Guests','Base Rate','Extra Guest Fee',
    'Blocked Dates','Map URL','Notes'
  ],
  Platforms: ['ID','Name','Commission %','VAT %','Color'],
  Expenses: [
    'ID','Month','Property','Promo Cost','Cleaning Cost',
    'Water','Electricity','Supplies','Maintenance','Other Expenses','Total','Notes'
  ],
  Settings: ['Key','Value','Updated At'],
  SyncLog: ['Timestamp','Direction','Records','User','Status']
};

// ── GET — pull all data ─────────────────────────────────────
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);
    const data = {
      bookings:   sheetToObjects(ss, 'Bookings'),
      properties: sheetToObjects(ss, 'Properties'),
      platforms:  sheetToObjects(ss, 'Platforms'),
      expenses:   sheetToObjects(ss, 'Expenses'),
      exportedAt: new Date().toISOString(),
      sheetTitle: ss.getName()
    };
    logSync(ss, 'PULL', countAll(data), e.parameter.user || 'app', 'OK');
    return jsonOut(data);
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

// ── POST — push all data ─────────────────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheets(ss);
    let total = 0;

    if (Array.isArray(payload.bookings)) {
      writeSheet(ss, 'Bookings', payload.bookings, HEADERS.Bookings, bookingRow);
      total += payload.bookings.length;
    }
    if (Array.isArray(payload.properties)) {
      writeSheet(ss, 'Properties', payload.properties, HEADERS.Properties, propertyRow);
      total += payload.properties.length;
    }
    if (Array.isArray(payload.platforms)) {
      writeSheet(ss, 'Platforms', payload.platforms, HEADERS.Platforms, platformRow);
      total += payload.platforms.length;
    }
    if (Array.isArray(payload.expenses)) {
      writeSheet(ss, 'Expenses', payload.expenses, HEADERS.Expenses, expenseRow);
      total += payload.expenses.length;
    }
    if (Array.isArray(payload.settings)) {
      writeSheet(ss, 'Settings', payload.settings, HEADERS.Settings, settingRow);
      total += payload.settings.length;
    }

    logSync(ss, 'PUSH', total, payload.user || 'app', 'OK');
    return jsonOut({ success: true, savedAt: new Date().toISOString(), records: total });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

// ── Row builders ─────────────────────────────────────────────
function bookingRow(b) {
  const ci  = b['Check-in']  || b.checkin  || '';
  const co  = b['Check-out'] || b.checkout || '';
  const nights = (ci && co) ? Math.max(0, Math.round(
    (new Date(co) - new Date(ci)) / 86400000)) : (b.Nights || b.nights || 0);
  return [
    b.ID    || b.id    || '',
    b.Guest || b.guest || '',
    ci, co, nights,
    b.Platform    || b.platform    || '',
    b.Property    || b.property    || '',
    num(b.Rate    || b.rate),
    num(b.Promo   || b.promo),
    num(b['Booking Fee'] || b.bookingFee),
    num(b['Service Fee'] || b.serviceFee),
    num(b['Platform Commission'] || b.platformCommission),
    num(b['Extra Guests']              || b.extraGuests),
    num(b['Extra Guest Fee']           || b.extraGuestFee),
    num(b['Total (excl. Extra Guests)']|| b.totalWithout),
    num(b['Net Revenue']   || b.netRevenue),
    num(b['Adjustments Total'] || b.adjustmentsTotal || 0),
    num(b['Store Sales']   || b.storeSales),
    num(b['Cleaning Fee']  || b.cleaningFee),
    num(b.Deposit || b.deposit),
    yn(b['Dep Collected'] || b.depositCollected),
    yn(b['Dep Refunded']  || b.depositRefunded),
    b.Payment     || b.payment  || '',
    b.Status      || b.status   || 'Confirmed',
    num(b['Guest Count'] || b.guestCount || 1),
    b.Notes       || b.notes    || '',
    b['Created At']  || b.createdAt  || '',
    b['Updated At']  || b.updatedAt  || ''
  ];
}

function propertyRow(p) {
  return [
    p.ID   || p.id   || '',
    p.Name || p.name || '',
    p.City || p.city || '',
    p.Address || p.address || '',
    num(p.Beds || p.beds),
    num(p['Base Guests']  || p.baseGuests  || 2),
    num(p['Max Guests']   || p.maxGuests   || 4),
    num(p['Base Rate']    || p.baseRate    || 0),
    num(p['Extra Guest Fee'] || p.extraGuestFee || 0),
    Array.isArray(p['Blocked Dates'] || p.blockedDates)
      ? (p['Blocked Dates'] || p.blockedDates).join(',')
      : (p['Blocked Dates'] || p.blockedDates || ''),
    p['Map URL'] || p.map   || '',
    p.Notes      || p.notes || ''
  ];
}

function platformRow(p) {
  return [
    p.ID   || p.id   || '',
    p.Name || p.name || '',
    num(p['Commission %'] || p.commission),
    num(p['VAT %']        || p.vat),
    p.Color || p.color || '#888'
  ];
}

function expenseRow(e) {
  return [
    e.ID    || e.id    || '',
    e.Month || e.month || '',
    e.Property || e.prop || 'all',
    num(e['Promo Cost']    || e.promoCost),
    num(e['Cleaning Cost'] || e.cleaningCost),
    num(e.Water        || e.water),
    num(e.Electricity  || e.electricity),
    num(e.Supplies     || e.supplies),
    num(e.Maintenance  || e.maintenance),
    num(e['Other Expenses'] || e.Other || e.other),
    num(e.Total        || e.amount),
    e.Notes || e.notes || ''
  ];
}

function settingRow(s) {
  return [
    s.Key   || s.key   || '',
    s.Value || s.value || '',
    s['Updated At'] || s.updatedAt || new Date().toISOString()
  ];
}

// ── Sheet helpers ─────────────────────────────────────────────
function ensureSheets(ss) {
  Object.keys(HEADERS).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) {
      sh = ss.insertSheet(name);
      const h = HEADERS[name];
      const hRange = sh.getRange(1, 1, 1, h.length);
      hRange.setValues([h]);
      hRange.setFontWeight('bold');
      hRange.setBackground('#1a1a1a');
      hRange.setFontColor('#ffffff');
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, h.length);
    }
  });
  // Move SyncLog to last tab
  const log = ss.getSheetByName('SyncLog');
  if (log) ss.setActiveSheet(ss.getSheets()[0]);
}

function writeSheet(ss, name, rows, headers, rowFn) {
  const sh = ss.getSheetByName(name);
  if (!sh) return;
  // Clear data rows (keep header)
  const lastRow = sh.getLastRow();
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  if (!rows.length) return;
  const data = rows.map(rowFn);
  sh.getRange(2, 1, data.length, headers.length).setValues(data);
  // Alternate row colours for readability
  for (let i = 0; i < data.length; i++) {
    const colour = i % 2 === 0 ? '#ffffff' : '#f7f7f5';
    sh.getRange(i + 2, 1, 1, headers.length).setBackground(colour);
  }
}

function sheetToObjects(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const rows    = sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).getValues();
  return rows
    .filter(r => r.some(v => v !== '' && v !== null))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = r[i]; });
      return obj;
    });
}

function logSync(ss, direction, records, user, status) {
  try {
    const sh = ss.getSheetByName('SyncLog');
    if (!sh) return;
    sh.appendRow([new Date(), direction, records, user, status]);
    // Keep only last 200 log rows
    if (sh.getLastRow() > 201) sh.deleteRow(2);
  } catch(e) {}
}

function countAll(data) {
  return (data.bookings||[]).length + (data.properties||[]).length +
         (data.platforms||[]).length + (data.expenses||[]).length;
}

// ── Utility ───────────────────────────────────────────────────
function num(v)  { return isNaN(+v) ? 0 : +v || 0; }
function yn(v)   { return v === true || v === 'Yes' || v === 1 ? 'Yes' : 'No'; }
function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Sidebar / Setup helper (run from Apps Script editor) ──────
function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheets(ss);
  SpreadsheetApp.getUi().alert(
    '✅ Bloomstone Sheets Ready!\n\n' +
    'Next step:\n' +
    '1. Deploy → New Deployment → Web App\n' +
    '2. Execute as: Me\n' +
    '3. Who has access: Anyone\n' +
    '4. Copy the Web App URL\n' +
    '5. Paste it in Bloomstone → System → Integrations → Google Sheets'
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🏠 Bloomstone')
    .addItem('Setup Sheets', 'setupSheet')
    .addItem('View Sync Log', 'viewSyncLog')
    .addToUi();
}

function viewSyncLog() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setActiveSheet(ss.getSheetByName('SyncLog'));
}
