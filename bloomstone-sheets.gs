// ============================================================
// BLOOMSTONE PMS — Google Sheets Sync Backend
// Version 2.0 — Added owner/contract fields, guest service fee, adjustments readable
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
// HOW TO UPDATE (existing deployment):
// 1. Open Google Sheets → Extensions → Apps Script
// 2. Replace the existing code with this file
// 3. Click "Deploy" → "Manage Deployments"
// 4. Click the pencil ✏ icon on your existing deployment
// 5. Set "Version" to "New version"
// 6. Click "Deploy" — the URL stays the same, no need to reconnect
//
// SHEET TABS CREATED AUTOMATICALLY:
//   Bookings | Properties | Platforms | Expenses | SyncLog
// ============================================================

'use strict';

// ── Column definitions ──────────────────────────────────────
const HEADERS = {
  Bookings: [
    'ID','Guest','Check-in','Check-out','Nights','Platform','Property',
    'Rate',
    'Total Promo (Manual Set by User)','Booking Fee','Total Promo',
    'Special Promo (Auto From Airbnb)','Platform Commission',
    'Service Fee (Auto From Airbnb)','Extra Guests','Extra Guest Fee',
    'Adjustments','Adjustments (Readable)','Adjustments Total',
    'Guest Service Fee',
    'Total (excl. Extra Guests)','Total Charged to Guest',
    'Total Guest Paid to Platform','Net Revenue',
    'Store Sales','Cleaning Fee',
    'Deposit','Deposit Refunded','Dep Collected','Dep Refunded',
    'Payment','Status','Guest Count','Notes','Guest Prefs',
    'Created At','Updated At'
  ],
  Properties: [
    'ID','Name','City','Address','Beds',
    'Base Guests','Max Guests','Base Rate','Extra Guest Fee',
    'Blocked Dates','Map URL','Notes','Airbnb URL','Icon',
    'Owner Name','Owner Phone','Owner Email','Owner Address',
    'Owner Pct','Payout Method','Payout Account',
    'Contract Start','Contract End'
  ],
  Platforms: ['ID','Name','Commission %','VAT %','Guest Fee %','Color'],
  Expenses: [
    'ID','Month','Property','Promo Cost','Cleaning Cost','Cleaning',
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
    // Financial columns — match exact key names the app sends
    num(b['Total Promo (Manual Set by User)'] || b.promo),
    num(b['Booking Fee']  || b.bookingFee),
    num(b['Total Promo']  || b.promoTotal),
    num(b['Special Promo (Auto From Airbnb)'] || b['Special Offer'] || b.specialOffer),
    num(b['Platform Commission'] || b.platformCommission),
    num(b['Service Fee (Auto From Airbnb)'] || b['Service Fee'] || b.serviceFee),
    num(b['Extra Guests']    || b.extraGuests),
    num(b['Extra Guest Fee'] || b.extraGuestFee),
    b['Adjustments'] || '[]',
    b['Adjustments (Readable)'] || '',
    num(b['Adjustments Total'] || b.adjustmentsTotal || 0),
    num(b['Guest Service Fee'] || b.guestServiceFee),
    num(b['Total (excl. Extra Guests)'] || b.totalWithout),
    num(b['Total Charged to Guest']     || b.guestTotal),
    num(b['Total Guest Paid to Platform'] || b.totalGuestPaid),
    num(b['Net Revenue']   || b.netRevenue),
    num(b['Store Sales']   || b.storeSales),
    num(b['Cleaning Fee']  || b.cleaningFee),
    num(b.Deposit || b.deposit),
    num(b['Deposit Refunded'] || b.depositRefundedAmt),
    yn(b['Dep Collected'] || b.depositCollected),
    yn(b['Dep Refunded']  || b.depositRefunded),
    b.Payment     || b.payment  || '',
    b.Status      || b.status   || 'Confirmed',
    num(b['Guest Count'] || b.guestCount || 1),
    b.Notes       || b.notes    || '',
    b['Guest Prefs'] || b.guestPrefs || '',
    b['Created At']  || b.createdAt  || '',
    b['Updated At']  || b.updatedAt  || ''
  ];
}

function propertyRow(p) {
  const blocked = p['Blocked Dates'] || p.blockedDates || '';
  return [
    p.ID   || p.id   || '',
    p.Name || p.name || '',
    p.City || p.city || '',
    p.Address || p.address || '',
    num(p.Beds || p.beds),
    num(p['Base Guests']     || p.baseGuests  || 2),
    num(p['Max Guests']      || p.maxGuests   || 4),
    num(p['Base Rate']       || p.baseRate    || 0),
    num(p['Extra Guest Fee'] || p.extraGuestFee || 0),
    Array.isArray(blocked) ? blocked.join(',') : blocked,
    p['Map URL']    || p.map       || '',
    p.Notes         || p.notes     || '',
    p['Airbnb URL'] || p.airbnbUrl || '',
    p.Icon          || p.iconId    || 'house',
    // Owner & Contract fields
    p['Owner Name']    || p.ownerName    || '',
    p['Owner Phone']   || p.ownerPhone   || '',
    p['Owner Email']   || p.ownerEmail   || '',
    p['Owner Address'] || p.ownerAddress || '',
    p['Owner Pct'] != null ? num(p['Owner Pct']) : (p.ownerPct != null ? num(p.ownerPct) : 100),
    p['Payout Method']  || p.payoutMethod  || '',
    p['Payout Account'] || p.payoutAccount || '',
    p['Contract Start'] || p.contractStart || '',
    p['Contract End']   || p.contractEnd   || ''
  ];
}

function platformRow(p) {
  return [
    p.ID   || p.id   || '',
    p.Name || p.name || '',
    num(p['Commission %'] || p.commission),
    num(p['VAT %']        || p.vat),
    num(p['Guest Fee %']  || p.guestFee),
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
    num(e.Cleaning         || e.cleaning),
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
    const h = HEADERS[name];
    if (!sh) {
      sh = ss.insertSheet(name);
      const hRange = sh.getRange(1, 1, 1, h.length);
      hRange.setValues([h]);
      hRange.setFontWeight('bold');
      hRange.setBackground('#1a1a1a');
      hRange.setFontColor('#ffffff');
      sh.setFrozenRows(1);
      sh.autoResizeColumns(1, h.length);
    } else {
      reconcileHeaders(sh, h);
    }
  });
  // Move SyncLog to last tab
  const log = ss.getSheetByName('SyncLog');
  if (log) ss.setActiveSheet(ss.getSheets()[0]);
}

function reconcileHeaders(sh, expected) {
  const width = Math.max(sh.getLastColumn(), expected.length);
  const current = width
    ? sh.getRange(1, 1, 1, width).getValues()[0].filter(String)
    : [];
  const missing = expected.filter(h => current.indexOf(h) === -1);
  if (!current.length) {
    sh.getRange(1, 1, 1, expected.length).setValues([expected]);
  } else if (missing.length) {
    sh.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  const finalWidth = Math.max(sh.getLastColumn(), expected.length);
  const hRange = sh.getRange(1, 1, 1, finalWidth);
  hRange.setFontWeight('bold');
  hRange.setBackground('#1a1a1a');
  hRange.setFontColor('#ffffff');
  sh.setFrozenRows(1);
}

function writeSheet(ss, name, rows, headers, rowFn) {
  const sh = ss.getSheetByName(name);
  if (!sh) return;
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  // Clear data rows (keep header)
  const lastRow = sh.getLastRow();
  const clearWidth = Math.max(sh.getLastColumn(), headers.length);
  if (lastRow > 1) sh.getRange(2, 1, lastRow - 1, clearWidth).clearContent();
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
