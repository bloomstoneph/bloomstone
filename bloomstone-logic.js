// ============================================================
// BLOOMSTONE PMS — Logic Engine
// ============================================================
'use strict';

// ---- CONSTANTS
const LS_KEY      = 'bloomstone_v2';
const LS_SETTINGS = 'bloomstone_settings';
const LS_DRIVE    = 'bloomstone_drive';
const LS_USERS    = 'bloomstone_users';
const LS_SESSION  = 'bloomstone_session';
const LS_DRAFTS   = 'bloomstone_drafts';
let drafts = [];
let _currentDraftId = null;
let _draftTimer = null;

// ============================================================
// USER AUTH SYSTEM
// ============================================================
let currentUser = null;

function hashPass(str){
  // Simple but reasonable hash using djb2 + salt for localStorage-only auth
  let h=5381;for(let i=0;i<str.length;i++)h=((h<<5)+h)+str.charCodeAt(i);
  return'bls_'+Math.abs(h).toString(36)+'_'+str.length;
}

function loadUsers(){
  try{const u=localStorage.getItem(LS_USERS);if(u)return JSON.parse(u);}catch(e){}
  // Default admin user
  const defaultUsers=[{id:'u_admin',name:'Administrator',username:'admin',password:hashPass('admin123'),role:'admin',createdAt:new Date().toISOString()}];
  localStorage.setItem(LS_USERS,JSON.stringify(defaultUsers));
  return defaultUsers;
}

function saveUsers(users){localStorage.setItem(LS_USERS,JSON.stringify(users));}

function tryLogin(username,password){
  const users=loadUsers();
  const u=users.find(x=>x.username.toLowerCase()===username.toLowerCase()&&x.password===hashPass(password));
  return u||null;
}

function startSession(user){
  currentUser={id:user.id,name:user.name,username:user.username,role:user.role};
  // localStorage keeps session after app close, phone restart, PWA reopen
  localStorage.setItem(LS_SESSION,JSON.stringify(currentUser));
}

function endSession(){
  currentUser=null;
  localStorage.removeItem(LS_SESSION);
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('app').style.display='none';
}

function resumeSession(){
  try{
    const s=localStorage.getItem(LS_SESSION);
    if(s){currentUser=JSON.parse(s);return true;}
  }catch(e){}
  return false;
}

function renderUsers(){
  const users=loadUsers();
  const label=document.getElementById('currentUserLabel');
  if(label&&currentUser)label.textContent=`Signed in as ${currentUser.name} (${currentUser.role})`;
  const list=document.getElementById('userList');if(!list)return;
  list.innerHTML=users.map(u=>`<div class="user-card">
    <div class="user-avatar">${(u.name||'?')[0].toUpperCase()}</div>
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:700">${esc(u.name)}</div>
      <div style="font-size:11px;color:var(--text-3)">@${esc(u.username)} · <span class="badge ${u.role==='admin'?'badge-purple':'badge-blue'}">${u.role}</span></div>
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="btn btn-secondary btn-sm" onclick="openUserModal('${u.id}')">✏ Edit</button>
      ${u.id!=='u_admin'?`<button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}')">✕</button>`:'<span style="font-size:11px;color:var(--text-3)">protected</span>'}
    </div>
  </div>`).join('');
}

let editingUserId=null;
function openUserModal(id=null){
  editingUserId=id;
  document.getElementById('userModalTitle').textContent=id?'Edit User':'Add User';
  ['um-name','um-username','um-password'].forEach(k=>{const el=document.getElementById(k);if(el)el.value='';});
  document.getElementById('um-role').value='staff';
  // Update password label: optional when editing, required when adding
  const pwLabel=document.getElementById('um-password-label');
  if(pwLabel)pwLabel.innerHTML=id?'Password <span style="font-size:11px;color:var(--text-3);font-weight:400">(leave blank to keep current)</span>':'Password <span class="req">*</span>';
  const pwInput=document.getElementById('um-password');
  if(pwInput)pwInput.placeholder=id?'Leave blank to keep current password':'Minimum 6 characters';
  if(id){const u=loadUsers().find(x=>x.id===id);if(u){document.getElementById('um-name').value=u.name;document.getElementById('um-username').value=u.username;document.getElementById('um-role').value=u.role;}}
  openModal('userModal');
}

function saveUser(){
  const name=(document.getElementById('um-name')?.value||'').trim();
  const username=(document.getElementById('um-username')?.value||'').trim().toLowerCase();
  const password=(document.getElementById('um-password')?.value||'').trim();
  const role=document.getElementById('um-role')?.value||'staff';
  const missing=[];
  if(!name)missing.push('Full Name');
  if(!username)missing.push('Username');
  if(!editingUserId&&!password)missing.push('Password');
  if(missing.length){toast(`Missing: ${missing.join(', ')}`,'error');return;}
  if(!editingUserId&&password.length<6){toast('Password must be at least 6 characters.','error');return;}
  const users=loadUsers();
  const dup=users.find(u=>u.username===username&&u.id!==editingUserId);
  if(dup){toast('Username already taken.','error');return;}
  if(editingUserId){
    const i=users.findIndex(u=>u.id===editingUserId);
    if(i>=0){users[i]={...users[i],name,username,role};if(password)users[i].password=hashPass(password);}
  }else{
    users.push({id:genId(),name,username,password:hashPass(password),role,createdAt:new Date().toISOString()});
  }
  saveUsers(users);closeModal('userModal');renderUsers();toast('User saved.');
}

function deleteUser(id){
  if(currentUser?.id===id){toast('Cannot delete your own account.','error');return;}
  confirmDialog('⚠ Delete User','This user will permanently lose access to the system. This action cannot be undone.','🗑',()=>{
    const users=loadUsers().filter(u=>u.id!==id);
    saveUsers(users);renderUsers();toast('User deleted.','warning');
  });
}

// Login wiring
document.getElementById('loginBtn').addEventListener('click',doLogin);
document.getElementById('loginPass').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
document.getElementById('loginUser').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('loginPass').focus();});
document.getElementById('logoutBtn').addEventListener('click',()=>{
  confirmDialog('Sign Out?','You will be returned to the login screen.','⏏',()=>endSession());
});

function doLogin(){
  const u=(document.getElementById('loginUser')?.value||'').trim();
  const p=document.getElementById('loginPass')?.value||'';
  const err=document.getElementById('loginErr');
  if(!u||!p){err.textContent='Enter username and password.';err.classList.add('show');return;}
  const user=tryLogin(u,p);
  if(!user){err.textContent='Invalid username or password.';err.classList.add('show');return;}
  err.classList.remove('show');
  startSession(user);
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='flex';
  init();
}

// ============================================================
// EXCEL IMPORT / EXPORT (SheetJS)
// ============================================================
function saveAsExcel(){
  if(typeof XLSX==='undefined'){toast('SheetJS not loaded. Check internet connection.','error');return;}
  try{
    const wb=XLSX.utils.book_new();
    // Bookings sheet
    const bkHeaders=['ID','Guest','Check-in','Check-out','Nights','Platform','Property','Rate','Promo','Special Offer','Service Fee','Booking Fee','Extra Guests','Guest Count','Cleaning Fee','Store Sales','Deposit','Deposit Refunded','Dep Collected','Dep Refunded','Adjustments','Net Revenue','Payment','Status','Notes','Guest Phone','Guest Prefs','Created At'];
    const bkRows=bookings.map(b=>{const t=calcTotals(b);return[b.id,b.guest,b.checkin,b.checkout,t.nights,b.platform,propName(b.property),b.rate||0,b.promo||0,b.specialOffer||0,b.serviceFee||0,t.bkFee,b.extraGuests||0,b.guestCount||1,b.cleaningFee||0,b.storeSales||0,b.deposit||0,b.depositRefundedAmt||0,b.depositCollected?'Yes':'No',b.depositRefunded?'Yes':'No',JSON.stringify(b.adjustments||[]),t.netRevenue,b.payment||'',b.status||'',b.notes||'',b.guestPhone||'',b.guestPrefs||'',b.createdAt||''];});
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([bkHeaders,...bkRows]),'Bookings');
    // Properties sheet
    const prHeaders=['ID','Name','City','Address','Beds','Base Guests','Max Guests','Base Rate','Extra Guest Fee','Blocked Dates','Map URL','Notes','Airbnb URL','Icon','Owner Name','Owner Phone','Owner Email','Owner Address','Owner Pct','Payout Method','Payout Account','Contract Start','Contract End'];
    const prRows=properties.map(p=>[p.id,p.name,p.city,p.address||'',p.beds||0,p.baseGuests||2,p.maxGuests||4,p.baseRate||0,p.extraGuestFee||0,(p.blockedDates||[]).join(','),p.map||'',p.notes||'',p.airbnbUrl||'',p.iconId||'house',p.ownerName||'',p.ownerPhone||'',p.ownerEmail||'',p.ownerAddress||'',p.ownerPct??100,p.payoutMethod||'',p.payoutAccount||'',p.contractStart||'',p.contractEnd||'']);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([prHeaders,...prRows]),'Properties');
    // Platforms sheet
    const plHeaders=['ID','Name','Commission %','VAT %','Guest Fee %','Color'];
    const plRows=platforms.map(p=>[p.id,p.name,p.commission,p.vat,p.guestFee||0,p.color]);
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([plHeaders,...plRows]),'Platforms');
    // Expenses sheet
    const expHeaders=['ID','Month','Property','Promo Cost','Cleaning Cost','Water','Electricity','Supplies','Maintenance','Other Expenses','Total','Notes'];
    const expRows=expenses.map(e=>{
      const bksCI=bookings.filter(b=>b.status!=='Cancelled'&&b.checkin&&b.checkin.startsWith(e.month)&&(e.prop==='all'||b.property===e.prop));
      const bksCO=expBookings(e.month,e.prop);
      const promoCost=bksCI.reduce((s,b)=>s+(+b.promo||0),0);
      const cleaningFromBks=bksCO.reduce((s,b)=>s+(+b.cleaningFee||0),0);
      const cleaningCost=cleaningFromBks||e.cleaning||0;
      const rowTotal=promoCost+cleaningCost+(e.water||0)+(e.electricity||0)+(e.supplies||0)+(e.maintenance||0)+(e.other||0);
      return[e.id,e.month,e.prop==='all'?'All':propName(e.prop),promoCost,cleaningCost,e.water||0,e.electricity||0,e.supplies||0,e.maintenance||0,e.other||0,rowTotal,e.notes||''];
    });
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([expHeaders,...expRows]),'Expenses');
    XLSX.writeFile(wb,`bloomstone-${todayISO()}.xlsx`);
    toast('Excel file downloaded.','success');
  }catch(e){console.error(e);toast('Export failed: '+e.message,'error');}
}

function loadFromExcel(){
  const input=document.createElement('input');input.type='file';input.accept='.xlsx,.xls,.csv';
  input.onchange=e=>{
    const file=e.target.files[0];if(!file)return;
    if(typeof XLSX==='undefined'){toast('SheetJS not loaded.','error');return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      try{
        const wb=XLSX.read(ev.target.result,{type:'binary'});
        let imported={bookings:0,properties:0,platforms:0,expenses:0};
        let propWarnings=0;
        // Bookings
        if(wb.SheetNames.includes('Bookings')){
          const rows=XLSX.utils.sheet_to_json(wb.Sheets['Bookings'],{defval:''});
          const newBks=rows.map(r=>{
            const propMatch=properties.find(p=>p.id===r.Property||p.name===r.Property);
            if(r.Property&&!propMatch)propWarnings++;
            return{
              id:r.ID||genId(),guest:r.Guest||'',checkin:r['Check-in']||'',checkout:r['Check-out']||'',
              platform:normPlatform(r.Platform||''),property:propMatch?.id||r.Property||'',
              rate:+r.Rate||0,promo:+r.Promo||0,
              specialOffer:+r['Special Offer']||0,
              serviceFee:+r['Service Fee']||0,
              bookingFee:+r['Booking Fee']||0,
              extraGuests:+r['Extra Guests']||0,
              guestCount:+r['Guest Count']||1,
              cleaningFee:+r['Cleaning Fee']||0,
              storeSales:+r['Store Sales']||0,
              deposit:+r.Deposit||0,
              depositRefundedAmt:+r['Deposit Refunded']||0,
              depositCollected:r['Dep Collected']==='Yes',
              depositRefunded:r['Dep Refunded']==='Yes',
              adjustments:(()=>{try{const a=JSON.parse(r['Adjustments']||'[]');return Array.isArray(a)?a:[];}catch(e){return[];}})(),
              payment:r.Payment||'',status:r.Status||'Confirmed',notes:r.Notes||'',guestPrefs:r['Guest Prefs']||'',
              tasks:{},createdAt:r['Created At']||new Date().toISOString(),
            };
          }).filter(b=>b.checkin&&b.checkout&&b.guest);
          bookings=newBks;imported.bookings=newBks.length;
        }
        // Properties (optional - only if sheet exists and has rows)
        if(wb.SheetNames.includes('Properties')){
          const rows=XLSX.utils.sheet_to_json(wb.Sheets['Properties'],{defval:''});
          if(rows.length){
            properties=rows.map(r=>({
              id:r.ID||genId(),name:r.Name||'',city:r.City||'',address:r.Address||'',
              beds:+r.Beds||0,baseGuests:+r['Base Guests']||2,maxGuests:+r['Max Guests']||4,
              baseRate:+r['Base Rate']||0,extraGuestFee:+r['Extra Guest Fee']||300,
              blockedDates:r['Blocked Dates']?String(r['Blocked Dates']).split(',').filter(Boolean):[],
              notes:r.Notes||'',airbnbUrl:r['Airbnb URL']||'',iconId:r.Icon||'house',
              ownerName:r['Owner Name']||'',ownerPhone:r['Owner Phone']||'',
              ownerEmail:r['Owner Email']||'',ownerAddress:r['Owner Address']||'',
              ownerPct:r['Owner Pct']!=null?+r['Owner Pct']:100,
              payoutMethod:r['Payout Method']||'',payoutAccount:r['Payout Account']||'',
              contractStart:r['Contract Start']||'',contractEnd:r['Contract End']||'',
            }));
            imported.properties=properties.length;
          }
        }
        // Platforms
        if(wb.SheetNames.includes('Platforms')){
          const rows=XLSX.utils.sheet_to_json(wb.Sheets['Platforms'],{defval:''});
          if(rows.length){platforms=rows.map(r=>({id:r.ID||genId(),name:r.Name||'',commission:+r['Commission %']||0,vat:+r['VAT %']||0,guestFee:+r['Guest Fee %']||0,color:r.Color||'#888'}));imported.platforms=platforms.length;}
        }
        // Expenses
        if(wb.SheetNames.includes('Expenses')){
          const rows=XLSX.utils.sheet_to_json(wb.Sheets['Expenses'],{defval:''});
          if(rows.length){expenses=rows.map(r=>({id:r.ID||genId(),month:r.Month||'',prop:properties.find(p=>p.id===r.Property||p.name===r.Property)?.id||'all',water:+r.Water||0,electricity:+r.Electricity||0,supplies:+r.Supplies||0,maintenance:+r.Maintenance||0,cleaning:+r.Cleaning||0,other:+r.Other||0,amount:+r.Total||0,notes:r.Notes||''}));imported.expenses=expenses.length;}
        }
        saveAll();renderView(currentWs);populateSelects();
        const xlParts=[`${imported.bookings} bookings`];
        if(imported.properties)xlParts.push(`${imported.properties} properties`);
        if(imported.platforms)xlParts.push(`${imported.platforms} platforms`);
        if(imported.expenses)xlParts.push(`${imported.expenses} expenses`);
        toast(`Loaded from Excel: ${xlParts.join(', ')}.`+(propWarnings?` ⚠ ${propWarnings} booking${propWarnings!==1?'s':''} had unknown property — check their Property field.`:''),'success');
      }catch(err){console.error(err);toast('Failed to read Excel: '+err.message,'error');}
    };
    reader.readAsBinaryString(file);
  };
  input.click();
}

document.getElementById('excelSaveBtn').addEventListener('click',saveAsExcel);
document.getElementById('excelLoadBtn').addEventListener('click',()=>{
  confirmDialog('Load from Excel?','This will replace ALL current data with data from the Excel file. Make sure you have a backup first.','📂',()=>loadFromExcel());
});
const EXP_CATS = ['water','electricity','supplies','maintenance','cleaning','other'];
const DEFAULT_TASKS = [
  {key:'checkInReady',label:'Check-in Ready'},
  {key:'cleaningDone',label:'Cleaning Done'},
  {key:'depositCollected',label:'Deposit Collected'},
  {key:'depositReturned',label:'Deposit Returned'},
  {key:'suppliesRestocked',label:'Supplies Restocked'},
  {key:'paymentConfirmed',label:'Payment Confirmed'},
];

const DEFAULT_PLATFORMS = [
  {id:'p_airbnb', name:'Airbnb',         commission:3,  vat:12, guestFee:14, color:'#FF5A5F'},
  {id:'p_booking',name:'Booking.com',    commission:15, vat:0,  guestFee:0,  color:'#003580'},
  {id:'p_agoda',  name:'Agoda',          commission:15, vat:0,  guestFee:0,  color:'#E31837'},
  {id:'p_trip',   name:'Trip.com',       commission:12, vat:0,  guestFee:0,  color:'#287DFA'},
  {id:'p_yr',     name:'Your.Rentals',   commission:5,  vat:0,  guestFee:0,  color:'#00A699'},
  {id:'p_direct', name:'Direct Booking', commission:0,  vat:0,  guestFee:0,  color:'#5B4BDB'},
];

const DEFAULT_PROPERTIES = [
  {id:'pr_1',city:'Gensan',   name:'2BR Family Suite',      address:'General Santos City',map:'',beds:2,baseGuests:2,maxGuests:4,baseRate:2500,extraGuestFee:300,blockedDates:[],notes:''},
  {id:'pr_2',city:'Gensan',   name:'Urban Chill Cabin',     address:'General Santos City',map:'',beds:1,baseGuests:2,maxGuests:2,baseRate:1800,extraGuestFee:300,blockedDates:[],notes:''},
  {id:'pr_3',city:'Gensan',   name:'3BR Cozy Home',         address:'General Santos City',map:'',beds:3,baseGuests:2,maxGuests:6,baseRate:3200,extraGuestFee:300,blockedDates:[],notes:''},
  {id:'pr_4',city:'Dumaguete',name:'2BR Town House Aurora', address:'Dumaguete City',     map:'',beds:2,baseGuests:2,maxGuests:4,baseRate:2200,extraGuestFee:300,blockedDates:[],notes:''},
  {id:'pr_5',city:'Dumaguete',name:'2BR Town House Bliss',  address:'Dumaguete City',     map:'',beds:2,baseGuests:2,maxGuests:4,baseRate:2200,extraGuestFee:300,blockedDates:[],notes:''},
  {id:'pr_6',city:'Dumaguete',name:'4BR Twin Town Houses',  address:'Dumaguete City',     map:'',beds:4,baseGuests:2,maxGuests:8,baseRate:4500,extraGuestFee:300,blockedDates:[],notes:''},
];

// ---- STATE
let bookings=[], properties=[], platforms=[], expenses=[], trash=[], ownerPayouts=[];
let settings={currency:'\u20b1',appName:'Bloomstone'};
let driveConfig={connected:false,folderId:'',folderName:'',clientId:'',lastSync:null};
let editingBookingId=null, editingPropId=null, editingExpId=null, editingPlatId=null;
let _bulkSelected=new Set();
let currentWs='today', currentSubView='';
let calView='month', calDate=new Date(), calPropFilter='all', calPlatFilter='all';
let drawerUnsaved=false, cmdSelectedIdx=-1;
let _currentAdjustments=[];
// When true, side-effect functions skip value-clearing/auto-fill so saved data is never overwritten during load
let _loadingDrawer=false;

// ---- PERSISTENCE
let _isPulling=false;      // true while a pull is running
let _pullCooldownUntil=0;  // timestamp — no auto-push before this time
function saveAll(){
  try{ localStorage.setItem(LS_KEY,JSON.stringify({bookings,properties,platforms,expenses,trash,ownerPayouts})); }
  catch(e){ console.error('save failed',e); }
  rebuildLookupMaps();
  if(!_isPulling)scheduleSheetsAutoPush();
}

// ── Live sync: debounced auto-push ──────────────────────────
let _autoPushTimer=null;
function scheduleSheetsAutoPush(){
  if(!sheetsConfig.connected||!sheetsConfig.url)return;
  if(Date.now()<_pullCooldownUntil)return; // inside post-pull cooldown, skip
  if(!bookings.length&&!properties.length)return; // never push empty data
  clearTimeout(_autoPushTimer);_autoPushTimer=null;
  _autoPushTimer=setTimeout(()=>{_autoPushTimer=null;sheetsPush(true);},1500);
}
// B1 — flush pending push when user switches tabs or closes app (prevents 1.5s race condition)
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'&&_autoPushTimer!==null){
    clearTimeout(_autoPushTimer);_autoPushTimer=null;
    if(sheetsConfig.connected&&sheetsConfig.url&&(bookings.length||properties.length)){
      sheetsPush(true).catch(()=>{});
    }
  }
});

// ── Live sync: poll Sheets every 20 s for external changes ──
let _pollTimer=null;
function startSheetsPolling(){
  stopSheetsPolling();
  _pollTimer=setInterval(()=>sheetsQuietPull(),20000);
}
function stopSheetsPolling(){
  if(_pollTimer){clearInterval(_pollTimer);_pollTimer=null;}
}

/**
 * Pull latest data from Google Sheets.
 * @param {boolean} force — startup mode: bypass cooldown, autoPush-pending check,
 *   and timestamp comparison; always apply whatever the sheet has.
 */
async function sheetsQuietPull(force=false){
  if(!sheetsConfig.connected||!sheetsConfig.url)return;
  if(_isPulling)return;
  // In normal poll mode: respect cooldown and pending push guard.
  // In force (startup) mode: bypass both so the device always gets fresh data.
  if(!force&&Date.now()<_pullCooldownUntil)return;
  if(!force&&_autoPushTimer!==null)return;
  try{
    const url=sheetsConfig.url+'?user=auto&t='+Date.now();
    const r=await fetch(url,{method:'GET'});
    if(!r.ok)return;
    const data=await r.json();
    if(data.error)return;
    const neverSynced=!sheetsConfig.lastSync;
    // Use sheet's own exportedAt as the comparison baseline, NOT device wall-clock.
    // This prevents the "device pulled at T+3s, sheet updated at T+5s, poll sees only 2s diff
    // and misses it because of the 10s buffer" race condition.
    const sheetTime=data.exportedAt?new Date(data.exportedAt).getTime():0;
    const lastSyncMs=sheetsConfig.lastSync?new Date(sheetsConfig.lastSync).getTime():0;
    const sheetIsNewer=sheetTime&&sheetTime>lastSyncMs+2000; // 2s buffer for clock skew
    const shouldApply=force||neverSynced||sheetIsNewer;
    if(!shouldApply)return;
    // Final guard: if a push snuck in during the fetch, let it win (it has newer local data)
    if(!force&&_autoPushTimer!==null)return;
    _isPulling=true;
    applySheetsPullData(data);
    if(bookings.length||properties.length){
      saveAll();populateSelects();renderView(currentWs);
      // KEY: store the SHEET's exportedAt as lastSync (not Date.now()).
      // Ensures subsequent polls correctly detect further sheet changes.
      sheetsConfig.lastSync=data.exportedAt||new Date().toISOString();
      saveSheetsConfig();renderSheetsStatus();
      // Only toast for genuine external edits detected during normal polling
      if(!force&&!neverSynced)toast('📊 Sheets updated — data refreshed.','info');
    }
    _isPulling=false;
  }catch(e){
    _isPulling=false; // always release lock, even on network error
  }
}
function loadAll(){
  try{
    const raw=localStorage.getItem(LS_KEY);
    if(!raw){
      properties=DEFAULT_PROPERTIES.map(p=>({...p}));
      platforms=DEFAULT_PLATFORMS.map(p=>({...p}));
      bookings=[];expenses=[];trash=[];
      saveAll();return;
    }
    const d=JSON.parse(raw);
    bookings  =Array.isArray(d.bookings)  ?d.bookings  :[];
    properties=Array.isArray(d.properties)&&d.properties.length?d.properties:DEFAULT_PROPERTIES.map(p=>({...p}));
    platforms =Array.isArray(d.platforms) &&d.platforms.length ?d.platforms :DEFAULT_PLATFORMS.map(p=>({...p}));
    // Migrate: fill in missing colors and guestFee — use normPlatform to match DEFAULT_PLATFORMS
    platforms=platforms.map(p=>{
      const normKey=normPlatform(p.name||'');
      const def=DEFAULT_PLATFORMS.find(d=>d.name===normKey);
      return{...p,
        color:p.color&&p.color!=='#888'?p.color:(def?.color||'#888'),
        guestFee:p.guestFee!=null?p.guestFee:(def?.guestFee??0),
      };
    });
    expenses      =Array.isArray(d.expenses)     ?d.expenses     :[];
    trash         =Array.isArray(d.trash)        ?d.trash        :[];
    ownerPayouts  =Array.isArray(d.ownerPayouts) ?d.ownerPayouts :[];
    properties=properties.map(p=>({baseGuests:2,maxGuests:Math.max(2,(p.beds||1)*2),extraGuestFee:300,baseRate:0,blockedDates:[],...p}));
    // One-time migration: clear corrupted extraGuests data from old bad column mapping
    const migrated = localStorage.getItem('bls_eg_migrated_v1');
    bookings=bookings.map(b=>{
      const eg = migrated ? (+b.extraGuests||0) : 0;
      const ef = migrated ? (+b.extraGuestFee||0) : 0;
      return{tasks:{},...b,
        platform:normPlatform(b.platform||''),
        bookingFee:b.bookingFee??b.bookingfee??0,
        guestCount:b.guestCount??b.guestcount??1,
        storeSales:b.storeSales??b.storeSale??0,
        extraGuests:eg,
        extraGuestFee:ef,
      };
    });
    if(!migrated) localStorage.setItem('bls_eg_migrated_v1','1');
    // Migration v2: sanitize obviously corrupted numeric fields that cause impossible revenue figures.
    // Runs independently of v1 — catches devices that had v1 flag already set with bad data.
    if(!localStorage.getItem('bls_v2_sanitized')){
      bookings=bookings.map(b=>{
        const prop=_propMap[b.property]||null;
        const maxExtra=prop?(+prop.maxGuests||8)-(+prop.baseGuests||2):20;
        const eg=+b.extraGuests||0;
        return{...b,
          extraGuests:eg>Math.max(maxExtra,20)?0:eg, // if way above property max, almost certainly corrupt
          extraGuestFee:+b.extraGuestFee>500000?0:+b.extraGuestFee||0, // >₱500k extra fee per booking is corrupt
        };
      });
      localStorage.setItem('bls_v2_sanitized','1');
    }
    // Migration v3: fix bookings where serviceFee was stored as 0 but platform has commission.
    // Root cause: drawer loading code unconditionally set dataset.manual='loaded' even when
    // serviceFee=0, blocking auto-populate. Use saved platformCommission as reference.
    if(!localStorage.getItem('bls_v3_svcfee')){
      bookings=bookings.map(b=>{
        const storedSvc=+b.serviceFee||0;
        const storedComm=+b.platformCommission||0;
        if(storedSvc===0&&storedComm>0){
          const fixed={...b,serviceFee:storedComm};
          const t2=calcTotals(fixed);
          return{...fixed,netRevenue:t2.netRevenue};
        }
        return b;
      });
      localStorage.setItem('bls_v3_svcfee','1');
    }
    // Migration v4: catch older bookings where platformCommission was never stored (pre-tracking).
    // Use calcTotals().platFee directly — only touches bookings that still have serviceFee=0
    // but whose platform currently has commission configured.
    if(!localStorage.getItem('bls_v4_svcfee')){
      bookings=bookings.map(b=>{
        if((+b.serviceFee||0)===0){
          const t0=calcTotals(b);
          if(t0.platFee>0){
            const fixed={...b,serviceFee:t0.platFee,platformCommission:t0.platFee};
            const t2=calcTotals(fixed);
            return{...fixed,netRevenue:t2.netRevenue};
          }
        }
        return b;
      });
      localStorage.setItem('bls_v4_svcfee','1');
    }
    // Deduplicate platforms — merge by normalized name, prefer non-grey color
    const platMap={};
    platforms.forEach(p=>{
      const key=normPlatform(p.name||'');
      p.name=key;
      if(!platMap[key]){
        platMap[key]=p;
      }else{
        // Merge: keep non-grey color; keep higher commission/guestFee if non-zero
        if(platMap[key].color==='#888'&&p.color&&p.color!=='#888')platMap[key].color=p.color;
        if(!platMap[key].commission&&p.commission)platMap[key].commission=p.commission;
        if(!platMap[key].guestFee&&p.guestFee)platMap[key].guestFee=p.guestFee;
      }
    });
    platforms=Object.values(platMap);
  }catch(e){
    console.error('load failed',e);
    properties=DEFAULT_PROPERTIES.map(p=>({...p}));
    platforms=DEFAULT_PLATFORMS.map(p=>({...p}));
  }
  rebuildLookupMaps();
}
function loadSettings(){
  try{const s=localStorage.getItem(LS_SETTINGS);if(s)settings={...settings,...JSON.parse(s)};}catch(e){}
}
function loadDriveConfig(){
  try{const d=localStorage.getItem(LS_DRIVE);if(d)driveConfig={...driveConfig,...JSON.parse(d)};}catch(e){}
}
function saveDriveConfig(){ localStorage.setItem(LS_DRIVE,JSON.stringify(driveConfig)); }

const genId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);

// ---- UTILS
const C=()=>settings.currency||'\u20b1';
function fmtMoney(n){return C()+Number(n||0).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});}
function fmtDate(d){if(!d)return'';const dt=new Date(d+'T12:00:00');if(isNaN(dt.getTime()))return d;return`${MONTHS_LONG[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;}
function fmtMonthYear(iso){if(!iso)return'';const[y,m]=iso.split('-');return new Date(+y,+m-1).toLocaleString('default',{month:'long',year:'numeric'});}
const MONTHS_LONG=['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDateRange(ci,co){
  if(!ci||!co)return{range:'',nightsText:''};
  const d1=new Date(ci+'T12:00:00'),d2=new Date(co+'T12:00:00');
  const nights=nightsBetween(ci,co);
  const nightsText=`${nights} night${nights!==1?'s':''}`;
  const sameYear=d1.getFullYear()===d2.getFullYear();
  const sameMonth=sameYear&&d1.getMonth()===d2.getMonth();
  let range;
  if(sameMonth){
    range=`${MONTHS_LONG[d1.getMonth()]} ${d1.getDate()}–${d2.getDate()}, ${d1.getFullYear()}`;
  }else if(sameYear){
    range=`${MONTHS_SHORT[d1.getMonth()]} ${d1.getDate()} – ${MONTHS_SHORT[d2.getMonth()]} ${d2.getDate()}, ${d1.getFullYear()}`;
  }else{
    range=`${MONTHS_SHORT[d1.getMonth()]} ${d1.getDate()}, ${d1.getFullYear()} – ${MONTHS_SHORT[d2.getMonth()]} ${d2.getDate()}, ${d2.getFullYear()}`;
  }
  return{range,nightsText};
}
function updateContextStrip(){
  const strip=document.getElementById('drawerContextStrip');if(!strip)return;
  const guest=(document.getElementById('f-guest')?.value||'').trim();
  const propId=document.getElementById('f-property')?.value||'';
  const ci=document.getElementById('f-checkin')?.value||'';
  const co=document.getElementById('f-checkout')?.value||'';
  const platName=(document.getElementById('f-platform')?.value||'').trim();
  if(!guest&&!propId&&!ci){strip.style.display='none';return;}
  const guestEl=document.getElementById('dcsGuest');
  const propEl=document.getElementById('dcsProperty');
  const datesEl=document.getElementById('dcsDates');
  const platEl=document.getElementById('dcsPlatform');
  if(guestEl)guestEl.textContent=guest||'—';
  if(propEl)propEl.textContent=propId?propName(propId):'';
  if(platEl){
    if(platName){
      const pc=platformColor(platName);
      platEl.innerHTML=`<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:${pc};white-space:nowrap"><span style="width:6px;height:6px;border-radius:50%;background:${pc};flex-shrink:0"></span>${esc(platName)}</span>`;
      platEl.style.display='inline';
    } else {
      platEl.style.display='none';
    }
  }
  if(datesEl&&ci&&co){const{range,nightsText}=fmtDateRange(ci,co);datesEl.textContent=`📅 ${range} · ${nightsText}`;}
  else if(datesEl)datesEl.textContent=ci?`📅 Check-in: ${fmtDate(ci)}`:'';
  strip.style.display='block';
}
function updateDateRangeDisplay(){
  const ci=document.getElementById('f-checkin')?.value||'';
  const co=document.getElementById('f-checkout')?.value||'';
  const el=document.getElementById('dateRangeDisplay');if(!el)return;
  if(!ci||!co){el.style.display='none';return;}
  const nightsEl=document.getElementById('dateNightsText');
  if(nightsEl)nightsEl.textContent=nightsBetween(ci,co);
  el.style.display='flex';el.style.flexDirection='column';el.style.alignItems='center';
  updateContextStrip();
}
function updateGuestAvatar(){
  const guest=(document.getElementById('f-guest')?.value||'').trim();
  const av=document.getElementById('guestAvatar');if(!av)return;
  if(!guest){av.textContent='?';return;}
  const parts=guest.split(/\s+/);
  const initials=parts.length>=2?parts[0][0]+parts[parts.length-1][0]:parts[0][0];
  av.textContent=initials.toUpperCase();
}
function updateDrawerProfile(){
  const el=document.getElementById('drawerGuestProfile');if(!el)return;
  const guest=(document.getElementById('f-guest')?.value||'').trim();
  updateGuestAvatar();
  if(!guest){el.style.display='none';return;}
  const gBks=bookings.filter(b=>(b.guest||'').toLowerCase().trim()===guest.toLowerCase().trim());
  // B6: Show guest prefs from most recent booking for this guest
  const latestBk=gBks.slice().sort((a,b)=>(b.checkin||'').localeCompare(a.checkin||''))[0];
  const prefs=latestBk?.guestPrefs||'';
  let html='';
  if(gBks.length>1){
    const lifetime=gBks.reduce((s,b)=>s+calcTotals(b).netRevenue,0);
    html+=`<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:var(--purple);background:var(--purple-bg);border-radius:20px;padding:2px 9px;white-space:nowrap">↩ Repeat Guest · ${gBks.length} stays · ${fmtMoney(lifetime)} lifetime</span>`;
  }
  if(prefs){
    html+=`<div style="margin-top:5px;background:var(--blue-bg);border-radius:var(--radius);padding:6px 10px;font-size:11px;color:var(--blue);display:flex;align-items:flex-start;gap:6px">
      <span style="flex-shrink:0">📋</span>
      <span><strong>Prefs:</strong> ${esc(prefs)}</span>
    </div>`;
  }
  if(html){el.innerHTML=html;el.style.display='block';}
  else{el.style.display='none';}
  updateContextStrip();
}
function todayISO(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dateToISO(d){return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function nightsBetween(a,b){if(!a||!b)return 0;return Math.max(0,Math.round((new Date(b+'T12:00:00')-new Date(a+'T12:00:00'))/86400000));}
function properCase(s){return(s||'').toLowerCase().replace(/\s+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// Normalize platform name variations to canonical form
function normPlatform(name){
  const n=(name||'').trim();
  const lo=n.toLowerCase();
  if(lo==='booking'||lo==='booking.com'||lo==='bookingcom')return'Booking.com';
  if(lo==='airbnb')return'Airbnb';
  if(lo==='agoda')return'Agoda';
  if(lo==='trip.com'||lo==='tripcom'||lo==='trip')return'Trip.com';
  if(lo==='your.rentals'||lo==='yourrentals'||lo==='your rentals')return'Your.Rentals';
  if(lo==='direct booking'||lo==='direct'||lo==='directbooking')return'Direct Booking';
  return n||'Direct Booking';
}
// \u2500\u2500 Lookup maps: O(1) property/platform access \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let _propMap={},_platMap={};
function rebuildLookupMaps(){
  _propMap=Object.fromEntries(properties.map(p=>[p.id,p]));
  _platMap=Object.fromEntries(platforms.map(p=>[normPlatform(p.name),p]));
}
function getPlatform(name){return _platMap[normPlatform(name)]||null;}
function platformColor(name){return(getPlatform(name)||{color:'#888'}).color;}
function platformPillHtml(name){const c=platformColor(name);return`<span class="platform-pill" style="background:${c}22;color:${c}"><span style="width:5px;height:5px;border-radius:50%;background:${c};display:inline-block"></span> ${esc(name||'\u2014')}</span>`;}
function propName(id){return(_propMap[id]||{name:'\u2014'}).name;}
// Assigns a stable distinct color per property from a curated palette
const _PROP_PALETTE=['#0ea5e9','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#f97316','#6366f1','#14b8a6','#e879f9'];
function propertyColor(propId){
  const idx=properties.findIndex(p=>p.id===propId);
  return _PROP_PALETTE[Math.max(0,idx)%_PROP_PALETTE.length];
}
function propCity(id){return(_propMap[id]||{city:''}).city;}
function statusBadgeHtml(s){const m={'Confirmed':'badge-green','Pending':'badge-orange','Checked-In':'badge-blue','Checked-Out':'badge-neutral','Cancelled':'badge-red'};return`<span class="badge ${m[s]||'badge-neutral'}">${esc(s||'Pending')}</span>`;}
function statusColorStyle(s){
  const m={'Confirmed':{bg:'var(--green-bg)',color:'var(--green)',border:'rgba(45,106,31,.3)'},
           'Pending':{bg:'var(--orange-bg)',color:'var(--orange)',border:'rgba(196,124,10,.3)'},
           'Checked-In':{bg:'var(--blue-bg)',color:'var(--blue)',border:'rgba(26,86,219,.3)'},
           'Cancelled':{bg:'var(--red-bg)',color:'var(--red)',border:'rgba(192,57,43,.3)'}};
  return m[s]||{bg:'',color:'',border:''};
}
function applyStatusColor(sel){
  if(!sel)return;
  const c=statusColorStyle(sel.value);
  sel.style.background=c.bg;sel.style.color=c.color;sel.style.borderColor=c.border;sel.style.fontWeight='700';
}

function renderRecentBookings(containerEl){
  if(!containerEl)return;
  const recent=bookings.slice().sort((a,b)=>(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||'')).slice(0,8);
  if(!recent.length){containerEl.innerHTML='<div style="color:var(--text-3);font-size:12px;padding:10px 14px">No bookings yet.</div>';return;}
  containerEl.innerHTML=recent.map(b=>`
    <div style="display:flex;align-items:center;gap:8px;padding:8px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s" onmouseenter="this.style.background='var(--surface-2)'" onmouseleave="this.style.background=''" onclick="closeRecentPanel();openBookingDrawer('${b.id}')">
      <div style="width:3px;height:28px;border-radius:2px;background:${platformColor(b.platform)};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.guest)}</div>
        <div style="font-size:10px;color:var(--text-3)">${esc(propName(b.property))} · ${fmtDate(b.checkin)}</div>
      </div>
      ${statusBadgeHtml(b.status)}
    </div>`).join('');
}

// ============================================================
// DRAFT SYSTEM
// ============================================================
function loadDrafts(){try{drafts=JSON.parse(localStorage.getItem(LS_DRAFTS))||[];}catch(e){drafts=[];}}
function saveDraftsStore(){localStorage.setItem(LS_DRAFTS,JSON.stringify(drafts));}

function deleteDraft(id){
  loadDrafts();
  drafts=drafts.filter(d=>d.id!==id);
  saveDraftsStore();
  if(_currentDraftId===id)_currentDraftId=null;
}

function autoSaveDraft(){
  if(editingBookingId)return; // only new bookings become drafts
  const guest=(document.getElementById('f-guest')?.value||'').trim();
  if(!guest){
    if(_currentDraftId){deleteDraft(_currentDraftId);}
    _currentDraftId=null;
    return;
  }
  if(!_currentDraftId)_currentDraftId='draft_'+Date.now();
  const draft={
    id:_currentDraftId,
    guest,
    checkin:document.getElementById('f-checkin')?.value||'',
    checkout:document.getElementById('f-checkout')?.value||'',
    property:document.getElementById('f-property')?.value||'',
    platform:normPlatform(document.getElementById('f-platform')?.value||''),
    rate:document.getElementById('f-rate')?.value||'',
    promo:document.getElementById('f-promo')?.value||'0',
    specialOffer:document.getElementById('f-specialoffer')?.value||'0',
    serviceFee:document.getElementById('f-servicefee')?.value||'0',
    guestServiceFee:document.getElementById('f-guestservicefee')?.value||'0',
    extraGuests:document.getElementById('f-extraguests')?.value||'0',
    storeSales:document.getElementById('f-store')?.value||'0',
    cleaningFee:document.getElementById('f-cleaning')?.value||'0',
    deposit:document.getElementById('f-deposit')?.value||'',
    depRefundedAmt:document.getElementById('f-dep-refunded-amt')?.value||'0',
    status:document.getElementById('f-status')?.value||'',
    payment:document.getElementById('f-payment')?.value||'',
    notes:document.getElementById('f-notes')?.value||'',
    updatedAt:new Date().toISOString()
  };
  loadDrafts();
  const idx=drafts.findIndex(d=>d.id===_currentDraftId);
  if(idx>=0)drafts[idx]=draft;else drafts.push(draft);
  saveDraftsStore();
}

function scheduleDraftSave(){
  clearTimeout(_draftTimer);
  _draftTimer=setTimeout(autoSaveDraft,1200);
}

function openDraftInDrawer(draftId){
  closeModal('dailyBriefModal');
  loadDrafts();
  const draft=drafts.find(d=>d.id===draftId);
  if(!draft){openBookingDrawer();return;}
  openBookingDrawer(); // resets all fields
  _currentDraftId=draftId; // restore AFTER openBookingDrawer resets it
  _loadingDrawer=true; // prevent side-effects from overwriting restored draft values
  try{
    document.getElementById('f-guest').value=draft.guest||'';
    if(draft.checkin)document.getElementById('f-checkin').value=draft.checkin;
    if(draft.checkout)document.getElementById('f-checkout').value=draft.checkout;
    dpSyncFromHidden();
    if(draft.property)document.getElementById('f-property').value=draft.property;
    if(draft.platform)setPlatPickerValue(draft.platform);
    if(draft.rate!=null)document.getElementById('f-rate').value=draft.rate;
    const dPromo=document.getElementById('f-promo');
    if(dPromo&&draft.promo!=null){dPromo.value=draft.promo;}
    const dSO=document.getElementById('f-specialoffer');
    if(dSO&&draft.specialOffer!=null){dSO.value=draft.specialOffer;}
    const dSvc=document.getElementById('f-servicefee');
    if(dSvc&&draft.serviceFee!=null){
      dSvc.value=draft.serviceFee;
      if((+draft.serviceFee||0)>0){dSvc.dataset.manual='loaded';}else{delete dSvc.dataset.manual;}
    }
    if(draft.guestServiceFee!=null){
      const el=document.getElementById('f-guestservicefee');
      if(el){
        el.value=draft.guestServiceFee;
        if((+draft.guestServiceFee||0)>0){el.dataset.manual='loaded';}else{delete el.dataset.manual;}
      }
    }
    if(draft.depRefundedAmt!=null){const el=document.getElementById('f-dep-refunded-amt');if(el)el.value=draft.depRefundedAmt;}
    if(draft.storeSales!=null)document.getElementById('f-store').value=draft.storeSales;
    if(draft.cleaningFee!=null)document.getElementById('f-cleaning').value=draft.cleaningFee;
    if(draft.deposit!=null)document.getElementById('f-deposit').value=draft.deposit;
    if(draft.status){const s=document.getElementById('f-status');if(s){s.value=draft.status;applyStatusColor(s);}}
    if(draft.payment){const p=document.getElementById('f-payment');if(p)p.value=draft.payment;}
    if(draft.notes)document.getElementById('f-notes').value=draft.notes;
  }finally{_loadingDrawer=false;}
  updatePromoSpecialOfferState(true); // fromLoad=true — don't clear promo/specialOffer
  onPropertyChange();
  // Restore draft values that onPropertyChange() may have overwritten
  if(draft.rate!=null){const el=document.getElementById('f-rate');if(el)el.value=draft.rate;}
  if(draft.promo!=null){const el=document.getElementById('f-promo');if(el)el.value=draft.promo;}
  if(draft.specialOffer!=null){const el=document.getElementById('f-specialoffer');if(el)el.value=draft.specialOffer;}
  if(draft.extraGuests!=null){const el=document.getElementById('f-extraguests');if(el)el.value=draft.extraGuests;}
  calcFinancials();
  updateDrawerProfile(draft.guest||'');
  updateDrawerSummary();
}

function printBooking(){
  const bkData=editingBookingId?bookings.find(x=>x.id===editingBookingId):null;
  const fGuest=document.getElementById('f-guest')?.value||'Guest';
  const fCI=document.getElementById('f-checkin')?.value||'';
  const fCO=document.getElementById('f-checkout')?.value||'';
  const fRate=+document.getElementById('f-rate')?.value||0;
  const fPromo=+document.getElementById('f-promo')?.value||0;
  const fSvc=+document.getElementById('f-servicefee')?.value||0;
  const fPlatform=document.getElementById('f-platform')?.value||'';
  const fProp=document.getElementById('f-property')?.value||'';
  const fPayment=document.getElementById('f-payment')?.value||'';
  const fStatus=document.getElementById('f-status')?.value||'';
  const fNotes=document.getElementById('f-notes')?.value||'';
  const fDeposit=+document.getElementById('f-deposit')?.value||0;
  const fSpecialOffer=+document.getElementById('f-specialoffer')?.value||0;
  const fGuestSvcFee=+document.getElementById('f-guestservicefee')?.value||0;
  const fGuestCount=+document.getElementById('f-guestcount')?.value||1;
  const fGuestPrefs=document.getElementById('f-guestprefs')?.value||'';
  const fDepCollected=document.getElementById('f-dep-collected')?.value==='1';
  const bTemp={checkin:fCI,checkout:fCO,rate:fRate,promo:fPromo,specialOffer:fSpecialOffer,serviceFee:fSvc,platform:fPlatform,property:fProp,extraGuests:0,storeSales:0,adjustments:_currentAdjustments};
  const t=calcTotals(bTemp);
  const propObj=properties.find(p=>p.id===fProp);
  const propDisplay=propObj?propObj.name:fProp;
  const propAddr=propObj?.address||propObj?.city||'';
  const propNotes=propObj?.notes||'';
  const balanceDue=Math.max(0,t.guestTotal-fDeposit);
  const dateRange=fCI&&fCO?`${fmtDate(fCI)} → ${fmtDate(fCO)}`:'';
  const adjRows=(_currentAdjustments||[]).filter(a=>a.desc||a.amount).map(a=>`
    <tr><td style="padding:4px 0;color:#555">${esc(a.desc||'Adjustment')}</td><td style="text-align:right">${a.amount>=0?'+':''}${fmtMoney(a.amount)}</td></tr>`).join('');
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Booking Summary</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;color:#1a1a1a;background:#fff}
    .page{max-width:560px;margin:0 auto;padding:32px 28px}
    .logo{font-size:22px;font-weight:900;letter-spacing:-.04em;margin-bottom:4px}
    .logo span{color:#888;font-weight:400}
    .divider{border:none;border-top:1px solid #e8e6e1;margin:18px 0}
    h2{font-size:18px;font-weight:800;margin:0 0 4px}
    .meta{font-size:12px;color:#666;margin-bottom:18px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    td{padding:5px 0;vertical-align:top}
    td:last-child{text-align:right;font-weight:600}
    .section-title{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#999;padding:14px 0 6px}
    .total-row td{font-size:16px;font-weight:900;border-top:2px solid #1a1a1a;padding-top:10px}
    .badge{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700}
    .green{background:#edf7ea;color:#2d6a1f}.orange{background:#fef8ec;color:#c47c0a}
    .blue{background:#eef4ff;color:#1a56db}.red{background:#fdf0ee;color:#c0392b}
    @media print{body{margin:0}@page{margin:16mm}}
  </style></head><body><div class="page">
    <div class="logo">Bloomstone<span> PMS</span></div>
    <div style="font-size:11px;color:#999;margin-bottom:20px">Booking Confirmation</div>
    <hr class="divider"/>
    <h2>${esc(fGuest)}</h2>
    <div class="meta">${esc(propDisplay)}${propAddr?' · '+esc(propAddr):''}</div>
    <table>
      <tr><td style="color:#555">Check-in</td><td>${fmtDate(fCI)||'—'}</td></tr>
      <tr><td style="color:#555">Check-out</td><td>${fmtDate(fCO)||'—'}</td></tr>
      <tr><td style="color:#555">Nights</td><td>${t.nights}</td></tr>
      <tr><td style="color:#555">Guests</td><td>${fGuestCount}</td></tr>
      <tr><td style="color:#555">Platform</td><td>${esc(fPlatform)||'—'}</td></tr>
      <tr><td style="color:#555">Payment</td><td>${esc(fPayment)||'—'}</td></tr>
      <tr><td style="color:#555">Status</td><td><span class="badge ${fStatus==='Confirmed'?'green':fStatus==='Pending'?'orange':fStatus==='Checked-In'?'blue':'red'}">${esc(fStatus)}</span></td></tr>
      ${fGuestPrefs?`<tr><td style="color:#555">Guest Preferences</td><td style="text-align:left;font-style:italic;color:#444">${esc(fGuestPrefs)}</td></tr>`:''}
    </table>
    <hr class="divider"/>
    <div class="section-title" style="color:#1a56db">Guest Invoice</div>
    <table>
      <tr><td>Accommodation <span style="color:#999;font-size:11px">${t.nights} night${t.nights!==1?'s':''} × ${fmtMoney(fRate)}</span></td><td>${fmtMoney(t.bkFee)}</td></tr>
      ${t.promoTotal?`<tr><td style='color:#555'>Promo / Discount</td><td style='color:#6d28d9'>−${fmtMoney(t.promoTotal)}</td></tr>`:''}
      ${t.specialOffer?`<tr><td style='color:#555'>Special Offer (Platform)</td><td style='color:#6d28d9'>−${fmtMoney(t.specialOffer)}</td></tr>`:''}
      ${t.extraFee?`<tr><td style="color:#555">Extra Guest Fee</td><td>+${fmtMoney(t.extraFee)}</td></tr>`:''}
      ${adjRows}
      <tr class="total-row"><td>Total Charged to Guest</td><td>${fmtMoney(t.guestTotal)}</td></tr>
      ${fGuestSvcFee?`<tr><td style="color:#555">+ Platform Guest Service Fee</td><td>+${fmtMoney(fGuestSvcFee)}</td></tr>`:''}
      ${fGuestSvcFee?`<tr><td style="color:#555">= Total Guest Paid to Platform</td><td style="font-weight:700">${fmtMoney(t.guestTotal+fGuestSvcFee)}</td></tr>`:''}
    </table>
    <hr class="divider"/>
    <div class="section-title" style="color:#2d6a1f">Owner Earnings</div>
    <table>
      <tr><td style="color:#555">Guest charges received</td><td>${fmtMoney(t.guestTotal)}</td></tr>
      ${t.specialOffer?`<tr><td style="color:#555">Special Offer (absorbed, already in guest charges)</td><td style="color:#999">−${fmtMoney(t.specialOffer)}</td></tr>`:''}
      ${fSvc?`<tr><td style="color:#555">Host Service Fee${t.comm?` (${t.comm}%${t.vat?'+'+t.vat+'%VAT':''})`:''}</td><td style="color:#c0392b">−${fmtMoney(fSvc)}</td></tr>`:''}
      ${t.cleaningFee?`<tr><td style="color:#555">Cleaning Fee</td><td style="color:#c0392b">−${fmtMoney(t.cleaningFee)}</td></tr>`:''}
      ${t.storeSales?`<tr><td style="color:#555">Store / Add-on Sales</td><td style="color:#2d6a1f">+${fmtMoney(t.storeSales)}</td></tr>`:''}
      <tr class="total-row"><td>Net Revenue</td><td style="color:#2d6a1f">${fmtMoney(t.guestTotal-fSvc-t.cleaningFee+t.storeSales)}</td></tr>
    </table>
    ${fDeposit?`<hr class="divider"/>
    <div class="section-title">Payment Summary</div>
    <table>
      <tr><td style="color:#555">Total Charged to Guest</td><td>${fmtMoney(t.guestTotal)}</td></tr>
      <tr><td style="color:#555">Security Deposit</td><td>${fmtMoney(fDeposit)}</td></tr>
      ${fDepCollected?`<tr><td style="color:#555">Deposit Status</td><td style="color:#2d6a1f;font-weight:700">✓ Collected</td></tr>`:
        `<tr><td style="color:#555">Deposit Status</td><td style="color:#c47c0a;font-weight:700">⚠ Pending</td></tr>`}
      ${balanceDue>0?`<tr style="border-top:1px solid #e8e6e1"><td style="font-weight:700;padding-top:8px">Balance Due</td><td style="font-weight:900;font-size:15px;padding-top:8px;color:#1a56db">${fmtMoney(balanceDue)}</td></tr>`:''}
    </table>`:''}
    ${fNotes?`<hr class="divider"/><div class="section-title">Notes</div><div style="font-size:13px;color:#444;white-space:pre-line">${esc(fNotes)}</div>`:''}
    ${propNotes?`<hr class="divider"/><div class="section-title">House Rules / Property Notes</div><div style="font-size:12px;color:#555;white-space:pre-line">${esc(propNotes)}</div>`:''}
    <hr class="divider"/>
    <div style="font-size:10px;color:#aaa;text-align:center">Generated by Bloomstone PMS · ${new Date().toLocaleDateString()}</div>
  </div></body></html>`;
  const win=window.open('','_blank','width=640,height=780');
  if(!win){toast('Allow popups to print this booking.','warning');return;}
  win.document.write(html);win.document.close();win.focus();
  setTimeout(()=>win.print(),400);
}

// showGuestHistory() legacy stub — now handled by openGuestProfile above

// ── Render-scoped memoization for calcTotals ─────────────────
// _totalsCache is set to a Map() at the start of heavy renders,
// null outside renders — so drawer live-calcs never get stale results.
let _totalsCache=null;
// ── Debounced calcFinancials for oninput handlers ─────────────
let _calcFinTimer=null;
function calcFinancialsLazy(){clearTimeout(_calcFinTimer);_calcFinTimer=setTimeout(calcFinancials,150);}

// ---- FINANCIALS
function calcTotals(b){
  if(_totalsCache&&b.id){const cached=_totalsCache.get(b.id);if(cached)return cached;}

  const nights=nightsBetween(b.checkin,b.checkout);
  const rate=+b.rate||0;
  const promo=+b.promo||0;
  const bkFee=rate*nights;                        // accommodation: nights × rate
  const promoTotal=promo*nights;                   // direct booking promo discount (per night × nights)
  const specialOffer=+b.specialOffer||0;           // platform special offer: owner-side cost (platform deducts from remittance)
  const stayFee=Math.max(0,bkFee-promoTotal-specialOffer); // accommodation after direct promo & platform special offer
  const prop=_propMap[b.property]||null;
  const feePerG=prop?(+prop.extraGuestFee??300):300;
  const baseG=prop?(+prop.baseGuests||2):2;
  const maxG=prop?(+prop.maxGuests||8):8;
  const extraG=+b.extraGuests||0;
  const extraFee=extraG*feePerG*nights;            // extra guests — goes to owner, not subject to platform fee
  const adjTotal=(b.adjustments||[]).reduce((s,a)=>s+(+a.amount||0),0);
  // ── Guest Invoice total (what guest pays) ──
  const guestTotal=stayFee+extraFee+adjTotal;
  // ── Owner deductions (platform charges to host) ──
  const svcFee=+b.serviceFee||0;                  // host service fee charged by platform
  const plat=getPlatform(b.platform);
  const comm=plat?(+plat.commission||0):0;
  const vat=plat?(+plat.vat||0):0;
  const platFee=Math.max(0,bkFee)*(comm/100)*(1+vat/100); // commission on GROSS rate×nights (pre-discount — what platform actually charges)
  const guestFeeRate=plat?(+plat.guestFee||0):0;
  const guestServiceFee=stayFee*(guestFeeRate/100); // platform charges to guest (informational)
  const totalGuestPaid=guestTotal+guestServiceFee;
  const cleaningFee=+b.cleaningFee||0;             // owner's cleaning cost
  const storeSales=+b.storeSales||0;               // store/add-on income — 100% owner per §7.8.3
  // ── Net Revenue to owner ──
  const netRevenue=guestTotal-svcFee-cleaningFee+storeSales;
  const totalWithout=guestTotal-extraFee;            // accommodation total without extra-guest fee
  // ── Revenue split (Gap 2): split base excludes storeSales (100% owner) ──
  const ownerPct=+(prop?.ownerPct??100);             // default 100% = no split / self-managed
  const splitBase=guestTotal-svcFee-cleaningFee;     // net before store sales
  const ownerShare=splitBase*(ownerPct/100)+storeSales;  // owner's share + all store sales
  const bloomsShare=splitBase*((100-ownerPct)/100);  // Bloomstone's management cut
  const result={nights,rate,promo,promoTotal,specialOffer,stayFee,bkFee,extraFee,svcFee,platFee,
         guestTotal,totalWithout,cleaningFee,storeSales,netRevenue,
         guestFeeRate,guestServiceFee,totalGuestPaid,
         extraG,comm,vat,feePerG,baseG,maxG,adjTotal,
         ownerPct,ownerShare,bloomsShare,splitBase};
  if(_totalsCache&&b.id)_totalsCache.set(b.id,result);
  return result;
}

function bookingsOverlap(a,b){
  if(a.checkout===b.checkin||b.checkout===a.checkin)return false;
  return a.checkin<b.checkout&&b.checkin<a.checkout;
}
function hasConflict(b){
  if(!b||!b.checkin||!b.checkout||b.status==='Cancelled')return false;
  return bookings.some(o=>o.id!==b.id&&o.property===b.property&&o.status!=='Cancelled'&&bookingsOverlap(b,o));
}
function isRepeat(name){
  if(!name)return false;
  const n=name.toLowerCase().trim();
  return bookings.filter(b=>(b.guest||'').toLowerCase().trim()===n).length>1;
}
function tasksDone(b){if(!b.tasks)return 0;return DEFAULT_TASKS.filter(t=>b.tasks[t.key]).length;}
function tasksTotal(){return DEFAULT_TASKS.length;}

// ---- TOAST
function toast(msg,type='success',durationOrUndo=null){
  const host=document.getElementById('toastHost');
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  const undoFn=typeof durationOrUndo==='function'?durationOrUndo:null;
  const duration=typeof durationOrUndo==='number'?durationOrUndo:(undoFn?6000:2800);
  el.innerHTML=`<span>${esc(msg)}</span>${undoFn?'<button class="undo">Undo</button>':''}`;
  if(undoFn)el.querySelector('.undo').onclick=()=>{undoFn();el.remove();};
  host.appendChild(el);
  setTimeout(()=>el.remove(),duration);
}

// ---- CONFIRM
function confirmDialog(title,text,icon,onOk,confirmLabel='Confirm',opts={}){
  document.getElementById('confirmTitle').textContent=title;
  const textEl=document.getElementById('confirmText');
  if(opts.html){textEl.innerHTML=text;}else{textEl.textContent=text;}
  document.getElementById('confirmIcon').textContent=icon||'\u26a0';
  const modal=document.getElementById('confirmModal');
  if(opts.wide)modal.classList.add('wide');else modal.classList.remove('wide');
  const btn=document.getElementById('confirmBtn');
  btn.textContent=confirmLabel;
  btn.className='btn '+(opts.btnClass||'btn-danger');
  btn.style.minWidth='110px';
  btn.onclick=()=>{closeModal('confirmModal');onOk();};
  openModal('confirmModal');
}

// ---- MODALS
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.addEventListener('click',e=>{
  if(e.target.classList.contains('modal-overlay'))e.target.classList.remove('open');
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
    closeDrawer();closeCmdPalette();
    return;
  }
  // Global shortcuts — only fire when no input/textarea is focused and drawer is closed
  const active=document.activeElement;
  const inInput=active&&(active.tagName==='INPUT'||active.tagName==='TEXTAREA'||active.tagName==='SELECT'||active.isContentEditable);
  const drawerOpen=document.getElementById('bookingDrawer')?.classList.contains('open');
  if(inInput||drawerOpen)return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  switch(e.key){
    case 'n':case 'N': e.preventDefault();openBookingDrawer();break;
    case 'p':case 'P': e.preventDefault();openPropertyModal();break;
    case 'k':case 'K': e.preventDefault();openCmdPalette();break;
    case '1': e.preventDefault();navigateTo('today');break;
    case '2': e.preventDefault();navigateTo('bookings');break;
    case '3': e.preventDefault();navigateTo('calendar');break;
    case '4': e.preventDefault();navigateTo('finance-overview');break;
    case '5': e.preventDefault();navigateTo('properties');break;
    case '6': e.preventDefault();navigateTo('guests');break;
    case '?': showKeyboardShortcuts();break;
  }
});

function showKeyboardShortcuts(){
  const shortcuts=[
    ['N','New Booking'],['P','New Property'],['K','Command Palette'],
    ['1','Today Dashboard'],['2','Bookings'],['3','Calendar'],
    ['4','Finance Overview'],['5','Properties'],['6','Guests'],
    ['Esc','Close drawer / modal'],['?','Show this help'],
  ];
  const html=shortcuts.map(([k,d])=>`<div style="display:flex;align-items:center;gap:12px;padding:5px 0;border-bottom:1px solid var(--border)">
    <kbd style="background:var(--surface-2);border:1px solid var(--border-2);border-radius:4px;padding:2px 8px;font-size:12px;font-family:monospace;min-width:28px;text-align:center">${k}</kbd>
    <span style="font-size:13px;color:var(--text)">${d}</span></div>`).join('');
  confirmDialog('⌨ Keyboard Shortcuts',html,null,()=>{},{confirmLabel:'Close',html:true,btnClass:'btn-secondary'});
}

// ============================================================
// NAVIGATION
// ============================================================
const NAV_STRUCTURE=[
  {id:'today',    icon:'\u25ce',label:'Today',      sub:[]},
  {id:'operations',icon:'\u229f',label:'Operations',sub:[
    {id:'calendar',label:'Calendar'},
    {id:'bookings',label:'Bookings'},
  ]},
  {id:'finance',  icon:'\u20b1',label:'Finance',    sub:[
    {id:'finance-overview',label:'Overview'},
    {id:'finance-expenses',label:'Expenses'},
    {id:'finance-deposits',label:'Deposits'},
    {id:'finance-platforms',label:'Platforms'},
    {id:'finance-owner-statements',label:'Owner Statements'},
  ]},
  {id:'properties',icon:'\u2302',label:'Properties',sub:[]},
  {id:'guests',   icon:'\u{1F9D1}',label:'Guests',   sub:[]},
  {id:'reports',  icon:'\u2197',label:'Reports',    sub:[]},
  {id:'system',   icon:'\u2699',label:'System',     sub:[
    {id:'system-guide',label:'Guide'},
    {id:'system-imports',label:'Imports'},
    {id:'system-integrations',label:'Integrations'},
    {id:'system-settings',label:'Settings'},
    {id:'system-trash',label:'Trash'},
  ]},
  {id:'users',    icon:'\u{1F464}',label:'Users',    sub:[]},
];

function buildSidebarNav(){
  const nav=document.getElementById('sidebarNav');
  nav.innerHTML=NAV_STRUCTURE.map(ws=>{
    const hasSub=ws.sub.length>0;
    return`<div class="ws-item">
      <button class="ws-btn" data-ws="${ws.id}" onclick="wsClick('${ws.id}',${hasSub})">
        <span class="ws-icon">${ws.icon}</span>
        <span class="ws-label">${ws.label}</span>
        ${hasSub?'<span class="ws-chevron">\u203a</span>':''}
      </button>
      ${hasSub?`<div class="sub-nav" id="sub-${ws.id}">${ws.sub.map(s=>`<button class="sub-btn" data-sub="${s.id}" onclick="subClick('${ws.id}','${s.id}')">${s.label}</button>`).join('')}</div>`:''}
    </div>`;
  }).join('');
}

function wsClick(wsId,hasSub){
  if(hasSub){
    const subEl=document.getElementById('sub-'+wsId);
    const btn=document.querySelector(`.ws-btn[data-ws="${wsId}"]`);
    const isOpen=subEl.classList.contains('open');
    document.querySelectorAll('.sub-nav.open').forEach(s=>s.classList.remove('open'));
    document.querySelectorAll('.ws-btn.open').forEach(b=>b.classList.remove('open'));
    if(!isOpen){subEl.classList.add('open');btn.classList.add('open');}
    if(!isOpen){
      const first=NAV_STRUCTURE.find(w=>w.id===wsId)?.sub[0];
      if(first)subClick(wsId,first.id);
    }
  }else{
    document.querySelectorAll('.sub-nav.open').forEach(s=>s.classList.remove('open'));
    document.querySelectorAll('.ws-btn.open').forEach(b=>b.classList.remove('open'));
    navigateTo(wsId);
  }
  document.querySelectorAll('.ws-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.ws-btn[data-ws="${wsId}"]`)?.classList.add('active');
}

function subClick(wsId,subId){
  document.querySelectorAll('.sub-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.sub-btn[data-sub="${subId}"]`)?.classList.add('active');
  document.querySelectorAll('.ws-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.ws-btn[data-ws="${wsId}"]`)?.classList.add('active');
  navigateTo(subId);
}

function navigateTo(viewId){
  currentWs=viewId;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const viewEl=document.getElementById('view-'+viewId);
  if(viewEl)viewEl.classList.add('active');
  const ws=NAV_STRUCTURE.find(w=>w.id===viewId||w.sub.some(s=>s.id===viewId));
  const sub=ws?.sub.find(s=>s.id===viewId);
  document.getElementById('topbarTitle').textContent=sub?sub.label:(ws?.label||viewId);
  const sidebar=document.getElementById('sidebar');
  if(sidebar.classList.contains('mobile-open')){
    sidebar.classList.remove('mobile-open');
    document.getElementById('sidebarOverlay').classList.remove('open');
  }
  renderView(viewId);
}

function mobileNavClick(wsId){
  document.querySelectorAll('.mobile-nav-btn').forEach(b=>b.classList.remove('active'));
  document.querySelector(`.mobile-nav-btn[data-ws="${wsId}"]`)?.classList.add('active');
  const ws=NAV_STRUCTURE.find(w=>w.id===wsId);
  if(ws&&ws.sub.length>0)subClick(wsId,ws.sub[0].id);
  else wsClick(wsId,false);
}

function renderView(viewId){
  const map={
    'today':renderToday,
    'bookings':renderBookings,
    'calendar':renderCalendar,
    'finance-overview':renderFinanceOverview,
    'finance-expenses':renderExpenses,
    'finance-deposits':renderDeposits,
    'finance-platforms':renderPlatforms,
    'finance-owner-statements':renderOwnerStatements,
    'properties':renderProperties,
    'guests':renderGuests,
    'reports':renderReports,
    'system-guide':()=>{},
    'system-imports':populateBulkSelect,
    'system-trash':renderTrash,
    'system-settings':()=>{},
    'system-integrations':()=>{renderDriveStatus();renderSheetsStatus();},
    'users':renderUsers,
  };
  if(map[viewId])map[viewId]();
  populateSelects();
}

function buildPlatPickerOptions(){
  const list=document.getElementById('platPickerList');
  if(!list)return;
  const cur=document.getElementById('f-platform')?.value||'';
  list.innerHTML=`<div class="plat-picker-opt${!cur?' selected':''}" onclick="selectPlatform('')"><span style="color:var(--text-3)">Select\u2026</span></div>`
    +platforms.map(p=>`<div class="plat-picker-opt${cur===p.name?' selected':''}" onclick="selectPlatform('${esc(p.name)}')">${platformPillHtml(p.name)}</div>`).join('');
}
function togglePlatPicker(){
  const btn=document.getElementById('platPickerBtn');
  const list=document.getElementById('platPickerList');
  if(!btn||!list)return;
  const isOpen=list.classList.contains('open');
  list.classList.toggle('open',!isOpen);
  btn.classList.toggle('open',!isOpen);
}
function selectPlatform(name){
  const inp=document.getElementById('f-platform');
  if(inp)inp.value=name;
  const label=document.getElementById('platPickerLabel');
  const btn=document.getElementById('platPickerBtn');
  const list=document.getElementById('platPickerList');
  if(btn)btn.classList.remove('open');
  if(list)list.classList.remove('open');
  const pc=name?platformColor(name):'';
  if(label){
    if(name){
      label.innerHTML=pc
        ?`<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.55);flex-shrink:0"></span>${esc(name)}</span>`
        :platformPillHtml(name);
      label.style.color=pc?'#fff':'';
    } else {
      label.textContent='Select\u2026';
      label.style.color='var(--text-3)';
    }
  }
  // Full platform color fill — remove input-req (has !important bg) when selected
  if(btn){
    if(pc){
      btn.classList.remove('input-req');
      btn.style.background=pc;
      btn.style.borderColor=pc;
      btn.style.boxShadow=`0 0 0 3px ${pc}40`;
      btn.style.color='#fff';
    } else {
      btn.classList.add('input-req');
      btn.style.background='';
      btn.style.borderColor='';
      btn.style.boxShadow='';
      btn.style.color='';
    }
    const chev=btn.querySelector('.plat-picker-chevron');
    if(chev)chev.style.color=pc?'rgba(255,255,255,.7)':'';
  }
  buildPlatPickerOptions();
  updatePromoSpecialOfferState();
  updateContextStrip();
  calcFinancials();
  updateDrawerSummary();
}
// fromLoad=true: only update disabled/opacity states, never clear any values.
// Called with fromLoad=true during booking load so existing promo/specialOffer
// values are never zeroed by platform logic (they are restored explicitly after).
function updatePromoSpecialOfferState(fromLoad=false){
  const platName=(document.getElementById('f-platform')?.value||'').trim().toLowerCase();
  const isDirect=!platName||platName==='direct'||platName.startsWith('direct');
  const promoEl=document.getElementById('f-promo');
  const soEl=document.getElementById('f-specialoffer');
  if(promoEl){
    promoEl.disabled=!isDirect;
    promoEl.style.opacity=isDirect?'':'0.4';
    promoEl.style.cursor=isDirect?'':'not-allowed';
    // Clear ONLY on explicit user-driven platform change (never during load or _loadingDrawer)
    if(!fromLoad&&!_loadingDrawer&&!isDirect&&!promoEl.dataset.keepValue){promoEl.value=0;}
  }
  if(soEl){
    soEl.disabled=isDirect;
    soEl.style.opacity=isDirect?'0.4':'';
    soEl.style.cursor=isDirect?'not-allowed':'';
    if(!fromLoad&&!_loadingDrawer&&isDirect&&!soEl.dataset.keepValue){soEl.value=0;}
  }
  // Zero service fees only on active user-driven platform switch, never during load
  if(!fromLoad&&!_loadingDrawer&&isDirect){
    const _sf=document.getElementById('f-servicefee');
    if(_sf){delete _sf.dataset.manual;_sf.style.borderColor='';_sf.value=0;}
    const _sfr=document.getElementById('f-servicefee-reset');
    if(_sfr)_sfr.style.display='none';
    const _gsf=document.getElementById('f-guestservicefee');
    if(_gsf){delete _gsf.dataset.manual;_gsf.value=0;}
    calcFinancials();
  }
}
function setPlatPickerValue(name){
  // Normalize before setting so "Booking" becomes "Booking.com", etc.
  const norm=name?normPlatform(name):'';
  const inp=document.getElementById('f-platform');
  if(inp)inp.value=norm;
  const label=document.getElementById('platPickerLabel');
  const _pc=norm?platformColor(norm):'';
  if(label){
    if(norm){
      label.innerHTML=_pc
        ?`<span style="display:inline-flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.55);flex-shrink:0"></span>${esc(norm)}</span>`
        :platformPillHtml(norm);
      label.style.color=_pc?'#fff':'';
    } else {
      label.textContent='Select\u2026';
      label.style.color='var(--text-3)';
    }
  }
  const _btn=document.getElementById('platPickerBtn');
  if(_btn){
    if(_pc){
      _btn.classList.remove('input-req');
      _btn.style.background=_pc;
      _btn.style.borderColor=_pc;
      _btn.style.boxShadow=`0 0 0 3px ${_pc}40`;
      _btn.style.color='#fff';
    } else {
      _btn.classList.add('input-req');
      _btn.style.background='';
      _btn.style.borderColor='';
      _btn.style.boxShadow='';
      _btn.style.color='';
    }
    const _chev=_btn.querySelector('.plat-picker-chevron');
    if(_chev)_chev.style.color=_pc?'rgba(255,255,255,.7)':'';
  }
  buildPlatPickerOptions();
  updatePromoSpecialOfferState();
}
// Close picker when clicking outside
document.addEventListener('click',e=>{
  const wrap=document.getElementById('platPickerWrap');
  if(wrap&&!wrap.contains(e.target)){
    document.getElementById('platPickerList')?.classList.remove('open');
    document.getElementById('platPickerBtn')?.classList.remove('open');
  }
});
function populateSelects(){
  const prOpts='<option value="">Select…</option>'+properties.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  // Rebuild custom platform picker options (preserves current selection)
  buildPlatPickerOptions();
  const fProp=document.getElementById('f-property');if(fProp){const c=fProp.value;fProp.innerHTML=prOpts;if(c)fProp.value=c;}
  [['bk-prop',true],['cal-prop',true],['fin-prop',true],['rep-prop',true],['exp-prop',true]].forEach(([id,all])=>{
    const el=document.getElementById(id);if(!el)return;
    const c=el.value;
    el.innerHTML=(all?'<option value="all">All Properties</option>':'')+properties.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
    if(c)el.value=c;
  });
  [['bk-plat',true],['cal-plat',true],['rep-plat',true]].forEach(([id])=>{
    const el=document.getElementById(id);if(!el)return;
    const c=el.value;
    el.innerHTML='<option value="all">All Platforms</option>'+platforms.map(p=>`<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
    if(c)el.value=c;
  });
  const dates=bookings.map(b=>b.checkin).concat(expenses.map(e=>e.month||'')).filter(Boolean);
  const curMonth=todayISO().slice(0,7);
  const months=[...new Set([curMonth,...dates.map(d=>d.slice(0,7))])].sort().reverse();
  ['bk-month','exp-month','dep-month'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    const c=el.value;
    el.innerHTML='<option value="all">All Months</option>'+months.map(m=>`<option value="${m}">${fmtMonthYear(m+'-01')}</option>`).join('');
    if(c)el.value=c;
  });
  const feProp=document.getElementById('fe-prop');
  if(feProp){const c=feProp.value;feProp.innerHTML='<option value="all">All Properties</option>'+properties.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');if(c)feProp.value=c;}
}

// ============================================================
// LINKED PROPERTY GROUP — 2BR Aurora + 2BR Bliss + 4BR Twin Town Houses
// ISOLATED: only used in Today module rendering and booking drawer overlap warning.
// Does NOT affect finance, reports, calendar, booking save, or Sheets sync.
// ============================================================
function getLinkedSiblings(propId){
  const p=properties.find(x=>x.id===propId);
  if(!p)return[];
  const n=p.name.toLowerCase();
  const isTwin=n.includes('twin town');
  const isAurora=n.includes('aurora');
  const isBliss=n.includes('bliss');
  if(!isTwin&&!isAurora&&!isBliss)return[];
  if(isTwin){
    // 4BR links to both Aurora and Bliss
    return properties.filter(x=>x.id!==propId&&(x.name.toLowerCase().includes('aurora')||x.name.toLowerCase().includes('bliss'))).map(x=>x.id);
  }
  // Aurora or Bliss only links to 4BR — not to each other
  return properties.filter(x=>x.id!==propId&&x.name.toLowerCase().includes('twin town')).map(x=>x.id);
}

// ============================================================
// TODAY VIEW
// ============================================================
function renderToday(){
  _totalsCache=new Map();
  const today=todayISO();
  const now=new Date();
  const checkIns=bookings.filter(b=>b.checkin===today&&b.status!=='Cancelled');
  const checkOuts=bookings.filter(b=>b.checkout===today&&b.status!=='Cancelled');
  const active=bookings.filter(b=>b.status!=='Cancelled'&&b.checkin<=today&&b.checkout>today);
  const pending=bookings.filter(b=>b.status==='Pending');
  const mnth=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const monthRev=bookings.filter(b=>b.status!=='Cancelled'&&(b.checkin||'').startsWith(mnth)).reduce((s,b)=>s+calcTotals(b).netRevenue,0);

  // ── STAT PILLS (revenue-only) ─────────────────────────────────────────────────
  // ADR & RevPAR (YTD)
  const ytdBks=bookings.filter(b=>b.status!=='Cancelled'&&(b.checkin||'').startsWith(String(now.getFullYear())));
  const ytdNights=ytdBks.reduce((s,b)=>s+calcTotals(b).nights,0);
  const ytdRev=ytdBks.reduce((s,b)=>s+calcTotals(b).netRevenue,0);
  const adr=ytdNights?ytdRev/ytdNights:0;
  const daysElapsed=Math.max(1,Math.floor((now-new Date(now.getFullYear(),0,1))/86400000));
  const revpar=properties.length?ytdRev/(properties.length*daysElapsed):0;
  // Occupancy: booked nights this month / (props × days in month)
  const daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();
  const mStart=new Date(mnth+'-01');const mEnd=new Date(now.getFullYear(),now.getMonth()+1,0);
  let bookedNightsMonth=0;
  bookings.filter(b=>b.status!=='Cancelled').forEach(b=>{
    const ci=new Date(b.checkin+'T12:00:00'),co=new Date(b.checkout+'T12:00:00');
    const s=ci<mStart?mStart:ci,e=co>mEnd?mEnd:co;
    bookedNightsMonth+=Math.max(0,Math.ceil((e-s)/86400000));
  });
  const occupancy=Math.min(100,Math.round(bookedNightsMonth/(Math.max(1,properties.length)*daysInMonth)*100));
  document.getElementById('todayStats').innerHTML=`<div class="stats-scroll">
    <div class="today-stat-pill" style="background:#1E293B;min-width:130px"><div class="today-stat-pill-val" style="font-size:16px">${fmtMoney(monthRev)}</div><div class="today-stat-pill-lbl">Month Revenue</div></div>
    <div class="today-stat-pill" style="background:#0F766E;min-width:120px" title="Average Daily Rate (YTD net revenue ÷ booked nights)"><div class="today-stat-pill-val" style="font-size:16px">${fmtMoney(adr)}</div><div class="today-stat-pill-lbl">Avg Daily Rate</div></div>
    <div class="today-stat-pill" style="background:#4338CA;min-width:110px" title="RevPAR (YTD net revenue ÷ properties × days elapsed)"><div class="today-stat-pill-val" style="font-size:16px">${fmtMoney(revpar)}</div><div class="today-stat-pill-lbl">RevPAR</div></div>
    <div class="today-stat-pill" style="background:#0369A1;min-width:90px" title="% of available room-nights booked this month"><div class="today-stat-pill-val">${occupancy}%</div><div class="today-stat-pill-lbl">Occupancy</div></div>
  </div>`;

  // ── PROPERTY GRID ─────────────────────────────────────────────────────────────
  const today2=todayISO();
  const makeTpcPill=(b,isNow)=>{
    const c=platformColor(b.platform);
    const t=calcTotals(b);
    const isCI=b.checkin===today2;
    const lastNight=new Date(b.checkout+'T12:00:00');lastNight.setDate(lastNight.getDate()-1);
    const isCO=dateToISO(lastNight)===today2;
    const nightsLeft=isNow?Math.ceil((new Date(b.checkout)-new Date(today2))/86400000):0;
    const sd=d=>{const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
    const shortRange=`${sd(b.checkin)} – ${sd(b.checkout)}`;
    const bg=isNow?c:`${c}18`;
    const guestClr=isNow?'#fff':c;
    const subClr=isNow?'rgba(255,255,255,.78)':'#64748b';
    const amtClr=isNow?'#fff':c;
    // Active Stay tag: Check In (green) / Last Night (red) / Active Stay (dark) — row 1, right of guest name
    const todayLabel=isCI?'Check In':isCO?'Last Night':'Active Stay';
    const todayLabelBg=isCI?'#16a34a':isCO?'#dc2626':'rgba(0,0,0,.28)';
    const statusBadge=isNow?`<span style="font-size:9px;font-weight:800;padding:2px 6px;border-radius:8px;background:${todayLabelBg};color:#fff;white-space:nowrap;flex-shrink:0">${todayLabel}</span>`:'';
    const daysLeftTag=isNow?`<span style="font-size:9px;font-weight:700;color:${subClr};white-space:nowrap;flex-shrink:0">${nightsLeft}d left</span>`:'';
    return`<div style="background:${bg};border-radius:9px;padding:9px 12px;cursor:pointer;transition:filter .12s" onclick="event.stopPropagation();openBookingDrawer('${b.id}')">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="font-size:13px;font-weight:800;color:${guestClr};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0">${esc(b.guest)}</span>
        ${statusBadge}
      </div>
      <div style="display:flex;align-items:center;gap:5px;flex-wrap:nowrap">
        <span style="font-size:10px;font-weight:700;color:${subClr};white-space:nowrap;flex-shrink:0">${esc(b.platform)}</span>
        <span style="font-size:10px;color:${subClr};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0">· ${shortRange}</span>
        <span style="font-size:12px;font-weight:800;color:${amtClr};white-space:nowrap;flex-shrink:0">${fmtMoney(t.guestTotal)}</span>
        ${daysLeftTag}
      </div>
    </div>`;
  };
  // ── PROPERTY GRID — grouped by city ────────────────────────────────────────
  const sdShort=d=>{const dt=new Date(d+'T12:00:00');return dt.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
  // ── Linked booking pill (shown on sibling properties) ────────
  const linkedPill=(sibBk)=>{
    const sn=propName(sibBk.property);
    return`<div style="background:var(--surface-2);border:1.5px dashed var(--border);border-radius:9px;padding:9px 12px">
      <div style="font-size:12px;font-weight:800;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px">🔗 Occupied via ${esc(sn)}</div>
      <div style="font-size:10px;font-weight:700;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(sibBk.guest)} · ${sdShort(sibBk.checkin)} – ${sdShort(sibBk.checkout)}</div>
    </div>`;
  };

  const makeCard=p=>{
    const curStay=bookings.find(b=>b.property===p.id&&b.status!=='Cancelled'&&b.checkin<=today2&&b.checkout>today2);
    const upcoming=bookings.filter(b=>b.property===p.id&&b.status!=='Cancelled'&&b.checkin>today2).sort((a,b2)=>a.checkin.localeCompare(b2.checkin)).slice(0,3);
    const hasAnyBooking=!!(curStay||upcoming.length||bookings.some(b=>b.property===p.id&&b.status!=='Cancelled'));

    // ── Sibling (linked group) data ───────────────────────────
    const siblingIds=getLinkedSiblings(p.id);
    const sibBookings=siblingIds.length
      ?bookings.filter(b=>siblingIds.includes(b.property)&&b.status!=='Cancelled'&&b.checkout>today2)
      :[];
    const sibCurStay=sibBookings.find(b=>b.checkin<=today2&&b.checkout>today2)||null;

    // Sibling-aware gap pill: splits the window around sibling bookings
    // 4BR: blocked sub-periods → linked pill; free sub-periods → gap pill
    // Aurora/Bliss: blocked sub-periods → nothing; free sub-periods → gap pill
    const isCombinedUnit=p.name.toLowerCase().includes('twin town');
    const gapPillSib=(fromDate,toDate)=>{
      if(!sibBookings.length) return gapPill(fromDate,toDate);
      const overlapping=sibBookings
        .filter(b=>b.checkin<toDate&&b.checkout>fromDate)
        .sort((a,b)=>a.checkin.localeCompare(b.checkin));
      if(!overlapping.length) return gapPill(fromDate,toDate);
      const parts=[];
      let cursor=fromDate;
      for(const sib of overlapping){
        const freeEnd=sib.checkin>cursor?sib.checkin:cursor;
        if(cursor<freeEnd) parts.push(gapPill(cursor,freeEnd));
        if(isCombinedUnit) parts.push(linkedPill(sib));
        if(sib.checkout>cursor) cursor=sib.checkout;
      }
      if(cursor<toDate) parts.push(gapPill(cursor,toDate));
      return parts.join('');
    };
    const isOccupied=!!curStay;

    // Status pill (top of card)
    const occPill=`<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5;white-space:nowrap;flex-shrink:0"><span style="width:6px;height:6px;border-radius:50%;background:#dc2626;flex-shrink:0"></span>OCCUPIED</span>`;
    const availPill=`<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:800;padding:3px 9px;border-radius:20px;background:#dcfce7;color:#16a34a;border:1.5px solid #86efac;white-space:nowrap;flex-shrink:0"><span style="width:6px;height:6px;border-radius:50%;background:#16a34a;flex-shrink:0"></span>AVAILABLE</span>`;
    const linkedOccPill=sibCurStay?`<span style="display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:800;padding:3px 8px;border-radius:20px;background:#fee2e2;color:#dc2626;border:1.5px solid #fca5a5;white-space:nowrap;flex-shrink:0">🔗 OCCUPIED · via ${esc(propName(sibCurStay.property))}</span>`:null;
    const statusPill=isOccupied?occPill:(linkedOccPill||availPill);

    // ── Gap Days pill ─────────────────────────────────────────
    const gapPill=(fromDate,toDate)=>{
      const days=Math.round((new Date(toDate+'T12:00:00')-new Date(fromDate+'T12:00:00'))/86400000);
      if(days<=0)return'';
      const tight=days<5;
      const tip=tight?` · <span style="font-size:11px">💡</span> <span style="font-weight:900;color:#15803d;font-size:11px">Tight gap — offer 20% off on Airbnb</span>`:'';
      return`<div style="background:#f0fdf4;border-radius:9px;padding:9px 12px">
        <div style="font-size:13px;font-weight:800;color:#16a34a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:4px">GAP · ${days} day${days!==1?'s':''}</div>
        <div style="font-size:11px;font-weight:700;color:#16a34a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sdShort(fromDate)} → ${sdShort(toDate)}${tip}</div>
      </div>`;
    };

    // ── No Upcoming Bookings pill ─────────────────────────────
    // RED: property has zero bookings at all
    // GREY: has bookings but nothing after last one
    const noUpcomingPill=(afterDate,isRed)=>{
      if(isRed)return`<div style="background:#cc0000;border-radius:9px;padding:10px 13px;border:2px solid #a30000">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="width:9px;height:9px;border-radius:50%;background:#fff;flex-shrink:0;display:inline-block;box-shadow:0 0 0 3px rgba(255,255,255,.35);animation:pulse-dot 1.4s ease-in-out infinite"></span>
          <span style="font-size:12px;font-weight:900;color:#fff;letter-spacing:.5px;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.3)">⚠️ No Bookings Yet</span>
        </div>
        <div style="font-size:10px;color:rgba(255,255,255,.9);font-weight:700;padding-left:17px;text-shadow:0 1px 1px rgba(0,0,0,.2)">No reservations scheduled — add one now</div>
      </div>`;
      return`<div style="background:var(--surface-2);border-radius:9px;padding:8px 12px">
        <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
          <span style="width:8px;height:8px;border-radius:50%;background:var(--text-3);flex-shrink:0;display:inline-block"></span>
          <span style="font-size:11px;font-weight:700;color:var(--text-3);letter-spacing:.3px">No upcoming bookings</span>
        </div>
        <div style="font-size:10px;color:var(--text-3);padding-left:13px">Unoccupied after ${sdShort(afterDate)}</div>
      </div>`;
    };

    // ── Build chronological timeline ──────────────────────────
    const timelinePills=[];
    // If not directly occupied, show sibling current stay OR gap/noUpcoming
    if(!isOccupied){
      if(upcoming.length){
        timelinePills.push(gapPillSib(today2,upcoming[0].checkin));
      }else{
        timelinePills.push(noUpcomingPill(today2,!hasAnyBooking));
      }
    }
    // Current stay
    if(curStay)timelinePills.push(makeTpcPill(curStay,true));
    // Upcoming bookings + gaps between them
    upcoming.forEach((b,i)=>{
      const prevCheckout=i===0?(curStay?curStay.checkout:null):upcoming[i-1].checkout;
      if(prevCheckout&&prevCheckout<b.checkin){
        timelinePills.push(gapPillSib(prevCheckout,b.checkin));
      }
      timelinePills.push(makeTpcPill(b,false));
    });
    // After last upcoming: grey "no upcoming" (only if there's something before it)
    if(hasAnyBooking){
      const lastCheckout=upcoming.length?upcoming[upcoming.length-1].checkout:(curStay?curStay.checkout:null);
      if(lastCheckout){
        timelinePills.push(noUpcomingPill(lastCheckout,false));
      }
    }

    const pillsHtml=timelinePills.join('');

    // Monthly KPI stats for this property
    const mnthBks=bookings.filter(b=>b.property===p.id&&b.status!=='Cancelled'&&(b.checkin||'').startsWith(mnth));
    const mnthCount=mnthBks.length;
    const mnthNights=mnthBks.reduce((s,b)=>s+(calcTotals(b).nights||0),0);
    const mnthGross=mnthBks.reduce((s,b)=>s+calcTotals(b).guestTotal,0);
    const mnthLabel=new Date(mnth+'-02').toLocaleString('en-US',{month:'long',year:'numeric'});
    const kpiBox=(val,lbl)=>`<div style="flex:1;text-align:center;padding:7px 4px;background:var(--surface-2);border-radius:8px;min-width:0">
      <div style="font-size:15px;font-weight:800;color:var(--text);line-height:1.1">${val}</div>
      <div style="font-size:9px;font-weight:700;color:var(--text-3);letter-spacing:.5px;margin-top:2px;text-transform:uppercase">${lbl}</div>
    </div>`;
    const kpiRow=`<div style="margin-top:auto;padding-top:10px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <div style="flex:1;height:1px;background:rgba(0,0,0,.07)"></div>
        <span style="font-size:9px;font-weight:700;color:var(--text-3);letter-spacing:.6px;text-transform:uppercase;white-space:nowrap">${mnthLabel} only</span>
        <div style="flex:1;height:1px;background:rgba(0,0,0,.07)"></div>
      </div>
      <div style="display:flex;gap:6px">
        ${kpiBox(mnthCount,'Bookings')}
        ${kpiBox(mnthNights,'Nights')}
        ${kpiBox(mnthGross?fmtMoney(mnthGross):'—','Gross Rev')}
      </div>
    </div>`;
    return`<div class="today-prop-card" style="display:flex;flex-direction:column">
      <div style="margin-bottom:9px">
        <div style="display:flex;align-items:center;gap:7px;margin-bottom:6px;cursor:pointer" onclick="navigateTo('properties')">
          <div class="tpc-icon">${propIconHtml(p,15)}</div>
          <div style="font-size:18px;font-weight:800;color:var(--text);line-height:1.25;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(p.name)}</div>
        </div>
        <div>${statusPill}</div>
      </div>
      <div style="height:1px;background:rgba(0,0,0,.07);margin:0 0 9px"></div>
      <div style="display:flex;flex-direction:column;gap:6px">${pillsHtml}</div>
      ${kpiRow}
    </div>`;
  };
  // Group by city
  const citiesMap={};
  properties.forEach(p=>{const c=p.city||'Other';if(!citiesMap[c])citiesMap[c]=[];citiesMap[c].push(p);});
  const cityHtml=Object.entries(citiesMap).map(([city,props])=>{
    const propIds=props.map(p=>p.id);
    const cityMnthRev=bookings.filter(b=>propIds.includes(b.property)&&b.status!=='Cancelled'&&(b.checkin||'').startsWith(mnth)).reduce((s,b)=>s+calcTotals(b).netRevenue,0);
    const cityAllRev=bookings.filter(b=>propIds.includes(b.property)&&b.status!=='Cancelled').reduce((s,b)=>s+calcTotals(b).netRevenue,0);
    return`<div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <span style="font-size:18px;font-weight:800;color:var(--text);white-space:nowrap;flex-shrink:0">${esc(city)}</span>
        <span style="font-size:12px;font-weight:700;color:var(--green);white-space:nowrap;flex-shrink:0">${fmtMoney(cityMnthRev)} this month</span>
        <span style="font-size:12px;color:var(--text-3);white-space:nowrap;flex-shrink:0">· ${fmtMoney(cityAllRev)} all-time</span>
        <div style="flex:1;height:1px;background:var(--border);min-width:12px"></div>
        <span style="font-size:11px;color:var(--text-3)">${props.length} ${props.length===1?'property':'properties'}</span>
      </div>
      <div class="today-prop-grid">${props.map(makeCard).join('')}</div>
    </div>`;
  }).join('');

  document.getElementById('todaySections').innerHTML=properties.length?cityHtml:'';

  document.getElementById('todayTimeline').innerHTML='';

  // \u2500\u2500 Contract expiry alerts (P1-D) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  const expiring=properties.filter(p=>{
    if(!p.contractEnd)return false;
    const d=Math.ceil((new Date(p.contractEnd)-new Date(today))/86400000);
    return d<=90;
  }).sort((a,b)=>a.contractEnd.localeCompare(b.contractEnd));
  const contractAlertEl=document.getElementById('contractAlerts');
  if(contractAlertEl){
    if(expiring.length){
      contractAlertEl.innerHTML=expiring.map(p=>{
        const d=Math.ceil((new Date(p.contractEnd)-new Date(today))/86400000);
        const isExp=d<0;
        const cls=isExp?'danger':'warning';
        const icon=isExp?'\ud83d\udd34':'\u26a0\ufe0f';
        const msg=isExp?`Contract EXPIRED ${Math.abs(d)} day${Math.abs(d)!==1?'s':''} ago`:`Contract expires in ${d} day${d!==1?'s':''} (${fmtDate(p.contractEnd)})`;
        return`<div class="alert-bar show ${cls}" style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="openPropertyModal('${p.id}')">
          <span>${icon}</span><span style="flex:1"><strong>${esc(p.name)}</strong> \u2014 ${msg}</span>
          <span style="font-size:11px;opacity:.7">Tap to edit \u2192</span>
        </div>`;
      }).join('');
      contractAlertEl.style.display='';
    }else{contractAlertEl.innerHTML='';contractAlertEl.style.display='none';}
  }
}

// ============================================================
// BOOKINGS VIEW
// ============================================================
function clearBookingFilters(){
  ['bk-month','bk-prop','bk-plat','bk-status'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='all';});
  renderBookings();
}
function getFilteredBookings(){
  const m=document.getElementById('bk-month')?.value||'all';
  const pr=document.getElementById('bk-prop')?.value||'all';
  const pl=document.getElementById('bk-plat')?.value||'all';
  const st=document.getElementById('bk-status')?.value||'all';
  return bookings.filter(b=>{
    if(m!=='all'){const[y,mo]=m.split('-').map(Number);const d=new Date(b.checkin+'T12:00:00');if(d.getFullYear()!==y||d.getMonth()+1!==mo)return false;}
    if(pr!=='all'&&b.property!==pr)return false;
    if(pl!=='all'&&b.platform!==pl)return false;
    if(st!=='all'&&b.status!==st)return false;
    return true;
  }).sort((a,b)=>b.checkin.localeCompare(a.checkin));
}
function renderBookings(){
  _totalsCache=new Map();
  const list=getFilteredBookings();
  const cnt=document.getElementById('bkCount');
  if(cnt)cnt.textContent=`${list.length} booking${list.length!==1?'s':''}`;
  const isMobile=window.innerWidth<768;
  const cards=document.getElementById('bookingCards');
  const tblWrap=document.querySelector('#view-bookings .table-wrap');
  if(isMobile){
    if(tblWrap)tblWrap.style.display='none';
    if(cards){
      cards.style.display='block';
      if(!list.length){
        const hasFilters=document.getElementById('bk-month')?.value!=='all'||document.getElementById('bk-prop')?.value!=='all'||document.getElementById('bk-plat')?.value!=='all'||document.getElementById('bk-status')?.value!=='all';
        cards.innerHTML=bookings.length&&hasFilters
          ?`<div class="empty"><div class="empty-icon">\ud83d\udd0d</div><div class="empty-text">No bookings match your filters</div><button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="clearBookingFilters()">Clear filters</button></div>`
          :`<div class="empty"><div class="empty-icon">\ud83d\udccb</div><div class="empty-text">No bookings yet</div><div class="empty-sub">Start by adding your first booking</div><button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="openBookingDrawer()">\uff0b Add Booking</button></div>`;
        return;
      }
      cards.innerHTML=list.map(b=>{const t=calcTotals(b);const pc=propertyColor(b.property);
        return`<div class="bk-card-b" onclick="openBookingDrawer('${b.id}')" oncontextmenu="onBkRowContextMenu(event,'${b.id}')" ontouchstart="onBkRowTouchStart(event,'${b.id}')" ontouchend="onBkRowTouchEnd()" ontouchmove="onBkRowTouchEnd()">
          <div class="bk-card-band" style="background:${pc}"></div>
          <div class="bk-card-body">
            <div class="bk-card-prop" style="color:${pc}">${esc(propName(b.property))}</div>
            <div class="bk-card-guest">${esc(b.guest)}${isRepeat(b.guest)?'<span class="badge badge-purple" style="margin-left:6px;font-size:9px">REPEAT</span>':''}</div>
            <div class="bk-card-dates">${fmtDate(b.checkin)} \u2192 ${fmtDate(b.checkout)}</div>
            <div class="bk-card-footer">
              <div class="bk-revenue-box" style="background:${pc}18">
                <span class="bk-revenue-amt" style="color:${pc}">${fmtMoney(t.netRevenue)}</span>
                <span class="bk-revenue-nights"> \u00b7 ${t.nights}N</span>
              </div>
              ${platformPillHtml(b.platform)}${statusBadgeHtml(b.status)}
              <button class="btn btn-ghost btn-sm" style="margin-left:auto;font-size:11px;padding:2px 7px" onclick="cloneBooking('${b.id}',event)" title="Clone booking">\u2398</button>
            </div>
          </div>
        </div>`;}).join('');
    }
    return;
  }
  if(tblWrap)tblWrap.style.display='';
  if(cards)cards.style.display='none';
  const tbody=document.getElementById('bookingsTbody');
  if(!list.length){
    const hasFilters=document.getElementById('bk-month')?.value!=='all'||document.getElementById('bk-prop')?.value!=='all'||document.getElementById('bk-plat')?.value!=='all'||document.getElementById('bk-status')?.value!=='all';
    tbody.innerHTML=`<tr><td colspan="29"><div class="empty">${bookings.length&&hasFilters
      ?`<div class="empty-icon">🔍</div><div class="empty-text">No bookings match your filters</div><button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="clearBookingFilters()">Clear filters</button>`
      :`<div class="empty-icon">📋</div><div class="empty-text">No bookings yet</div><div class="empty-sub">Start by adding your first booking</div><button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="openBookingDrawer()">＋ Add Booking</button>`
    }</div></td></tr>`;return;
  }
  tbody.innerHTML=list.map(b=>{
    const t=calcTotals(b);const pc=propertyColor(b.property);
    const td=tasksDone(b),tt=tasksTotal();
    const conflict=hasConflict(b);
    const svcFee=b.serviceFee||0;
    const cleanFee=b.cleaningFee||0;
    const storeSales=b.storeSales||0;
    const platComm=b.platformCommission??t.platFee;
    const extraG=b.extraGuests??t.extraG;
    const extraFeeAmt=b.extraGuestFee??t.extraFee;
    const adjTotal=t.adjTotal||0;
    const adjLabel=adjTotal?(adjTotal>0?`+${fmtMoney(adjTotal)}`:`−${fmtMoney(Math.abs(adjTotal))}`):'—';
    const adjColor=adjTotal>0?'var(--green)':adjTotal<0?'var(--red)':'';
    const dc=n=>`data-col="${n}"`; // shorthand for data-col attribute on td
    const isSel=_bulkSelected.has(b.id);
    return`<tr${conflict?' style="background:var(--orange-bg)"':''} onclick="openBookingDrawer('${b.id}')" data-bid="${b.id}" oncontextmenu="onBkRowContextMenu(event,'${b.id}')" ontouchstart="onBkRowTouchStart(event,'${b.id}')" ontouchend="onBkRowTouchEnd()" ontouchmove="onBkRowTouchEnd()">
      <td class="bulk-check-cell" onclick="event.stopPropagation()"><input type="checkbox" class="bulk-cb" data-bid="${b.id}" ${isSel?'checked':''} onchange="toggleBulkSelect('${b.id}',this.checked)"></td>
      <td class="col-stripe"><div class="col-stripe-bar" style="background:${pc}"></div></td>
      <td ${dc('checkin')} style="white-space:nowrap">${fmtDate(b.checkin)}</td>
      <td ${dc('checkout')} style="white-space:nowrap">${fmtDate(b.checkout)}</td>
      <td ${dc('nights')}><strong>${t.nights}</strong></td>
      <td ${dc('platform')}>${platformPillHtml(b.platform)}</td>
      <td ${dc('guest')} style="white-space:nowrap"><strong>${esc(b.guest)}</strong>${isRepeat(b.guest)?'<span class="badge badge-purple" style="margin-left:4px;font-size:9px">REPEAT</span>':''}</td>
      <td ${dc('property')} style="color:${pc};font-weight:600;white-space:nowrap">${esc(propName(b.property))}</td>
      <td ${dc('rate')}>${fmtMoney(b.rate)}</td>
      <td ${dc('promo')} style="color:var(--purple);font-weight:700">${b.promo?`−${fmtMoney(b.promo)}`:'—'}</td>
      <td ${dc('specialpromo')} style="color:var(--purple);font-weight:700">${b.specialOffer?`−${fmtMoney(b.specialOffer)}`:'—'}</td>
      <td ${dc('bookingfee')}>${fmtMoney(t.bkFee)}</td>
      <td ${dc('servicefee')}>${svcFee?fmtMoney(svcFee):'—'}</td>
      <td ${dc('extraguests')}>${extraG||'—'}</td>
      <td ${dc('extrafee')}>${extraFeeAmt?fmtMoney(extraFeeAmt):'—'}</td>
      <td ${dc('adjustments')} style="color:${adjColor};font-weight:600">${adjLabel}</td>
      <td ${dc('platcomm')} style="color:var(--red)">${platComm?`−${fmtMoney(platComm)}`:'—'}</td>
      <td ${dc('totalcharged')} style="font-weight:600">${fmtMoney(t.guestTotal)}</td>
      <td ${dc('netrevenue')}><strong style="color:var(--green)">${fmtMoney(t.netRevenue)}</strong></td>
      <td ${dc('storesales')}>${storeSales?`<span style="color:var(--green)">+${fmtMoney(storeSales)}</span>`:'—'}</td>
      <td ${dc('cleaningfee')}>${cleanFee?`<span style="color:var(--red)">−${fmtMoney(cleanFee)}</span>`:'—'}</td>
      <td ${dc('deposit')}>${b.deposit?fmtMoney(b.deposit):'—'}</td>
      <td ${dc('depcollected')}><span style="color:${b.depositCollected?'var(--green)':'var(--text-3)'}">${b.depositCollected?'Yes':'—'}</span></td>
      <td ${dc('deprefunded')}><span style="color:${b.depositRefunded?'var(--green)':'var(--text-3)'}">${b.depositRefunded?'Yes':'—'}</span></td>
      <td ${dc('guestcount')}>${b.guestCount>1?b.guestCount:'—'}</td>
      <td ${dc('notes')} style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-2);font-size:11px">${esc(b.notes||'—')}</td>
      <td ${dc('payment')} style="white-space:nowrap">${esc(b.payment||'—')}</td>
      <td ${dc('status')}>${statusBadgeHtml(b.status)}</td>
      <td ${dc('tasks')}><span style="font-size:11px;color:${td===tt?'var(--green)':'var(--text-3)'}">${td}/${tt}</span></td>
      <td onclick="event.stopPropagation()" style="white-space:nowrap"><button class="btn btn-ghost btn-sm" onclick="openBookingDrawer('${b.id}')" title="Edit">&#x270e;</button><button class="btn btn-ghost btn-sm" style="margin-left:2px" onclick="cloneBooking('${b.id}',event)" title="Clone booking">⎘</button></td>
    </tr>`;
  }).join('');
  applyColVisibility();
}

// ============================================================
// BULK ACTIONS
// ============================================================
function toggleBulkSelect(id,checked){
  if(checked)_bulkSelected.add(id);else _bulkSelected.delete(id);
  updateBulkBar();
}
function toggleSelectAll(cb){
  const all=document.querySelectorAll('.bulk-cb');
  all.forEach(c=>{c.checked=cb.checked;if(cb.checked)_bulkSelected.add(c.dataset.bid);else _bulkSelected.delete(c.dataset.bid);});
  updateBulkBar();
}
function updateBulkBar(){
  const bar=document.getElementById('bulkActionBar');if(!bar)return;
  const n=_bulkSelected.size;
  if(n===0){bar.classList.remove('show');return;}
  bar.classList.add('show');
  const lbl=bar.querySelector('#bulkCountLbl');
  if(lbl)lbl.textContent=`${n} booking${n!==1?'s':''} selected`;
}
function clearBulkSelection(){
  _bulkSelected.clear();
  document.querySelectorAll('.bulk-cb').forEach(c=>c.checked=false);
  const sa=document.getElementById('bulkSelectAll');if(sa)sa.checked=false;
  updateBulkBar();
}
function bulkSetStatus(status){
  if(!_bulkSelected.size)return;
  const ids=[..._bulkSelected];
  confirmDialog(`Set ${ids.length} booking${ids.length!==1?'s':''} to "${status}"?`,
    `This will update the status for all selected bookings.`,null,()=>{
      ids.forEach(id=>{const b=bookings.find(x=>x.id===id);if(b)b.status=status;});
      saveAll();renderBookings();clearBulkSelection();
      toast(`${ids.length} booking${ids.length!==1?'s':''} updated to ${status}.`,'success');
    });
}
function bulkExportCSV(){
  if(!_bulkSelected.size)return;
  const ids=[..._bulkSelected];
  const rows=ids.map(id=>{const b=bookings.find(x=>x.id===id);if(!b)return null;const t=calcTotals(b);
    return[b.id,b.guest,propName(b.property),b.checkin,b.checkout,t.nights,b.platform,b.rate,b.promo||0,b.cleaningFee||0,t.guestTotal,t.netRevenue,b.status].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',');
  }).filter(Boolean);
  const header='"ID","Guest","Property","Check-in","Check-out","Nights","Platform","Rate","Promo","Cleaning","Total Charged","Net Revenue","Status"';
  const csv=[header,...rows].join('\n');
  const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  a.download=`bloomstone-export-${new Date().toISOString().slice(0,10)}.csv`;a.click();
  toast(`Exported ${rows.length} booking${rows.length!==1?'s':''} to CSV.`,'success');
}
function bulkDelete(){
  if(!_bulkSelected.size)return;
  const ids=[..._bulkSelected];
  confirmDialog(`Delete ${ids.length} booking${ids.length!==1?'s':''}?`,
    `<b style="color:var(--red)">This cannot be undone.</b> All selected bookings will be permanently removed.`,
    '🗑️',()=>{
      bookings=bookings.filter(b=>!ids.includes(b.id));
      saveAll();renderBookings();clearBulkSelection();
      toast(`${ids.length} booking${ids.length!==1?'s':''} deleted.`,'success');
    },{confirmLabel:'Delete',btnClass:'btn-danger'});
}

// ============================================================
// COLUMN PICKER
// ============================================================
const COL_ALL=[
  {id:'checkin',label:'Check-in',def:true},
  {id:'checkout',label:'Check-out',def:true},
  {id:'nights',label:'Nights',def:true},
  {id:'platform',label:'Platform',def:true},
  {id:'guest',label:'Guest',def:true},
  {id:'property',label:'Property',def:true},
  {id:'netrevenue',label:'Net Revenue',def:true},
  {id:'status',label:'Status',def:true},
  {id:'rate',label:'Rate',def:false},
  {id:'promo',label:'Promo',def:false},
  {id:'specialpromo',label:'Special Promo',def:false},
  {id:'bookingfee',label:'Booking Fee',def:false},
  {id:'servicefee',label:'Service Fee',def:false},
  {id:'extraguests',label:'Extra Guests',def:false},
  {id:'extrafee',label:'Extra Fee',def:false},
  {id:'adjustments',label:'Adjustments',def:false},
  {id:'platcomm',label:'Platform Comm',def:false},
  {id:'totalcharged',label:'Total Charged',def:false},
  {id:'storesales',label:'Store Sales',def:false},
  {id:'cleaningfee',label:'Cleaning Fee',def:false},
  {id:'deposit',label:'Deposit',def:false},
  {id:'depcollected',label:'Dep Collected',def:false},
  {id:'deprefunded',label:'Dep Refunded',def:false},
  {id:'guestcount',label:'Guest Count',def:false},
  {id:'notes',label:'Notes',def:false},
  {id:'payment',label:'Payment',def:false},
  {id:'tasks',label:'Tasks',def:false},
];
function loadColPrefs(){
  try{return JSON.parse(localStorage.getItem('bk_col_prefs'))||null;}catch(e){return null;}
}
function saveColPrefs(prefs){localStorage.setItem('bk_col_prefs',JSON.stringify(prefs));}
function getVisibleCols(){
  const saved=loadColPrefs();
  if(saved)return saved;
  return COL_ALL.reduce((o,c)=>{o[c.id]=c.def;return o;},{});
}
function applyColVisibility(){
  const vis=getVisibleCols();
  const table=document.getElementById('bookingsTable');
  if(!table)return;
  COL_ALL.forEach(c=>{
    const show=vis[c.id]!==false;
    table.querySelectorAll(`[data-col="${c.id}"]`).forEach(el=>{
      el.classList.toggle('col-hidden',!show);
    });
  });
}
function toggleColPicker(){
  const vis=getVisibleCols();
  const body=document.getElementById('colPickerBody');
  if(!body)return;
  body.innerHTML=COL_ALL.map(c=>`
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;user-select:none">
      <input type="checkbox" id="colck_${c.id}" ${vis[c.id]!==false?'checked':''}
        onchange="toggleOneCol('${c.id}',this.checked)" style="width:15px;height:15px;cursor:pointer"/>
      ${c.label}
    </label>`).join('');
  openModal('colPickerModal');
}
function toggleOneCol(id,show){
  const vis=getVisibleCols();
  vis[id]=show;
  saveColPrefs(vis);
  applyColVisibility();
}
function resetColPicker(){
  localStorage.removeItem('bk_col_prefs');
  // re-render checkboxes
  const vis=getVisibleCols();
  COL_ALL.forEach(c=>{
    const el=document.getElementById(`colck_${c.id}`);
    if(el)el.checked=vis[c.id]!==false;
  });
  applyColVisibility();
}

// ============================================================
// BOOKING DRAWER
// ============================================================
function updateDrawerSummary(){
  // Option B: Accent bar uses property color (identity)
  const propId=document.getElementById('f-property')?.value||'';
  const platName=document.getElementById('f-platform')?.value||'';
  // Status badge in header
  const badgeEl=document.getElementById('drawerStatusBadge');
  if(badgeEl){
    const status=document.getElementById('f-status')?.value||'';
    const ci=document.getElementById('f-checkin')?.value||'';
    const co=document.getElementById('f-checkout')?.value||'';
    const today=todayISO();
    let badge='';
    const lastNightD=co?(()=>{const d=new Date(co+'T12:00:00');d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);})():'';
    if(status==='Cancelled')badge='<span class="badge badge-red">Cancelled</span>';
    else if(co&&co<today)badge='<span class="badge badge-neutral">✓ Checked Out</span>';
    else if(co&&co===today)badge='<span class="badge badge-orange">Checking Out Today</span>';
    else if(ci&&ci===today&&co&&co>today)badge='<span class="badge badge-green">↓ Check In</span>';
    else if(ci&&ci<today&&co&&co>today&&lastNightD===today)badge='<span class="badge badge-red">Last Night</span>';
    else if(ci&&ci<=today&&co&&co>today)badge='<span class="badge badge-blue">Active Stay</span>';
    badgeEl.innerHTML=badge;
  }
  updateDrawerProfile();
  updateDateRangeDisplay();
}
function openBookingDrawer(id=null){
  editingBookingId=id;
  drawerUnsaved=false;
  _currentDraftId=null; // reset; openDraftInDrawer sets it back after this
  populateSelects();
  const isNew=!id;
  document.getElementById('drawerTitle').textContent=isNew?'New Booking':'Edit Booking';
  document.getElementById('drawerDeleteBtn').style.display=isNew?'none':'';
  document.getElementById('drawerSaveBtn').style.display='';
  document.getElementById('drawerSaveBtn').textContent=isNew?'\u2713 Save Booking':'\u270e Update Booking';
  document.getElementById('drawerCancelBtn').textContent='Cancel';
  ['f-checkin','f-checkout','f-guest','f-rate','f-notes'].forEach(k=>{const el=document.getElementById(k);if(el)el.value=''});
  dpSyncFromHidden(); // reset date picker triggers to blank
  // promo + servicefee intentionally left blank so yellow highlight prompts user
  ['f-promo','f-specialoffer'].forEach(k=>{const el=document.getElementById(k);if(el){el.value='';el.classList.remove('error');}});
  // Clear service fee and remove manual flag
  const _svcEl=document.getElementById('f-servicefee');
  if(_svcEl){_svcEl.value='';_svcEl.classList.remove('error');delete _svcEl.dataset.manual;_svcEl.style.borderColor='';}
  const _svcRstBtn=document.getElementById('f-servicefee-reset');
  if(_svcRstBtn)_svcRstBtn.style.display='none';
  // Clear guest service fee and remove manual flag
  const _gsfEl=document.getElementById('f-guestservicefee');
  if(_gsfEl){_gsfEl.value=0;delete _gsfEl.dataset.manual;}
  ['f-store','f-cleaning','f-extraguests'].forEach(k=>{const el=document.getElementById(k);if(el)el.value=0;});
  const _gcEl=document.getElementById('f-guestcount');if(_gcEl)_gcEl.value=1;
  const _gpEl=document.getElementById('f-guestprefs');if(_gpEl)_gpEl.value='';
  document.getElementById('f-deposit').value=0;
  document.getElementById('f-dep-refunded-amt').value=0;
  _currentAdjustments=[];
  setPlatPickerValue('');
  document.getElementById('f-property').value='';
  document.getElementById('f-status').value='Confirmed';
  applyStatusColor(document.getElementById('f-status'));
  document.getElementById('f-payment').value='Platform (Auto)';
  document.getElementById('f-dep-collected').value='';
  document.getElementById('f-dep-refunded').value='';
  document.getElementById('f-nights').value='';
  document.getElementById('overlapAlert').classList.remove('show');
  if(id){
    addCmdRecent(id);
    const b=bookings.find(x=>x.id===id);
    if(b){
      _loadingDrawer=true; // prevent side-effect functions from overwriting saved values
      try{
        document.getElementById('f-checkin').value=b.checkin||'';
        document.getElementById('f-checkout').value=b.checkout||'';
        dpSyncFromHidden(); // update date picker trigger display
        document.getElementById('f-guest').value=b.guest||'';
        setPlatPickerValue(b.platform||'');
        document.getElementById('f-property').value=b.property||'';
        document.getElementById('f-rate').value=b.rate??'';
        const promoEl=document.getElementById('f-promo');
        if(promoEl){promoEl.value=b.promo??0;promoEl.classList.remove('error');}
        const soEl=document.getElementById('f-specialoffer');
        if(soEl){soEl.value=b.specialOffer??0;soEl.classList.remove('error');}
        // bookingFee auto-calculated; mark fees as manual ONLY when non-zero so
        // calcFinancials() can auto-populate from platform commission when the stored
        // value is 0 (avoids "Host Service Fee shows dash despite platform having commission" bug)
        const svcEl=document.getElementById('f-servicefee');
        if(svcEl){
          svcEl.value=b.serviceFee??0;svcEl.classList.remove('error');svcEl.style.borderColor='';
          if((+b.serviceFee||0)>0){svcEl.dataset.manual='loaded';}else{delete svcEl.dataset.manual;}
        }
        const svcRstBtn=document.getElementById('f-servicefee-reset');
        if(svcRstBtn)svcRstBtn.style.display='none';
        const gsfEl=document.getElementById('f-guestservicefee');
        if(gsfEl){
          gsfEl.value=b.guestServiceFee??0;
          if((+b.guestServiceFee||0)>0){gsfEl.dataset.manual='loaded';}else{delete gsfEl.dataset.manual;}
        }
        document.getElementById('f-extraguests').value=b.extraGuests??0;
        document.getElementById('f-store').value=b.storeSales??0;
        document.getElementById('f-cleaning').value=b.cleaningFee??0;
        document.getElementById('f-deposit').value=b.deposit??0;
        document.getElementById('f-dep-refunded-amt').value=b.depositRefunded?(b.depositRefundedAmt||0):0;
        document.getElementById('f-status').value=b.status||'Confirmed';
        applyStatusColor(document.getElementById('f-status'));
        document.getElementById('f-payment').value=b.payment||'Platform (Auto)';
        document.getElementById('f-notes').value=b.notes||'';
        const gcEl=document.getElementById('f-guestcount');
        if(gcEl)gcEl.value=b.guestCount??1;
        const gpEl=document.getElementById('f-guestprefs');
        if(gpEl)gpEl.value=b.guestPrefs||'';
        document.getElementById('f-dep-collected').value=(+b.deposit||0)>0?'1':(b.depositCollected?'1':'');
        document.getElementById('f-dep-refunded').value=b.depositRefunded?'1':'';
        _currentAdjustments=(b.adjustments||[]).map(a=>({...a}));
      }finally{_loadingDrawer=false;}
      updatePromoSpecialOfferState(true); // fromLoad=true — only update UI states, never clear values
      onDatesChange();onPropertyChange();
      // ── Restore all fields that side-effect functions may have overwritten ──
      // updatePromoSpecialOfferState() clears f-promo for non-Direct platforms and
      // f-specialoffer for Direct platform. onPropertyChange() overwrites f-rate with
      // prop.baseRate and may cap f-extraguests. All must be restored from the booking.
      const _rateEl=document.getElementById('f-rate');
      if(_rateEl)_rateEl.value=b.rate??'';
      const _promoEl=document.getElementById('f-promo');
      if(_promoEl){_promoEl.value=b.promo??0;_promoEl.classList.remove('error');}
      const _soEl=document.getElementById('f-specialoffer');
      if(_soEl){_soEl.value=b.specialOffer??0;_soEl.classList.remove('error');}
      const _egEl=document.getElementById('f-extraguests');
      if(_egEl)_egEl.value=b.extraGuests??0;
      // Restore payment — the 20s background Sheets poll can overwrite the booking
      // object while the drawer is open; guard against it reverting to empty/default
      const _payEl=document.getElementById('f-payment');
      if(_payEl)_payEl.value=b.payment||'Platform (Auto)';
      calcFinancials();
      updateDrawerSummary();
      renderDrawerHistory(b);updateDrawerProfile(b.guest);
      const _guestBkCount=bookings.filter(x=>x.id!==b.id&&(x.guest||'').toLowerCase().trim()===(b.guest||'').toLowerCase().trim()).length;
      const _hc=document.getElementById('drawerHistoryCount');
      if(_hc){if(_guestBkCount>0){_hc.textContent=_guestBkCount+' booking'+(_guestBkCount!==1?'s':'');_hc.style.display='inline';}else{_hc.style.display='none';}}
      renderAdjustments();
    }
  }else{
    const _hc2=document.getElementById('drawerHistoryCount');if(_hc2)_hc2.style.display='none';
    const recent=bookings.slice().sort((a,b)=>(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||'')).slice(0,4);
    document.getElementById('drawerHistory').innerHTML=recent.length?
      '<div style="font-size:11px;font-weight:700;color:var(--text-3);margin-bottom:6px">Recent bookings:</div>'+
      recent.map(b=>`<div style="display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer" onclick="closeDrawer();setTimeout(()=>openBookingDrawer('${b.id}'),150)">
        <div style="width:5px;height:22px;border-radius:2px;background:${propertyColor(b.property)};flex-shrink:0"></div>
        <div style="flex:1;font-size:11px"><strong>${esc(b.guest)}</strong> · <span style="color:${propertyColor(b.property)};font-weight:600">${esc(propName(b.property))}</span> · ${fmtDate(b.checkin)}</div>
        ${statusBadgeHtml(b.status)}</div>`).join('')
      :'<div style="color:var(--text-3);font-size:12px">New booking — no history yet</div>';
    renderAdjustments();
  }
  updateDrawerSummary();
  updateStoreSalesState();
  calcFinancials();
  document.getElementById('drawerBody')?.scrollTo(0,0);
  document.getElementById('bookingDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  document.body.style.overflow='hidden';
}

function closeDrawer(){
  document.getElementById('bookingDrawer').classList.remove('open');
  document.getElementById('drawerOverlay').classList.remove('open');
  document.body.style.overflow='';
}

function cloneBooking(id,ev){
  if(ev)ev.stopPropagation();
  const src=bookings.find(x=>x.id===id);if(!src)return;
  openBookingDrawer(); // open fresh new-booking drawer
  // Pre-fill fields from source booking (dates intentionally left blank)
  _loadingDrawer=true;
  try{
    document.getElementById('f-guest').value=src.guest||'';
    setPlatPickerValue(src.platform||'');
    document.getElementById('f-property').value=src.property||'';
    document.getElementById('f-rate').value=src.rate??'';
    const promoEl=document.getElementById('f-promo');if(promoEl)promoEl.value=src.promo??0;
    const soEl=document.getElementById('f-specialoffer');if(soEl)soEl.value=src.specialOffer??0;
    const svcEl=document.getElementById('f-servicefee');
    if(svcEl){
      svcEl.value=src.serviceFee??0;
      if((+src.serviceFee||0)>0){svcEl.dataset.manual='loaded';}else{delete svcEl.dataset.manual;}
    }
    const gsfEl=document.getElementById('f-guestservicefee');
    if(gsfEl){
      gsfEl.value=src.guestServiceFee??0;
      if((+src.guestServiceFee||0)>0){gsfEl.dataset.manual='loaded';}else{delete gsfEl.dataset.manual;}
    }
    document.getElementById('f-extraguests').value=src.extraGuests??0;
    document.getElementById('f-cleaning').value=src.cleaningFee??0;
    const gcEl=document.getElementById('f-guestcount');if(gcEl)gcEl.value=src.guestCount??1;
    const gpEl=document.getElementById('f-guestprefs');if(gpEl)gpEl.value=src.guestPrefs||'';
    document.getElementById('f-payment').value=src.payment||'Platform (Auto)';
    document.getElementById('f-status').value='Confirmed';
    applyStatusColor(document.getElementById('f-status'));
  }finally{_loadingDrawer=false;}
  calcFinancials();updateDrawerSummary();updateDrawerProfile(src.guest||'');
  toast(`Cloned from ${src.guest||'booking'} — set new dates to save.`,'info');
}

function toggleTask(key){
  if(!editingBookingId)return;
  const b=bookings.find(x=>x.id===editingBookingId);if(!b)return;
  if(!b.tasks)b.tasks={};
  b.tasks[key]=!b.tasks[key];
  saveAll();
}

// ── Adjustments ───────────────────────────────────────────────
function renderAdjustments(){
  const el=document.getElementById('adjList');if(!el)return;
  if(!_currentAdjustments.length){
    el.innerHTML='<div style="font-size:12px;color:var(--text-3);padding:4px 0 6px">No adjustments. Use buttons below to add.</div>';
    return;
  }
  el.innerHTML=_currentAdjustments.map((a,i)=>`
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
      <input class="input" style="flex:1;font-size:13px" value="${esc(a.desc)}" placeholder="e.g. Extra guest night 3–5"
             oninput="_currentAdjustments[${i}].desc=this.value"/>
      <input class="input" type="number" style="width:110px;font-size:13px" value="${a.amount||''}" placeholder="₱ 0"
             oninput="_currentAdjustments[${i}].amount=+this.value;calcFinancials()"/>
      <button class="btn-icon btn-sm" onclick="removeAdj(${i})" title="Remove">×</button>
    </div>`).join('');
}
function addAdjustment(desc){
  _currentAdjustments.push({id:'adj_'+Date.now(),desc:desc||'',amount:0});
  renderAdjustments();calcFinancials();
  setTimeout(()=>{
    const rows=document.querySelectorAll('#adjList .input');
    if(rows.length){const last=rows[rows.length-2];last?.focus();if(desc&&last)last.select();}
  },40);
}
function removeAdj(i){
  _currentAdjustments.splice(i,1);
  renderAdjustments();calcFinancials();
}

function renderDrawerHistory(b){
  const lines=[];
  if(b.createdAt)lines.push(`Created: ${new Date(b.createdAt).toLocaleString()}`);
  if(b.updatedAt)lines.push(`Last updated: ${new Date(b.updatedAt).toLocaleString()}`);
  document.getElementById('drawerHistory').innerHTML=lines.map(l=>`<div>${l}</div>`).join('');
}

document.getElementById('drawerCloseBtn').addEventListener('click',closeDrawer);
document.getElementById('drawerOverlay').addEventListener('click',closeDrawer);
document.getElementById('drawerCancelBtn').addEventListener('click',closeDrawer);
document.getElementById('drawerSaveBtn').addEventListener('click',saveBooking);
document.getElementById('drawerDeleteBtn').addEventListener('click',()=>deleteBooking(editingBookingId));
// ── Guest name suggestions ────────────────────────────────
let _pendingSuggestName=null;

function _knownGuests(){
  const seen=new Map();
  bookings.slice().sort((a,b)=>(b.checkin||'').localeCompare(a.checkin||'')).forEach(b=>{
    if(b.guest&&!seen.has(b.guest.toLowerCase()))seen.set(b.guest.toLowerCase(),b);
  });
  return[...seen.values()];
}

function showGuestSuggestions(query){
  const box=document.getElementById('guestSuggestBox');
  if(!box)return;
  const q=query.trim().toLowerCase();
  if(q.length<2){box.style.display='none';return;}
  const matches=_knownGuests().filter(b=>b.guest.toLowerCase().includes(q)&&b.guest.toLowerCase()!==q);
  if(!matches.length){box.style.display='none';return;}
  box.style.display='block';
  box.innerHTML=matches.slice(0,6).map(b=>{
    const stays=bookings.filter(x=>x.guest===b.guest&&x.status!=='Cancelled').length;
    const last=fmtDate(b.checkin);
    const safeQ=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const hi=b.guest.replace(new RegExp('('+safeQ+')','gi'),'<mark style="background:rgba(251,191,36,.4);border-radius:2px;padding:0 2px">$1</mark>');
    return`<div class="guest-suggest-item" onmousedown="event.preventDefault()" onclick="pendingGuestSuggest('${esc(b.guest)}')"><span class="gs-name">${hi}</span><span class="gs-meta">${stays} stay${stays!==1?'s':''} \u00b7 Last ${last}</span></div>`;
  }).join('');
}

function pendingGuestSuggest(name){
  const box=document.getElementById('guestSuggestBox');
  if(box)box.style.display='none';
  _pendingSuggestName=name;
  const banner=document.getElementById('guestConfirmBanner');
  const label=document.getElementById('guestConfirmName');
  if(banner&&label){label.textContent=name;banner.style.display='flex';}
}

function confirmGuestSuggest(){
  const inp=document.getElementById('f-guest');
  if(inp&&_pendingSuggestName)inp.value=_pendingSuggestName;
  const pos=_pendingSuggestName;
  dismissGuestConfirm();
  updateDrawerProfile(pos||'');
  updateDrawerSummary();
  _pendingSuggestName=null;
}

function dismissGuestConfirm(){
  const banner=document.getElementById('guestConfirmBanner');
  if(banner)banner.style.display='none';
  _pendingSuggestName=null;
}

document.getElementById('f-guest').addEventListener('input',e=>{
  const pos=e.target.selectionStart;
  e.target.value=properCase(e.target.value);
  try{e.target.setSelectionRange(pos,pos);}catch(_){}
  showGuestSuggestions(e.target.value);
  dismissGuestConfirm();
  updateDrawerProfile(e.target.value);
  updateDrawerSummary();
  scheduleDraftSave();
});
document.getElementById('f-guest').addEventListener('blur',()=>{
  setTimeout(()=>{const box=document.getElementById('guestSuggestBox');if(box)box.style.display='none';},180);
});
document.getElementById('f-status').addEventListener('change',e=>{applyStatusColor(e.target);updateDrawerSummary();});
// F6: Trigger guest count warning check when user changes the guest count field
document.getElementById('f-guestcount')?.addEventListener('input',()=>{onPropertyChange();});

function onDatesChange(){
  const ci=document.getElementById('f-checkin').value;
  const co=document.getElementById('f-checkout').value;
  const nf=document.getElementById('f-nights');
  if(ci&&co){const n=nightsBetween(ci,co);nf.value=n>0?n:0;}else nf.value='';
  updateStoreSalesState();
  calcFinancials();checkOverlap();
  updateDateRangeDisplay();
  updateDrawerSummary();
  scheduleDraftSave();
}

function onPropertyChange(){
  const pid=document.getElementById('f-property').value;
  const prop=properties.find(p=>p.id===pid);
  const hint=document.getElementById('f-cap-hint');
  // City badge
  const badge=document.getElementById('f-prop-city-badge');
  const cityIcon=document.getElementById('f-prop-city-icon');
  const cityText=document.getElementById('f-prop-city-text');
  if(prop){
    if(hint)hint.textContent=`Base ${prop.baseGuests} guests · max ${prop.maxGuests} · ${C()}${prop.extraGuestFee}/extra/night`;
    const maxHint=document.getElementById('f-guestcount-max');
    if(maxHint)maxHint.textContent=`Max ${prop.maxGuests}`;
    if(badge&&cityText){
      if(cityIcon)cityIcon.innerHTML=propIconHtml(prop,16);
      cityText.textContent=prop.city||'';
      badge.style.display=prop.city?'inline-flex':'none';
      // Option B: tint badge with property color
      const pc=propertyColor(pid);
      badge.style.background=pc+'18';
      badge.style.borderColor=pc+'40';
      badge.style.color=pc;
    }
    const maxExtra=prop.maxGuests-prop.baseGuests;
    const eg=document.getElementById('f-extraguests');
    if(eg){eg.max=maxExtra;if(!_loadingDrawer&&+eg.value>maxExtra)eg.value=maxExtra;}
    // F6: Warn if guest count exceeds property max
    const gcEl=document.getElementById('f-guestcount');
    const gcWarn=document.getElementById('f-guestcount-warn');
    if(gcEl&&gcWarn&&!_loadingDrawer){
      const gc=+gcEl.value||1;
      gcWarn.style.display=gc>prop.maxGuests?'block':'none';
      gcWarn.textContent=gc>prop.maxGuests?`⚠ Exceeds max capacity (${prop.maxGuests} guests)`:'';
    }
    // Auto-fill base rate when user actively changes property, but never during load
    // (during load the saved rate is already in the field and must not be overwritten)
    const rateEl=document.getElementById('f-rate');
    if(rateEl&&prop.baseRate&&!_loadingDrawer)rateEl.value=prop.baseRate;
  }else{
    if(hint)hint.textContent='';
    if(badge)badge.style.display='none';
  }
  calcFinancials();
  updateDrawerSummary();
  updateContextStrip();
}

function updatePostCheckoutFields(){
  const co=document.getElementById('f-checkout')?.value||'';
  const checkedOut=co&&co<=todayISO();
  // helper: lock or unlock a post-checkout field
  function setField(inputId,hintId,labelId,lockedLabel,unlockedLabel){
    const el=document.getElementById(inputId);
    const hint=document.getElementById(hintId);
    const lbl=document.getElementById(labelId);
    if(!el)return;
    el.disabled=!checkedOut;
    el.style.opacity=checkedOut?'1':'0.45';
    el.style.cursor=checkedOut?'':'not-allowed';
    if(hint)hint.style.display=checkedOut?'none':'block';
    if(lbl)lbl.textContent=checkedOut?unlockedLabel:lockedLabel;
  }
  setField('f-store','f-store-hint','f-store-label',
    'Store / Add-on Sales (₱) — locked until checkout',
    'Store / Add-on Sales (₱)');
  setField('f-cleaning','f-cleaning-hint','f-cleaning-label',
    'Cleaning Fee (₱) — locked until checkout',
    'Cleaning Fee (₱)');
}
// keep old name as alias so existing calls don't break
function updateStoreSalesState(){ updatePostCheckoutFields(); }

function calcFinancials(){
  const pid=document.getElementById('f-property')?.value||'';
  const extraG=+document.getElementById('f-extraguests')?.value||0;
  const b={
    checkin:document.getElementById('f-checkin')?.value||'',
    checkout:document.getElementById('f-checkout')?.value||'',
    rate:document.getElementById('f-rate')?.value||0,
    promo:document.getElementById('f-promo')?.value||0,
    specialOffer:document.getElementById('f-specialoffer')?.value||0,
    serviceFee:document.getElementById('f-servicefee')?.value||0,
    guestServiceFee:+document.getElementById('f-guestservicefee')?.value||0,
    platform:document.getElementById('f-platform')?.value||'',
    property:pid,
    extraGuests:extraG,
    storeSales:document.getElementById('f-store')?.value||0,
    cleaningFee:document.getElementById('f-cleaning')?.value||0,
    adjustments:_currentAdjustments,
  };
  const t=calcTotals(b);
  const n=document.getElementById('f-nights');if(n)n.value=t.nights||'';
  const _set=(id,text,color)=>{const el=document.getElementById(id);if(!el)return;el.textContent=text;if(color!==undefined)el.style.color=color;};

  // Auto-populate service fee if not manually edited
  const svcEl=document.getElementById('f-servicefee');
  if(svcEl&&!svcEl.dataset.manual){
    svcEl.value=t.platFee?( +t.platFee).toFixed(2):0;
    const svcHint=document.getElementById('f-servicefee-hint');
    if(svcHint)svcHint.textContent=t.platFee?`auto: ${fmtMoney(t.platFee)} (${t.comm}%${t.vat?'+'+t.vat+'%VAT':''})` :'';
  }
  const gsfEl=document.getElementById('f-guestservicefee');
  if(gsfEl&&!gsfEl.dataset.manual){
    gsfEl.value=t.guestServiceFee?(+t.guestServiceFee).toFixed(2):0;
    const gsfHint=document.getElementById('f-guestservicefee-hint');
    if(gsfHint)gsfHint.textContent=t.guestServiceFee?`auto: ${fmtMoney(t.guestServiceFee)} (${t.guestFeeRate}%)`:'';
  }

  // Re-read actual field values after auto-populate
  const actualSvcFee=+document.getElementById('f-servicefee')?.value||0;
  const actualGuestFee=+document.getElementById('f-guestservicefee')?.value||0;
  const actualTotalGuestPaid=t.guestTotal+actualGuestFee;
  const actualNet=t.guestTotal-actualSvcFee-t.cleaningFee+t.storeSales;

  // ── SECTION 1: Guest Paid ──
  const bkLbl=document.getElementById('s-bkfee-label');
  if(bkLbl&&t.nights)bkLbl.textContent=`${t.nights} night${t.nights!==1?'s':''} × ${C()}${(+b.rate||0).toLocaleString()}`;
  else if(bkLbl)bkLbl.textContent='';
  _set('s-bkfee',t.bkFee?fmtMoney(t.bkFee):'—','var(--text)');
  _set('s-promo',t.promoTotal?`−${fmtMoney(t.promoTotal)}`:'—','var(--purple)');
  const promoSubLbl=document.getElementById('s-promo-sublabel');
  if(promoSubLbl)promoSubLbl.textContent=(t.promo&&t.nights>1)?`${t.nights} nights × ${C()}${(+b.promo||0).toLocaleString()}`:'';
  _set('s-specialoffer-guest',t.specialOffer?`−${fmtMoney(t.specialOffer)}`:'—','var(--purple)');
  _set('s-extra',t.extraFee?`+${fmtMoney(t.extraFee)}`:'—','var(--text-2)');
  _set('s-adj',t.adjTotal?`${t.adjTotal>=0?'+':''} ${fmtMoney(Math.abs(t.adjTotal))}`:'—','var(--text-2)');
  _set('s-guest-total',fmtMoney(t.guestTotal),'var(--text)');
  _set('s-guest-total-2',fmtMoney(t.guestTotal),'var(--text)');
  _set('s-guestfee',actualGuestFee?`+${fmtMoney(actualGuestFee)}`:'—','var(--text-2)');
  _set('s-total-guest-paid',actualTotalGuestPaid?fmtMoney(actualTotalGuestPaid):'—','var(--text)');

  // ── SECTION 2: Host Payout ──
  // Guest charges received breakdown
  const stayLbl=document.getElementById('s-host-stayfee-label');
  if(stayLbl){
    if(t.nights&&t.rate){
      let lbl=`${t.nights} night${t.nights!==1?'s':''} × ${C()}${(+b.rate||0).toLocaleString()}`;
      if(t.promoTotal)lbl+=` − promo`;
      if(t.specialOffer)lbl+=` − special offer`;
      stayLbl.textContent=lbl;
    }else{stayLbl.textContent='';}
  }
  _set('s-host-stayfee',t.stayFee?fmtMoney(t.stayFee):'—','var(--text)');
  _set('s-host-extra',t.extraFee?`+${fmtMoney(t.extraFee)}`:'—','var(--text-2)');
  _set('s-host-adj',t.adjTotal?`${t.adjTotal>=0?'+':''}${fmtMoney(Math.abs(t.adjTotal))}`:'—','var(--text-2)');
  _set('s-guest-total-2',fmtMoney(t.guestTotal),'var(--text)');

  const platName=b.platform||'';
  const svcLbl=document.getElementById('s-svcfee-label');
  if(svcLbl)svcLbl.textContent=platName&&t.comm?`Host Service Fee (${t.comm}%${t.vat?'+'+t.vat+'%VAT':''})` :'Host Service Fee';
  _set('s-specialoffer',t.specialOffer?`−${fmtMoney(t.specialOffer)}`:'—','var(--text-3)');
  _set('s-svcfee',actualSvcFee?`−${fmtMoney(actualSvcFee)}`:'—','var(--red)');
  _set('s-cleaning',t.cleaningFee?`−${fmtMoney(t.cleaningFee)}`:'—','var(--text-2)');
  _set('s-store-display',t.storeSales?`+${fmtMoney(t.storeSales)}`:'—','var(--green)');
  _set('s-net',fmtMoney(actualNet),actualNet>=0?'var(--green)':'var(--red)');
  // ── Revenue Split row (only shown when property has a split configured) ──
  const actualOwnerPct=t.ownerPct??100;
  const splitEl=document.getElementById('s-split-row');
  if(splitEl){
    if(actualOwnerPct<100&&actualNet){
      const actualSplitBase=t.guestTotal-actualSvcFee-t.cleaningFee;
      const ownerAmt=actualSplitBase*(actualOwnerPct/100)+t.storeSales;
      const bloomsAmt=actualSplitBase*((100-actualOwnerPct)/100);
      splitEl.innerHTML=`<div style="margin-top:8px;padding:8px 10px;background:var(--surface-2);border-radius:var(--radius-sm);border:1px solid var(--border);font-size:12px">
        <div style="font-weight:700;color:var(--text-3);font-size:10px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px">Revenue Split (${actualOwnerPct}% / ${100-actualOwnerPct}%)</div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--text-2)">Owner Share (${actualOwnerPct}%)</span><span style="font-weight:700;color:var(--blue)">${fmtMoney(ownerAmt)}</span></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-2)">Bloomstone (${100-actualOwnerPct}%)</span><span style="font-weight:700;color:var(--green)">${fmtMoney(bloomsAmt)}</span></div>
      </div>`;
      splitEl.style.display='';
    }else{splitEl.style.display='none';}
  }
  checkOverlap();
}

function resetServiceFee(){
  const el=document.getElementById('f-servicefee');
  if(el){delete el.dataset.manual;el.style.borderColor='';}
  const rst=document.getElementById('f-servicefee-reset');
  if(rst)rst.style.display='none';
  calcFinancials();
}

function checkOverlap(){
  const ci=document.getElementById('f-checkin')?.value;
  const co=document.getElementById('f-checkout')?.value;
  const pr=document.getElementById('f-property')?.value;
  const alertEl=document.getElementById('overlapAlert');
  if(!ci||!co||!pr){alertEl.classList.remove('show');return;}
  const cand={id:editingBookingId||'',checkin:ci,checkout:co,property:pr,status:'Confirmed'};
  // Direct same-property conflicts
  const ov=bookings.filter(o=>o.id!==editingBookingId&&o.property===pr&&o.status!=='Cancelled'&&bookingsOverlap(cand,o));
  if(ov.length){
    alertEl.classList.add('show','danger');
    document.getElementById('overlapText').textContent=`Conflict with ${ov.map(o=>o.guest).join(', ')} — tap to view`;
    alertEl.style.cursor='pointer';
    alertEl.onclick=()=>{closeDrawer();setTimeout(()=>openBookingDrawer(ov[0].id),180);};
    return;
  }
  // Linked group conflict (2BR Aurora / Bliss / 4BR Twin) — soft warning only
  const siblings=getLinkedSiblings(pr);
  if(siblings.length){
    const sibOv=bookings.filter(o=>o.id!==editingBookingId&&siblings.includes(o.property)&&o.status!=='Cancelled'&&bookingsOverlap(cand,o));
    if(sibOv.length){
      const sn=propName(sibOv[0].property);
      alertEl.classList.add('show','danger');
      document.getElementById('overlapText').textContent=`⚠️ Linked unit conflict: ${sn} booked by ${sibOv[0].guest} (${fmtDate(sibOv[0].checkin)}–${fmtDate(sibOv[0].checkout)}) — tap to view`;
      alertEl.style.cursor='pointer';
      alertEl.onclick=()=>{closeDrawer();setTimeout(()=>openBookingDrawer(sibOv[0].id),180);};
      return;
    }
  }
  alertEl.classList.remove('show');alertEl.onclick=null;alertEl.style.cursor='';
}

function _buildBookingFromForm(existing){
  const ci=document.getElementById('f-checkin').value;
  const co=document.getElementById('f-checkout').value;
  const bk={
    id:editingBookingId||genId(),
    guest:properCase(document.getElementById('f-guest').value),
    checkin:ci,checkout:co,
    platform:normPlatform(document.getElementById('f-platform').value||''),
    property:document.getElementById('f-property').value,
    rate:+document.getElementById('f-rate').value||0,
    promo:+document.getElementById('f-promo').value||0,
    specialOffer:+document.getElementById('f-specialoffer').value||0,
    bookingFee:0, // will be recalculated below from calcTotals
    serviceFee:+document.getElementById('f-servicefee').value||0,
    extraGuests:+document.getElementById('f-extraguests').value||0,
    adjustments:_currentAdjustments.filter(a=>a.desc||a.amount).map(a=>({...a})),
    storeSales:+document.getElementById('f-store').value||0,
    cleaningFee:+document.getElementById('f-cleaning').value||0,
    guestServiceFee:+document.getElementById('f-guestservicefee')?.value||0,
    deposit:+document.getElementById('f-deposit').value||0,
    status:document.getElementById('f-status').value,
    payment:document.getElementById('f-payment').value,
    notes:document.getElementById('f-notes').value,
    guestPrefs:document.getElementById('f-guestprefs')?.value||existing?.guestPrefs||'',
    guestCount:Math.max(1,+document.getElementById('f-guestcount')?.value||existing?.guestCount||1),
    depositCollected:(+document.getElementById('f-deposit').value||0)>0,
    depositRefunded:(+document.getElementById('f-dep-refunded-amt').value||0)>0,
    depositRefundedAmt:+document.getElementById('f-dep-refunded-amt').value||0,
    tasks:existing?.tasks||{},
    createdAt:existing?.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString(),
  };
  const t=calcTotals(bk);
  bk.bookingFee=t.bkFee;bk.extraGuests=t.extraG;bk.extraGuestFee=t.extraFee;
  bk.totalWithout=t.totalWithout;bk.netRevenue=t.netRevenue;bk.platformCommission=t.platFee;
  return bk;
}

function _commitBooking(bk,isNew){
  if(!isNew){const i=bookings.findIndex(b=>b.id===editingBookingId);if(i>=0)bookings[i]=bk;toast('Booking updated.');}
  else{bookings.unshift(bk);toast('Booking added.');}
  if(_currentDraftId){deleteDraft(_currentDraftId);} // remove draft on confirmed save
  // Save locally first (use saveAll so ownerPayouts is preserved)
  saveAll();
  // Block quiet pull for 60 s so the immediate push below is not overwritten by stale Sheets data
  _pullCooldownUntil=Date.now()+60000;
  clearTimeout(_autoPushTimer);_autoPushTimer=null;
  closeDrawer();renderView(currentWs);
  // Push to Sheets immediately — no debounce on booking saves
  if(sheetsConfig.connected&&sheetsConfig.url){
    sheetsPush(true).catch(()=>{});
  }
}

function _buildChangeDiff(orig,bk){
  const rows=[];
  const fmt=v=>v===true?'Yes':v===false?'No':(v===0||v===''||v==null)?'—':String(v);
  const fmtM=v=>v?fmtMoney(v):'—';
  const fmtD=v=>v?fmtDate(v):'—';
  const checks=[
    {label:'Guest',       o:orig.guest,          n:bk.guest},
    {label:'Check-in',    o:fmtD(orig.checkin),  n:fmtD(bk.checkin)},
    {label:'Check-out',   o:fmtD(orig.checkout), n:fmtD(bk.checkout)},
    {label:'Property',    o:propName(orig.property), n:propName(bk.property)},
    {label:'Platform',    o:normPlatform(orig.platform||''), n:normPlatform(bk.platform||'')},
    {label:'Status',      o:orig.status,         n:bk.status},
    {label:'Payment',     o:orig.payment,        n:bk.payment},
    {label:'Rate',        o:fmtM(orig.rate),     n:fmtM(bk.rate)},
    {label:'Promo',       o:fmtM(orig.promo),    n:fmtM(bk.promo)},
    {label:'Special Offer',o:fmtM(orig.specialOffer),n:fmtM(bk.specialOffer)},
    {label:'Service Fee', o:fmtM(orig.serviceFee),n:fmtM(bk.serviceFee)},
    {label:'Cleaning',    o:fmtM(orig.cleaningFee),n:fmtM(bk.cleaningFee)},
    {label:'Deposit',     o:fmtM(orig.deposit),  n:fmtM(bk.deposit)},
    {label:'Dep.Collected',o:fmt(orig.depositCollected),n:fmt(bk.depositCollected)},
    {label:'Dep.Refunded', o:fmt(orig.depositRefunded), n:fmt(bk.depositRefunded)},
    {label:'Guest Count', o:fmt(orig.guestCount),n:fmt(bk.guestCount)},
    {label:'Extra Guests',o:fmt(orig.extraGuests||0),n:fmt(bk.extraGuests||0)},
    {label:'Store Sales', o:fmtM(orig.storeSales||0),n:fmtM(bk.storeSales||0)},
    {label:'Cleaning Fee',o:fmtM(orig.cleaningFee||0),n:fmtM(bk.cleaningFee||0)},
    {label:'Notes',       o:orig.notes||'—',     n:bk.notes||'—'},
  ];
  checks.forEach(c=>{
    if(String(c.o)!==String(c.n))rows.push(c);
  });
  return rows;
}

function saveBooking(){
  const REQUIRED_FIELDS=[
    {id:'f-guest',      label:'Guest Name'},
    {id:'f-checkin',    label:'Check-in Date'},
    {id:'f-checkout',   label:'Check-out Date'},
    {id:'f-platform',   label:'Platform'},
    {id:'f-property',   label:'Property'},
    {id:'f-status',     label:'Status'},
    {id:'f-payment',    label:'Payment'},
  ];
  // Number fields that must have a value (0 is OK, empty string is not)
  const REQUIRED_NUMBER_FIELDS=[
    {id:'f-promo',      label:'Promo / Discount (enter 0 if none)'},
    {id:'f-servicefee', label:'Service Fee (enter 0 if none)'},
  ];
  const missing=[];
  REQUIRED_FIELDS.forEach(({id,label})=>{
    const el=document.getElementById(id);
    const val=id==='f-platform'?el?.value:(el?.value||'');
    const empty=!val||!String(val).trim();
    // For date fields, show error on the visible trigger button (hidden input isn't visible)
    const errEl=id==='f-checkin'?document.getElementById('dp-ci-btn')
               :id==='f-checkout'?document.getElementById('dp-co-btn')
               :el;
    if(empty){errEl?.classList.add('error');el?.classList.add('error');missing.push(label);}
    else{errEl?.classList.remove('error');el?.classList.remove('error');}
  });
  REQUIRED_NUMBER_FIELDS.forEach(({id,label})=>{
    const el=document.getElementById(id);
    // Empty string = missing. '0' or any number = OK.
    const empty=el?.value===''||el?.value===null||el?.value===undefined;
    if(empty){el?.classList.add('error');missing.push(label);}else el?.classList.remove('error');
  });
  if(missing.length){
    toast(`Required: ${missing.join(' · ')}`, 'error');
    // Scroll to first error
    const firstErr=document.querySelector('#drawerBody .error');
    if(firstErr)firstErr.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  const ci=document.getElementById('f-checkin').value;
  const co=document.getElementById('f-checkout').value;
  if(co<=ci){toast('Check-out must be after check-in date.','error');return;}
  // Blocked dates check
  const propId=document.getElementById('f-property').value;
  const prop=properties.find(p=>p.id===propId);
  if(prop&&(prop.blockedDates||[]).length){
    const blocked=[];
    for(let d=new Date(ci+'T12:00:00');dateToISO(d)<co;d.setDate(d.getDate()+1)){
      const ds=dateToISO(d);
      if(prop.blockedDates.includes(ds))blocked.push(ds);
    }
    if(blocked.length){
      toast(`Dates blocked for ${prop.name}: ${blocked.map(fmtDate).join(', ')}`, 'error');
      return;
    }
  }
  const existing=editingBookingId?bookings.find(b=>b.id===editingBookingId):null;
  const bk=_buildBookingFromForm(existing);

  // New booking — save directly
  if(!editingBookingId){_commitBooking(bk,true);return;}

  // Edit — diff and confirm
  const changes=_buildChangeDiff(existing,bk);
  if(!changes.length){
    toast('No changes detected.','warning');return;
  }
  const rows=changes.map(c=>`<div class="change-row">
    <span class="change-field">${esc(c.label)}</span>
    <span class="change-old">${esc(String(c.o))}</span>
    <span class="change-arrow">\u2192</span>
    <span class="change-new">${esc(String(c.n))}</span>
  </div>`).join('');
  const html=`<div style="text-align:left;margin-bottom:4px;font-size:12px;font-weight:700;color:var(--text-2)">${changes.length} change${changes.length!==1?'s':''} to save:</div>
    <div style="background:var(--surface-2);border-radius:var(--radius);padding:8px 12px;margin-bottom:4px">${rows}</div>`;
  confirmDialog(
    '\u270e Confirm Update',
    html,
    '\u270e',
    ()=>_commitBooking(bk,false),
    'Save Changes',
    {html:true,wide:true,btnClass:'btn-primary'}
  );
}

function deleteBooking(id){
  const b=bookings.find(x=>x.id===id);
  const label=b?`"${b.guest}" (${fmtDate(b.checkin)} \u2192 ${fmtDate(b.checkout)})`:'this booking';
  confirmDialog(
    '\u26a0 Delete Booking',
    `You are about to delete ${label}. It will be moved to Trash and can be restored. All booking data and financial records will be removed from reports.`,
    '\ud83d\uddd1',
    ()=>{
      if(!b)return;
      trash.unshift({...b,deletedAt:new Date().toISOString(),type:'booking'});
      bookings=bookings.filter(x=>x.id!==id);
      saveAll();closeDrawer();renderView(currentWs);
      toast('Moved to Trash.',  'warning',()=>{
        const i=trash.findIndex(t=>t.id===id);
        if(i>=0){const item=trash.splice(i,1)[0];delete item.deletedAt;delete item.type;bookings.unshift(item);saveAll();renderView(currentWs);}
      });
    }
  );
}

// ============================================================
// CALENDAR ENGINE
// ============================================================
function renderCalPropPills(){
  const container=document.getElementById('calPropPills');if(!container)return;
  const isAll=calPropFilter==='all';
  container.innerHTML=
    `<button class="prop-pill${isAll?' active':''}" onclick="setCalPropFilter('all')">All Properties</button>`+
    properties.map(p=>{
      const pc=propertyColor(p.id);
      const isActive=calPropFilter===p.id;
      return`<button class="prop-pill${isActive?' active':''}" data-color="${pc}" onclick="setCalPropFilter('${p.id}')" style="--prop-color:${pc};border-left:3px solid ${pc}"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${pc};margin-right:5px;vertical-align:middle;margin-top:-1px;flex-shrink:0"></span>${esc(p.name)}</button>`;
    }).join('');
}

function setCalPropFilter(id){
  calPropFilter=id;
  const sel=document.getElementById('cal-prop');
  if(sel)sel.value=id;
  renderCalPropPills();
  renderCalendar();
}

function renderCalendar(){
  renderCalPropPills();
  const y=calDate.getFullYear(),m=calDate.getMonth();
  const labels={
    month:calDate.toLocaleString('default',{month:'long',year:'numeric'}),
    week:'Week of '+fmtDate(dateToISO(getWeekStart(calDate))),
    day:fmtDate(dateToISO(calDate)),
    timeline:calDate.toLocaleString('default',{month:'long',year:'numeric'}),
    availability:calDate.toLocaleString('default',{month:'long',year:'numeric'}),
    occupancy:calDate.toLocaleString('default',{month:'long',year:'numeric'}),
  };
  document.getElementById('calPeriodLabel').textContent=labels[calView]||'';
  document.querySelectorAll('.cal-view-tab').forEach(t=>t.classList.toggle('active',t.dataset.view===calView));
  const body=document.getElementById('calBody');
  const platF=document.getElementById('cal-plat')?.value||'all';
  const shown=bookings.filter(b=>{
    if(b.status==='Cancelled')return false;
    if(calPropFilter!=='all'&&b.property!==calPropFilter)return false;
    if(platF!=='all'&&b.platform!==platF)return false;
    return true;
  });
  // E1: Week view is unusable on mobile — silently redirect to Day view
  document.getElementById('_weekMobileNote')?.remove();
  if(calView==='week'&&window.innerWidth<640){
    calView='day';
    document.querySelectorAll('.cal-view-tab').forEach(t=>t.classList.toggle('active',t.dataset.view==='day'));
    const note=document.createElement('div');
    note.id='_weekMobileNote';
    note.style.cssText='font-size:11px;color:var(--text-3);padding:4px 12px 0;margin-bottom:-4px';
    note.textContent='Week view not available on mobile — showing Day view';
    body.parentNode.insertBefore(note,body);
  }
  if(calView==='month')renderMonthCal(body,y,m,shown);
  else if(calView==='week')renderWeekCal(body,shown);
  else if(calView==='day')renderDayCal(body,shown);
  else if(calView==='timeline')renderTimelineCal(body,y,m,shown);
  else if(calView==='availability')renderAvailabilityCal(body,y,m);
  else if(calView==='occupancy')renderOccupancyCal(body,y,m,shown);
}

function getWeekStart(d){const dt=new Date(d);dt.setDate(dt.getDate()-dt.getDay());return dt;}

function renderMonthCal(body,y,m,shown){
  const today=todayISO();
  const compact=window.innerWidth<640; // compact pill mode for mobile
  const firstDow=new Date(y,m,1).getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const dayNames=compact?['S','M','T','W','T','F','S']:['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const cells=[];
  for(let i=0;i<firstDow;i++){const d=new Date(y,m,i-firstDow+1);cells.push({date:dateToISO(d),in:false});}
  for(let d=1;d<=daysInMonth;d++)cells.push({date:dateToISO(new Date(y,m,d)),in:true});
  while(cells.length%7!==0){const last=new Date(cells[cells.length-1].date+'T12:00:00');last.setDate(last.getDate()+1);cells.push({date:dateToISO(last),in:false});}
  // Pre-compute check-in / check-out sets for dot indicators
  const ciDates={}, coDates={};
  shown.forEach(b=>{
    if(b.checkin){ciDates[b.checkin]=(ciDates[b.checkin]||0)+1;}
    if(b.checkout){coDates[b.checkout]=(coDates[b.checkout]||0)+1;}
  });
  body.innerHTML=`<div class="month-grid">
    ${dayNames.map(d=>`<div class="month-day-name">${d}</div>`).join('')}
    ${cells.map(cell=>{
      const ci=ciDates[cell.date]||0, co=coDates[cell.date]||0;
      const dots=(ci?`<span style="width:7px;height:7px;border-radius:50%;background:#16a34a;display:inline-block" title="${ci} check-in(s)"></span>`.repeat(Math.min(ci,3)):'')
               +(co?`<span style="width:7px;height:7px;border-radius:50%;background:#dc2626;display:inline-block" title="${co} check-out(s)"></span>`.repeat(Math.min(co,3)):'');
      return`<div class="month-cell${cell.in?'':' other-month'}${cell.date===today?' today':''}" data-date="${cell.date}">
        <div class="month-cell-header">
          <div class="month-cell-num">${+cell.date.slice(8,10)}</div>
          ${dots?`<div class="month-cell-dots">${dots}</div>`:''}
        </div>
        <div class="month-cell-events" data-date="${cell.date}"></div>
      </div>`;
    }).join('')}
  </div>`;
  shown.slice().sort((a,b)=>a.checkin.localeCompare(b.checkin)).forEach(b=>{
    const isAllProps=calPropFilter==='all';
    const conflict=hasConflict(b);
    const totalN=nightsBetween(b.checkin,b.checkout);
    const today=todayISO();
    const platC=platformColor(b.platform);
    for(let d=new Date(b.checkin+'T12:00:00');dateToISO(d)<b.checkout;d.setDate(d.getDate()+1)){
      const ds=dateToISO(d);
      const container=body.querySelector(`.month-cell-events[data-date="${ds}"]`);
      if(!container)continue;
      if(isAllProps){
        // All Properties mode: rich card pill with property, guest, day counter
        const isStart=ds===b.checkin;
        const nextD=new Date(d);nextD.setDate(nextD.getDate()+1);
        const isEnd=dateToISO(nextD)===b.checkout;
        // Dim this SPECIFIC DAY if it has already passed — not the whole booking
        // so long stays only grey their past days, keeping ongoing/future days vivid
        const isDayPast=ds<today;
        const isToday=ds===today;
        // Day number within the stay (1 = checkin day)
        const dayNum=nightsBetween(b.checkin,ds)+1;
        const pill=document.createElement('div');
        if(conflict)pill.style.outline='2px solid var(--orange)';
        if(isDayPast){
          pill.style.cssText=`display:flex;align-items:center;gap:5px;padding:3px 6px;border-radius:6px;margin-bottom:3px;cursor:pointer;overflow:hidden;background:${platC};color:#fff;opacity:0.3;min-height:18px`;
          pill.innerHTML=`<span style="font-size:10px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(propName(b.property))}</span><span style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55px">${esc(b.guest.split(' ')[0])}</span>`;
        }else{
          const badge=isStart
            ?`<span class="cal-ci-badge">${compact?'CI':'CHECK IN'}</span>`
            :isEnd
            ?`<span class="cal-co-badge">${compact?'LN':'LAST NIGHT'}</span>`
            :`<span class="cal-stay-badge">${compact?'●':'ACTIVE STAY'}</span>`;
          const t=calcTotals(b);
          const dayLabel=(!compact&&totalN>1)?`<span style="font-size:9px;opacity:.7;white-space:nowrap;flex-shrink:0">Day ${dayNum}/${totalN}</span>`:'';
          const rateLabel=!compact?`<span style="font-size:9px;opacity:.75;white-space:nowrap;flex-shrink:0">${fmtMoney(b.rate)}/n</span>`:'';
          const pStr=compact?propName(b.property).slice(0,4):propName(b.property);
          const gStr=compact?b.guest.split(' ')[0].slice(0,6):b.guest;
          pill.style.cssText=`display:flex;flex-direction:column;gap:${compact?1:2}px;padding:${compact?'2px 3px':'5px 7px'};border-radius:${compact?5:7}px;margin-bottom:${compact?2:3}px;cursor:pointer;overflow:hidden;background:${platC};color:#fff;${isToday?'box-shadow:0 0 0 2px #fff,0 0 0 3.5px '+platC+';':''}`;
          pill.innerHTML=`
            <div style="display:flex;align-items:center;gap:${compact?2:4}px;min-width:0">
              <span style="font-size:${compact?9:11}px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;line-height:1.2">${esc(pStr)}</span>
              ${badge}
            </div>
            ${compact?`<span style="font-size:9px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.9;display:block">${esc(gStr)}</span>`
            :`<div style="display:flex;align-items:center;gap:4px;min-width:0">
              <span style="font-size:10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;opacity:.9">${esc(gStr)}</span>
              ${dayLabel}
            </div>
            ${isStart||isEnd?`<div style="display:flex;align-items:center;gap:4px;min-width:0;opacity:.85">${rateLabel}<span style="font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;color:#fff">${esc(b.platform)}</span></div>`:''}`}`;
        }
        pill.title=`${esc(b.guest)} \u00b7 ${propName(b.property)} \u00b7 ${fmtDate(b.checkin)} \u2192 ${fmtDate(b.checkout)}`;
        pill.addEventListener('click',e=>{e.stopPropagation();openBookingDrawer(b.id);});
        container.appendChild(pill);
      }else{
        // Single property mode: same rich pill as All Properties, minus the property name row
        const isStart=ds===b.checkin;
        const nextD=new Date(d);nextD.setDate(nextD.getDate()+1);
        const isEnd=dateToISO(nextD)===b.checkout;
        const isDayPast=ds<today;
        const isToday=ds===today;
        const dayNum=nightsBetween(b.checkin,ds)+1;
        const pill=document.createElement('div');
        if(conflict)pill.style.outline='2px solid var(--orange)';
        if(isDayPast){
          pill.style.cssText=`display:flex;align-items:center;gap:${compact?2:5}px;padding:${compact?'2px 3px':'3px 6px'};border-radius:6px;margin-bottom:${compact?2:3}px;cursor:pointer;overflow:hidden;background:${platC};color:#fff;opacity:0.3;min-height:${compact?14:18}px`;
          pill.innerHTML=`<span style="font-size:${compact?9:10}px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(b.guest.split(' ')[0].slice(0,compact?5:20))}</span>`;
        }else{
          const badge=isStart
            ?`<span class="cal-ci-badge">${compact?'CI':'CHECK IN'}</span>`
            :isEnd
            ?`<span class="cal-co-badge">${compact?'LN':'LAST NIGHT'}</span>`
            :`<span class="cal-stay-badge">${compact?'●':'ACTIVE STAY'}</span>`;
          const dayLabel=(!compact&&totalN>1)?`<span style="font-size:9px;opacity:.7;white-space:nowrap;flex-shrink:0">Day ${dayNum}/${totalN}</span>`:'';
          const rateLabel=!compact?`<span style="font-size:9px;opacity:.75;white-space:nowrap;flex-shrink:0">${fmtMoney(b.rate)}/n</span>`:'';
          const gStr=compact?b.guest.split(' ')[0].slice(0,6):b.guest;
          pill.style.cssText=`display:flex;flex-direction:column;gap:${compact?1:2}px;padding:${compact?'2px 3px':'5px 7px'};border-radius:${compact?5:7}px;margin-bottom:${compact?2:3}px;cursor:pointer;overflow:hidden;background:${platC};color:#fff;${isToday?'box-shadow:0 0 0 2px #fff,0 0 0 3.5px '+platC+';':''}`;
          pill.innerHTML=`
            <div style="display:flex;align-items:center;gap:${compact?2:4}px;min-width:0">
              <span style="font-size:${compact?9:11}px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;line-height:1.2">${esc(gStr)}</span>
              ${badge}
            </div>
            ${compact?'':`<div style="display:flex;align-items:center;gap:4px;min-width:0">
              ${dayLabel}
              ${isStart||isEnd?rateLabel:''}
              <span style="font-size:9px;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;color:#fff">${esc(b.platform)}</span>
            </div>`}`;
        }
        pill.title=`${esc(b.guest)} \u00b7 ${fmtDate(b.checkin)} \u2192 ${fmtDate(b.checkout)} \u00b7 ${totalN} nights`;
        pill.addEventListener('click',e=>{e.stopPropagation();openBookingDrawer(b.id);});
        container.appendChild(pill);
      }
    }
  });
  // Show blocked dates
  if(calPropFilter!=='all'){
    const prop=properties.find(p=>p.id===calPropFilter);
    if(prop&&(prop.blockedDates||[]).length){
      prop.blockedDates.forEach(ds=>{
        const cell=body.querySelector(`.month-cell[data-date="${ds}"]`);
        if(cell){cell.style.background='var(--red-bg)';cell.title='Blocked';}
      });
    }
  }
  body.querySelectorAll('.month-cell').forEach(cell=>{
    cell.addEventListener('click',()=>openDayModal(cell.dataset.date));
  });
}

function openDayModal(dateStr){
  const matches=bookings.filter(b=>b.status!=='Cancelled'&&b.checkin<=dateStr&&dateStr<b.checkout&&(calPropFilter==='all'||b.property===calPropFilter));
  const prop=calPropFilter!=='all'?properties.find(p=>p.id===calPropFilter):null;
  const isBlocked=prop&&(prop.blockedDates||[]).includes(dateStr);
  document.getElementById('dayModalTitle').textContent='\ud83d\udcc5 '+fmtDate(dateStr)+(isBlocked?' \u2014 \ud83d\udd34 Blocked':'');
  document.getElementById('dayModalBody').innerHTML=
    (isBlocked?`<div class="alert-bar show warning" style="display:block;margin-bottom:12px">\ud83d\udd34 This date is blocked for ${esc(prop.name)}. No new bookings accepted.</div>`:'')
    +(matches.length?matches.map(b=>{
      const t=calcTotals(b);
      const isCI=b.checkin===dateStr,isCO=b.checkout===dateStr;
      // checkout is day after last night, so the day BEFORE checkout is last night
      const lastNight=new Date(b.checkout+'T12:00:00');lastNight.setDate(lastNight.getDate()-1);
      const isLastNight=dateToISO(lastNight)===dateStr;
      const cioBadge=isCI?`<span class="cal-ci-badge" style="font-size:10px;padding:3px 9px">CHECK IN</span>`
        :isLastNight?`<span class="cal-co-badge" style="font-size:10px;padding:3px 9px">LAST NIGHT</span>`
        :`<span class="cal-stay-badge" style="font-size:10px;padding:3px 9px;background:var(--accent-soft);color:var(--accent);border:none">ACTIVE STAY</span>`;
      const dayNum=nightsBetween(b.checkin,dateStr)+1;
      return`<div style="display:flex;align-items:flex-start;gap:10px;padding:11px 12px;border:1px solid var(--border);border-radius:var(--radius-lg);margin-bottom:8px;cursor:pointer;background:var(--surface-2)" onclick="closeModal('dayModal');openBookingDrawer('${b.id}')">
        <div style="width:5px;min-height:50px;border-radius:3px;background:${platformColor(b.platform)};flex-shrink:0;margin-top:2px"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
            <span style="font-weight:800;font-size:14px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.guest)}</span>
            ${cioBadge}
          </div>
          <div style="font-size:11px;color:var(--text-3);margin-bottom:2px">${esc(propName(b.property))} \u00b7 ${platformPillHtml(b.platform)}</div>
          <div style="font-size:11px;color:var(--text-2)">${fmtDate(b.checkin)} \u2192 ${fmtDate(b.checkout)} \u00b7 <strong>${t.nights} nights</strong> \u00b7 Day ${dayNum}/${t.nights}</div>
          <div style="font-size:11px;color:var(--green);margin-top:2px;font-weight:700">${fmtMoney(b.rate)}/night \u00b7 Net ${fmtMoney(t.netRevenue)}</div>
        </div>
        <div style="flex-shrink:0">${statusBadgeHtml(b.status)}</div>
      </div>`;
    }).join('')
    :`<div class="empty" style="padding:24px 0"><div class="empty-text">No bookings on this day.</div></div>`);
  document.getElementById('dayModalAddBtn').onclick=()=>{
    closeModal('dayModal');
    openBookingDrawer();
    document.getElementById('f-checkin').value=dateStr;
    const nd=new Date(dateStr+'T12:00:00');nd.setDate(nd.getDate()+1);
    document.getElementById('f-checkout').value=dateToISO(nd);
    dpSyncFromHidden();
    if(calPropFilter!=='all')document.getElementById('f-property').value=calPropFilter;
    onDatesChange();onPropertyChange();
  };
  openModal('dayModal');
}

function renderWeekCal(body,shown){
  const ws=getWeekStart(calDate);
  const days=[];
  for(let i=0;i<7;i++){const d=new Date(ws);d.setDate(ws.getDate()+i);days.push(dateToISO(d));}
  const today=todayISO();
  body.innerHTML=`<div style="display:grid;grid-template-columns:repeat(7,1fr);min-width:700px">
    ${days.map(ds=>`<div class="week-header-cell${ds===today?' today-col':''}">${new Date(ds+'T12:00:00').toLocaleDateString('default',{weekday:'short',month:'short',day:'numeric'})}</div>`).join('')}
    ${days.map(ds=>{
      const dayB=shown.filter(b=>b.checkin<=ds&&ds<b.checkout);
      return`<div class="week-col${ds===today?' today-col':''}" style="padding:6px;min-height:200px">
        ${dayB.map(b=>{
          const isAllProps=calPropFilter==='all';
          const _today=todayISO();
          const isPast=b.checkout<_today;
          const platC=platformColor(b.platform);
          const isStart=ds===b.checkin;
          const nextD=new Date(ds+'T12:00:00');nextD.setDate(nextD.getDate()+1);
          const isEnd=dateToISO(nextD)===b.checkout;
          const tag=isStart?`<span class="cal-ci-badge" style="font-size:8px;padding:1px 5px;margin-left:4px">IN</span>`
                   :isEnd?`<span class="cal-co-badge" style="font-size:8px;padding:1px 5px;margin-left:4px">OUT</span>`
                   :`<span class="cal-stay-badge" style="font-size:8px;padding:1px 5px;margin-left:4px">●</span>`;
          if(isAllProps){
            const _totalN=nightsBetween(b.checkin,b.checkout);
            const _dayNum=nightsBetween(b.checkin,ds)+1;
            const _isToday=ds===_today;
            const _isDayPast=ds<_today;
            if(_isDayPast){
              return`<div style="display:flex;align-items:center;gap:5px;padding:3px 7px;border-radius:6px;margin-bottom:3px;cursor:pointer;overflow:hidden;background:${platC};color:#fff;opacity:0.28" onclick="openBookingDrawer('${b.id}')">
                <span style="font-size:10px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(propName(b.property))}</span>
                <span style="font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55px">${esc(b.guest.split(' ')[0])}</span>
              </div>`;
            }
            const _badge=isStart
              ?`<span class="cal-ci-badge">CHECK IN</span>`
              :isEnd
              ?`<span class="cal-co-badge">LAST NIGHT</span>`
              :`<span class="cal-stay-badge">ACTIVE STAY</span>`;
            const _dayLbl=_totalN>1?`<span style="font-size:9px;opacity:.75;white-space:nowrap">Day ${_dayNum}/${_totalN}</span>`:'';
            return`<div style="display:flex;flex-direction:column;gap:2px;padding:5px 7px;border-radius:6px;margin-bottom:3px;cursor:pointer;overflow:hidden;background:${platC};color:#fff;${_isToday?'box-shadow:0 0 0 2px #fff,0 0 0 3.5px '+platC+';':''}" onclick="openBookingDrawer('${b.id}')">
              <div style="display:flex;align-items:center;gap:4px;min-width:0">
                <span style="font-size:11px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;line-height:1.3">${esc(propName(b.property))}</span>
                ${_badge}
              </div>
              <div style="display:flex;align-items:center;gap:4px;min-width:0">
                <span style="font-size:10px;opacity:.82;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc(b.guest)}</span>
                ${_dayLbl}
              </div>
            </div>`;
          }
          return`<div class="cal-event-bar" style="background:${platC};height:auto;padding:6px 8px;margin-bottom:4px;line-height:1.4;white-space:normal;overflow:visible;opacity:${isPast?'0.55':'1'}" onclick="openBookingDrawer('${b.id}')">
            <div style="display:flex;align-items:center"><strong style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.guest)}</strong>${tag}</div>
            <div style="font-size:10px;opacity:.8">${esc(isAllProps?propName(b.property):b.platform)}</div></div>`;
        }).join('')}
        <div style="font-size:20px;color:var(--border-2);text-align:center;margin-top:4px;cursor:pointer;line-height:2" onclick="openBookingDrawer()">+</div>
      </div>`;
    }).join('')}
  </div>`;
}

function renderDayCal(body,shown){
  const ds=dateToISO(calDate);
  const today=todayISO();
  const dayB=shown.filter(b=>b.checkin<=ds&&ds<b.checkout);
  body.innerHTML=`<div style="padding:4px">
    <div style="font-size:16px;font-weight:700;margin-bottom:14px">${fmtDate(ds)}</div>
    ${dayB.length?dayB.map(b=>{
      const t=calcTotals(b);
      const isCheckinDay=b.checkin===ds;
      const isCheckoutDay=b.checkout===ds;
      const nextD=new Date(ds+'T12:00:00');nextD.setDate(nextD.getDate()+1);
      const isLastNight=dateToISO(nextD)===b.checkout;
      const isPast=b.checkout<today;
      const statusBadge=isPast
        ?`<span style="background:var(--surface-2);color:var(--text-3);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap">\u2713 Checked out</span>`
        :isCheckinDay
        ?`<span style="background:var(--green-bg);color:var(--green);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap">\u2193 Check-in Today</span>`
        :isCheckoutDay
        ?`<span style="background:var(--orange-bg);color:var(--orange);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap">\u2191 Checking Out Today</span>`
        :isLastNight
        ?`<span style="background:var(--orange-bg);color:var(--orange);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap">Last Night</span>`
        :`<span style="background:var(--accent-soft);color:var(--accent);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap">Active Stay</span>`;
      return`<div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${platformColor(b.platform)};border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:10px;cursor:pointer;opacity:${isPast?'0.7':'1'}" onclick="openBookingDrawer('${b.id}')">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">${statusBadge}</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:4px">${esc(b.guest)}</div>
      <div style="font-size:12px;color:var(--text-3);margin-bottom:8px">${esc(propName(b.property))} \u00b7 ${platformPillHtml(b.platform)}</div>
      <div style="display:flex;gap:10px;font-size:12px;flex-wrap:wrap"><span>${fmtDate(b.checkin)} \u2192 ${fmtDate(b.checkout)}</span><span style="font-weight:700">${fmtMoney(t.netRevenue)}</span>${statusBadgeHtml(b.status)}</div>
    </div>`;}).join(''):`<div class="empty"><div class="empty-text">No bookings on ${fmtDate(ds)}</div></div>`}
    <button class="btn btn-primary" style="width:100%;margin-top:14px" onclick="openBookingDrawer()">+ Add Booking</button>
  </div>`;
}

function renderTimelineCal(body,y,m,shown){
  const daysInMonth=new Date(y,m+1,0).getDate();
  const today=todayISO();
  const propsToShow=calPropFilter==='all'?properties:properties.filter(p=>p.id===calPropFilter);
  const days=[];
  for(let d=1;d<=daysInMonth;d++)days.push(dateToISO(new Date(y,m,d)));
  body.innerHTML=`<div class="timeline-wrap"><div class="timeline-grid">
    <div class="timeline-header">
      <div class="timeline-prop-col">Property</div>
      <div class="timeline-dates">${days.map(ds=>`<div class="timeline-date-cell${ds===today?' today-col':''}">${+ds.slice(8,10)}</div>`).join('')}</div>
    </div>
    ${propsToShow.map(prop=>{
      const propB=shown.filter(b=>b.property===prop.id);
      return`<div class="timeline-row">
        <div class="timeline-prop-label">${esc(prop.name)}</div>
        <div class="timeline-cells" style="position:relative">
          ${days.map(ds=>{const bl=isDateBlocked(ds,prop.id);return`<div class="timeline-cell${ds===today?' today-col':''}" data-date="${ds}" data-prop="${prop.id}" style="${bl?'background:var(--red-bg)':''}" title="${bl?'Blocked':''}"></div>`;}).join('')}
          ${propB.map(b=>{
            const startIdx=days.indexOf(b.checkin);
            if(startIdx===-1)return'';
            const endRaw=days.indexOf(b.checkout);
            const endIdx=endRaw===-1?days.length:endRaw;
            const width=((endIdx-startIdx)/days.length*100).toFixed(2);
            const left=(startIdx/days.length*100).toFixed(2);
            const isAllProps=calPropFilter==='all';
            const tbg=isAllProps?propertyColor(b.property):platformColor(b.platform);
            const tContent=isAllProps?`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,0.85);border:1.5px solid ${platformColor(b.platform)};margin-right:5px;vertical-align:middle;flex-shrink:0;box-sizing:border-box"></span>${esc(b.guest)}`:esc(b.guest);
            return`<div class="timeline-bar" style="left:${left}%;width:${width}%;background:${tbg}" onclick="openBookingDrawer('${b.id}')" title="${esc(b.guest)}">${tContent}</div>`;
          }).join('')}
        </div>
      </div>`;
    }).join('')}
  </div></div>`;
  body.querySelectorAll('.timeline-cell').forEach(cell=>{
    cell.addEventListener('click',()=>{
      const ds=cell.dataset.date;
      const propId=cell.dataset.prop;
      openBookingDrawer();
      document.getElementById('f-checkin').value=cell.dataset.date;
      const nd=new Date(ds+'T12:00:00');nd.setDate(nd.getDate()+1);
      document.getElementById('f-checkout').value=dateToISO(nd);
      document.getElementById('f-property').value=propId;
      dpSyncFromHidden();onDatesChange();onPropertyChange();
    });
  });
}

function renderAvailabilityCal(body,y,m){
  const daysInMonth=new Date(y,m+1,0).getDate();
  const firstDow=new Date(y,m,1).getDay();
  const today=todayISO();
  const monthStr=`${y}-${String(m+1).padStart(2,'0')}`;
  const propsToShow=calPropFilter==='all'?properties:properties.filter(p=>p.id===calPropFilter);
  const dayNames=['S','M','T','W','T','F','S'];

  const cards=propsToShow.map((prop,pi)=>{
    const pc=propertyColor(prop.id);
    // Build booked map: date \u2192 booking
    const bookedMap={};
    bookings.filter(b=>b.property===prop.id&&b.status!=='Cancelled').forEach(b=>{
      for(let d=new Date(b.checkin+'T12:00:00');dateToISO(d)<b.checkout;d.setDate(d.getDate()+1)){
        bookedMap[dateToISO(d)]=b;
      }
    });
    const blockedSet=new Set(prop.blockedDates||[]);

    // Day name headers
    let cells=dayNames.map(d=>`<div class="avail-day-name">${d}</div>`).join('');
    // Use grid-column-start on day 1 instead of empty divs \u2014 eliminates the blank first-row gap
    // Day cells
    for(let d=1;d<=daysInMonth;d++){
      const ds=dateToISO(new Date(y,m,d));
      const b=bookedMap[ds];
      const isBlocked=blockedSet.has(ds);
      const isToday=ds===today;
      const col=b?platformColor(b.platform):'';
      let cls='avail-day';
      let style=d===1&&firstDow>0?`grid-column-start:${firstDow+1};`:'';
      let titleTxt='';
      if(isBlocked){cls+=' blocked-avail';titleTxt='Blocked';}
      else if(b){
        cls+=' booked';
        style+=`background:${col}`;
        titleTxt=`${b.guest} \u00b7 ${fmtDate(b.checkin)} \u2192 ${fmtDate(b.checkout)}`;
      }else{cls+=' available';titleTxt='Available';}
      if(isToday)cls+=' today-avail';
      cells+=`<div class="${cls}" style="${style}" title="${titleTxt}" onclick="openDayModal('${ds}')">${d}</div>`;
    }

    const bookedCount=Object.keys(bookedMap).filter(ds=>ds.startsWith(monthStr)).length;
    const blockedCount=[...blockedSet].filter(ds=>ds.startsWith(monthStr)).length;
    const availCount=daysInMonth-bookedCount-blockedCount;
    const pct=Math.round((availCount/daysInMonth)*100);

    return`<div class="avail-card">
      <div class="avail-prop-header">
        <div class="avail-prop-dot" style="background:${pc}"></div>
        <div class="avail-prop-name">${esc(prop.name)}</div>
        <div class="avail-prop-sub">${availCount}/${daysInMonth} free \u00b7 ${pct}%</div>
      </div>
      <div class="avail-cal">${cells}</div>
    </div>`;
  }).join('');

  body.innerHTML=`<div class="avail-grid">${cards}
    <div class="avail-legend">
      <div class="avail-legend-item"><div class="avail-legend-dot" style="background:var(--green-bg);border:1px solid var(--green)"></div>Available</div>
      <div class="avail-legend-item"><div class="avail-legend-dot" style="background:#2196f3"></div>Booked (color = platform)</div>
      <div class="avail-legend-item"><div class="avail-legend-dot" style="background:var(--red-bg);border:1px solid var(--red)"></div>Blocked</div>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" onclick="exportAvailability()">\u2b07 Export CSV</button>
        <button class="btn btn-secondary btn-sm" onclick="printAvailability()">\ud83d\udda8 Print</button>
      </div>
    </div>
  </div>`;
}

function exportAvailability(){
  const y=calDate.getFullYear(),m=calDate.getMonth();
  const daysInMonth=new Date(y,m+1,0).getDate();
  const rows=[['Property',...Array.from({length:daysInMonth},(_,i)=>String(i+1))]];
  properties.forEach(prop=>{
    const bookedSet=new Set();
    bookings.filter(b=>b.property===prop.id&&b.status!=='Cancelled').forEach(b=>{
      for(let d=new Date(b.checkin+'T12:00:00');dateToISO(d)<b.checkout;d.setDate(d.getDate()+1))bookedSet.add(dateToISO(d));
    });
    rows.push([prop.name,...Array.from({length:daysInMonth},(_,i)=>{const ds=dateToISO(new Date(y,m,i+1));return bookedSet.has(ds)?'Booked':'Available';})]);
  });
  downloadCSV(`bloomstone-availability-${y}-${m+1}.csv`,rows);
}

function printAvailability(){
  const el=document.querySelector('.avail-grid');if(!el)return;
  const win=window.open('','_blank');if(!win)return;
  win.document.write(`<!DOCTYPE html><html><head><title>Availability</title><style>body{font-family:Inter,sans-serif;padding:20px}.avail-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.avail-card{border:1px solid #e8e6e1;border-radius:10px;padding:14px}.avail-prop-header{display:flex;align-items:center;gap:8px;margin-bottom:8px}.avail-prop-dot{width:10px;height:10px;border-radius:3px}.avail-prop-name{font-size:13px;font-weight:700}.avail-prop-sub{font-size:11px;color:#888;margin-left:auto}.avail-cal{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}.avail-day-name{text-align:center;font-size:9px;font-weight:700;color:#888;padding:2px 0 4px}.avail-day{width:100%;height:28px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;box-sizing:border-box}.avail-day.available{background:#edf7ea;color:#2d6a1f}.avail-day.booked{color:#fff}.avail-day.blocked-avail{background:#fdf0ee;color:#c0392b}.avail-day.empty{background:transparent}.avail-legend{display:none}</style></head><body>${el.outerHTML}</body></html>`);
  win.document.close();win.print();
}

function renderOccupancyCal(body,y,m,shown){
  const daysInMonth=new Date(y,m+1,0).getDate();
  const today=todayISO();
  const propsToShow=calPropFilter==='all'?properties:properties.filter(p=>p.id===calPropFilter);
  const days=Array.from({length:daysInMonth},(_,i)=>dateToISO(new Date(y,m,i+1)));
  const totalBooked=shown.reduce((s,b)=>{
    for(let d=new Date(b.checkin+'T12:00:00');dateToISO(d)<b.checkout;d.setDate(d.getDate()+1)){if(days.includes(dateToISO(d)))s++;}
    return s;
  },0);
  const occupancyPct=Math.round(totalBooked/(propsToShow.length*daysInMonth)*100);
  body.innerHTML=`<div class="occ-grid">
    <div style="padding:10px 0 16px;font-size:14px;color:var(--text-2)">Overall occupancy: <strong style="color:var(--text);font-size:18px">${occupancyPct}%</strong> \u00b7 ${totalBooked} booked nights</div>
    ${propsToShow.map(prop=>{
      const bookedMap={};
      shown.filter(b=>b.property===prop.id).forEach(b=>{
        for(let d=new Date(b.checkin+'T12:00:00');dateToISO(d)<b.checkout;d.setDate(d.getDate()+1))bookedMap[dateToISO(d)]=b;
      });
      const booked=days.filter(ds=>bookedMap[ds]).length;
      const pct=Math.round(booked/daysInMonth*100);
      return`<div class="occ-row">
        <div class="occ-prop-name">${esc(prop.name)} <span style="float:right;font-size:13px;font-weight:800;color:${pct>70?'var(--green)':pct>40?'var(--orange)':'var(--red)'}">${pct}%</span></div>
        <div class="occ-bar-wrap">${days.map(ds=>{const b=bookedMap[ds];return`<div class="occ-day${b?' booked':' available'}" style="${b?`background:${platformColor(b.platform)}`:''};${ds===today?'outline:2px solid var(--text)':''}" title="${ds}${b?': '+b.guest:''}"></div>`;}).join('')}</div>
      </div>`;
    }).join('')}
    <div class="occ-legend"><div class="occ-legend-item"><div class="occ-dot" style="background:var(--surface-3)"></div>Available</div>${platforms.map(p=>`<div class="occ-legend-item"><div class="occ-dot" style="background:${p.color}"></div>${esc(p.name)}</div>`).join('')}</div>
  </div>`;
}

document.getElementById('calPrev').addEventListener('click',()=>{
  if(['month','timeline','availability','occupancy'].includes(calView))calDate=new Date(calDate.getFullYear(),calDate.getMonth()-1,1);
  else if(calView==='week'){calDate=new Date(calDate);calDate.setDate(calDate.getDate()-7);}
  else{calDate=new Date(calDate);calDate.setDate(calDate.getDate()-1);}
  renderCalendar();
});
document.getElementById('calNext').addEventListener('click',()=>{
  if(['month','timeline','availability','occupancy'].includes(calView))calDate=new Date(calDate.getFullYear(),calDate.getMonth()+1,1);
  else if(calView==='week'){calDate=new Date(calDate);calDate.setDate(calDate.getDate()+7);}
  else{calDate=new Date(calDate);calDate.setDate(calDate.getDate()+1);}
  renderCalendar();
});
document.getElementById('calToday').addEventListener('click',()=>{calDate=new Date();renderCalendar();});
document.getElementById('calViewTabs').addEventListener('click',e=>{const tab=e.target.closest('.cal-view-tab');if(tab){calView=tab.dataset.view;renderCalendar();}});
// cal-prop select hidden but kept for compatibility
const calPropSel=document.getElementById('cal-prop');if(calPropSel)calPropSel.addEventListener('change',e=>{calPropFilter=e.target.value;renderCalPropPills();renderCalendar();});
document.getElementById('cal-plat').addEventListener('change',e=>{calPlatFilter=e.target.value;renderCalendar();});
document.getElementById('calExportBtn').addEventListener('click',exportAvailability);

// ============================================================
// FINANCE, EXPENSES, DEPOSITS, PLATFORMS, PROPERTIES, REPORTS
// ============================================================
function getFinanceList(){
  const f=document.getElementById('fin-period')?.value||'thismonth';
  const pr=document.getElementById('fin-prop')?.value||'all';
  const now=new Date();
  let list=bookings.filter(b=>b.status!=='Cancelled');
  if(f==='thismonth')list=list.filter(b=>{const d=new Date(b.checkin+'T12:00:00');return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();});
  else if(f==='lastmonth'){const lm=new Date(now.getFullYear(),now.getMonth()-1,1);list=list.filter(b=>{const d=new Date(b.checkin+'T12:00:00');return d.getMonth()===lm.getMonth()&&d.getFullYear()===lm.getFullYear();});}
  else if(f==='thisyear')list=list.filter(b=>new Date(b.checkin+'T12:00:00').getFullYear()===now.getFullYear());
  if(pr!=='all')list=list.filter(b=>b.property===pr);
  return list;
}

function renderFinanceOverview(){
  _totalsCache=new Map();
  const list=getFinanceList();
  const totalRev=list.reduce((s,b)=>s+calcTotals(b).netRevenue,0);
  const totalRoom=list.reduce((s,b)=>s+calcTotals(b).stayFee,0);
  const totalExtra=list.reduce((s,b)=>s+calcTotals(b).extraFee,0);
  const totalAddons=list.reduce((s,b)=>s+(+b.storeSales||0),0);
  const totalPlatFee=list.reduce((s,b)=>s+calcTotals(b).platFee,0);
  const totalPromo=list.reduce((s,b)=>s+(+b.promo||0),0);
  // Filter expenses to match the selected period and property
  const finPeriod=document.getElementById('fin-period')?.value||'all';
  const finProp=document.getElementById('fin-prop')?.value||'all';
  const now2=new Date();
  const filteredExp=expenses.filter(e=>{
    if(finProp!=='all'&&e.prop!=='all'&&e.prop!==finProp)return false;
    if(finPeriod==='thismonth'){const ym=`${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}`;return e.month===ym;}
    if(finPeriod==='lastmonth'){const lm=new Date(now2.getFullYear(),now2.getMonth()-1,1);const ym=`${lm.getFullYear()}-${String(lm.getMonth()+1).padStart(2,'0')}`;return e.month===ym;}
    if(finPeriod==='thisyear')return e.month?.startsWith(String(now2.getFullYear()));
    return true;
  });
  // Exclude cleaning from expenses — cleaning is already deducted inside each booking's netRevenue
  const totalExp=filteredExp.reduce((s,e)=>s+((e.amount||0)-(e.cleaning||0)),0);
  // storeSales is already included in netRevenue; don't add it again
  const netProfit=totalRev-totalExp;
  // Revenue split totals across all bookings in view
  const totalOwnerShare=list.reduce((s,b)=>s+calcTotals(b).ownerShare,0);
  const totalBloomsShare=list.reduce((s,b)=>s+calcTotals(b).bloomsShare,0);
  const hasSplit=list.some(b=>{const p=properties.find(x=>x.id===b.property);return(p?.ownerPct??100)<100;});
  document.getElementById('finStats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Net Revenue</div><div class="stat-value">${fmtMoney(totalRev)}</div><div class="stat-sub">${list.length} bookings</div></div>
    <div class="stat-card"><div class="stat-label">Add-on Sales</div><div class="stat-value">${fmtMoney(totalAddons)}</div></div>
    <div class="stat-card"><div class="stat-label">Total Expenses</div><div class="stat-value">${fmtMoney(totalExp)}</div></div>
    <div class="stat-card"><div class="stat-label">Net Profit</div><div class="stat-value" style="color:${netProfit>=0?'var(--green)':'var(--red)'}">${fmtMoney(netProfit)}</div></div>
    ${hasSplit?`<div class="stat-card" style="border-color:#1a56db"><div class="stat-label" style="color:#1a56db">Owner Payable</div><div class="stat-value" style="color:#1a56db">${fmtMoney(totalOwnerShare)}</div><div class="stat-sub">across managed properties</div></div>
    <div class="stat-card" style="border-color:var(--green)"><div class="stat-label" style="color:var(--green)">Bloomstone Earnings</div><div class="stat-value" style="color:var(--green)">${fmtMoney(totalBloomsShare)}</div><div class="stat-sub">management share</div></div>`:''}
    `;
  document.getElementById('finBlocks').innerHTML=`
    <div class="finance-block"><div class="finance-block-title">Revenue</div>
      <div class="finance-row"><span class="label">Room Revenue</span><span class="val">${fmtMoney(totalRoom)}</span></div>
      <div class="finance-row"><span class="label">Extra Guest Fees</span><span class="val">${fmtMoney(totalExtra)}</span></div>
      <div class="finance-row"><span class="label">Add-ons / Store</span><span class="val">${fmtMoney(totalAddons)}</span></div>
      <div class="finance-row"><span class="label">Total Net Revenue</span><span class="val pos">${fmtMoney(totalRev)}</span></div>
    </div>
    <div class="finance-block"><div class="finance-block-title">Deductions</div>
      <div class="finance-row"><span class="label">Platform Fees</span><span class="val neg">\u2212${fmtMoney(totalPlatFee)}</span></div>
      <div class="finance-row"><span class="label">Discounts / Promos</span><span class="val neg">\u2212${fmtMoney(totalPromo)}</span></div>
      <div class="finance-row"><span class="label">Other Expenses</span><span class="val neg">\u2212${fmtMoney(totalExp)}</span></div>
      <div class="finance-row"><span class="label">Total Deductions</span><span class="val neg">\u2212${fmtMoney(totalPlatFee+totalPromo+totalExp)}</span></div>
    </div>
    <div class="finance-block"><div class="finance-block-title">Profit</div>
      <div class="finance-row"><span class="label">Net Revenue</span><span class="val">${fmtMoney(totalRev)}</span></div>
      <div class="finance-row"><span class="label">Other Expenses</span><span class="val neg">\u2212${fmtMoney(totalExp)}</span></div>
      <div class="finance-row"><span class="label">Net Profit</span><span class="val pos">${fmtMoney(netProfit)}</span></div>
    </div>`;
  const wrap=document.getElementById('finCharts');
  if(wrap){wrap.innerHTML=`<div class="card"><div class="section-title" style="margin-bottom:12px">Revenue by Platform</div><div class="chart-wrap"><canvas id="finPieCanvas" class="chart"></canvas></div></div><div class="card"><div class="section-title" style="margin-bottom:12px">6-Month Trend</div><div class="chart-wrap"><canvas id="finBarCanvas" class="chart"></canvas></div></div>`;setTimeout(()=>{drawPieChart('finPieCanvas',list);drawBarChart('finBarCanvas');},50);}
}

['fin-period','fin-prop'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',renderFinanceOverview);});

// F3: Export Finance Overview as Excel
function exportFinanceOverview(){
  const list=getFinanceList();
  const period=document.getElementById('fin-period')?.value||'all';
  const propId=document.getElementById('fin-prop')?.value||'all';
  const propLabel=propId==='all'?'All Properties':(properties.find(p=>p.id===propId)?.name||propId);
  const periodLabels={thismonth:'This Month',lastmonth:'Last Month',thisyear:'This Year',all:'All Time'};
  const title=`Finance Overview — ${periodLabels[period]||period} — ${propLabel}`;
  // Build rows
  const headerRow=['Guest','Property','Platform','Check-in','Check-out','Nights','Rate/Night','Accommodation','Promo','Special Offer','Service Fee','Extra Guests','Extra Fee','Adjustments','Guest Total','Net Revenue','Store Sales','Cleaning Fee','Status'];
  const dataRows=list.map(b=>{const t=calcTotals(b);return[b.guest,propName(b.property),b.platform,b.checkin,b.checkout,t.nights,b.rate,t.bkFee,b.promo||0,b.specialOffer||0,b.serviceFee||0,t.extraG,t.extraFee,t.adjTotal,t.guestTotal,t.netRevenue,b.storeSales||0,b.cleaningFee||0,b.status];});
  // Totals row
  const totals=['TOTALS','','','','',
    list.reduce((s,b)=>s+nightsBetween(b.checkin,b.checkout),0),'',
    list.reduce((s,b)=>s+calcTotals(b).bkFee,0),
    list.reduce((s,b)=>s+(+b.promo||0),0),
    list.reduce((s,b)=>s+(+b.specialOffer||0),0),
    list.reduce((s,b)=>s+(+b.serviceFee||0),0),'',
    list.reduce((s,b)=>s+calcTotals(b).extraFee,0),
    list.reduce((s,b)=>s+calcTotals(b).adjTotal,0),
    list.reduce((s,b)=>s+calcTotals(b).guestTotal,0),
    list.reduce((s,b)=>s+calcTotals(b).netRevenue,0),
    list.reduce((s,b)=>s+(+b.storeSales||0),0),
    list.reduce((s,b)=>s+(+b.cleaningFee||0),0),''];
  // CSV export (simple, no external lib needed)
  const fmt=v=>typeof v==='number'?v:(v||'');
  const csvLine=row=>row.map(v=>`"${String(fmt(v)).replace(/"/g,'""')}"`).join(',');
  const csv=[`"${title}"`,'',csvLine(headerRow),...dataRows.map(csvLine),csvLine(totals)].join('\r\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`bloomstone-finance-${period}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();toast('Finance report exported.','success');
}

function populateExpenseMonthYear(){
  const now=new Date();
  const mSel=document.getElementById('fe-month');const ySel=document.getElementById('fe-year');
  if(!mSel||!ySel)return;
  const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
  mSel.innerHTML=months.map((mo,i)=>`<option value="${i+1}"${i===now.getMonth()?' selected':''}>${mo}</option>`).join('');
  const years=[];for(let y=now.getFullYear()+1;y>=now.getFullYear()-5;y--)years.push(y);
  ySel.innerHTML=years.map(y=>`<option value="${y}"${y===now.getFullYear()?' selected':''}>${y}</option>`).join('');
}

function openExpenseModal(id=null){
  editingExpId=id;
  document.getElementById('expModalTitle').textContent=id?'Edit Expenses':'Add Expenses';
  populateSelects();populateExpenseMonthYear();
  EXP_CATS.forEach(c=>{const el=document.getElementById('fe-'+c);if(el){el.value=0;el.classList.remove('error');}
    const er=document.getElementById('err-'+c);if(er)er.classList.remove('show');});
  const now=new Date();
  document.getElementById('fe-month').value=now.getMonth()+1;
  document.getElementById('fe-year').value=now.getFullYear();
  document.getElementById('fe-notes').value='';
  document.getElementById('fe-prop').value='all';
  if(id){
    const e=expenses.find(x=>x.id===id);
    if(e){
      if(e.month){const[y,mo]=e.month.split('-');document.getElementById('fe-year').value=y;document.getElementById('fe-month').value=parseInt(mo,10);}
      document.getElementById('fe-prop').value=e.prop||'all';
      document.getElementById('fe-notes').value=e.notes||'';
      EXP_CATS.forEach(c=>{const el=document.getElementById('fe-'+c);if(el)el.value=e[c]??0;});
      // Auto-fill cleaning from bookings
      const autoClean=bookings.filter(b=>b.status!=='Cancelled'&&b.checkout&&b.checkout.startsWith(e.month)&&(e.prop==='all'||b.property===e.prop)).reduce((s,b)=>s+(+b.cleaningFee||0),0);
      if(autoClean){const cl=document.getElementById('fe-cleaning');if(cl)cl.value=autoClean;}
    }
  }else{
    // New entry — try to auto-fill cleaning from current month
    const now=new Date();
    const monthStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const autoClean=bookings.filter(b=>b.status!=='Cancelled'&&b.checkout&&b.checkout.startsWith(monthStr)).reduce((s,b)=>s+(+b.cleaningFee||0),0);
    if(autoClean){const cl=document.getElementById('fe-cleaning');if(cl)cl.value=autoClean;}
  }
  openModal('expenseModal');
}

function saveExpense(){
  const mo=document.getElementById('fe-month').value;
  const yr=document.getElementById('fe-year').value;
  if(!mo||!yr){toast('Month and year required.','error');return;}
  let err=false;
  EXP_CATS.forEach(c=>{
    const el=document.getElementById('fe-'+c);const erEl=document.getElementById('err-'+c);
    if(!el)return;
    if(el.value===''||isNaN(+el.value)||+el.value<0){el.classList.add('error');if(erEl)erEl.classList.add('show');err=true;}
    else{el.classList.remove('error');if(erEl)erEl.classList.remove('show');}
  });
  if(err){toast('All amounts must be 0 or more.','error');return;}
  const data={id:editingExpId||genId(),month:`${yr}-${String(mo).padStart(2,'0')}`,prop:document.getElementById('fe-prop').value,notes:document.getElementById('fe-notes').value};
  EXP_CATS.forEach(c=>{data[c]=+document.getElementById('fe-'+c).value||0;});
  data.amount=EXP_CATS.reduce((s,c)=>s+(data[c]||0),0);
  if(editingExpId){const i=expenses.findIndex(e=>e.id===editingExpId);if(i>=0)expenses[i]=data;}
  else expenses.unshift(data);
  saveAll();closeModal('expenseModal');toast('Expenses saved.');renderExpenses();driveAutoBackup();
}

function deleteExpense(id){
  const e=expenses.find(x=>x.id===id);
  confirmDialog('\u26a0 Delete Expense Record',`You are about to permanently delete this expense record (${e?fmtMonthYear(e.month+'-01'):''}). This cannot be undone and will affect financial reports.`,'\ud83d\uddd1',()=>{
    expenses=expenses.filter(ex=>ex.id!==id);saveAll();renderExpenses();toast('Expense deleted.','warning');
  });
}

// Bookings whose checkout falls in the given month (YYYY-MM).
// All per-stay costs (cleaning, promo discount) are attributed to checkout month —
// that's when the stay settles: cleaning is done, revenue is realised.
function expBookings(month,propId){
  return bookings.filter(b=>{
    if(b.status==='Cancelled'||!b.checkout)return false;
    if(!b.checkout.startsWith(month))return false;
    if(propId!=='all'&&b.property!==propId)return false;
    return true;
  });
}
// ============================================================
// OWNER STATEMENTS (Phase 2)
// ============================================================
// ── shared data builder ────────────────────────────────────────
function _buildStatementData(propId,month,opts={}){
  const prop=properties.find(p=>p.id===propId);
  if(!prop)return null;
  const ownerPct=+(prop.ownerPct??70);
  const incCleaning=opts.incCleaning!==false;
  const incStore=opts.incStore!==false;
  const incExtras=opts.incExtras!==false;
  const incAdj=opts.incAdj!==false;
  const list=bookings.filter(b=>b.property===propId&&b.status!=='Cancelled'&&(b.checkin||'').startsWith(month));
  const rows=list.map(b=>{
    const t=calcTotals(b);
    // Full rate × nights before any discounts — shown to owner for transparency
    const rawRate=t.bkFee;                           // rate × nights (no deductions)
    const promoDeduct=t.promoTotal;                  // direct booking promo discount
    const specialDeduct=t.specialOffer;              // platform special offer (absorbed by host)
    const gross=t.stayFee+(incExtras?t.extraFee:0)+(incAdj?t.adjTotal:0); // net accommodation
    const svcFee=t.svcFee;                           // platform commission charged to host
    const cleaning=incCleaning?t.cleaningFee:0;
    const store=incStore?t.storeSales:0;
    const splitBase=Math.max(0,gross-svcFee-cleaning);
    const ownerAmt=splitBase*(ownerPct/100)+store;
    return{b,t,rawRate,promoDeduct,specialDeduct,gross,svcFee,cleaning,store,splitBase,ownerAmt,nights:t.nights};
  });
  const totalGross=rows.reduce((s,r)=>s+r.gross,0);
  const totalRawRate=rows.reduce((s,r)=>s+r.rawRate,0);
  const totalPromo=rows.reduce((s,r)=>s+r.promoDeduct,0);
  const totalSpecialOffer=rows.reduce((s,r)=>s+r.specialDeduct,0);
  const totalSvcFee=rows.reduce((s,r)=>s+r.svcFee,0);
  const totalCleaning=rows.reduce((s,r)=>s+r.cleaning,0);
  const totalStore=rows.reduce((s,r)=>s+r.store,0);
  const totalSplitBase=rows.reduce((s,r)=>s+r.splitBase,0);
  const ownerAmount=rows.reduce((s,r)=>s+r.ownerAmt,0);
  const bloomsAmount=totalSplitBase*((100-ownerPct)/100);
  const totalNights=rows.reduce((s,r)=>s+r.nights,0);
  const [y,mo]=month.split('-');
  const monthLabel=new Date(+y,+mo-1,1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});
  const payoutDate=`${+mo===12?+y+1:+y}-${String(+mo===12?1:+mo+1).padStart(2,'0')}-05`;
  return{prop,ownerPct,list,rows,totalGross,totalRawRate,totalPromo,totalSpecialOffer,totalSvcFee,totalCleaning,totalStore,totalSplitBase,ownerAmount,bloomsAmount,totalNights,monthLabel,payoutDate,month,opts};
}

function _getOsOpts(){
  return{
    incCleaning:document.getElementById('os-inc-cleaning')?.checked!==false,
    incStore:document.getElementById('os-inc-store')?.checked!==false,
    incExtras:document.getElementById('os-inc-extras')?.checked!==false,
    incAdj:document.getElementById('os-inc-adj')?.checked!==false,
  };
}

// ── inline report renderer ─────────────────────────────────────
function renderOwnerStatements(){
  // Populate property dropdown only if empty
  const osPropEl=document.getElementById('os-prop');
  if(osPropEl&&osPropEl.options.length<=1){
    const cur=osPropEl.value;
    osPropEl.innerHTML='<option value="">Select Property…</option>'+
      properties.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
    if(cur)osPropEl.value=cur;
  }
  // Populate month dropdown only if empty
  const osMonthEl=document.getElementById('os-month');
  if(osMonthEl&&osMonthEl.options.length<=1){
    const months=[];const now=new Date();
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
    osMonthEl.innerHTML='<option value="">Select Month…</option>'+months.map(m=>{const[y,mo]=m.split('-');const lbl=new Date(+y,+mo-1,1).toLocaleDateString('en-PH',{month:'long',year:'numeric'});return`<option value="${m}">${lbl}</option>`;}).join('');
    // default to current month
    const now2=new Date();
    osMonthEl.value=`${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}`;
  }

  const propId=osPropEl?.value||'';
  const month=osMonthEl?.value||'';
  const stmtEl=document.getElementById('osStatementPreview');
  const ledgerEl=document.getElementById('osLedger');
  const printBtn=document.getElementById('osPrintBtn');

  if(!propId||!month){
    if(stmtEl)stmtEl.innerHTML=`<div class="empty" style="padding:60px 0"><div class="empty-icon">📋</div><div class="empty-text">Select a property and month to view the statement</div></div>`;
    if(ledgerEl)ledgerEl.innerHTML='';
    if(printBtn)printBtn.style.display='none';
    return;
  }

  const opts=_getOsOpts();
  const d=_buildStatementData(propId,month,opts);
  if(!d){if(stmtEl)stmtEl.innerHTML='';return;}
  if(printBtn)printBtn.style.display='';

  // ── Auto-save/update ledger (base amounts, no opts override) — always refresh so
  // recalculated fees (after migration fixes) are reflected in the ledger ──
  const base=_buildStatementData(propId,month,{});
  const existing=ownerPayouts.find(x=>x.propertyId===propId&&x.month===month);
  if(!existing){
    ownerPayouts.push({id:genId(),propertyId:propId,month,bookingCount:base.list.length,grossRevenue:base.totalGross,platFees:base.totalSvcFee,netRevenue:base.totalSplitBase+base.totalStore,amountDue:base.ownerAmount,paid:false,datePaid:'',method:d.prop.payoutMethod||'',notes:''});
  }else{
    // Always refresh computed fields so fixed service fees propagate to ledger
    existing.bookingCount=base.list.length;
    existing.grossRevenue=base.totalGross;
    existing.platFees=base.totalSvcFee;
    existing.netRevenue=base.totalSplitBase+base.totalStore;
    existing.amountDue=base.ownerAmount;
  }
  saveAll();

  // ── Build booking rows ──
  const ledgerRec=ownerPayouts.find(x=>x.propertyId===propId&&x.month===month);
  const isPaid=ledgerRec?.paid||false;
  const bkRows=d.rows.map(r=>`<tr>
    <td style="white-space:nowrap">${fmtDate(r.b.checkin)}</td>
    <td style="white-space:nowrap">${fmtDate(r.b.checkout)}</td>
    <td style="text-align:center">${r.nights}</td>
    <td><strong>${esc(r.b.guest)}</strong></td>
    <td>${platformPillHtml(r.b.platform)}</td>
    <td style="text-align:right;color:var(--text-2)">${fmtMoney(r.b.rate||0)}<span style="font-size:10px;color:var(--text-3)">/nt</span></td>
    <td style="text-align:right">${fmtMoney(r.rawRate)}</td>
    <td style="text-align:right;color:var(--purple)">${r.promoDeduct?`−${fmtMoney(r.promoDeduct)}`:'—'}</td>
    <td style="text-align:right;color:var(--purple)">${r.specialDeduct?`−${fmtMoney(r.specialDeduct)}`:'—'}</td>
    <td style="text-align:right;font-weight:600">${fmtMoney(r.gross)}</td>
    <td style="text-align:right;color:var(--red)">${r.svcFee?`−${fmtMoney(r.svcFee)}`:'—'}</td>
    <td style="text-align:right;color:var(--red)">${r.cleaning?`−${fmtMoney(r.cleaning)}`:'—'}</td>
    <td style="text-align:right;color:var(--green)">${r.store?`+${fmtMoney(r.store)}`:'—'}</td>
    <td style="text-align:right;font-weight:700">${fmtMoney(r.splitBase)}</td>
    <td style="text-align:right;color:var(--blue);font-weight:700">${fmtMoney(r.ownerAmt)}</td>
  </tr>`).join('');

  // ── Inline statement HTML ──
  stmtEl.innerHTML=`<div class="os-statement" id="osStatementDoc">
    <div class="os-header">
      <div>
        <div class="os-logo">Bloomstone <span>PMS</span></div>
        <div class="os-subtitle">Monthly Owner Statement</div>
      </div>
      <div style="text-align:right">
        ${isPaid?`<span class="badge badge-green" style="font-size:12px;padding:4px 12px">✓ PAID</span>`:`<span class="badge badge-orange" style="font-size:12px;padding:4px 12px">UNPAID</span>`}
        <div style="font-size:11px;color:var(--text-3);margin-top:6px">Generated ${new Date().toLocaleDateString('en-PH')}</div>
      </div>
    </div>

    <div class="os-meta-grid">
      <div class="os-meta-block">
        <div class="os-meta-label">Property</div>
        <div class="os-meta-value">${esc(d.prop.name)}</div>
        ${d.prop.city?`<div class="os-meta-sub">${esc(d.prop.city)}</div>`:''}
      </div>
      <div class="os-meta-block">
        <div class="os-meta-label">Owner</div>
        <div class="os-meta-value">${esc(d.prop.ownerName||'—')}</div>
        ${d.prop.ownerPhone?`<div class="os-meta-sub">${esc(d.prop.ownerPhone)}</div>`:''}
        ${d.prop.ownerEmail?`<div class="os-meta-sub">${esc(d.prop.ownerEmail)}</div>`:''}
      </div>
      <div class="os-meta-block">
        <div class="os-meta-label">Period</div>
        <div class="os-meta-value">${d.monthLabel}</div>
        <div class="os-meta-sub">Revenue share: ${d.ownerPct}% owner · ${100-d.ownerPct}% Bloomstone</div>
      </div>
      <div class="os-meta-block">
        <div class="os-meta-label">Payout Info</div>
        <div class="os-meta-value">Due ${fmtDate(d.payoutDate)}</div>
        <div class="os-meta-sub">${esc(d.prop.payoutMethod||'Method not set')}${d.prop.payoutAccount?' · '+esc(d.prop.payoutAccount):''}</div>
      </div>
    </div>

    <div class="os-kpi-row">
      <div class="os-kpi"><div class="os-kpi-val">${d.list.length}</div><div class="os-kpi-lbl">Bookings</div></div>
      <div class="os-kpi"><div class="os-kpi-val">${d.totalNights}</div><div class="os-kpi-lbl">Nights</div></div>
      <div class="os-kpi"><div class="os-kpi-val">${fmtMoney(d.totalRawRate)}</div><div class="os-kpi-lbl">Gross Revenue</div></div>
      ${(d.totalPromo+d.totalSpecialOffer)?`<div class="os-kpi"><div class="os-kpi-val" style="color:var(--purple)">−${fmtMoney(d.totalPromo+d.totalSpecialOffer)}</div><div class="os-kpi-lbl">Promos / Offers</div></div>`:''}
      <div class="os-kpi"><div class="os-kpi-val" style="color:var(--red)">−${fmtMoney(d.totalSvcFee+d.totalCleaning)}</div><div class="os-kpi-lbl">Fees &amp; Cleaning</div></div>
      <div class="os-kpi"><div class="os-kpi-val" style="color:var(--blue);font-size:16px">${fmtMoney(d.ownerAmount)}</div><div class="os-kpi-lbl">Owner Payout</div></div>
    </div>

    <div class="os-section-title">Booking Details</div>
    <div class="table-wrap" style="margin-bottom:0">
      <table class="data-table">
        <thead><tr>
          <th>Check-in</th><th>Check-out</th><th style="text-align:center">Nts</th><th>Guest</th><th>Platform</th>
          <th style="text-align:right">Rate/Nt</th>
          <th style="text-align:right">Full Rate</th>
          <th style="text-align:right;color:var(--purple)">Promo</th>
          <th style="text-align:right;color:var(--purple)">Spc Offer</th>
          <th style="text-align:right">Accommodation</th>
          <th style="text-align:right;color:var(--red)">Plat Fee</th>
          <th style="text-align:right;color:var(--red)">Cleaning</th>
          <th style="text-align:right;color:var(--green)">Store</th>
          <th style="text-align:right">Net Base</th>
          <th style="text-align:right;color:var(--blue)">Owner Share</th>
        </tr></thead>
        <tbody>${bkRows||`<tr><td colspan="15" style="text-align:center;color:var(--text-3);padding:24px">No bookings for this month</td></tr>`}</tbody>
      </table>
    </div>

    <div class="os-bottom-grid">
      <div class="os-summary-block">
        <div class="os-section-title">Revenue Summary</div>
        <div class="os-sum-row"><span>Full Rate Revenue (rate × nights)</span><span>${fmtMoney(d.totalRawRate)}</span></div>
        ${d.totalPromo?`<div class="os-sum-row" style="color:var(--purple)"><span>Less: Promo Discounts</span><span>−${fmtMoney(d.totalPromo)}</span></div>`:''}
        ${d.totalSpecialOffer?`<div class="os-sum-row" style="color:var(--purple)"><span>Less: Special Offers (Platform)</span><span>−${fmtMoney(d.totalSpecialOffer)}</span></div>`:''}
        ${(d.totalPromo||d.totalSpecialOffer)?`<div class="os-sum-row" style="font-weight:600;border-top:1px solid var(--border);padding-top:4px;margin-top:2px"><span>Accommodation Revenue</span><span>${fmtMoney(d.totalGross)}</span></div>`:''}
        ${d.totalSvcFee?`<div class="os-sum-row" style="color:var(--red)"><span>Less: Platform / Service Fees</span><span>−${fmtMoney(d.totalSvcFee)}</span></div>`:`<div class="os-sum-row" style="color:var(--text-3)"><span>Platform / Service Fees</span><span>—</span></div>`}
        ${d.totalCleaning?`<div class="os-sum-row" style="color:var(--red)"><span>Less: Cleaning ${!opts.incCleaning?'<span style="font-size:10px;color:var(--orange)">(excluded)</span>':''}</span><span>${opts.incCleaning?`−${fmtMoney(d.totalCleaning)}`:`<s style="opacity:.4">−${fmtMoney(d.totalCleaning)}</s>`}</span></div>`:''}
        ${d.totalStore?`<div class="os-sum-row" style="color:var(--green)"><span>Add: Store / Add-on Sales ${!opts.incStore?'<span style="font-size:10px;color:var(--orange)">(excluded)</span>':''}</span><span>${opts.incStore?`+${fmtMoney(d.totalStore)}`:`<s style="opacity:.4">+${fmtMoney(d.totalStore)}</s>`}</span></div>`:''}
        <div class="os-sum-row os-sum-total"><span>Net Revenue (split base)</span><span>${fmtMoney(d.totalSplitBase)}</span></div>
      </div>
      <div class="os-payout-block">
        <div class="os-section-title">Payout Breakdown</div>
        <div class="os-owner-box">
          <div class="os-owner-label">OWNER PAYOUT (${d.ownerPct}%)</div>
          <div class="os-owner-amt">${fmtMoney(d.ownerAmount)}</div>
          ${isPaid&&ledgerRec?.datePaid?`<div class="os-owner-paid">✓ Paid on ${fmtDate(ledgerRec.datePaid)}</div>`:''}
        </div>
        <div class="os-blooms-row"><span>Bloomstone PH (${100-d.ownerPct}%)</span><span style="font-weight:700;color:var(--green)">${fmtMoney(d.bloomsAmount)}</span></div>
        ${!isPaid?`<button class="btn btn-primary btn-sm" style="margin-top:12px;width:100%" onclick="markPayoutPaidForProp('${propId}','${month}')">Mark as Paid</button>`:'<div style="text-align:center;margin-top:10px;font-size:12px;color:var(--green);font-weight:700">✓ Payment recorded</div>'}
      </div>
    </div>
    <div style="font-size:11px;color:var(--text-3);text-align:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      Bloomstone PMS · Payout due ${fmtDate(d.payoutDate)} · ${d.monthLabel}
    </div>
  </div>`;

  // ── Payout Ledger ──
  if(ledgerEl){
    const payouts=ownerPayouts.filter(x=>x.propertyId===propId).sort((a,b)=>b.month.localeCompare(a.month));
    const totalUnpaid=payouts.filter(x=>!x.paid).reduce((s,x)=>s+x.amountDue,0);
    ledgerEl.innerHTML=`<div style="margin-top:28px">
      <div class="os-section-title">Payout Ledger — ${esc(d.prop.name)}</div>
      ${totalUnpaid>0?`<div class="alert-bar show warning" style="margin-bottom:10px">⚠ Outstanding: <strong>${fmtMoney(totalUnpaid)}</strong> unpaid to ${esc(d.prop.ownerName||'owner')}</div>`:''}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Month</th><th>Bookings</th><th>Gross</th><th>Fees</th><th>Net</th><th>Owner Due</th><th>Status</th><th>Date Paid</th><th></th></tr></thead>
          <tbody>${payouts.length?payouts.map(x=>`
            <tr style="cursor:pointer" onclick="document.getElementById('os-month').value='${x.month}';document.getElementById('os-prop').value='${propId}';renderOwnerStatements()">
              <td style="font-weight:700">${x.month}</td>
              <td>${x.bookingCount||'—'}</td>
              <td>${fmtMoney(x.grossRevenue||0)}</td>
              <td style="color:var(--red)">${x.platFees?`−${fmtMoney(x.platFees)}`:'—'}</td>
              <td>${fmtMoney(x.netRevenue||0)}</td>
              <td style="font-weight:800;color:var(--blue)">${fmtMoney(x.amountDue)}</td>
              <td>${x.paid?`<span class="badge badge-green">✓ Paid</span>`:`<span class="badge badge-orange">Unpaid</span>`}</td>
              <td style="font-size:11px;color:var(--text-3)">${x.datePaid?fmtDate(x.datePaid):'—'}</td>
              <td onclick="event.stopPropagation()" style="white-space:nowrap">
                ${!x.paid?`<button class="btn btn-sm btn-primary" onclick="markPayoutPaid('${x.id}')">Mark Paid</button>`:''}
                <button class="btn btn-sm" onclick="deleteOwnerPayout('${x.id}')" title="Delete" style="color:var(--red)">✕</button>
              </td>
            </tr>`).join(''):
            `<tr><td colspan="9" style="text-align:center;color:var(--text-3);padding:20px">No payout records yet</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  }
}

function markPayoutPaidForProp(propId,month){
  const rec=ownerPayouts.find(x=>x.propertyId===propId&&x.month===month);
  if(rec){rec.paid=true;rec.datePaid=todayISO();saveAll();renderOwnerStatements();toast('Payout marked as paid ✓','success');}
}

function printOwnerStatement(){
  const propId=document.getElementById('os-prop')?.value||'';
  const month=document.getElementById('os-month')?.value||'';
  if(!propId||!month){toast('Select a property and month first.','warning');return;}
  const opts=_getOsOpts();
  const d=_buildStatementData(propId,month,opts);
  if(!d){toast('No data found.','error');return;}
  const ledgerRec=ownerPayouts.find(x=>x.propertyId===propId&&x.month===month);
  const isPaid=ledgerRec?.paid||false;
  const rows=d.rows.map(r=>`<tr>
    <td>${fmtDate(r.b.checkin)}</td><td>${fmtDate(r.b.checkout)}</td>
    <td style="text-align:center">${r.nights}</td>
    <td>${esc(r.b.guest)}</td><td>${esc(r.b.platform||'—')}</td>
    <td style="text-align:right">${fmtMoney(r.gross)}</td>
    <td style="text-align:right;color:#c0392b">${r.svcFee?`−${fmtMoney(r.svcFee)}`:''}</td>
    <td style="text-align:right;color:#c0392b">${r.cleaning?`−${fmtMoney(r.cleaning)}`:''}</td>
    <td style="text-align:right;color:#2d6a1f">${r.store?`+${fmtMoney(r.store)}`:''}</td>
    <td style="text-align:right;font-weight:700">${fmtMoney(r.splitBase)}</td>
    <td style="text-align:right;font-weight:800;color:#1a56db">${fmtMoney(r.ownerAmt)}</td>
  </tr>`).join('');
  const toggleNote=[
    !opts.incCleaning?'Cleaning excluded':'',
    !opts.incStore?'Store sales excluded':'',
    !opts.incExtras?'Extra guests excluded':'',
    !opts.incAdj?'Adjustments excluded':'',
  ].filter(Boolean).join(' · ');
  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Owner Statement – ${esc(d.monthLabel)}</title>
  <style>
    *{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:0;color:#1a1a1a;background:#fff}
    .page{max-width:720px;margin:0 auto;padding:28px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;padding-bottom:14px;border-bottom:2px solid #e8e6e1}
    .logo{font-size:20px;font-weight:900;letter-spacing:-.03em}.logo span{color:#bbb;font-weight:400}
    .subtitle{font-size:10px;color:#999;margin-top:2px;text-transform:uppercase;letter-spacing:.05em}
    .badge{display:inline-block;padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700}
    .paid{background:#edf7ea;color:#2d6a1f}.unpaid{background:#fef8ec;color:#c47c0a}
    .meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;background:#f8f7f4;border-radius:8px;padding:14px;margin-bottom:14px}
    .meta-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:3px}
    .meta-val{font-size:12px;font-weight:700;color:#1a1a1a}.meta-sub{font-size:10px;color:#666;margin-top:1px}
    .kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:#e8e6e1;border-radius:8px;overflow:hidden;margin-bottom:14px}
    .kpi{background:#fff;padding:10px;text-align:center}
    .kpi-val{font-size:14px;font-weight:900;color:#1a1a1a}.kpi-lbl{font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
    .sec{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;margin:12px 0 5px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#f5f4f0;padding:5px 6px;text-align:left;font-weight:700;font-size:9px;border-bottom:2px solid #e0ddd5;text-transform:uppercase;letter-spacing:.04em}
    td{padding:4px 6px;border-bottom:1px solid #f0ede5;vertical-align:top}
    .bottom{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px}
    .sum-row{display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid #f0ede5;color:#555}
    .sum-total{font-weight:900;font-size:12px;color:#1a1a1a;border-top:2px solid #1a1a1a;border-bottom:none;padding-top:6px;margin-top:2px}
    .owner-box{background:#eef4ff;border:2px solid #1a56db;border-radius:8px;padding:14px;margin-bottom:10px}
    .owner-lbl{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#1a56db;margin-bottom:4px}
    .owner-amt{font-size:26px;font-weight:900;color:#1a56db;line-height:1}
    .owner-paid{font-size:10px;color:#2d6a1f;font-weight:700;margin-top:5px}
    .blooms-row{display:flex;justify-content:space-between;font-size:11px;color:#555;padding:6px 0;border-top:1px solid #d1d9f0;margin-top:4px}
    .footer{font-size:9px;color:#bbb;text-align:center;margin-top:16px;border-top:1px solid #e8e6e1;padding-top:10px}
    .toggle-note{font-size:9px;color:#c47c0a;background:#fef8ec;border-radius:4px;padding:2px 8px;margin-bottom:10px;display:inline-block}
    @media print{body{margin:0}@page{margin:12mm 10mm}}
  </style></head><body><div class="page">
  <div class="hdr">
    <div><div class="logo">Bloomstone <span>PMS</span></div><div class="subtitle">Monthly Owner Statement</div></div>
    <div style="text-align:right"><div class="badge ${isPaid?'paid':'unpaid'}">${isPaid?'✓ PAID':'UNPAID'}</div><div style="font-size:9px;color:#999;margin-top:5px">Generated ${new Date().toLocaleDateString('en-PH')}</div></div>
  </div>
  ${toggleNote?`<div class="toggle-note">⚠ Report excludes: ${toggleNote}</div>`:''}
  <div class="meta-grid">
    <div><div class="meta-lbl">Property</div><div class="meta-val">${esc(d.prop.name)}</div>${d.prop.city?`<div class="meta-sub">${esc(d.prop.city)}</div>`:''}</div>
    <div><div class="meta-lbl">Owner</div><div class="meta-val">${esc(d.prop.ownerName||'—')}</div>${d.prop.ownerPhone?`<div class="meta-sub">${esc(d.prop.ownerPhone)}</div>`:''}</div>
    <div><div class="meta-lbl">Period</div><div class="meta-val">${d.monthLabel}</div><div class="meta-sub">${d.ownerPct}% owner · ${100-d.ownerPct}% Bloomstone</div></div>
    <div><div class="meta-lbl">Payout Due</div><div class="meta-val">${fmtDate(d.payoutDate)}</div><div class="meta-sub">${esc(d.prop.payoutMethod||'TBD')}${d.prop.payoutAccount?' · '+esc(d.prop.payoutAccount):''}</div></div>
  </div>
  <div class="kpi-row">
    <div class="kpi"><div class="kpi-val">${d.list.length}</div><div class="kpi-lbl">Bookings</div></div>
    <div class="kpi"><div class="kpi-val">${d.totalNights}</div><div class="kpi-lbl">Nights</div></div>
    <div class="kpi"><div class="kpi-val">${fmtMoney(d.totalGross)}</div><div class="kpi-lbl">Gross</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#c0392b">−${fmtMoney(d.totalSvcFee+d.totalCleaning)}</div><div class="kpi-lbl">Fees</div></div>
    <div class="kpi"><div class="kpi-val" style="color:#1a56db">${fmtMoney(d.ownerAmount)}</div><div class="kpi-lbl">Owner Payout</div></div>
  </div>
  <div class="sec">Booking Details</div>
  <table>
    <thead><tr><th>Check-in</th><th>Check-out</th><th>Nts</th><th>Guest</th><th>Platform</th><th style="text-align:right">Gross</th><th style="text-align:right">Svc</th><th style="text-align:right">Cleaning</th><th style="text-align:right">Store</th><th style="text-align:right">Net</th><th style="text-align:right">Owner</th></tr></thead>
    <tbody>${rows||`<tr><td colspan="11" style="color:#999;padding:10px;text-align:center">No bookings this month</td></tr>`}</tbody>
  </table>
  <div class="bottom">
    <div>
      <div class="sec">Revenue Summary</div>
      <div class="sum-row"><span>Gross guest charges</span><span>${fmtMoney(d.totalGross)}</span></div>
      ${d.totalSvcFee?`<div class="sum-row" style="color:#c0392b"><span>Service / platform fees</span><span>−${fmtMoney(d.totalSvcFee)}</span></div>`:''}
      ${d.totalCleaning?`<div class="sum-row" style="color:#c0392b"><span>Cleaning fees</span><span>−${fmtMoney(d.totalCleaning)}</span></div>`:''}
      ${d.totalStore?`<div class="sum-row" style="color:#2d6a1f"><span>Store sales (100% owner)</span><span>+${fmtMoney(d.totalStore)}</span></div>`:''}
      <div class="sum-row sum-total"><span>Net Split Base</span><span>${fmtMoney(d.totalSplitBase)}</span></div>
    </div>
    <div>
      <div class="sec">Payout</div>
      <div class="owner-box">
        <div class="owner-lbl">OWNER PAYOUT (${d.ownerPct}%)</div>
        <div class="owner-amt">${fmtMoney(d.ownerAmount)}</div>
        ${isPaid&&ledgerRec?.datePaid?`<div class="owner-paid">✓ Paid ${fmtDate(ledgerRec.datePaid)}</div>`:''}
        <div class="blooms-row"><span>Bloomstone PH (${100-d.ownerPct}%)</span><span style="font-weight:700;color:#2d6a1f">${fmtMoney(d.bloomsAmount)}</span></div>
      </div>
    </div>
  </div>
  <div class="footer">Bloomstone PMS · Payout due ${fmtDate(d.payoutDate)} · ${d.monthLabel} · ${new Date().toLocaleDateString('en-PH')}</div>
  </div></body></html>`;
  const win=window.open('','_blank','width=800,height=960');
  if(!win){toast('Allow popups to print.','warning');return;}
  win.document.write(html);win.document.close();win.focus();
  setTimeout(()=>win.print(),600);
}

function generateOwnerStatement(){printOwnerStatement();}
function markPayoutPaid(id){
  const p=ownerPayouts.find(x=>x.id===id);if(!p)return;
  p.paid=true;p.datePaid=todayISO();
  saveAll();renderOwnerStatements();
  toast('Payout marked as paid ✓','success');
}
function deleteOwnerPayout(id){
  confirmDialog('Delete payout record?','This will remove the payout record from the ledger. The bookings themselves are not affected.',null,()=>{
    ownerPayouts=ownerPayouts.filter(x=>x.id!==id);
    saveAll();renderOwnerStatements();
    toast('Payout record deleted.','warning');
  });
}
function renderExpenses(){
  const mo=document.getElementById('exp-month')?.value||'all';
  const pr=document.getElementById('exp-prop')?.value||'all';

  // All non-cancelled bookings filtered by property (month filter applied per-row below)
  const allBks=bookings.filter(b=>{
    if(b.status==='Cancelled'||!b.checkin)return false;
    if(pr!=='all'&&b.property!==pr)return false;
    return true;
  });

  // Collect all months from bookings (checkin) and expense records
  const monthSet=new Set();
  allBks.forEach(b=>{const m=(b.checkin||'').substring(0,7);if(m)monthSet.add(m);});
  expenses.filter(e=>pr==='all'||e.prop===pr||e.prop==='all').forEach(e=>{if(e.month)monthSet.add(e.month);});
  let months=[...monthSet].sort((a,b)=>b.localeCompare(a)); // newest first
  if(mo!=='all')months=months.filter(m=>m===mo||(mo.length===7&&m===mo));

  // All platform names that appear in filtered bookings
  const platNames=[...new Set(allBks.map(b=>b.platform||'Unknown'))].filter(Boolean).sort();

  // Stat card totals (all months, filtered property)
  const bkForStats=mo==='all'?allBks:allBks.filter(b=>(b.checkin||'').startsWith(mo));
  const totalPlatFees=bkForStats.reduce((s,b)=>s+calcTotals(b).platFee,0);
  const totalPromo=bkForStats.reduce((s,b)=>s+(+b.promo||0),0);
  const bkCheckoutStats=bookings.filter(b=>{
    if(b.status==='Cancelled'||!b.checkout)return false;
    if(pr!=='all'&&b.property!==pr)return false;
    if(mo!=='all'&&!(b.checkout||'').startsWith(mo))return false;
    return true;
  });
  const totalCleaningFromBks=bkCheckoutStats.reduce((s,b)=>s+(+b.cleaningFee||0),0);
  const expList=expenses.filter(e=>(pr==='all'||e.prop===pr||e.prop==='all')&&(mo==='all'||e.month===mo));
  const manualCleaning=expList.reduce((s,e)=>s+(e.cleaning||0),0);
  const totalCleaning=totalCleaningFromBks||manualCleaning;
  const manualOther=expList.reduce((s,e)=>s+(e.water||0)+(e.electricity||0)+(e.supplies||0)+(e.maintenance||0)+(e.other||0),0);
  const grandTotal=totalPlatFees+totalPromo+totalCleaning+manualOther;

  document.getElementById('expStats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total Expenses</div><div class="stat-value" style="color:var(--red)">${fmtMoney(grandTotal)}</div><div class="stat-sub">${months.length} months</div></div>
    <div class="stat-card"><div class="stat-label">Platform Fees</div><div class="stat-value" style="color:var(--orange)">${fmtMoney(totalPlatFees)}</div><div class="stat-sub">paid to platforms</div></div>
    <div class="stat-card"><div class="stat-label">Promo Discounts</div><div class="stat-value" style="color:var(--purple)">${fmtMoney(totalPromo)}</div></div>
    <div class="stat-card"><div class="stat-label">Cleaning</div><div class="stat-value" style="color:var(--red)">${fmtMoney(totalCleaning)}</div></div>
    <div class="stat-card"><div class="stat-label">Utilities</div><div class="stat-value" style="color:var(--red)">${fmtMoney(expList.reduce((s,e)=>s+(e.water||0)+(e.electricity||0),0))}</div></div>`;

  // ── Build dynamic thead ────────────────────────────────────
  const thead=document.getElementById('expenseThead');
  if(thead){
    const platCols=platNames.map(pn=>{
      const plat=platforms.find(p=>p.name===pn);
      const color=plat?.color||'#888';
      return`<th style="text-align:right;white-space:nowrap"><span style="display:inline-flex;align-items:center;gap:4px;justify-content:flex-end"><span style="width:9px;height:9px;border-radius:2px;background:${color};flex-shrink:0;display:inline-block"></span>${esc(pn)}</span></th>`;
    }).join('');
    thead.innerHTML=`<tr>
      <th>Month</th>
      ${platCols}
      <th style="text-align:right;color:var(--orange)">Plat Total</th>
      <th style="text-align:right;color:var(--purple)">Promo</th>
      <th style="text-align:right">Cleaning</th>
      <th style="text-align:right">Water</th>
      <th style="text-align:right">Electricity</th>
      <th style="text-align:right">Supplies</th>
      <th style="text-align:right">Maintenance</th>
      <th style="text-align:right">Other</th>
      <th style="text-align:right">Total</th>
      <th></th>
    </tr>`;
  }

  const tbody=document.getElementById('expenseTbody');
  if(!months.length){
    tbody.innerHTML=`<tr><td colspan="${platNames.length+11}"><div class="empty"><div class="empty-text">No expenses recorded.</div></div></td></tr>`;
    return;
  }

  const auto=(v,color='')=>`<span style="color:${color||'var(--text)'};font-weight:600">${fmtMoney(v)}</span><span style="font-size:10px;color:var(--text-3);margin-left:3px">auto</span>`;
  const cell=(v,color='var(--text-2)')=>v?`<span style="color:${color};font-weight:600">${fmtMoney(v)}</span>`:`<span style="color:var(--border-2)">—</span>`;

  // Totals accumulators
  const platTotals={};platNames.forEach(pn=>platTotals[pn]=0);
  let grandPlatTotal=0,grandPromo=0,grandCleaning=0,grandWater=0,grandElec=0,grandSupplies=0,grandMaint=0,grandOtherRow=0,grandRowTotal=0;

  const rows=months.map(m=>{
    // Bookings checkin in this month
    const bkCI=allBks.filter(b=>(b.checkin||'').startsWith(m));
    // Bookings checkout in this month (for cleaning)
    const bkCO=bookings.filter(b=>{
      if(b.status==='Cancelled'||!b.checkout)return false;
      if(pr!=='all'&&b.property!==pr)return false;
      return (b.checkout||'').startsWith(m);
    });
    // Expense record for this month+prop
    const expRec=expenses.find(e=>e.month===m&&(pr==='all'?e.prop==='all':e.prop===pr||e.prop==='all'))||{};

    const platFeeByName={};
    platNames.forEach(pn=>{
      const fee=bkCI.filter(b=>b.platform===pn).reduce((s,b)=>s+calcTotals(b).platFee,0);
      platFeeByName[pn]=fee;
    });
    const platFeeTotal=platNames.reduce((s,pn)=>s+platFeeByName[pn],0);
    const promoCost=bkCI.reduce((s,b)=>s+(+b.promo||0),0);
    const cleaningFromBks=bkCO.reduce((s,b)=>s+(+b.cleaningFee||0),0);
    const cleaningCost=cleaningFromBks||(expRec.cleaning||0);
    const water=expRec.water||0;
    const elec=expRec.electricity||0;
    const supplies=expRec.supplies||0;
    const maint=expRec.maintenance||0;
    const other=expRec.other||0;
    const rowTotal=platFeeTotal+promoCost+cleaningCost+water+elec+supplies+maint+other;

    // Accumulate
    platNames.forEach(pn=>platTotals[pn]+=platFeeByName[pn]);
    grandPlatTotal+=platFeeTotal;grandPromo+=promoCost;grandCleaning+=cleaningCost;
    grandWater+=water;grandElec+=elec;grandSupplies+=supplies;grandMaint+=maint;grandOtherRow+=other;grandRowTotal+=rowTotal;

    const platCells=platNames.map(pn=>{
      const v=platFeeByName[pn];
      const cnt=bkCI.filter(b=>b.platform===pn).length;
      return`<td style="text-align:right">${v?`<span style="color:var(--orange);font-weight:600">${fmtMoney(v)}</span><span style="font-size:10px;color:var(--text-3);margin-left:2px">${cnt}bk</span>`:`<span style="color:var(--border-2)">—</span>`}</td>`;
    }).join('');

    const editBtn=expRec.id?`<button class="btn btn-ghost btn-sm" onclick="openExpenseModal('${expRec.id}')">&#x270e;</button>`:`<button class="btn btn-ghost btn-sm" onclick="openExpenseModalForMonth('${m}','${pr}')" title="Add expense record">+</button>`;

    return`<tr>
      <td><strong>${fmtMonthYear(m+'-01')}</strong></td>
      ${platCells}
      <td style="text-align:right">${platFeeTotal?auto(platFeeTotal,'var(--orange)'):`<span style="color:var(--border-2)">—</span>`}</td>
      <td style="text-align:right">${promoCost?auto(promoCost,'var(--purple)'):`<span style="color:var(--border-2)">—</span>`}</td>
      <td style="text-align:right">${cleaningFromBks?auto(cleaningCost,'var(--red)'):cleaningCost?cell(cleaningCost,'var(--red)'):`<span style="color:var(--border-2)">—</span>`}</td>
      <td style="text-align:right">${cell(water,'var(--red)')}</td>
      <td style="text-align:right">${cell(elec,'var(--red)')}</td>
      <td style="text-align:right">${cell(supplies,'var(--red)')}</td>
      <td style="text-align:right">${cell(maint,'var(--red)')}</td>
      <td style="text-align:right">${cell(other,'var(--red)')}</td>
      <td style="text-align:right"><strong style="color:var(--red)">${fmtMoney(rowTotal)}</strong></td>
      <td>${editBtn}</td>
    </tr>`;
  }).join('');

  // All-time totals row
  const platTotalCells=platNames.map(pn=>`<td style="text-align:right"><strong style="color:var(--orange)">${fmtMoney(platTotals[pn])}</strong></td>`).join('');
  const totalsRow=`<tr style="border-top:2px solid var(--border);background:var(--surface-2);font-weight:700">
    <td><strong>All Time</strong></td>
    ${platTotalCells}
    <td style="text-align:right"><strong style="color:var(--orange)">${fmtMoney(grandPlatTotal)}</strong></td>
    <td style="text-align:right"><strong style="color:var(--purple)">${fmtMoney(grandPromo)}</strong></td>
    <td style="text-align:right"><strong style="color:var(--red)">${fmtMoney(grandCleaning)}</strong></td>
    <td style="text-align:right"><strong style="color:var(--red)">${fmtMoney(grandWater)}</strong></td>
    <td style="text-align:right"><strong style="color:var(--red)">${fmtMoney(grandElec)}</strong></td>
    <td style="text-align:right"><strong style="color:var(--red)">${fmtMoney(grandSupplies)}</strong></td>
    <td style="text-align:right"><strong style="color:var(--red)">${fmtMoney(grandMaint)}</strong></td>
    <td style="text-align:right"><strong style="color:var(--red)">${fmtMoney(grandOtherRow)}</strong></td>
    <td style="text-align:right"><strong style="color:var(--red)">${fmtMoney(grandRowTotal)}</strong></td>
    <td></td>
  </tr>`;

  tbody.innerHTML=rows+totalsRow;
}

function openExpenseModalForMonth(month,prop){
  // Pre-fill the expense modal for a specific month (format: 'YYYY-MM')
  openExpenseModal(null);
  requestAnimationFrame(()=>{
    if(month){
      const[yr,mo]=month.split('-');
      const yEl=document.getElementById('fe-year');
      const mEl=document.getElementById('fe-month');
      if(yEl)yEl.value=yr;
      if(mEl)mEl.value=parseInt(mo,10);
    }
    const pEl=document.getElementById('fe-prop');
    if(pEl&&prop&&prop!=='all')pEl.value=prop;
  });
}

['exp-month','exp-prop'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',renderExpenses);});

function renderDeposits(){
  const mo=document.getElementById('dep-month')?.value||'all';
  const st=document.getElementById('dep-status')?.value||'all';
  let list=bookings.filter(b=>b.deposit&&b.status!=='Cancelled');
  if(mo!=='all'){const[y,m]=mo.split('-').map(Number);list=list.filter(b=>{const d=new Date(b.checkin+'T12:00:00');return d.getFullYear()===y&&d.getMonth()+1===m;});}
  if(st==='pending')list=list.filter(b=>!b.depositCollected);
  else if(st==='collected')list=list.filter(b=>b.depositCollected&&!b.depositRefunded);
  else if(st==='refunded')list=list.filter(b=>b.depositRefunded);
  const totalDep=list.reduce((s,b)=>s+(+b.deposit||0),0);
  document.getElementById('depStats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total Deposits</div><div class="stat-value">${fmtMoney(totalDep)}</div></div>
    <div class="stat-card"><div class="stat-label">Collected</div><div class="stat-value">${list.filter(b=>b.depositCollected).length}</div></div>
    <div class="stat-card"><div class="stat-label">Refunded</div><div class="stat-value">${list.filter(b=>b.depositRefunded).length}</div></div>`;
  const tbody=document.getElementById('depositTbody');
  if(!list.length){tbody.innerHTML=`<tr><td colspan="8"><div class="empty"><div class="empty-text">No deposits found.</div></div></td></tr>`;return;}
  tbody.innerHTML=list.map(b=>{
    const sl=b.depositRefunded?'<span class="badge badge-neutral">Refunded</span>':b.depositCollected?'<span class="badge badge-green">Collected</span>':'<span class="badge badge-orange">Pending</span>';
    return`<tr onclick="openBookingDrawer('${b.id}')"><td><strong>${esc(b.guest)}</strong></td><td>${esc(propName(b.property))}</td><td>${fmtDate(b.checkin)} \u2192 ${fmtDate(b.checkout)}</td><td><strong>${fmtMoney(b.deposit)}</strong></td><td>${b.depositCollected?'<span class="badge badge-green">\u2713</span>':'<span class="badge badge-orange">\u2014</span>'}</td><td>${b.depositRefunded?'<span class="badge badge-neutral">\u2713</span>':'\u2014'}</td><td>${sl}</td><td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openBookingDrawer('${b.id}')">&#x270e;</button></td></tr>`;
  }).join('');
}
['dep-month','dep-status'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',renderDeposits);});

function openPlatformModal(id=null){
  editingPlatId=id;
  document.getElementById('platModalTitle').textContent=id?'Edit Platform':'Add Platform';
  document.getElementById('plat-name').value='';document.getElementById('plat-comm').value=0;document.getElementById('plat-vat').value=12;document.getElementById('plat-color').value='#5B4BDB';
  if(id){const p=platforms.find(x=>x.id===id);if(p){document.getElementById('plat-name').value=p.name;document.getElementById('plat-comm').value=p.commission;document.getElementById('plat-vat').value=p.vat;document.getElementById('plat-color').value=p.color;document.getElementById('plat-guestfee').value=p.guestFee||0;}}
  openModal('platformModal');
}
function savePlatform(){
  const name=document.getElementById('plat-name').value.trim();if(!name){toast('Name required.','error');return;}
  const data={id:editingPlatId||genId(),name,commission:+document.getElementById('plat-comm').value||0,vat:+document.getElementById('plat-vat').value||0,guestFee:+document.getElementById('plat-guestfee').value||0,color:document.getElementById('plat-color').value||'#888'};
  if(editingPlatId){
    const i=platforms.findIndex(p=>p.id===editingPlatId);
    if(i>=0){
      const oldName=platforms[i].name;
      platforms[i]=data;
      // Propagate name change to all bookings
      if(oldName&&oldName!==name){
        let changed=0;
        bookings.forEach(b=>{if(b.platform===oldName){b.platform=name;changed++;}});
        if(changed)toast(`Updated platform name on ${changed} booking${changed!==1?'s':''}.`,'success');
      }
    }
  }else platforms.push(data);
  saveAll();closeModal('platformModal');toast('Platform saved.');renderPlatforms();populateSelects();
  // If booking drawer is open, refresh its picker label in case it was affected
  if(editingBookingId)updateDrawerSummary();
}
function deletePlatform(id){
  const p=platforms.find(x=>x.id===id);
  const cnt=bookings.filter(b=>normPlatform(b.platform||'')===normPlatform(p?.name||'')).length;
  confirmDialog('\u26a0 Delete Platform',`You are about to delete "${p?.name}". ${cnt>0?`${cnt} existing booking(s) will retain the platform name but commission calculations may be affected. `:''}This cannot be undone.`,'\ud83d\uddd1',()=>{
    platforms=platforms.filter(x=>x.id!==id);saveAll();renderPlatforms();populateSelects();toast('Platform deleted.','warning');
  });
}
function renderPlatforms(){
  const tbody=document.getElementById('platformTbody');
  if(!platforms.length){tbody.innerHTML=`<tr><td colspan="7"><div class="empty"><div class="empty-text">No platforms.</div></div></td></tr>`;return;}
  tbody.innerHTML=platforms.map(p=>{
    const cnt=bookings.filter(b=>normPlatform(b.platform||'')===p.name&&b.status!=='Cancelled').length;
    const rev=bookings.filter(b=>normPlatform(b.platform||'')===p.name&&b.status!=='Cancelled').reduce((s,b)=>s+calcTotals(b).netRevenue,0);
    return`<tr><td>${platformPillHtml(p.name)}</td><td>${p.commission}%</td><td>${p.vat}%</td><td>${cnt}</td><td>${fmtMoney(rev)}</td><td><div style="width:24px;height:24px;border-radius:5px;background:${p.color}"></div></td><td><button class="btn btn-ghost btn-sm" onclick="openPlatformModal('${p.id}')">&#x270e;</button> <button class="btn btn-ghost btn-sm" onclick="deletePlatform('${p.id}')">&#x2326;</button></td></tr>`;
  }).join('');
}

// Temporary photo store for modal (before saving)
// ── Property icon set — Phosphor Icons SVGs (phosphoricons.com) ──
const PROP_ICONS=[
  {id:'house',label:'House',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z"/></svg>'},
  {id:'house-line',label:'Villa',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M240,208H224V136l2.34,2.34A8,8,0,0,0,237.66,127L139.31,28.68a16,16,0,0,0-22.62,0L18.34,127a8,8,0,0,0,11.32,11.31L32,136v72H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM48,120l80-80,80,80v88H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48Zm96,88H112V160h32Z"/></svg>'},
  {id:'buildings',label:'Buildings',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M240,208h-8V88a8,8,0,0,0-8-8H160a8,8,0,0,0-8,8v40H104V40a8,8,0,0,0-8-8H32a8,8,0,0,0-8,8V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM168,96h48V208H168Zm-16,48v64H104V144ZM40,48H88V208H40ZM72,72V88a8,8,0,0,1-16,0V72a8,8,0,0,1,16,0Zm0,48v16a8,8,0,0,1-16,0V120a8,8,0,0,1,16,0Zm0,48v16a8,8,0,0,1-16,0V168a8,8,0,0,1,16,0Zm48,16V168a8,8,0,0,1,16,0v16a8,8,0,0,1-16,0Zm64,0V168a8,8,0,0,1,16,0v16a8,8,0,0,1-16,0Zm0-48V120a8,8,0,0,1,16,0v16a8,8,0,0,1-16,0Z"/></svg>'},
  {id:'building-apartment',label:'Apartment',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M240,208h-8V72a8,8,0,0,0-8-8H184V40a8,8,0,0,0-8-8H80a8,8,0,0,0-8,8V96H32a8,8,0,0,0-8,8V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM40,112H80a8,8,0,0,0,8-8V48h80V72a8,8,0,0,0,8,8h40V208H152V168a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v40H40Zm96,96H120V176h16ZM112,72a8,8,0,0,1,8-8h16a8,8,0,0,1,0,16H120A8,8,0,0,1,112,72Zm0,32a8,8,0,0,1,8-8h16a8,8,0,0,1,0,16H120A8,8,0,0,1,112,104Zm56,0a8,8,0,0,1,8-8h16a8,8,0,0,1,0,16H176A8,8,0,0,1,168,104ZM88,136a8,8,0,0,1-8,8H64a8,8,0,0,1,0-16H80A8,8,0,0,1,88,136Zm0,32a8,8,0,0,1-8,8H64a8,8,0,0,1,0-16H80A8,8,0,0,1,88,168Zm24-32a8,8,0,0,1,8-8h16a8,8,0,0,1,0,16H120A8,8,0,0,1,112,136Zm56,0a8,8,0,0,1,8-8h16a8,8,0,0,1,0,16H176A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1,8-8h16a8,8,0,0,1,0,16H176A8,8,0,0,1,168,168Z"/></svg>'},
  {id:'city',label:'City',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M240,208h-8V88a8,8,0,0,0-8-8H160a8,8,0,0,0-8,8v40H104V40a8,8,0,0,0-8-8H32a8,8,0,0,0-8,8V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM168,96h48V208H168Zm-16,48v64H104V144ZM40,48H88V208H40ZM72,72V88a8,8,0,0,1-16,0V72a8,8,0,0,1,16,0Zm0,48v16a8,8,0,0,1-16,0V120a8,8,0,0,1,16,0Zm0,48v16a8,8,0,0,1-16,0V168a8,8,0,0,1,16,0Zm48,16V168a8,8,0,0,1,16,0v16a8,8,0,0,1-16,0Zm64,0V168a8,8,0,0,1,16,0v16a8,8,0,0,1-16,0Zm0-48V120a8,8,0,0,1,16,0v16a8,8,0,0,1-16,0Z"/></svg>'},
  {id:'warehouse',label:'Warehouse',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M240,184h-8V57.9l9.67-2.08a8,8,0,1,0-3.35-15.64l-224,48A8,8,0,0,0,16,104a8.16,8.16,0,0,0,1.69-.18L24,102.47V184H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM40,99,216,61.33V184H192V128a8,8,0,0,0-8-8H72a8,8,0,0,0-8,8v56H40Zm136,53H80V136h96ZM80,168h96v16H80Z"/></svg>'},
  {id:'castle-turret',label:'Castle',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M216,216H200V115.31L211.31,104A15.86,15.86,0,0,0,216,92.69V48a16,16,0,0,0-16-16H176a8,8,0,0,0-8,8V64H152V40a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8V64H88V40a8,8,0,0,0-8-8H56A16,16,0,0,0,40,48V92.69A15.86,15.86,0,0,0,44.69,104L56,115.31V216H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16ZM69.66,106.34,56,92.69V48H72V72a8,8,0,0,0,8,8h32a8,8,0,0,0,8-8V48h16V72a8,8,0,0,0,8,8h32a8,8,0,0,0,8-8V48h16V92.69l-13.66,13.65A8,8,0,0,0,184,112V216H160V168a32,32,0,0,0-64,0v48H72V112A8,8,0,0,0,69.66,106.34ZM144,216H112V168a16,16,0,0,1,32,0Z"/></svg>'},
  {id:'bed',label:'Hotel/BnB',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M216,72H32V48a8,8,0,0,0-16,0V208a8,8,0,0,0,16,0V176H240v32a8,8,0,0,0,16,0V112A40,40,0,0,0,216,72ZM32,88h72v72H32Zm88,72V88h96a24,24,0,0,1,24,24v48Z"/></svg>'},
  {id:'key',label:'Rental',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M216.57,39.43A80,80,0,0,0,83.91,120.78L28.69,176A15.86,15.86,0,0,0,24,187.31V216a16,16,0,0,0,16,16H72a8,8,0,0,0,8-8V208H96a8,8,0,0,0,8-8V184h16a8,8,0,0,0,5.66-2.34l9.56-9.57A79.73,79.73,0,0,0,160,176h.1A80,80,0,0,0,216.57,39.43ZM224,98.1c-1.09,34.09-29.75,61.86-63.89,61.9H160a63.7,63.7,0,0,1-23.65-4.51,8,8,0,0,0-8.84,1.68L116.69,168H96a8,8,0,0,0-8,8v16H72a8,8,0,0,0-8,8v16H40V187.31l58.83-58.82a8,8,0,0,0,1.68-8.84A63.72,63.72,0,0,1,96,95.92c0-34.14,27.81-62.8,61.9-63.89A64,64,0,0,1,224,98.1ZM192,76a12,12,0,1,1-12-12A12,12,0,0,1,192,76Z"/></svg>'},
  {id:'tent',label:'Glamping',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M255.31,188.75l-64-144A8,8,0,0,0,184,40H72a8,8,0,0,0-7.27,4.69.21.21,0,0,0,0,.06l0,.12,0,0L.69,188.75A8,8,0,0,0,8,200H248a8,8,0,0,0,7.31-11.25ZM64,184H20.31L64,85.7Zm16,0V85.7L123.69,184Zm61.2,0L84.31,56H178.8l56.89,128Z"/></svg>'},
  {id:'tree-palm',label:'Beach',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M237.79,53.23a66.86,66.86,0,0,0-97.74,0,72.21,72.21,0,0,0-12.05,17,72.21,72.21,0,0,0-12-17,66.86,66.86,0,0,0-97.74,0,8,8,0,0,0,2.6,12.85L77,90.55a71.42,71.42,0,0,0-43.36,33.21,70.64,70.64,0,0,0-7.2,54.32A8,8,0,0,0,39,182.36l81-61.68V224a8,8,0,0,0,16,0V120.68l81,61.68a8,8,0,0,0,12.57-4.28,70.64,70.64,0,0,0-7.2-54.32A71.42,71.42,0,0,0,179,90.55l56.22-24.47a8,8,0,0,0,2.6-12.85ZM67.08,48a51.13,51.13,0,0,1,37.28,16.26,56.53,56.53,0,0,1,14.26,26.93L39,56.53A50.5,50.5,0,0,1,67.08,48ZM40,161.5a54.82,54.82,0,0,1,7.47-29.7,55.55,55.55,0,0,1,34-25.89A56.52,56.52,0,0,1,96.1,104a55.82,55.82,0,0,1,16.23,2.41ZM208.5,131.8A54.82,54.82,0,0,1,216,161.5l-72.3-55.1a56.3,56.3,0,0,1,64.83,25.4ZM137.38,91.19a56.53,56.53,0,0,1,14.26-26.93A51.13,51.13,0,0,1,188.92,48,50.5,50.5,0,0,1,217,56.53Z"/></svg>'},
  {id:'waves',label:'Waterfront',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M222.16,177.25a8,8,0,0,1-1,11.25c-17.36,14.39-32.86,19.5-47,19.5-18.58,0-34.82-8.82-49.93-17-25.35-13.76-47.24-25.64-79.07.74a8,8,0,1,1-10.22-12.31c40.17-33.28,70.32-16.92,96.93-2.48,25.35,13.75,47.24,25.63,79.07-.74A8,8,0,0,1,222.16,177.25Zm-11.27-57c-31.83,26.38-53.72,14.5-79.07.74-26.61-14.43-56.76-30.79-96.93,2.49a8,8,0,0,0,10.22,12.31c31.83-26.38,53.72-14.5,79.07-.74,15.11,8.19,31.35,17,49.93,17,14.14,0,29.64-5.11,47-19.5a8,8,0,1,0-10.22-12.31ZM45.11,79.8c31.83-26.37,53.72-14.49,79.07-.74,15.11,8.2,31.35,17,49.93,17,14.14,0,29.64-5.12,47-19.5a8,8,0,1,0-10.22-12.31c-31.83,26.38-53.72,14.5-79.07.74C105.21,50.58,75.06,34.22,34.89,67.5A8,8,0,1,0,45.11,79.8Z"/></svg>'},
  {id:'mountains',label:'Mountain',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M164,80a28,28,0,1,0-28-28A28,28,0,0,0,164,80Zm0-40a12,12,0,1,1-12,12A12,12,0,0,1,164,40Zm90.88,155.92-54.56-92.08A15.87,15.87,0,0,0,186.55,96h0a15.85,15.85,0,0,0-13.76,7.84L146.63,148l-44.84-76.1a16,16,0,0,0-27.58,0L1.11,195.94A8,8,0,0,0,8,208H248a8,8,0,0,0,6.88-12.08ZM88,80l23.57,40H64.43ZM22,192l33-56h66l18.74,31.8,0,0L154,192Zm150.57,0-16.66-28.28L186.55,112,234,192Z"/></svg>'},
  {id:'campfire',label:'Campsite',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M223.62,226.42a8,8,0,0,1-10.05,5.2L128,204.39,42.43,231.62a8,8,0,1,1-4.85-15.25l64-20.37-64-20.38a8,8,0,1,1,4.85-15.24L128,187.6l85.57-27.22a8,8,0,1,1,4.85,15.24l-64,20.38,64,20.37A8,8,0,0,1,223.62,226.42ZM68,108c0-20.1,9.77-40.87,28.24-60a156,156,0,0,1,27.57-22.76,8,8,0,0,1,8.38,0C134.47,26.59,188,60.08,188,108a60,60,0,0,1-120,0Zm60,44a16,16,0,0,0,16-16c0-13.57-10-24.46-16-29.79-6,5.33-16,16.22-16,29.79A16,16,0,0,0,128,152ZM84,108a43.83,43.83,0,0,0,12.09,30.24c0-.74-.09-1.49-.09-2.24,0-28,26.44-45.91,27.56-46.66a8,8,0,0,1,8.88,0C133.56,90.09,160,108,160,136c0,.75,0,1.5-.09,2.24A43.83,43.83,0,0,0,172,108c0-32-32.26-58-44-66.34C116.27,50,84,76,84,108Z"/></svg>'},
  {id:'island',label:'Island',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M238.25,229A8,8,0,0,1,227,230.25c-.37-.3-38.82-30.25-99-30.25S29.36,230,29,230.26a8,8,0,0,1-10-12.51c1.63-1.3,38.52-30.26,98.29-33.45A119.94,119.94,0,0,1,114,146.37c1.74-21.71,10.92-50.63,43-72.48A64.65,64.65,0,0,0,140.26,72c-19,.62-30.94,11.71-36.5,33.92A8,8,0,0,1,96,112a7.64,7.64,0,0,1-1.94-.24,8,8,0,0,1-5.82-9.7c9.25-36.95,33.11-45.42,51.5-46a81.48,81.48,0,0,1,21.68,2.45c-3.83-6.33-9.43-12.93-17.21-16.25-10-4.24-22.17-2.39-36.31,5.51a8,8,0,0,1-7.8-14c18.74-10.45,35.72-12.54,50.48-6.2,12.49,5.36,20.73,15.78,25.87,25,6.18-9.64,13.88-16.17,22.39-18.94,11.86-3.87,24.64-.72,38,9.37a8,8,0,0,1-9.64,12.76c-8.91-6.73-16.77-9.06-23.35-6.93-7.29,2.35-12.87,10-16.37,16.61A70.46,70.46,0,0,1,208,73.07c14.61,8.35,32,26.05,32,62.94a8,8,0,0,1-16,0c0-23.46-8.07-40-24-49a50.49,50.49,0,0,0-5.75-2.8,55.64,55.64,0,0,1,5.06,33.06,59.41,59.41,0,0,1-8.86,23.41,8,8,0,0,1-13.09-9.2c.74-1.09,16.33-24.38-3.26-49.37-27,15.21-41.89,37.25-44.16,65.59a104.27,104.27,0,0,0,3.83,36.44c62.65,1.81,101.52,32.33,103.2,33.66A8,8,0,0,1,238.25,229ZM24,140a28,28,0,1,1,28,28A28,28,0,0,1,24,140Zm16,0a12,12,0,1,0,12-12A12,12,0,0,0,40,140Z"/></svg>'},
  {id:'swimming-pool',label:'Pool Villa',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M88,149.39a8,8,0,0,0,8-8V128h64v15.29a8,8,0,0,0,16,0V32a8,8,0,0,0-16,0V48H96V32a8,8,0,0,0-16,0V141.39A8,8,0,0,0,88,149.39ZM96,112V96h64v16Zm64-48V80H96V64ZM24,168a8,8,0,0,1,8-8c14.42,0,22.19,5.18,28.44,9.34C66,173.06,70.42,176,80,176s14-2.94,19.56-6.66c6.24-4.16,14-9.34,28.43-9.34s22.2,5.18,28.44,9.34c5.58,3.72,10,6.66,19.57,6.66s14-2.94,19.56-6.66c6.25-4.16,14-9.34,28.44-9.34a8,8,0,0,1,0,16c-9.58,0-14,2.94-19.56,6.66-6.25,4.16-14,9.34-28.44,9.34s-22.2-5.18-28.44-9.34C142,178.94,137.57,176,128,176s-14,2.94-19.56,6.66c-6.24,4.16-14,9.34-28.43,9.34s-22.19-5.18-28.44-9.34C46,178.94,41.58,176,32,176A8,8,0,0,1,24,168Zm208,40a8,8,0,0,1-8,8c-9.58,0-14,2.94-19.56,6.66-6.25,4.16-14,9.34-28.44,9.34s-22.2-5.18-28.44-9.34C142,218.94,137.57,216,128,216s-14,2.94-19.56,6.66c-6.24,4.16-14,9.34-28.43,9.34s-22.19-5.18-28.44-9.34C46,218.94,41.58,216,32,216a8,8,0,0,1,0-16c14.42,0,22.19,5.18,28.44,9.34C66,213.06,70.42,216,80,216s14-2.94,19.56-6.66c6.24-4.16,14-9.34,28.43-9.34s22.2,5.18,28.44,9.34c5.58,3.72,10,6.66,19.57,6.66s14-2.94,19.56-6.66c6.25-4.16,14-9.34,28.44-9.34A8,8,0,0,1,232,208Z"/></svg>'},
  {id:'umbrella',label:'Resort',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M240,126.63A112.44,112.44,0,0,0,51.75,53.75a111.56,111.56,0,0,0-35.7,72.88A16,16,0,0,0,32,144h88v56a32,32,0,0,0,64,0,8,8,0,0,0-16,0,16,16,0,0,1-32,0V144h88a16,16,0,0,0,16-17.37ZM32,128l0,0a96.15,96.15,0,0,1,76.2-85.89C96.48,58,81.85,86.11,80.17,128Zm64.15,0c1.39-30.77,10.53-52.81,18.3-66.24A106.44,106.44,0,0,1,128,43.16a106.31,106.31,0,0,1,13.52,18.6C154.8,84.7,159,109.28,159.82,128Zm79.65,0c-1.68-41.89-16.31-70-28-85.94A96.07,96.07,0,0,1,224,128Z"/></svg>'},
  {id:'star',label:'Luxury',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M239.18,97.26A16.38,16.38,0,0,0,224.92,86l-59-4.76L143.14,26.15a16.36,16.36,0,0,0-30.27,0L90.11,81.23,31.08,86a16.46,16.46,0,0,0-9.37,28.86l45,38.83L53,211.75a16.38,16.38,0,0,0,24.5,17.82L128,198.49l50.53,31.08A16.4,16.4,0,0,0,203,211.75l-13.76-58.07,45-38.83A16.43,16.43,0,0,0,239.18,97.26Zm-15.34,5.47-48.7,42a8,8,0,0,0-2.56,7.91l14.88,62.8a.37.37,0,0,1-.17.48c-.18.14-.23.11-.38,0l-54.72-33.65a8,8,0,0,0-8.38,0L69.09,215.94c-.15.09-.19.12-.38,0a.37.37,0,0,1-.17-.48l14.88-62.8a8,8,0,0,0-2.56-7.91l-48.7-42c-.12-.1-.23-.19-.13-.5s.18-.27.33-.29l63.92-5.16A8,8,0,0,0,103,91.86l24.62-59.61c.08-.17.11-.25.35-.25s.27.08.35.25L153,91.86a8,8,0,0,0,6.75,4.92l63.92,5.16c.15,0,.24,0,.33.29S224,102.63,223.84,102.73Z"/></svg>'},
  {id:'crown',label:'Premium',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M248,80a28,28,0,1,0-51.12,15.77l-26.79,33L146,73.4a28,28,0,1,0-36.06,0L85.91,128.74l-26.79-33a28,28,0,1,0-26.6,12L47,194.63A16,16,0,0,0,62.78,208H193.22A16,16,0,0,0,209,194.63l14.47-86.85A28,28,0,0,0,248,80ZM128,40a12,12,0,1,1-12,12A12,12,0,0,1,128,40ZM24,80A12,12,0,1,1,36,92,12,12,0,0,1,24,80ZM193.22,192H62.78L48.86,108.52,81.79,149A8,8,0,0,0,88,152a7.83,7.83,0,0,0,1.08-.07,8,8,0,0,0,6.26-4.74l29.3-67.4a27,27,0,0,0,6.72,0l29.3,67.4a8,8,0,0,0,6.26,4.74A7.83,7.83,0,0,0,168,152a8,8,0,0,0,6.21-3l32.93-40.52ZM220,92a12,12,0,1,1,12-12A12,12,0,0,1,220,92Z"/></svg>'},
  {id:'boat',label:'Houseboat',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M221.06,110.59,208,106.23V56a16,16,0,0,0-16-16H136V24a8,8,0,0,0-16,0V40H64A16,16,0,0,0,48,56v50.23l-13.06,4.36A16,16,0,0,0,24,125.77V152c0,61.54,97.89,86.72,102.06,87.76a8,8,0,0,0,3.88,0C134.11,238.72,232,213.54,232,152V125.77A16,16,0,0,0,221.06,110.59ZM64,56H192v44.9L130.53,80.41a8,8,0,0,0-5.06,0L64,100.9Zm152,96c0,24.91-23.68,43-43.55,53.83A228.13,228.13,0,0,1,128,223.72,226.85,226.85,0,0,1,83.81,206C47.6,186.35,40,165.79,40,152V125.77L120,99.1V168a8,8,0,0,0,16,0V99.1l80,26.67Z"/></svg>'},
  // ── Extra residential/house variants ──
  {id:'house-simple',label:'Simple Home',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M224,115.55V208a16,16,0,0,1-16,16H168a16,16,0,0,1-16-16V168H104v40a16,16,0,0,1-16,16H48a16,16,0,0,1-16-16V115.55a16,16,0,0,1,5.17-11.78l80-75.48.11-.11a16,16,0,0,1,21.46,0l.11.11,80,75.48A16,16,0,0,1,224,115.55Z"/></svg>'},
  {id:'house-roof',label:'Rooftop',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M240,208H224V115.55a16,16,0,0,0-5.17-11.78l-80-75.48a16,16,0,0,0-21.7,0l-80,75.48A16,16,0,0,0,32,115.55V208H16a8,8,0,0,0,0,16H240a8,8,0,0,0,0-16ZM48,115.55l80-75.47,80,75.47V208H160V164a4,4,0,0,0-4-4H100a4,4,0,0,0-4,4v44H48ZM112,208V168h32v40Z"/></svg>'},
  {id:'house-door',label:'Condo Unit',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M251.31,72.57,184,8.29a16,16,0,0,0-22.54.06L4.69,163.43A16,16,0,0,0,16,192H40v48a8,8,0,0,0,8,8H208a8,8,0,0,0,8-8V192h24a16,16,0,0,0,11.31-27.43ZM200,232H152V176H104v56H56V189.65L172.69,72.71,200,100ZM236.68,176H216V105.37l4.57-4.56,16.13,16.13Z"/></svg>'},
  {id:'house-3',label:'3BR House',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M235.54,103.68l-104-88a8,8,0,0,0-10.54,0l-104,88A8,8,0,0,0,24,112V208a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V112A8,8,0,0,0,235.54,103.68ZM216,208H152V160a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v48H40V117.37l88-74.55,88,74.55ZM120,208V168h16v40Z"/></svg>'},
  {id:'house-4',label:'4BR Home',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,24a104,104,0,1,0,104,104A104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm48-88a8,8,0,0,1-8,8H136v32a8,8,0,0,1-16,0V136H88a8,8,0,0,1,0-16h32V88a8,8,0,0,1,16,0v32h32A8,8,0,0,1,176,128Z"/></svg>'},
  {id:'house-family',label:'Family Home',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M208,80H176V56a16,16,0,0,0-16-16H32A16,16,0,0,0,16,56V176a16,16,0,0,0,16,16H48a32,32,0,0,0,64,0h32a32,32,0,0,0,64,0h16a16,16,0,0,0,16-16V112A32,32,0,0,0,208,80ZM32,176V56H160v24H112A32,32,0,0,0,80,112v64Zm48,32a16,16,0,1,1,16-16A16,16,0,0,1,80,208Zm96,0a16,16,0,1,1,16-16A16,16,0,0,1,176,208Zm16-48H112V112a16,16,0,0,1,16-16h80a16,16,0,0,1,16,16Z"/></svg>'},
  {id:'house-duplex',label:'Duplex',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M232,216H216V120l1.66,1.66a8,8,0,0,0,11.31-11.31l-98.34-98.32a8,8,0,0,0-11.26,0L21.34,110.34A8,8,0,1,0,32.66,121.66L128,26.33l80,80V216H152V176a8,8,0,0,0-8-8H112a8,8,0,0,0-8,8v40H48V128H32v88H24a8,8,0,0,0,0,16H232a8,8,0,0,0,0-16Zm-96,0H120V184h16Z"/></svg>'},
  {id:'house-studio',label:'Studio',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M128,26a102,102,0,1,0,102,102A102.12,102.12,0,0,0,128,26Zm0,188a86,86,0,1,1,86-86A86.1,86.1,0,0,1,128,214ZM174,128a46,46,0,1,1-46-46A46.05,46.05,0,0,1,174,128Zm-16,0a30,30,0,1,0-30,30A30,30,0,0,0,158,128Z"/></svg>'},
  {id:'house-corner',label:'Corner Unit',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M245.66,106.34l-96-96a8,8,0,0,0-11.32,0l-96,96A8,8,0,0,0,48,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V168h16v48a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A8,8,0,0,0,245.66,106.34ZM216,208H160V160a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v48H64V123.31L128,59.31l88,88Z"/></svg>'},
  {id:'house-townhome',label:'Townhouse',svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" fill="currentColor"><path d="M136,188a12,12,0,1,1-12-12A12,12,0,0,1,136,188ZM222.83,79.17l-96-80a8,8,0,0,0-10.24,0l-96,80A8,8,0,0,0,16,86V200a8,8,0,0,0,8,8H232a8,8,0,0,0,8-8V86A8,8,0,0,0,222.83,79.17ZM216,200H40V89.36L128,16.44,216,89.36Z"/></svg>'},
];

// Helper: get the SVG or custom image HTML for a property icon at given size
function propIconHtml(p,size=32){
  if(!p)return`<svg width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor"><path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V160h32v56a8,8,0,0,0,8,8h64a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68ZM208,208H160V152a8,8,0,0,0-8-8H104a8,8,0,0,0-8,8v56H48V120l80-80,80,80Z"/></svg>`;
  if(p.iconCustom){
    return`<img src="${p.iconCustom}" style="width:${size}px;height:${size}px;object-fit:cover;border-radius:${size>24?'6px':'4px'};display:block" alt="icon"/>`;
  }
  const ic=PROP_ICONS.find(i=>i.id===(p.iconId||'house'))||PROP_ICONS[0];
  const svg=ic.svg.replace('<svg ','<svg width="'+size+'" height="'+size+'" ');
  return svg;
}

function renderPropIconGrid(selectedId){
  const grid=document.getElementById('fp-icon-grid');
  if(!grid)return;
  grid.innerHTML=PROP_ICONS.map(({id,label,svg})=>`
    <button type="button" class="prop-icon-btn${id===selectedId?' selected':''}" title="${label}" onclick="selectPropIcon('${id}')">
      ${svg}
      <span>${label}</span>
    </button>`).join('');
}

function selectPropIcon(id){
  document.getElementById('fp-icon-id').value=id;
  // Clear custom upload when selecting from library
  document.getElementById('fp-icon-custom').value='';
  document.getElementById('fp-icon-clear').style.display='none';
  renderPropIconGrid(id);
  _updatePropIconPreview();
}

function handlePropIconUpload(input){
  const file=input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    document.getElementById('fp-icon-custom').value=e.target.result;
    document.getElementById('fp-icon-clear').style.display='';
    // Deselect grid icons
    document.querySelectorAll('.prop-icon-btn').forEach(b=>b.classList.remove('selected'));
    _updatePropIconPreview();
  };
  reader.readAsDataURL(file);
  input.value='';
}

function clearPropIconUpload(){
  document.getElementById('fp-icon-custom').value='';
  document.getElementById('fp-icon-clear').style.display='none';
  const id=document.getElementById('fp-icon-id').value||'house';
  renderPropIconGrid(id);
  _updatePropIconPreview();
}

function _updatePropIconPreview(){
  const preview=document.getElementById('fp-icon-preview');
  if(!preview)return;
  const custom=document.getElementById('fp-icon-custom').value;
  const id=document.getElementById('fp-icon-id').value||'house';
  if(custom){
    preview.innerHTML=`<img src="${custom}" style="width:52px;height:52px;object-fit:cover;border-radius:var(--radius)"/>`;
  }else{
    const ic=PROP_ICONS.find(i=>i.id===id)||PROP_ICONS[0];
    const svg=ic.svg.replace('<svg ','<svg width="32" height="32" ');
    preview.innerHTML=svg;
  }
}


let _editingPhotos=[];

function handlePropertyPhotoUpload(input){
  const files=Array.from(input.files);
  files.forEach(file=>{
    const reader=new FileReader();
    reader.onload=e=>{
      _editingPhotos.push(e.target.result);
      renderPropPhotoList();
    };
    reader.readAsDataURL(file);
  });
  input.value=''; // allow re-selecting same file
}

function renderPropPhotoList(){
  const container=document.getElementById('fp-photo-list');
  if(!container)return;
  if(!_editingPhotos.length){container.innerHTML='';return;}
  container.innerHTML=_editingPhotos.map((src,i)=>`
    <div class="fp-photo-preview">
      <img src="${src}" onclick="viewPropPhotoFull('${i}')"/>
      <div class="remove-photo" onclick="removePropPhoto(${i})">×</div>
    </div>`).join('');
}

function removePropPhoto(i){
  _editingPhotos.splice(i,1);
  renderPropPhotoList();
}

function viewPropPhotoFull(i){
  const src=_editingPhotos[i];
  if(!src)return;
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:pointer';
  overlay.innerHTML=`<img src="${src}" style="max-width:90vw;max-height:90vh;border-radius:8px;object-fit:contain"/>`;
  overlay.onclick=()=>overlay.remove();
  document.body.appendChild(overlay);
}

function openPropertyModal(id=null){
  editingPropId=id;
  _editingPhotos=[];
  document.getElementById('propModalTitle').textContent=id?'Edit Property':'Add Property';
  ['fp-name','fp-city','fp-address','fp-map','fp-airbnb','fp-notes',
   'fp-owner-name','fp-owner-phone','fp-owner-email','fp-owner-address',
   'fp-payout-method','fp-payout-account','fp-contract-start','fp-contract-end'].forEach(k=>{const el=document.getElementById(k);if(el)el.value='';});
  const opctEl=document.getElementById('fp-owner-pct');if(opctEl){opctEl.value=100;}
  document.getElementById('fp-beds').value='';
  document.getElementById('fp-baseguests').value=2;
  document.getElementById('fp-maxguests').value=4;
  document.getElementById('fp-extrafee').value=300;
  document.getElementById('fp-baserate').value=0;
  renderPropPhotoList();
  document.getElementById('fp-icon-id').value='house';
  document.getElementById('fp-icon-custom').value='';
  document.getElementById('fp-icon-clear').style.display='none';
  if(id){
    const p=properties.find(x=>x.id===id);
    if(p){
      document.getElementById('fp-name').value=p.name||'';
      document.getElementById('fp-city').value=p.city||'';
      document.getElementById('fp-address').value=p.address||'';
      document.getElementById('fp-map').value=p.map||'';
      document.getElementById('fp-airbnb').value=p.airbnbUrl||'';
      document.getElementById('fp-notes').value=p.notes||'';
      document.getElementById('fp-beds').value=p.beds??'';
      document.getElementById('fp-baseguests').value=p.baseGuests??2;
      document.getElementById('fp-maxguests').value=p.maxGuests??4;
      document.getElementById('fp-extrafee').value=p.extraGuestFee??300;
      document.getElementById('fp-baserate').value=p.baseRate??0;
      _editingPhotos=[...(p.photos||[])];
      renderPropPhotoList();
      const iconId=p.iconId||'house';
      const iconCustom=p.iconCustom||'';
      document.getElementById('fp-icon-id').value=iconId;
      document.getElementById('fp-icon-custom').value=iconCustom;
      if(iconCustom)document.getElementById('fp-icon-clear').style.display='';
      // Owner & Contract fields
      const _fp=id=>document.getElementById(id);
      if(_fp('fp-owner-name'))_fp('fp-owner-name').value=p.ownerName||'';
      if(_fp('fp-owner-phone'))_fp('fp-owner-phone').value=p.ownerPhone||'';
      if(_fp('fp-owner-email'))_fp('fp-owner-email').value=p.ownerEmail||'';
      if(_fp('fp-owner-address'))_fp('fp-owner-address').value=p.ownerAddress||'';
      if(_fp('fp-owner-pct'))_fp('fp-owner-pct').value=p.ownerPct??100;
      if(_fp('fp-payout-method'))_fp('fp-payout-method').value=p.payoutMethod||'';
      if(_fp('fp-payout-account'))_fp('fp-payout-account').value=p.payoutAccount||'';
      if(_fp('fp-contract-start'))_fp('fp-contract-start').value=p.contractStart||'';
      if(_fp('fp-contract-end'))_fp('fp-contract-end').value=p.contractEnd||'';
    }
  }
  // Always expand the owner section so fields are visible and editable
  const ownerSec=document.getElementById('fp-owner-section');
  if(ownerSec)ownerSec.style.display='';
  renderPropIconGrid(document.getElementById('fp-icon-id').value);
  _updatePropIconPreview();
  openModal('propertyModal');
}
function saveProperty(){
  const name=(document.getElementById('fp-name')?.value||'').trim();
  const city=(document.getElementById('fp-city')?.value||'').trim();
  const missing=[];
  if(!name)missing.push('Property Name');
  if(!city)missing.push('City');
  if(missing.length){toast(`Missing: ${missing.join(', ')}`,'error');return;}
  const bg=Math.max(1,+document.getElementById('fp-baseguests').value||2);
  let mg=Math.max(1,+document.getElementById('fp-maxguests').value||bg);if(mg<bg)mg=bg;
  const existing=editingPropId?properties.find(p=>p.id===editingPropId):null;
  const _gv=id=>document.getElementById(id)?.value||'';
  const ownerPctVal=Math.min(100,Math.max(0,+_gv('fp-owner-pct')||100));
  const data={
    id:editingPropId||genId(),name,city,
    address:_gv('fp-address'),
    map:_gv('fp-map'),
    airbnbUrl:_gv('fp-airbnb'),
    iconId:_gv('fp-icon-id')||'house',
    iconCustom:_gv('fp-icon-custom')||'',
    beds:+_gv('fp-beds')||0,
    baseGuests:bg,maxGuests:mg,
    baseRate:Math.max(0,+_gv('fp-baserate')||0),
    extraGuestFee:Math.max(0,+_gv('fp-extrafee')||0),
    blockedDates:existing?.blockedDates||[],
    photos:[..._editingPhotos],
    notes:_gv('fp-notes'),
    // Owner & Contract
    ownerName:_gv('fp-owner-name'),
    ownerPhone:_gv('fp-owner-phone'),
    ownerEmail:_gv('fp-owner-email'),
    ownerAddress:_gv('fp-owner-address'),
    ownerPct:ownerPctVal,
    payoutMethod:_gv('fp-payout-method'),
    payoutAccount:_gv('fp-payout-account'),
    contractStart:_gv('fp-contract-start'),
    contractEnd:_gv('fp-contract-end'),
  };
  if(editingPropId){const i=properties.findIndex(p=>p.id===editingPropId);if(i>=0)properties[i]=data;}
  else properties.push(data);
  saveAll();closeModal('propertyModal');toast('Property saved.');renderProperties();populateSelects();
}
function viewPropPhotos(propId,startIdx=0){
  const p=properties.find(x=>x.id===propId);
  if(!p||!(p.photos||[]).length)return;
  const photos=p.photos;
  let current=startIdx;
  const overlay=document.createElement('div');
  overlay.id='prop-photo-overlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.93);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px';
  const render=()=>{
    overlay.innerHTML=`<div style="color:#fff;font-size:13px;opacity:.6">${esc(p.name)} · Photo ${current+1} of ${photos.length}</div><img src="${photos[current]}" style="max-width:90vw;max-height:75vh;border-radius:10px;object-fit:contain"/><div style="display:flex;gap:12px">${photos.length>1?`<button onclick="event.stopPropagation();window._propPhotoNav(-1)" style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:18px">‹</button>`:''}<button onclick="document.getElementById('prop-photo-overlay').remove()" style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:14px">✕ Close</button>${photos.length>1?`<button onclick="event.stopPropagation();window._propPhotoNav(1)" style="background:rgba(255,255,255,.15);border:none;color:#fff;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:18px">›</button>`:''}</div>`;
  };
  window._propPhotoNav=(dir)=>{current=(current+dir+photos.length)%photos.length;render();};
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
  document.body.appendChild(overlay);
  render();
}
function deleteProperty(id){
  const p=properties.find(x=>x.id===id);
  const cnt=bookings.filter(b=>b.property===id).length;
  confirmDialog('\u26a0 Delete Property',`You are about to delete "${p?.name}". ${cnt>0?`This property has ${cnt} booking(s). The bookings will be kept but will show missing property. `:''}Property data cannot be recovered after deletion.`,'\ud83d\uddd1',()=>{
    properties=properties.filter(x=>x.id!==id);saveAll();renderProperties();populateSelects();toast('Property deleted.','warning');
  });
}
function contractStatusBadge(p){
  if(!p.contractEnd)return'';
  const today=todayISO();
  const end=p.contractEnd;
  const daysLeft=Math.ceil((new Date(end)-new Date(today))/86400000);
  if(daysLeft<0)return`<span class="badge badge-red" title="Contract expired ${fmtDate(end)}">Expired</span>`;
  if(daysLeft<=30)return`<span class="badge badge-orange" title="Contract ends ${fmtDate(end)}">Expires in ${daysLeft}d</span>`;
  if(daysLeft<=90)return`<span class="badge badge-orange" style="opacity:.7" title="Contract ends ${fmtDate(end)}">~${Math.ceil(daysLeft/30)}mo left</span>`;
  return`<span class="badge badge-green" title="Contract ends ${fmtDate(end)}">Active</span>`;
}
function renderProperties(){
  const grid=document.getElementById('propGrid');
  if(!properties.length){
    grid.innerHTML=`<div class="empty"><div class="empty-icon">🏠</div><div class="empty-text">No properties yet</div><div class="empty-sub">Add your rental properties to start tracking bookings</div><button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="openPropertyModal()">＋ Add Property</button></div>`;
    return;
  }
  const today=todayISO();
  grid.innerHTML=properties.map((p,idx)=>{
    const pc=_PROP_PALETTE[idx%_PROP_PALETTE.length];
    const bks=bookings.filter(b=>b.property===p.id&&b.status!=='Cancelled');
    const rev=bks.reduce((s,b)=>s+calcTotals(b).netRevenue,0);
    const now=new Date();
    const yearStart=new Date(now.getFullYear(),0,1);
    const daysElapsed=Math.ceil((now-yearStart)/86400000)+1;
    const thisYearNights=bks.filter(b=>b.checkin&&b.checkin.startsWith(String(now.getFullYear()))).reduce((s,b)=>s+nightsBetween(b.checkin,b.checkout),0);
    const occ=Math.min(100,Math.round(thisYearNights/Math.max(1,daysElapsed)*100));
    const upcoming=bks.filter(b=>b.checkin>today).length;
    const currentGuest=bks.find(b=>b.checkin<=today&&b.checkout>today&&b.status!=='Cancelled');
    const photos=p.photos||[];

    // ── Cover: photo or gradient ──
    const cover=photos.length
      ? `<div class="pcard-cover" onclick="viewPropPhotos('${p.id}')" style="cursor:pointer">
           <img src="${photos[0]}" class="pcard-cover-img" alt=""/>
           <div class="pcard-cover-grad"></div>
           ${photos.length>1?`<div class="pcard-photo-count">📷 ${photos.length}</div>`:''}
         </div>`
      : `<div class="pcard-cover pcard-cover-gradient" style="background:linear-gradient(135deg,${pc}22 0%,${pc}44 100%)" onclick="openPropertyModal('${p.id}')">
           <div class="pcard-cover-icon" style="color:${pc}">${propIconHtml(p,52)}</div>
         </div>`;

    // ── Status pill ──
    const statusPill=currentGuest
      ? `<div class="pcard-status occupied"><span class="pcard-status-dot"></span>Occupied · ${esc(currentGuest.guest)}</div>`
      : `<div class="pcard-status available"><span class="pcard-status-dot"></span>Available</div>`;

    // ── Occupancy bar color ──
    const occColor=occ>=70?'var(--green)':occ>=40?'var(--orange)':'var(--red)';

    // ── Owner / contract strip ──
    const hasSplit=(p.ownerPct??100)<100;
    const ownerStrip=hasSplit?`
      <div class="pcard-owner-strip">
        <span class="pcard-owner-name">👤 ${esc(p.ownerName||'Owner')}</span>
        <span class="pcard-split-badge" style="background:${pc}18;color:${pc};border-color:${pc}44">${p.ownerPct}% · ${100-p.ownerPct}% BLS</span>
        ${contractStatusBadge(p)}
      </div>`:'';

    return`<div class="pcard" onclick="openPropertyModal('${p.id}')">
      ${cover}
      <div class="pcard-body">
        <div class="pcard-top">
          <div class="pcard-title-wrap">
            <div class="pcard-name">${esc(p.name)}${p.beds?`<span class="pcard-beds">${p.beds}BR</span>`:''}</div>
            <div class="pcard-location">📍 ${esc(p.city)}${p.address?` · ${esc(p.address)}`:''}</div>
          </div>
          <div class="pcard-actions" onclick="event.stopPropagation()">
            <button class="pcard-action-btn" onclick="openPropertyModal('${p.id}')" title="Edit">✏️</button>
            <button class="pcard-action-btn" onclick="openBlockDatesModal('${p.id}')" title="Block dates">🔴</button>
            <button class="pcard-action-btn danger" onclick="deleteProperty('${p.id}')" title="Delete">🗑</button>
          </div>
        </div>

        ${statusPill}

        <div class="pcard-kpis">
          <div class="pcard-kpi">
            <div class="pcard-kpi-val" style="color:var(--green)">${fmtMoney(rev)}</div>
            <div class="pcard-kpi-lbl">Net Revenue</div>
          </div>
          <div class="pcard-kpi">
            <div class="pcard-kpi-val" style="color:${occColor}">${occ}%</div>
            <div class="pcard-kpi-lbl">Occupancy YTD</div>
            <div class="pcard-occ-bar"><div class="pcard-occ-fill" style="width:${occ}%;background:${occColor}"></div></div>
          </div>
          <div class="pcard-kpi">
            <div class="pcard-kpi-val">${p.baseRate?fmtMoney(p.baseRate):'—'}</div>
            <div class="pcard-kpi-lbl">Base Rate/Night</div>
          </div>
          <div class="pcard-kpi">
            <div class="pcard-kpi-val" style="color:var(--blue)">${upcoming}</div>
            <div class="pcard-kpi-lbl">Upcoming</div>
          </div>
        </div>

        ${ownerStrip}

        <div class="pcard-footer" onclick="event.stopPropagation()">
          ${p.map?`<a href="${esc(p.map)}" target="_blank" class="pcard-link-btn" onclick="event.stopPropagation()">📍 Map</a>`:''}
          ${p.airbnbUrl?`<a href="${esc(p.airbnbUrl)}" target="_blank" class="pcard-link-btn" onclick="event.stopPropagation()">🏡 Listing</a>`:''}
          <button class="pcard-link-btn" onclick="openBlockDatesModal('${p.id}')">🔴 Block Dates${(p.blockedDates||[]).length?` (${p.blockedDates.length})`:''}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// GUEST PROFILE MODAL (Edit + History combined)
// ============================================================
let _editingGuestName=null;
let _guestProfileTab='edit';

function openGuestProfile(name,tab='edit'){
  _editingGuestName=name;
  // Avatar + header
  const avatarEl=document.getElementById('gpAvatar');
  if(avatarEl){avatarEl.textContent=_guestInitials(name);avatarEl.style.background=_guestColor(name);}
  const titleEl=document.getElementById('gpTitle');
  if(titleEl)titleEl.textContent=name;
  const gBks=bookings.filter(b=>(b.guest||'').toLowerCase().trim()===name.toLowerCase().trim()&&b.status!=='Cancelled');
  const totalRev=gBks.reduce((s,b)=>s+calcTotals(b).netRevenue,0);
  const subtitleEl=document.getElementById('gpSubtitle');
  if(subtitleEl)subtitleEl.textContent=`${gBks.length} booking${gBks.length!==1?'s':''} · ${fmtMoney(totalRev)} lifetime`;
  // Fill edit fields
  let phone='',prefs='';
  bookings.forEach(b=>{
    if((b.guest||'').toLowerCase().trim()!==name.toLowerCase().trim())return;
    if(b.guestPhone)phone=b.guestPhone;
    if(b.guestPrefs)prefs=b.guestPrefs;
  });
  const nameEl=document.getElementById('ge-name');
  const phoneEl=document.getElementById('ge-phone');
  const prefsEl=document.getElementById('ge-prefs');
  if(nameEl)nameEl.value=name;
  if(phoneEl)phoneEl.value=phone;
  if(prefsEl)prefsEl.value=prefs;
  switchGuestTab(tab);
  openModal('guestProfileModal');
}
function switchGuestTab(tab){
  _guestProfileTab=tab;
  document.getElementById('gpEditPanel').style.display=tab==='edit'?'':'none';
  document.getElementById('gpHistoryPanel').style.display=tab==='history'?'':'none';
  document.getElementById('gpTabEdit').classList.toggle('active',tab==='edit');
  document.getElementById('gpTabHistory').classList.toggle('active',tab==='history');
  const saveBtn=document.getElementById('gpSaveBtn');
  if(saveBtn)saveBtn.style.display=tab==='edit'?'':'none';
  if(tab==='history')_renderGuestHistoryPanel(_editingGuestName);
}
function _renderGuestHistoryPanel(name){
  const container=document.getElementById('gpHistoryContent');if(!container)return;
  const gBks=bookings.filter(b=>(b.guest||'').toLowerCase().trim()===(name||'').toLowerCase().trim())
    .sort((a,b)=>b.checkin.localeCompare(a.checkin));
  if(!gBks.length){container.innerHTML='<div class="empty"><div class="empty-text">No bookings found.</div></div>';return;}
  const lifetime=gBks.reduce((s,b)=>s+calcTotals(b).netRevenue,0);
  container.innerHTML=`<div style="font-size:12px;color:var(--text-3);margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">${gBks.length} booking${gBks.length!==1?'s':''} · ${fmtMoney(lifetime)} lifetime value</div>`+
    gBks.map(b=>{const t=calcTotals(b);return`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="closeModal('guestProfileModal');openBookingDrawer('${b.id}')">
      <div style="width:3px;height:38px;border-radius:2px;background:${platformColor(b.platform)};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700">${esc(propName(b.property))}</div>
        <div style="font-size:11px;color:var(--text-3)">${fmtDate(b.checkin)} → ${fmtDate(b.checkout)} · ${t.nights} nights · ${esc(b.platform||'')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:700;color:var(--green)">${fmtMoney(t.netRevenue)}</div>
        ${statusBadgeHtml(b.status)}
      </div>
    </div>`;}).join('');
}
// Keep backward-compatible: called from booking drawer (no arg) or guests list (with name)
function showGuestHistory(name){
  if(!name){name=(document.getElementById('f-guest')?.value||'').trim();if(!name){toast('Enter a guest name first.','warning');return;}}
  openGuestProfile(name,'history');
}
// openGuestEdit → opens profile on edit tab
function openGuestEdit(name){openGuestProfile(name,'edit');}

function saveGuestEdit(){
  const newName=(document.getElementById('ge-name')?.value||'').trim();
  const phone=(document.getElementById('ge-phone')?.value||'').trim();
  const prefs=(document.getElementById('ge-prefs')?.value||'').trim();
  if(!newName){toast('Name is required.','error');return;}
  const oldKey=(_editingGuestName||'').toLowerCase().trim();
  let count=0;
  bookings.forEach(b=>{
    if((b.guest||'').toLowerCase().trim()!==oldKey)return;
    b.guest=newName;b.guestPhone=phone;b.guestPrefs=prefs;count++;
  });
  _editingGuestName=newName;
  saveAll();closeModal('guestProfileModal');renderGuests();
  toast(`Guest updated — ${count} booking${count!==1?'s':''} updated.`,'success');
}

// ============================================================
// GUESTS CRM VIEW (F5)
// ============================================================
let _guestSearchQ='';
let _guestSort='revenue';
let _guestTagFilter='all';
let _guestView='table';

// Avatar helpers
function _guestInitials(name){
  const p=(name||'?').trim().split(/\s+/).filter(Boolean);
  return p.length>=2?(p[0][0]+p[1][0]).toUpperCase():(name||'?').substring(0,2).toUpperCase();
}
function _guestColor(name){
  const c=['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#06b6d4','#ec4899'];
  return c[((name||'').charCodeAt(0)||0)%c.length];
}
function setGuestView(v){
  _guestView=v;
  const cards=document.getElementById('gvCards');
  const table=document.getElementById('gvTable');
  if(cards)cards.className='guest-view-btn'+(v==='cards'?' active':'');
  if(table)table.className='guest-view-btn'+(v==='table'?' active':'');
  renderGuests();
}

function renderGuests(){
  _totalsCache=new Map();
  const container=document.getElementById('guestCrmList');if(!container)return;
  const q=(_guestSearchQ||'').toLowerCase().trim();

  // ── Aggregate guests from bookings (unchanged logic) ─────
  const guestMap={};
  bookings.forEach(b=>{
    if(!b.guest)return;
    const key=b.guest.toLowerCase().trim();
    if(!guestMap[key])guestMap[key]={name:b.guest,bookings:[],prefs:''};
    guestMap[key].bookings.push(b);
    if(b.guestPrefs)guestMap[key].prefs=b.guestPrefs;
  });
  const allGuests=Object.values(guestMap).map(g=>{
    const active=g.bookings.filter(b=>b.status!=='Cancelled');
    const totalNights=active.reduce((s,b)=>s+nightsBetween(b.checkin,b.checkout),0);
    const totalRev=active.reduce((s,b)=>s+calcTotals(b).netRevenue,0);
    const lastBk=active.slice().sort((a,b)=>b.checkin.localeCompare(a.checkin))[0];
    const nextBk=active.filter(b=>b.checkin>=todayISO()).sort((a,b)=>a.checkin.localeCompare(b.checkin))[0];
    return{...g,active,totalNights,totalRev,lastBk,nextBk};
  });

  // ── Dashboard stats ──────────────────────────────────────
  const statsEl=document.getElementById('guestCrmStats');
  if(statsEl){
    const total=allGuests.length;
    const repeats=allGuests.filter(g=>g.active.length>1).length;
    const rate=total?Math.round(repeats/total*100):0;
    const avgSpend=total?Math.round(allGuests.reduce((s,g)=>s+g.totalRev,0)/total):0;
    const soon7=new Date(Date.now()+7*86400000).toISOString().split('T')[0];
    const soonCount=allGuests.filter(g=>g.nextBk&&g.nextBk.checkin<=soon7).length;
    statsEl.innerHTML=[
      {label:'Total Guests',   val:total,        sub:''},
      {label:'Repeat Guests',  val:repeats,       sub:''},
      {label:'Repeat Rate',    val:rate+'%',      sub:''},
      {label:'Avg Lifetime',   val:fmtMoney(avgSpend), sub:'per guest'},
      {label:'Checking In Soon',val:soonCount,    sub:'next 7 days'}
    ].map(s=>`<div class="stat-card" style="cursor:default">
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.val}</div>
      ${s.sub?`<div style="font-size:10px;color:var(--text-3);margin-top:2px">${s.sub}</div>`:''}
    </div>`).join('');
  }

  // ── Top 3 strip ──────────────────────────────────────────
  const topEl=document.getElementById('guestTopStrip');
  if(topEl){
    const top3=[...allGuests].sort((a,b)=>b.totalRev-a.totalRev).slice(0,3);
    const medals=['🥇','🥈','🥉'];
    topEl.innerHTML=top3.length?`<div style="background:var(--surface-2);border-radius:12px;padding:12px 16px;margin-bottom:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text-3);letter-spacing:.5px;margin-bottom:10px">🏆 TOP GUESTS</div>
      <div class="top3-grid">${top3.map((g,i)=>`
        <div class="top3-card" onclick="openGuestProfile('${esc(g.name)}','history')">
          <span style="font-size:22px;flex-shrink:0">${medals[i]}</span>
          <div class="guest-avatar" style="background:${_guestColor(g.name)};width:32px;height:32px;font-size:12px;flex-shrink:0">${_guestInitials(g.name)}</div>
          <div style="min-width:0">
            <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.name)}</div>
            <div style="font-size:11px;color:var(--text-3)">${fmtMoney(g.totalRev)} · ${g.totalNights} nights</div>
          </div>
        </div>`).join('')}
      </div>
    </div>`:'';
  }

  // ── Filter chips ─────────────────────────────────────────
  const chipsEl=document.getElementById('guestChipsRow');
  if(chipsEl){
    const upcoming7=new Date(Date.now()+7*86400000).toISOString().split('T')[0];
    const counts={
      all:allGuests.length,
      repeat:allGuests.filter(g=>g.active.length>1).length,
      upcoming:allGuests.filter(g=>g.nextBk&&g.nextBk.checkin<=upcoming7).length,
      nocontact:allGuests.filter(g=>!g.prefs).length
    };
    chipsEl.innerHTML=[
      {id:'all',      label:`All (${counts.all})`},
      {id:'repeat',   label:`🔄 Repeat (${counts.repeat})`},
      {id:'upcoming', label:`📅 Upcoming (${counts.upcoming})`},
      {id:'nocontact',label:`📞 No Prefs (${counts.nocontact})`}
    ].map(c=>`<button class="guest-chip${_guestTagFilter===c.id?' active':''}" onclick="_guestTagFilter='${c.id}';renderGuests()">${c.label}</button>`).join('');
  }

  // ── Sync sort select ─────────────────────────────────────
  const sortSel=document.getElementById('guestSortSel');
  if(sortSel&&sortSel.value!==_guestSort)sortSel.value=_guestSort;

  // ── Apply search ─────────────────────────────────────────
  let guests=allGuests;
  if(q)guests=guests.filter(g=>g.name.toLowerCase().includes(q)||(g.prefs||'').toLowerCase().includes(q));

  // ── Apply tag filter ─────────────────────────────────────
  const soon7b=new Date(Date.now()+7*86400000).toISOString().split('T')[0];
  if(_guestTagFilter==='repeat')   guests=guests.filter(g=>g.active.length>1);
  else if(_guestTagFilter==='upcoming') guests=guests.filter(g=>g.nextBk&&g.nextBk.checkin<=soon7b);
  else if(_guestTagFilter==='nocontact')guests=guests.filter(g=>!g.prefs);

  // ── Apply sort ───────────────────────────────────────────
  if(_guestSort==='revenue')     guests=[...guests].sort((a,b)=>b.totalRev-a.totalRev);
  else if(_guestSort==='lastStay')guests=[...guests].sort((a,b)=>(b.lastBk?.checkin||'').localeCompare(a.lastBk?.checkin||''));
  else if(_guestSort==='name')    guests=[...guests].sort((a,b)=>a.name.localeCompare(b.name));
  else if(_guestSort==='nights')  guests=[...guests].sort((a,b)=>b.totalNights-a.totalNights);
  else if(_guestSort==='nextCheckin'){
    guests=[...guests].sort((a,b)=>{
      if(!a.nextBk&&!b.nextBk)return 0;if(!a.nextBk)return 1;if(!b.nextBk)return-1;
      return a.nextBk.checkin.localeCompare(b.nextBk.checkin);
    });
  }

  // ── Empty state ──────────────────────────────────────────
  if(!guests.length){
    container.innerHTML=`<div class="empty">
      <div class="empty-icon">🧑</div>
      <div class="empty-text">${q||_guestTagFilter!=='all'?'No guests match your filters':'No guests yet'}</div>
      <div class="empty-sub">${q||_guestTagFilter!=='all'?'Try clearing your search or filters':'Guest profiles are created automatically from bookings'}</div>
      ${!q&&_guestTagFilter==='all'?'<button class="btn btn-primary btn-sm" style="margin-top:14px" onclick="openBookingDrawer()">＋ Add First Booking</button>':''}
    </div>`;
    return;
  }

  // ── Render: TABLE view ───────────────────────────────────
  if(_guestView==='table'){
    container.innerHTML=`<div style="overflow-x:auto;border-radius:10px;border:1px solid var(--border)">
      <table class="guest-table">
        <thead><tr>
          <th style="width:44px"></th>
          <th>Guest</th>
          <th style="text-align:center">Stays</th>
          <th>Last Stay</th>
          <th style="text-align:center">Nights</th>
          <th>Revenue</th>
          <th style="width:80px"></th>
        </tr></thead>
        <tbody>${guests.map(g=>{
          const color=_guestColor(g.name);
          const initials=_guestInitials(g.name);
          const repeatBadge=g.active.length>1?`<span class="badge badge-purple" style="font-size:9px;margin-left:5px">×${g.active.length}</span>`:'';
          const phoneStr=g.bookings.find(b=>b.guestPhone)?.guestPhone||'';
          return`<tr onclick="openGuestProfile('${esc(g.name)}','history')">
            <td><div class="guest-avatar" style="background:${color};width:32px;height:32px;font-size:11px">${initials}</div></td>
            <td>
              <div style="font-weight:600;font-size:13px">
                <span class="guest-name-link" onclick="event.stopPropagation();openGuestEdit('${esc(g.name)}')">${esc(g.name)}</span>${repeatBadge}
              </div>
              ${phoneStr?`<div style="font-size:11px;color:var(--text-3)">📞 ${esc(phoneStr)}</div>`:''}
              ${g.nextBk?`<div style="font-size:10px;color:var(--blue)">↓ Next: ${fmtDate(g.nextBk.checkin)}</div>`:''}
            </td>
            <td style="text-align:center;color:var(--text-2)">${g.active.length}</td>
            <td style="color:var(--text-2);font-size:12px">${g.lastBk?fmtDate(g.lastBk.checkin):'—'}</td>
            <td style="text-align:center;color:var(--text-2)">${g.totalNights}</td>
            <td style="font-weight:700;color:var(--green)">${fmtMoney(g.totalRev)}</td>
            <td onclick="event.stopPropagation()" style="white-space:nowrap">
              <button class="btn btn-ghost btn-sm" title="Edit Guest" onclick="openGuestEdit('${esc(g.name)}')">✏</button>
              <button class="btn btn-ghost btn-sm" title="New Booking" onclick="openBookingDrawer();document.getElementById('f-guest').value='${esc(g.name)}';updateDrawerProfile('${esc(g.name)}')">＋</button>
              <button class="btn btn-ghost btn-sm" title="History" onclick="event.stopPropagation();openGuestProfile('${esc(g.name)}','history')">📋</button>
            </td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
    return;
  }

  // ── Render: CARDS view ───────────────────────────────────
  container.innerHTML=`<div class="prop-grid">${guests.map(g=>{
    const color=_guestColor(g.name);
    const initials=_guestInitials(g.name);
    const repeatBadge=g.active.length>1?`<span class="badge badge-purple" style="font-size:9px">REPEAT×${g.active.length}</span>`:'';
    const nextStr=g.nextBk?`<div style="font-size:11px;color:var(--blue);margin-top:1px">↓ Next: ${fmtDate(g.nextBk.checkin)}</div>`:'';
    const prefsStr=g.prefs?`<div style="font-size:11px;color:var(--text-2);margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">📋 ${esc(g.prefs)}</div>`:'';
    // WhatsApp link — works with or without a stored number
    const storedPhone=g.bookings.find(b=>b.guestPhone)?.guestPhone||'';
    const waMsg=encodeURIComponent(`Hi ${g.name}! This is Bloomstone. `);
    const waHref=storedPhone?`https://wa.me/63${storedPhone.replace(/^0/,'').replace(/\D/g,'')}?text=${waMsg}`:`https://wa.me/?text=${waMsg}`;
    return`<div class="prop-card guest-card">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <div class="guest-avatar" style="background:${color}">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <span class="guest-name-link" onclick="openGuestEdit('${esc(g.name)}')">${esc(g.name)}</span>${repeatBadge}
          </div>
          ${storedPhone?`<div style="font-size:11px;color:var(--text-3)">📞 ${esc(storedPhone)}</div>`:''}
          <div style="font-size:11px;color:var(--text-3)">${g.lastBk?`Last: ${fmtDate(g.lastBk.checkin)}`:''}</div>
          ${nextStr}
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-weight:700;color:var(--green);font-size:14px">${fmtMoney(g.totalRev)}</div>
          <div style="font-size:11px;color:var(--text-3)">${g.totalNights} night${g.totalNights!==1?'s':''}</div>
        </div>
      </div>
      ${prefsStr}
      <div style="display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="openBookingDrawer();document.getElementById('f-guest').value='${esc(g.name)}';updateDrawerProfile('${esc(g.name)}')">＋ Booking</button>
        <a class="btn btn-ghost btn-sm" href="${waHref}" target="_blank" title="WhatsApp">💬</a>
        <button class="btn btn-ghost btn-sm" onclick="openGuestProfile('${esc(g.name)}','history')">👁 View</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}
document.addEventListener('DOMContentLoaded',()=>{
  const si=document.getElementById('guestCrmSearch');
  if(si)si.addEventListener('input',e=>{_guestSearchQ=e.target.value;renderGuests();});
});

// ============================================================
// BLOCK DATES
// ============================================================
let blockingPropId=null,blockCalDate=new Date();

function openBlockDatesModal(propId){
  blockingPropId=propId;
  blockCalDate=new Date();
  const p=properties.find(x=>x.id===propId);
  document.getElementById('blockDatesTitle').textContent=`Block Dates — ${p?.name||''}`;
  renderBlockCal();
  openModal('blockDatesModal');
}

function blockCalNav(dir){
  blockCalDate=new Date(blockCalDate.getFullYear(),blockCalDate.getMonth()+dir,1);
  renderBlockCal();
}

function renderBlockCal(){
  const p=properties.find(x=>x.id===blockingPropId);if(!p)return;
  const y=blockCalDate.getFullYear(),m=blockCalDate.getMonth();
  const blocked=new Set(p.blockedDates||[]);
  const bookedSet=new Set();
  bookings.filter(b=>b.property===blockingPropId&&b.status!=='Cancelled').forEach(b=>{
    for(let d=new Date(b.checkin+'T12:00:00');dateToISO(d)<b.checkout;d.setDate(d.getDate()+1))bookedSet.add(dateToISO(d));
  });
  document.getElementById('blockCalLabel').textContent=new Date(y,m,1).toLocaleString('default',{month:'long',year:'numeric'});
  const dayNames=['S','M','T','W','T','F','S'];
  const firstDow=new Date(y,m,1).getDay();
  const daysInMonth=new Date(y,m+1,0).getDate();
  let html=dayNames.map(d=>`<div class="block-cal-dn">${d}</div>`).join('');
  for(let i=0;i<firstDow;i++)html+=`<div class="block-cal-day empty"></div>`;
  for(let day=1;day<=daysInMonth;day++){
    const ds=dateToISO(new Date(y,m,day));
    const isBooked=bookedSet.has(ds);
    const isBlocked=blocked.has(ds);
    let cls='block-cal-day in';
    if(isBooked)cls+=' has-booking';
    else if(isBlocked)cls+=' blocked';
    html+=`<div class="${cls}" onclick="${isBooked?'':''};toggleBlockDate('${ds}')" title="${ds}">${day}</div>`;
  }
  document.getElementById('blockCalGrid').innerHTML=html;
}

function toggleBlockDate(dateStr){
  const p=properties.find(x=>x.id===blockingPropId);if(!p)return;
  // Don't block dates that have bookings
  const hasBooking=bookings.some(b=>b.property===blockingPropId&&b.status!=='Cancelled'&&b.checkin<=dateStr&&dateStr<b.checkout);
  if(hasBooking){toast(`Cannot block ${fmtDate(dateStr)} — has an active booking.`,'warning');return;}
  if(!p.blockedDates)p.blockedDates=[];
  const idx=p.blockedDates.indexOf(dateStr);
  if(idx>=0)p.blockedDates.splice(idx,1);
  else p.blockedDates.push(dateStr);
  saveAll();renderBlockCal();renderProperties();
  if(currentWs==='calendar')renderCalendar();
}

// D2: Block a date range at once
function blockDateRange(){
  const p=properties.find(x=>x.id===blockingPropId);if(!p)return;
  const from=document.getElementById('blockRangeFrom')?.value;
  const to=document.getElementById('blockRangeTo')?.value;
  if(!from||!to){toast('Select both From and To dates.','warning');return;}
  if(to<from){toast('End date must be after start date.','warning');return;}
  if(!p.blockedDates)p.blockedDates=[];
  let added=0,skipped=0;
  for(let d=new Date(from+'T12:00:00');dateToISO(d)<=to;d.setDate(d.getDate()+1)){
    const ds=dateToISO(d);
    const hasBooking=bookings.some(b=>b.property===blockingPropId&&b.status!=='Cancelled'&&b.checkin<=ds&&ds<b.checkout);
    if(hasBooking){skipped++;continue;}
    if(!p.blockedDates.includes(ds)){p.blockedDates.push(ds);added++;}
  }
  saveAll();renderBlockCal();renderProperties();
  if(currentWs==='calendar')renderCalendar();
  if(skipped>0)toast(`Blocked ${added} date(s). Skipped ${skipped} (have bookings).`,'success');
  else toast(`Blocked ${added} date(s).`,'success');
}
// D2: Clear all blocked dates for this property
function clearAllBlockedDates(){
  const p=properties.find(x=>x.id===blockingPropId);if(!p)return;
  confirmDialog('🔴 Clear All Blocked Dates',`Remove all ${(p.blockedDates||[]).length} blocked date(s) for "${p.name}"?`,'🔴',()=>{
    p.blockedDates=[];saveAll();renderBlockCal();renderProperties();
    if(currentWs==='calendar')renderCalendar();
    toast('All blocked dates cleared.','warning');
  });
}

function isDateBlocked(dateStr,propId){
  const p=properties.find(x=>x.id===propId);
  return p&&(p.blockedDates||[]).includes(dateStr);
}

// ============================================================
// REPORTS & CHARTS
// ============================================================
function clearReportFilters(){
  ['rep-prop','rep-plat'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='all';});
  ['rep-from','rep-to'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderReports();
}
function getReportData(){
  const group=document.getElementById('rep-group')?.value||'monthly';
  const pr=document.getElementById('rep-prop')?.value||'all';
  const pl=document.getElementById('rep-plat')?.value||'all';
  const from=document.getElementById('rep-from')?.value||'';
  const to=document.getElementById('rep-to')?.value||'';
  let list=bookings.filter(b=>b.status!=='Cancelled');
  if(pr!=='all')list=list.filter(b=>b.property===pr);
  if(pl!=='all')list=list.filter(b=>normPlatform(b.platform||'')===normPlatform(pl));
  if(from)list=list.filter(b=>b.checkin>=from);
  if(to)list=list.filter(b=>b.checkin<=to);
  const groups={};
  list.forEach(b=>{
    const key=group==='yearly'?b.checkin.slice(0,4):b.checkin.slice(0,7);
    if(!groups[key])groups[key]={key,bookings:[],revenue:0,nights:0,store:0};
    const t=calcTotals(b);groups[key].bookings.push(b);groups[key].revenue+=t.netRevenue;groups[key].nights+=t.nights;groups[key].store+=(+b.storeSales||0);
  });
  return{groups,list,group};
}
function renderReports(){
  _totalsCache=new Map();
  const{groups,list,group}=getReportData();
  const keys=Object.keys(groups).sort();
  const totalRev=list.reduce((s,b)=>s+calcTotals(b).netRevenue,0);
  const totalNights=list.reduce((s,b)=>s+nightsBetween(b.checkin,b.checkout),0);
  const totalStore=list.reduce((s,b)=>s+(+b.storeSales||0),0);
  const avgRev=list.length?totalRev/list.length:0;
  document.getElementById('repStats').innerHTML=`
    <div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-value">${fmtMoney(totalRev)}</div></div>
    <div class="stat-card"><div class="stat-label">Bookings</div><div class="stat-value">${list.length}</div></div>
    <div class="stat-card"><div class="stat-label">Total Nights</div><div class="stat-value">${totalNights}</div></div>
    <div class="stat-card"><div class="stat-label">Avg / Booking</div><div class="stat-value">${fmtMoney(avgRev)}</div></div>`;
  const topPlat=platforms.map(p=>({name:p.name,rev:list.filter(b=>normPlatform(b.platform||'')===p.name).reduce((s,b)=>s+calcTotals(b).netRevenue,0)})).sort((a,b)=>b.rev-a.rev)[0];
  const topProp=properties.map(p=>({name:p.name,rev:list.filter(b=>b.property===p.id).reduce((s,b)=>s+calcTotals(b).netRevenue,0)})).sort((a,b)=>b.rev-a.rev)[0];
  document.getElementById('repSmartInsight').textContent=topPlat&&topProp?`Best platform: ${topPlat.name} \u00b7 Best property: ${topProp.name}`:'';
  setTimeout(()=>{
    drawBarChart2(keys,groups,'repBarCanvas');
    drawPieChart('repPieCanvas',list);
    drawOccupancyChart('repOccCanvas',list);
  },50);
  document.getElementById('repThead').innerHTML=`<tr><th>${group==='yearly'?'Year':'Month'}</th><th>Bookings</th><th>Nights</th><th>Net Revenue</th><th>Store Sales</th></tr>`;
  document.getElementById('repTbody').innerHTML=keys.map(k=>{const g=groups[k];return`<tr><td><strong>${group==='yearly'?k:fmtMonthYear(k+'-01')}</strong></td><td>${g.bookings.length}</td><td>${g.nights}</td><td>${fmtMoney(g.revenue)}</td><td>${fmtMoney(g.store)}</td></tr>`;}).join('');
  document.getElementById('repTfoot').innerHTML=`<tr style="background:var(--surface-3);font-weight:700"><td>TOTAL</td><td>${list.length}</td><td>${totalNights}</td><td>${fmtMoney(totalRev)}</td><td>${fmtMoney(totalStore)}</td></tr>`;
}
['rep-group','rep-prop','rep-plat','rep-from','rep-to'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',renderReports);});

// Charts
function drawBarChart(canvasId){
  const canvas=document.getElementById(canvasId);if(!canvas)return;
  const now=new Date();
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({label:d.toLocaleString('default',{month:'short'}),y:d.getFullYear(),m:d.getMonth()});}
  const vals=months.map(mo=>bookings.filter(b=>b.status!=='Cancelled').filter(b=>{const d=new Date(b.checkin+'T12:00:00');return d.getFullYear()===mo.y&&d.getMonth()===mo.m;}).reduce((s,b)=>s+calcTotals(b).netRevenue,0));
  drawBars(canvas,months.map(m=>m.label),vals,'#1a1a1a');
}
function drawBarChart2(keys,groups,canvasId){
  const canvas=document.getElementById(canvasId);if(!canvas)return;
  drawBars(canvas,keys.map(k=>k.length===7?k.slice(5):k),keys.map(k=>groups[k].revenue),'#1a1a1a');
}
function drawBars(canvas,labels,vals,color){
  const dpr=window.devicePixelRatio||1;
  const W=canvas.offsetWidth||400,H=220;
  canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  if(!vals.length)return;
  const maxV=Math.max(...vals,1);
  const PAD={t:14,r:10,b:30,l:55};
  const cw=W-PAD.l-PAD.r,ch=H-PAD.t-PAD.b;
  const bw=Math.max(6,cw/labels.length-6);
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const gridColor=isDark?'#444441':'#e8e6e1';
  const textColor=isDark?'#888882':'#9a9a9a';
  ctx.font='10px Inter';ctx.fillStyle=textColor;
  for(let i=0;i<=4;i++){
    const y=PAD.t+(ch/4)*i;
    ctx.strokeStyle=gridColor;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PAD.l,y);ctx.lineTo(PAD.l+cw,y);ctx.stroke();
    const v=Math.round(maxV-(maxV/4)*i);
    ctx.fillText(C()+(v>=1000?Math.round(v/1000)+'k':v),2,y+4);
  }
  labels.forEach((l,i)=>{
    const x=PAD.l+(cw/labels.length)*i+(cw/labels.length-bw)/2;
    const bh=(vals[i]/maxV)*ch||0;const y=PAD.t+ch-bh;
    ctx.fillStyle=document.documentElement.getAttribute('data-theme')==='dark'?'#f0eeea':color;
    ctx.beginPath();
    if(ctx.roundRect)ctx.roundRect(x,y,bw,bh,3);else ctx.rect(x,y,bw,bh);
    ctx.fill();
    ctx.fillStyle=textColor;ctx.fillText(l,x+bw/2-ctx.measureText(l).width/2,H-PAD.b+14);
  });
}
function drawPieChart(canvasId,list){
  const canvas=document.getElementById(canvasId);if(!canvas)return;
  const dpr=window.devicePixelRatio||1;
  const W=canvas.offsetWidth||400,H=220;
  canvas.width=W*dpr;canvas.height=H*dpr;canvas.style.width=W+'px';canvas.style.height=H+'px';
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const totals={};
  list.forEach(b=>{totals[b.platform]=(totals[b.platform]||0)+calcTotals(b).netRevenue;});
  const entries=Object.entries(totals).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if(!entries.length)return;
  const total=entries.reduce((s,[,v])=>s+v,0);
  const cx=Math.min(W/2,90),cy=H/2,r=Math.min(cy-14,70);
  let angle=-Math.PI/2;
  entries.forEach(([name,val])=>{
    const sl=(val/total)*Math.PI*2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,angle,angle+sl);ctx.closePath();
    ctx.fillStyle=platformColor(name);ctx.fill();
    ctx.strokeStyle='rgba(0,0,0,.05)';ctx.lineWidth=2;ctx.stroke();
    angle+=sl;
  });
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const textColor=isDark?'#a0a09a':'#5a5a5a';
  const lx=cx+r+16;
  ctx.font='11px Inter';
  entries.forEach(([name,val],i)=>{
    const ly=H/2-entries.length*12+i*22;
    ctx.fillStyle=platformColor(name);ctx.fillRect(lx,ly,11,11);
    ctx.fillStyle=textColor;ctx.fillText(`${name} (${Math.round(val/total*100)}%)`,lx+15,ly+9);
  });
}
function drawOccupancyChart(canvasId,list){
  const canvas=document.getElementById(canvasId);if(!canvas)return;
  const now=new Date();
  const months=[];
  for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push({label:d.toLocaleString('default',{month:'short'}),y:d.getFullYear(),m:d.getMonth(),days:new Date(d.getFullYear(),d.getMonth()+1,0).getDate()});}
  const vals=months.map(mo=>{
    const nights=list.filter(b=>{const d=new Date(b.checkin+'T12:00:00');return d.getFullYear()===mo.y&&d.getMonth()===mo.m;}).reduce((s,b)=>s+nightsBetween(b.checkin,b.checkout),0);
    return Math.min(100,Math.round(nights/Math.max(1,properties.length*mo.days)*100));
  });
  drawBars(canvas,months.map(m=>m.label),vals,'#2d6a1f');
}

// ============================================================
// TRASH & DAILY BRIEF
// ============================================================
function renderTrash(){
  const list=document.getElementById('trashList');
  if(!trash.length){list.innerHTML=`<div class="empty"><div class="empty-icon">&#x2326;</div><div class="empty-text">Trash is empty.</div></div>`;return;}
  list.innerHTML=trash.map(item=>`<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px 16px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
    <div style="font-size:20px;opacity:.4">&#x2326;</div>
    <div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:700">${esc(item.guest||item.name||'Item')}</div><div style="font-size:11px;color:var(--text-3)">Deleted ${item.deletedAt?new Date(item.deletedAt).toLocaleString():'\u2014'}</div>${item.checkin?`<div style="font-size:11px;color:var(--text-3)">${fmtDate(item.checkin)} \u2192 ${fmtDate(item.checkout)}</div>`:''}</div>
    <button class="btn btn-success btn-sm" onclick="restoreTrash('${item.id}')">\u21bb Restore</button>
    <button class="btn btn-danger btn-sm" onclick="permDelete('${item.id}')">\u00d7</button>
  </div>`).join('');
}
function restoreTrash(id){
  const i=trash.findIndex(t=>t.id===id);if(i<0)return;
  const item=trash.splice(i,1)[0];
  if(item.type==='booking'){const{deletedAt,type,...rest}=item;bookings.unshift(rest);}
  saveAll();renderTrash();toast('Restored.');
}
function permDelete(id){
  const item=trash.find(t=>t.id===id);
  confirmDialog('\u26a0 Permanently Delete','This will PERMANENTLY remove this item and it CANNOT be recovered. There is no undo.','\ud83d\uddd1',()=>{
    trash=trash.filter(t=>t.id!==id);saveAll();renderTrash();toast('Permanently deleted.','warning');
  });
}
function emptyTrash(){
  if(!trash.length){toast('Trash is already empty.','warning');return;}
  confirmDialog('\u26a0 Empty Trash \u2014 Caution!',`This will PERMANENTLY delete all ${trash.length} item(s) in trash. This action CANNOT be undone and all data will be lost forever.`,'\ud83d\uddd1',()=>{
    trash=[];saveAll();renderTrash();toast('Trash emptied.','warning');
  });
}

function openDailyBrief(){
  const today=todayISO();
  const in3=new Date(); in3.setDate(in3.getDate()+3);
  const in3str=in3.toISOString().slice(0,10);

  document.getElementById('dailyDate').textContent=new Date().toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric',year:'numeric'});

  loadDrafts();
  const checkIns   = bookings.filter(b=>b.checkin===today&&b.status!=='Cancelled');
  const checkOuts  = bookings.filter(b=>b.checkout===today&&b.status!=='Cancelled');
  const upcoming   = bookings.filter(b=>b.status!=='Cancelled'&&b.checkin>today&&b.checkin<=in3str)
                             .sort((a,b)=>a.checkin.localeCompare(b.checkin));
  const conflicts  = bookings.filter(b=>b.status!=='Cancelled'&&hasConflict(b));
  const recent     = bookings.slice().sort((a,b)=>(b.updatedAt||b.createdAt||'').localeCompare(a.updatedAt||a.createdAt||'')).slice(0,6);

  // \u2500\u2500 Section header \u2500\u2500
  function secHdr(icon,title,count,color='var(--text-3)'){
    return`<div style="display:flex;align-items:center;gap:6px;margin:16px 0 8px">
      <span style="font-size:13px">${icon}</span>
      <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:${color}">${title}</span>
      <span style="font-size:10px;font-weight:700;background:var(--surface-3);color:var(--text-2);border-radius:99px;padding:1px 7px">${count}</span>
    </div>`;
  }

  // \u2500\u2500 Standard booking row \u2500\u2500
  function row(b,right=''){
    return`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--surface-2);border-radius:var(--radius);margin-bottom:5px;cursor:pointer" onclick="closeModal('dailyBriefModal');openBookingDrawer('${b.id}')">
      <div style="width:3px;min-height:28px;border-radius:2px;background:${platformColor(b.platform)};flex-shrink:0;align-self:stretch"></div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.guest)}${isRepeat(b.guest)?'<span class="badge badge-purple" style="margin-left:4px;font-size:9px;vertical-align:middle">REPEAT</span>':''}</div>
        <div style="font-size:11px;color:var(--text-3);margin-top:1px">${esc(propName(b.property))}</div>
      </div>
      <div style="flex-shrink:0">${right}</div>
    </div>`;
  }

  let html='';

  // \u2500\u2500 DRAFTS \u2500\u2500
  if(drafts.length){
    html+=secHdr('\u270f\ufe0f','Drafts',drafts.length,'var(--orange)');
    drafts.forEach(d=>{
      const ci=d.checkin?fmtDate(d.checkin):'';
      const co=d.checkout?fmtDate(d.checkout):'';
      const dateStr=ci&&co?`${ci} \u2192 ${co}`:ci||'No dates yet';
      const propStr=d.property?esc(propName(d.property)):'No property';
      html+=`<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--orange-bg);border:1px solid rgba(196,124,10,.2);border-radius:var(--radius);margin-bottom:5px">
        <div style="flex:1;min-width:0;cursor:pointer" onclick="openDraftInDrawer('${d.id}')">
          <div style="font-weight:700;font-size:13px">${esc(d.guest)}</div>
          <div style="font-size:11px;color:var(--text-3)">${propStr} \u00b7 ${dateStr}</div>
        </div>
        <button onclick="confirmDialog('Discard Draft','Discard the draft for \u201c${esc(d.guest)}\u201d? This cannot be undone.','\ud83d\uddd1',()=>{deleteDraft('${d.id}');openDailyBrief();},'Discard')" style="background:none;border:none;cursor:pointer;color:var(--text-3);font-size:15px;padding:2px 6px;border-radius:var(--radius-sm)" title="Discard draft">\ud83d\uddd1</button>
        <button onclick="openDraftInDrawer('${d.id}')" style="background:var(--orange);color:#fff;border:none;border-radius:var(--radius-sm);padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer">Open</button>
      </div>`;
    });
  }

  // \u2500\u2500 CHECK-INS \u2500\u2500
  if(checkIns.length){
    html+=secHdr('\ud83d\udfe2','Check-ins Today',checkIns.length,'var(--green)');
    checkIns.forEach(b=>{ html+=row(b,platformPillHtml(b.platform)); });
  }

  // \u2500\u2500 CHECK-OUTS \u2500\u2500
  if(checkOuts.length){
    html+=secHdr('\ud83c\udfc1','Check-outs Today',checkOuts.length,'var(--text-2)');
    checkOuts.forEach(b=>{ html+=row(b,`<span class="badge badge-green">${fmtMoney(calcTotals(b).netRevenue)}</span>`); });
  }

  // \u2500\u2500 UPCOMING (next 3 days) \u2500\u2500
  if(upcoming.length){
    html+=secHdr('\ud83d\udcc6','Upcoming (3 days)',upcoming.length);
    upcoming.forEach(b=>{
      const days=Math.round((new Date(b.checkin+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
      const label=days===1?'Tomorrow':`In ${days} days`;
      html+=row(b,`<span style="font-size:10px;font-weight:700;color:var(--blue);white-space:nowrap">${label}</span>`);
    });
  }

  // \u2500\u2500 RECENT BOOKINGS (last 6, compact 2-col grid) \u2500\u2500
  if(recent.length){
    html+=secHdr('\ud83d\udd50','Recent Bookings',recent.length);
    html+=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">`;
    recent.forEach(b=>{
      html+=`<div style="display:flex;align-items:center;gap:7px;padding:7px 9px;background:var(--surface-2);border-radius:var(--radius);cursor:pointer" onclick="closeModal('dailyBriefModal');openBookingDrawer('${b.id}')">
        <div style="width:3px;height:28px;border-radius:2px;background:${platformColor(b.platform)};flex-shrink:0"></div>
        <div style="min-width:0">
          <div style="font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(b.guest)}</div>
          <div style="font-size:10px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(propName(b.property))}</div>
        </div>
      </div>`;
    });
    html+=`</div>`;
  }

  // \u2500\u2500 CONFLICTS \u2500\u2500
  if(conflicts.length){
    html+=secHdr('\u26a0\ufe0f','Conflicts',conflicts.length,'var(--red)');
    conflicts.forEach(b=>{ html+=row(b,'<span class="badge badge-red">CONFLICT</span>'); });
  }

  // F10: Deposit not collected for upcoming check-ins (within 3 days)
  const depositAlert=upcoming.filter(b=>b.deposit>0&&!b.depositCollected);
  if(depositAlert.length){
    html+=secHdr('\ud83d\udcb0','Deposit Pending',depositAlert.length,'var(--orange)');
    depositAlert.forEach(b=>{
      const days=Math.round((new Date(b.checkin+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
      const label=days===1?'Tomorrow':`In ${days} days`;
      html+=row(b,`<span style="font-size:10px;font-weight:700;color:var(--orange);white-space:nowrap">\u20b1${fmtMoney(b.deposit)} due ${label}</span>`);
    });
  }

  // F9: Bookings that should be Checked-In or Checked-Out but status not updated
  const needsStatusUpdate=bookings.filter(b=>{
    if(b.status==='Cancelled'||b.status==='Checked-In'||b.status==='Checked-Out')return false;
    const inProgress=b.checkin<=today&&b.checkout>today;
    const pastCheckout=b.checkout<=today&&b.checkin<today;
    return inProgress||pastCheckout;
  });
  if(needsStatusUpdate.length){
    html+=secHdr('\ud83d\udd14','Status Needs Update',needsStatusUpdate.length,'var(--purple)');
    needsStatusUpdate.forEach(b=>{
      const inProgress=b.checkin<=today&&b.checkout>today;
      const label=inProgress?'Should be Checked-In':'Should be Checked-Out';
      const newStatus=inProgress?'Checked-In':'Checked-Out';
      html+=`<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:700">${esc(b.guest)}</div>
          <div style="font-size:11px;color:var(--text-3)">${esc(propName(b.property))} \u00b7 ${fmtDate(b.checkin)}\u2192${fmtDate(b.checkout)}</div>
          <div style="font-size:10px;font-weight:700;color:var(--purple);margin-top:2px">${label}</div>
        </div>
        <button class="btn btn-secondary btn-sm" style="font-size:11px;white-space:nowrap" onclick="quickStatusUpdate('${b.id}','${newStatus}',this)">\u2192 ${newStatus}</button>
      </div>`;
    });
    html+=`<div style="margin-top:10px"><button class="btn btn-primary btn-sm" style="font-size:12px;width:100%" onclick="bulkStatusUpdate()">Update All Automatically</button></div>`;
  }

  if(!html)html=`<div class="empty"><div class="empty-icon">\u2600\ufe0f</div><div class="empty-text">All clear for today!</div></div>`;
  document.getElementById('dailyBriefBody').innerHTML=html;
  openModal('dailyBriefModal');
}
document.getElementById('dailyBriefBtn').addEventListener('click',openDailyBrief);

function quickStatusUpdate(id,newStatus,btn){
  const b=bookings.find(x=>x.id===id);if(!b)return;
  b.status=newStatus;b.updatedAt=new Date().toISOString();
  saveAll();
  if(btn){btn.textContent='✓ Done';btn.disabled=true;btn.style.background='var(--green)';btn.style.color='#fff';}
  toast(`${b.guest} → ${newStatus}`,'success');
}

// ── WF1: Right-click / long-press quick status context menu ──
let _ctxMenuTimeout=null;
function showBookingContextMenu(id,x,y){
  closeBookingContextMenu();
  const b=bookings.find(bk=>bk.id===id);if(!b)return;
  const statuses=['Confirmed','Pending','Checked-In','Checked-Out','Cancelled'];
  const colors={Confirmed:'var(--green)',Pending:'var(--orange)','Checked-In':'var(--blue)','Checked-Out':'var(--text-3)',Cancelled:'var(--red)'};
  const menu=document.createElement('div');
  menu.id='bkCtxMenu';
  menu.className='bk-ctx-menu';
  menu.innerHTML=`<div class="bk-ctx-title">Change status · <b>${esc(b.guest)}</b></div>`+
    statuses.map(s=>`<div class="bk-ctx-item${b.status===s?' bk-ctx-active':''}" style="--ctx-color:${colors[s]||'var(--text-1)'}" onclick="quickCtxStatus('${id}','${s}')">${s==='Checked-In'?'✓ ':s==='Checked-Out'?'✓✓ ':''}<span>${s}</span></div>`).join('')+
    `<hr style="border:none;border-top:1px solid var(--border);margin:6px 0">
     <div class="bk-ctx-item" onclick="closeBookingContextMenu();openBookingDrawer('${id}')">✏️ Edit booking</div>
     <div class="bk-ctx-item" onclick="closeBookingContextMenu();cloneBooking('${id}',event)">⎘ Clone booking</div>`;
  document.body.appendChild(menu);
  // position so it stays on screen
  const vw=window.innerWidth,vh=window.innerHeight;
  const mw=180,mh=menu.offsetHeight||220;
  menu.style.left=Math.min(x,vw-mw-8)+'px';
  menu.style.top=Math.min(y,vh-mh-8)+'px';
  menu.style.opacity='1';
  requestAnimationFrame(()=>document.addEventListener('click',closeBookingContextMenu,{once:true}));
}
function quickCtxStatus(id,status){
  closeBookingContextMenu();
  const b=bookings.find(x=>x.id===id);if(!b)return;
  b.status=status;b.updatedAt=new Date().toISOString();
  saveAll();renderBookings();
  toast(`${b.guest} → ${status}`,'success');
}
function closeBookingContextMenu(){
  const m=document.getElementById('bkCtxMenu');if(m)m.remove();
}
function onBkRowContextMenu(e,id){
  e.preventDefault();e.stopPropagation();
  showBookingContextMenu(id,e.clientX,e.clientY);
}
function onBkRowTouchStart(e,id){
  _ctxMenuTimeout=setTimeout(()=>{
    const t=e.touches[0];
    showBookingContextMenu(id,t.clientX,t.clientY);
  },600);
}
function onBkRowTouchEnd(){
  clearTimeout(_ctxMenuTimeout);
}

function bulkStatusUpdate(){
  const today=todayISO();
  let count=0;
  bookings.forEach(b=>{
    if(b.status==='Cancelled'||b.status==='Checked-Out')return;
    // Past checkout: promote Confirmed / Pending / Checked-In → Checked-Out
    if(b.checkout<=today&&b.checkin<today){
      b.status='Checked-Out';b.updatedAt=new Date().toISOString();count++;return;
    }
    // Currently in-progress: promote Confirmed / Pending → Checked-In
    if(b.checkin<=today&&b.checkout>today&&(b.status==='Confirmed'||b.status==='Pending')){
      b.status='Checked-In';b.updatedAt=new Date().toISOString();count++;
    }
  });
  if(count){saveAll();renderView(currentWs);closeModal('dailyBriefModal');toast(`✓ Updated ${count} booking${count!==1?'s':''} automatically.`,'success');}
  else{toast('All statuses are already up to date.','info');}
}

// ============================================================
// COMMAND PALETTE
// ============================================================
// Recent items for command palette — persisted in localStorage
function getCmdRecent(){try{return JSON.parse(localStorage.getItem('cmd_recent'))||[];}catch(e){return[];}}
function addCmdRecent(id){
  const list=getCmdRecent().filter(x=>x!==id);
  list.unshift(id);
  localStorage.setItem('cmd_recent',JSON.stringify(list.slice(0,5)));
}

function openCmdPalette(){
  document.getElementById('cmdOverlay').classList.add('open');
  document.getElementById('cmdInput').value='';
  cmdSelectedIdx=-1;renderCmdResults('');
  setTimeout(()=>document.getElementById('cmdInput').focus(),50);
}
function closeCmdPalette(){document.getElementById('cmdOverlay').classList.remove('open');}
function renderCmdResults(q){
  const out=document.getElementById('cmdResults');const ql=q.toLowerCase();
  const navItems=[
    {icon:'\u25ce',label:'Today',hint:'Go to Today',action:()=>navigateTo('today')},
    {icon:'\ud83d\udcc5',label:'Calendar',hint:'Operations',action:()=>subClick('operations','calendar')},
    {icon:'\ud83d\udccb',label:'Bookings',hint:'Operations',action:()=>subClick('operations','bookings')},
    {icon:'\u20b1',label:'Finance Overview',hint:'Finance',action:()=>subClick('finance','finance-overview')},
    {icon:'\u2302',label:'Properties',hint:'Properties',action:()=>navigateTo('properties')},
    {icon:'\ud83e\uddd1',label:'Guests',hint:'Guest CRM',action:()=>navigateTo('guests')},
    {icon:'\u2197',label:'Reports',hint:'Reports',action:()=>navigateTo('reports')},
    {icon:'\u2699',label:'Settings',hint:'System',action:()=>subClick('system','system-settings')},
    {icon:'\u2601',label:'Google Drive',hint:'Integrations',action:()=>subClick('system','system-integrations')},
    {icon:'+',label:'New Booking',hint:'Add booking',action:()=>openBookingDrawer()},
    {icon:'+',label:'Add Expense',hint:'Expenses',action:()=>openExpenseModal()},
    {icon:'+',label:'Add Property',hint:'Properties',action:()=>openPropertyModal()},
    {icon:'+',label:'Add Platform',hint:'Platforms',action:()=>openPlatformModal()},
    {icon:'\u2328',label:'Keyboard Shortcuts',hint:'Help',action:()=>showKeyboardShortcuts()},
  ];
  let items=[];
  let html='';
  if(!ql){
    // Show recent bookings at top
    const recentIds=getCmdRecent();
    const recentBks=recentIds.map(id=>bookings.find(b=>b.id===id)).filter(Boolean);
    if(recentBks.length){
      const recentItems=recentBks.map(b=>({icon:'\ud83d\udd50',label:b.guest,hint:`${propName(b.property)} \u00b7 ${fmtDate(b.checkin)}`,action:()=>openBookingDrawer(b.id)}));
      items.push(...recentItems);
      html+=`<div class="cmd-section-label">Recent</div>${recentItems.map((i,idx)=>`<div class="cmd-item" onclick="cmdExec(${idx})"><div class="cmd-item-icon">${i.icon}</div><div class="cmd-item-label">${esc(i.label)}</div><div class="cmd-item-hint">${esc(i.hint||'')}</div></div>`).join('')}`;
    }
    const navFiltered=navItems;
    items.push(...navFiltered);
    html+=`<div class="cmd-section-label">Quick Actions</div>${navFiltered.map((i,idx)=>`<div class="cmd-item" onclick="cmdExec(${items.indexOf(i)})"><div class="cmd-item-icon">${i.icon}</div><div class="cmd-item-label">${esc(i.label)}</div><div class="cmd-item-hint">${esc(i.hint||'')}</div></div>`).join('')}`;
  }else{
    const navFiltered=navItems.filter(i=>i.label.toLowerCase().includes(ql)||i.hint.toLowerCase().includes(ql));
    items.push(...navFiltered);
    const bkMatches=bookings.filter(b=>[b.guest,propName(b.property),b.platform,b.checkin].join(' ').toLowerCase().includes(ql)).slice(0,6);
    items.push(...bkMatches.map(b=>({icon:'\ud83d\udccb',label:b.guest,hint:`${propName(b.property)} \u00b7 ${fmtDate(b.checkin)}`,type:'booking',action:()=>openBookingDrawer(b.id)})));
    if(!items.length){out.innerHTML=`<div style="padding:14px 18px;color:var(--text-3);font-size:13px">No results for "${esc(q)}"</div>`;out._items=[];return;}
    html=`<div class="cmd-section-label">Results</div>${items.map((i,idx)=>`<div class="cmd-item" onclick="cmdExec(${idx})"><div class="cmd-item-icon">${i.icon}</div><div class="cmd-item-label">${esc(i.label)}</div><div class="cmd-item-hint">${esc(i.hint||'')}</div></div>`).join('')}`;
  }
  out.innerHTML=html;
  out._items=items;
}
function cmdExec(idx){
  const items=document.getElementById('cmdResults')._items||[];
  if(items[idx]){items[idx].action();closeCmdPalette();}
}
document.getElementById('cmdInput').addEventListener('input',e=>renderCmdResults(e.target.value));
document.getElementById('cmdInput').addEventListener('keydown',e=>{
  const items=document.getElementById('cmdResults')._items||[];
  if(e.key==='ArrowDown'){e.preventDefault();cmdSelectedIdx=Math.min(cmdSelectedIdx+1,items.length-1);}
  else if(e.key==='ArrowUp'){e.preventDefault();cmdSelectedIdx=Math.max(cmdSelectedIdx-1,0);}
  else if(e.key==='Enter'&&cmdSelectedIdx>=0){cmdExec(cmdSelectedIdx);return;}
  document.querySelectorAll('.cmd-item').forEach((el,i)=>el.classList.toggle('selected',i===cmdSelectedIdx));
});
document.getElementById('cmdOverlay').addEventListener('click',e=>{if(e.target===e.currentTarget)closeCmdPalette();});
document.getElementById('cmdPaletteBtn').addEventListener('click',openCmdPalette);
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='k'){e.preventDefault();openCmdPalette();}});

// ============================================================
// BULK IMPORT
// ============================================================
function populateBulkSelect(){
  const sel=document.getElementById('bulkImportProperty');if(!sel)return;
  sel.innerHTML='<option value="">Select Property</option>'+properties.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
}
// Shared robust date parser — handles all formats including DD/MM/YYYY
function parseAnyDate(v){
  if(!v)return'';
  let s=String(v).trim();
  // Strip trailing day-of-week like ", Sat" / ", Saturday"
  s=s.replace(/,?\s*(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\.?\s*$/i,'').trim();
  if(!s)return'';
  // Already YYYY-MM-DD
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  // ISO with time e.g. 2025-04-20T00:00:00.000Z
  // Google Sheets returns date cells as UTC ISO strings (e.g. "2026-05-21T16:00:00.000Z")
  // which is May 22 midnight Philippines time — MUST use local date parts, not slice(0,10)
  if(/^\d{4}-\d{2}-\d{2}T/.test(s)){const d=new Date(s);if(!isNaN(d.getTime()))return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return s.slice(0,10);}
  // ── Slash/dot formats: handle BEFORE new Date() to avoid JS MM/DD assumption ──
  const parts=s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if(parts){
    const year=parts[3].length===2?'20'+parts[3]:parts[3];
    const a=+parts[1],b=+parts[2];
    // Always DD/MM/YYYY (Philippine standard). Only swap if second part >12 (impossible as month)
    const month=(b>12?parts[1]:parts[2]).padStart(2,'0');
    const day  =(b>12?parts[2]:parts[1]).padStart(2,'0');
    // Return directly — no Date object needed, avoids any UTC timezone shift
    if(+month>=1&&+month<=12&&+day>=1&&+day<=31)return`${year}-${month}-${day}`;
  }
  // Fallback: standard JS parse (for "April 20, 2025", "20 April 2025" etc.)
  const d=new Date(s);
  if(!isNaN(d.getTime())){
    // Use LOCAL date parts (not toISOString which is UTC) to avoid timezone day-shift in UTC+8
    return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return'';
}
function normalizeDate(v){return parseAnyDate(v);}
function cleanMoney(v){return parseFloat(String(v||'').replace(/[^0-9.-]/g,''))||0;}

document.getElementById('convertBulkBtn').addEventListener('click',()=>{
  const ta=document.getElementById('bulkPasteBox');
  const tbody=document.getElementById('sheetImportBody');
  const raw=ta.value.trim();
  if(!raw){toast('Paste data first.','warning');return;}
  tbody.innerHTML='';
  const rows=raw.replace(/\r/g,'').split('\n').filter(r=>r.trim());
  rows.forEach(line=>{
    const cols=line.split('\t');if(cols.length<4)return;
    const mapped=[cols[0]||'',cols[1]||'',cols[2]||'',cols[3]||'','',cols[4]||'',cols[5]||'',cols[7]||'',cols[8]||'',cols[9]||'',cols[10]||'',cols[11]||'',cols[12]||'',cols[13]||'',cols[14]||'',cols[16]||'',cols[17]||'',cols[22]||'',cols[23]||''];
    const tr=document.createElement('tr');
    mapped.forEach(v=>{const td=document.createElement('td');td.contentEditable=true;td.style.cssText='border:1px solid var(--border);padding:6px 8px;font-size:12px';td.innerText=v;tr.appendChild(td);});
    tbody.appendChild(tr);
  });
  document.getElementById('bulkPreviewCount').textContent=rows.length;
  toast(rows.length+' rows converted.','success');
});

document.getElementById('importDataBtn').addEventListener('click',()=>{
  const tbody=document.getElementById('sheetImportBody');
  const rows=tbody.querySelectorAll('tr');
  if(!rows.length){toast('No preview rows.','warning');return;}
  const propId=document.getElementById('bulkImportProperty').value;
  if(!propId){toast('Select property first.','warning');return;}
  let imported=0,dupSkipped=0,dateSkipped=0,noGuestSkipped=0;
  rows.forEach(row=>{
    const cells=row.querySelectorAll('td');
    const g=i=>(cells[i]?.innerText||'').trim();
    const ci=normalizeDate(g(0));const co=normalizeDate(g(1));
    if(!ci||!co){dateSkipped++;return;}
    const guestName=properCase(g(3));
    if(!guestName){noGuestSkipped++;return;}
    const isDup=bookings.some(b=>b.property===propId&&b.checkin===ci&&(b.guest||'').toLowerCase()===guestName.toLowerCase());
    if(isDup){dupSkipped++;return;}
    const bk={
      id:genId(),checkin:ci,checkout:co,
      platform:g(2),guest:guestName,property:propId,
      rate:cleanMoney(g(5)),promo:cleanMoney(g(6)),
      bookingFee:cleanMoney(g(10)),
      guestCount:Math.max(1,parseInt(g(13))||1),
      storeSales:cleanMoney(g(18)),
      payment:g(15),notes:g(16),
      guestPrefs:'',
      status:'Confirmed',tasks:{},
      createdAt:new Date().toISOString(),
    };
    const t=calcTotals(bk);bk.netRevenue=t.netRevenue;
    bookings.unshift(bk);imported++;
  });
  saveAll();renderView(currentWs);populateSelects();
  const parts=[`${imported} imported`];
  if(dupSkipped)parts.push(`${dupSkipped} duplicate${dupSkipped!==1?'s':''} skipped`);
  if(dateSkipped)parts.push(`${dateSkipped} skipped (bad dates)`);
  if(noGuestSkipped)parts.push(`${noGuestSkipped} skipped (no guest name)`);
  toast(parts.join(' · ')+(imported?'':' — nothing added'),imported?'success':'warning');
  driveAutoBackup();
});

// ============================================================
// GOOGLE DRIVE INTEGRATION
// ============================================================
let gisClient=null,driveAccessToken=null;

function renderDriveStatus(){
  const dot=document.getElementById('driveDot');
  const txt=document.getElementById('driveStatusText');
  const last=document.getElementById('driveLastSync');
  if(driveConfig.connected){
    dot.classList.add('connected');
    txt.textContent='Connected \u00b7 '+esc(driveConfig.folderName||'Linked folder');
    last.textContent=driveConfig.lastSync?'Last sync: '+new Date(driveConfig.lastSync).toLocaleString():'Never synced';
  }else{
    dot.classList.remove('connected');
    txt.textContent='Not connected';if(last)last.textContent='';
  }
  const fn=document.getElementById('driveFolderName');if(fn)fn.value=driveConfig.folderName||'';
  const ci=document.getElementById('driveClientId');if(ci)ci.value=driveConfig.clientId||'';
}

document.getElementById('driveConnectBtn').addEventListener('click',()=>{
  const cid=document.getElementById('driveClientId')?.value.trim();
  if(!cid){toast('Enter your Google OAuth Client ID first.','error');return;}
  driveConfig.clientId=cid;saveDriveConfig();
  loadGISScript(cid);
});

function loadGISScript(clientId){
  if(window.google?.accounts){initGoogleAuth(clientId);return;}
  const existing=document.getElementById('gsi-script');
  if(existing){existing.remove();}
  const s=document.createElement('script');
  s.id='gsi-script';s.src='https://accounts.google.com/gsi/client';
  s.onload=()=>initGoogleAuth(clientId);
  s.onerror=()=>toast('Failed to load Google auth. Check your internet connection.','error');
  document.head.appendChild(s);
}

function initGoogleAuth(clientId){
  try{
    gisClient=google.accounts.oauth2.initTokenClient({
      client_id:clientId,
      scope:'https://www.googleapis.com/auth/drive.file',
      callback:(resp)=>{
        if(resp.error){toast('Google auth failed: '+resp.error,'error');return;}
        driveAccessToken=resp.access_token;
        driveConfig.connected=true;saveDriveConfig();renderDriveStatus();
        toast('Google Drive connected!','success');
      }
    });
    gisClient.requestAccessToken();
  }catch(e){toast('Auth setup failed. Verify Client ID and allowed origins in Google Cloud Console.','error');}
}

document.getElementById('driveLinkBtn').addEventListener('click',()=>{
  if(!driveAccessToken){toast('Connect to Google Drive first.','error');return;}
  loadPickerAPI();
});

document.getElementById('driveFolderUrlBtn')?.addEventListener('click',()=>{
  const urlInput=document.getElementById('driveFolderUrl');
  const raw=(urlInput?.value||'').trim();
  if(!raw){toast('Paste a Google Drive folder URL first.','error');return;}
  // Extract folder ID from URL formats:
  // https://drive.google.com/drive/folders/FOLDER_ID
  // https://drive.google.com/drive/u/0/folders/FOLDER_ID
  const match=raw.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if(!match){toast('Could not extract folder ID from URL. Make sure it is a Google Drive folder link.','error');return;}
  const folderId=match[1];
  const folderName='Drive Folder ('+folderId.slice(0,8)+'…)';
  driveConfig.folderId=folderId;driveConfig.folderName=folderName;driveConfig.connected=true;
  saveDriveConfig();
  const fn=document.getElementById('driveFolderName');if(fn)fn.value=folderName;
  if(urlInput)urlInput.value='';
  renderDriveStatus();
  toast('Google Drive folder linked via URL! You can now export backups.','success');
});

function loadPickerAPI(){
  if(window.google?.picker){openFolderPicker();return;}
  const s=document.createElement('script');
  s.src='https://apis.google.com/js/api.js';
  s.onload=()=>gapi.load('picker',openFolderPicker);
  s.onerror=()=>toast('Failed to load Google Picker.','error');
  document.head.appendChild(s);
}

function openFolderPicker(){
  try{
    const picker=new google.picker.PickerBuilder()
      .addView(new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true))
      .setOAuthToken(driveAccessToken)
      .setCallback(data=>{
        if(data.action===google.picker.Action.PICKED){
          const folder=data.docs[0];
          driveConfig.folderId=folder.id;driveConfig.folderName=folder.name;saveDriveConfig();
          const fn=document.getElementById('driveFolderName');if(fn)fn.value=folder.name;
          toast('Folder linked: '+folder.name,'success');renderDriveStatus();
        }
      }).build();
    picker.setVisible(true);
  }catch(e){toast('Picker failed. Allow pop-ups for this page.','error');}
}

document.getElementById('driveExportNowBtn').addEventListener('click',()=>driveExport(true));
document.getElementById('driveDisconnectBtn').addEventListener('click',()=>{
  driveConfig={connected:false,folderId:'',folderName:'',clientId:'',lastSync:null};
  driveAccessToken=null;saveDriveConfig();renderDriveStatus();
  toast('Disconnected from Google Drive.','warning');
});

async function driveExport(manual=false){
  if(!driveConfig.connected||!driveAccessToken||!driveConfig.folderId){
    if(manual)toast('Connect Google Drive and link a folder first.','error');return;
  }
  const dot=document.getElementById('driveDot');
  if(dot){dot.classList.remove('connected');dot.classList.add('syncing');}
  try{
    const xlsxData=buildXLSX();
    const fileName=`Bloomstone-Backup-${todayISO()}.xlsx`;
    await uploadToDrive(fileName,xlsxData,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    driveConfig.lastSync=new Date().toISOString();saveDriveConfig();
    if(dot){dot.classList.remove('syncing');dot.classList.add('connected');}
    renderDriveStatus();
    toast(manual?`Exported to Drive: ${fileName}`:'Auto-backup saved to Drive.','success');
  }catch(e){
    if(dot){dot.classList.remove('syncing');dot.classList.add('connected');}
    console.error('Drive export failed:',e);
    if(manual)toast('Export failed: '+e.message,'error');
    else toast('Auto-backup failed. Will retry next session.','warning');
  }
}

async function uploadToDrive(fileName,data,mimeType){
  const boundary='bloomstone_bnd_'+Date.now();
  const meta=JSON.stringify({name:fileName,parents:[driveConfig.folderId]});
  const byteStr=Array.from(data).map(b=>String.fromCharCode(b)).join('');
  const b64=btoa(byteStr);
  const body=`--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}\r\n--${boundary}--`;
  const resp=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{
    method:'POST',
    headers:{'Authorization':'Bearer '+driveAccessToken,'Content-Type':`multipart/related; boundary="${boundary}"`},
    body
  });
  if(!resp.ok){const err=await resp.text();throw new Error(err||resp.status);}
  return resp.json();
}

function driveAutoBackup(){
  if(!driveConfig.connected||!driveAccessToken)return;
  const last=driveConfig.lastSync?new Date(driveConfig.lastSync):null;
  const hoursSince=last?(Date.now()-last.getTime())/3600000:Infinity;
  if(hoursSince>=24)driveExport(false);
}

document.getElementById('driveImportBtn').addEventListener('click',()=>{
  if(!driveConfig.connected||!driveAccessToken){toast('Connect to Google Drive first.','error');return;}
  toast('Drive file browser: Coming in next version. Use local import for now.','warning');
});

document.getElementById('driveImportLocalBtn').addEventListener('click',()=>{
  const input=document.createElement('input');input.type='file';input.accept='.json';
  input.onchange=e=>{
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      try{const data=JSON.parse(ev.target.result);previewDriveImport(data);}
      catch(err){toast('Failed to read file: '+err.message,'error');}
    };
    reader.readAsText(file);
  };
  input.click();
});

function previewDriveImport(data){
  const incoming=Array.isArray(data)?data:(data.bookings||[]);
  if(!incoming.length){toast('No bookings found in file.','warning');return;}
  const duplicates=incoming.filter(b=>bookings.some(ex=>
    (ex.guest||'').toLowerCase().trim()===(b.guest||'').toLowerCase().trim()&&
    ex.checkin===b.checkin&&ex.property===b.property
  ));
  const overlaps=incoming.filter(b=>!duplicates.includes(b)&&bookings.some(ex=>
    ex.property===b.property&&ex.status!=='Cancelled'&&b.status!=='Cancelled'&&bookingsOverlap(b,ex)
  ));
  const newOnes=incoming.filter(b=>!duplicates.includes(b)&&!overlaps.includes(b));
  document.getElementById('driveImportBody').innerHTML=`
    <div style="margin-bottom:14px;font-size:13px"><div style="margin-bottom:8px">File contains <strong>${incoming.length}</strong> bookings:</div>
      <span class="badge badge-green" style="margin-right:6px">${newOnes.length} new</span>
      <span class="badge badge-orange" style="margin-right:6px">${duplicates.length} duplicate${duplicates.length!==1?'s':''}</span>
      <span class="badge badge-red">${overlaps.length} overlap${overlaps.length!==1?'s':''}</span>
    </div>
    ${duplicates.length?`<div style="font-size:12px;color:var(--text-2);margin-bottom:8px;padding:10px;background:var(--orange-bg);border-radius:var(--radius)"><strong>Duplicates (same guest + check-in + property):</strong><br>${duplicates.map(b=>`${esc(b.guest)} \u00b7 ${fmtDate(b.checkin)}`).join('<br>')}</div>`:''}
    ${overlaps.length?`<div style="font-size:12px;color:var(--text-2);margin-bottom:8px;padding:10px;background:var(--red-bg);border-radius:var(--radius)"><strong>Date overlaps:</strong><br>${overlaps.map(b=>`${esc(b.guest)} \u00b7 ${fmtDate(b.checkin)}`).join('<br>')}</div>`:''}
    <div style="font-size:12px;color:var(--text-3);margin-top:10px"><strong>Merge:</strong> adds new only, skips duplicates and overlaps.<br/><strong>Overwrite:</strong> replaces ALL existing booking data.</div>`;
  document.getElementById('importMergeBtn').onclick=()=>{
    const toAdd=newOnes.map(b=>({tasks:{},...b}));
    bookings.unshift(...toAdd);saveAll();renderView(currentWs);populateSelects();
    closeModal('driveImportModal');toast(`${toAdd.length} new booking${toAdd.length!==1?'s':''} merged. ${duplicates.length+overlaps.length} skipped.`,'success');
  };
  document.getElementById('importOverwriteBtn').onclick=()=>{
    confirmDialog('Overwrite All Data?','This replaces ALL current bookings. Cannot be undone.','!',()=>{
      bookings=incoming.map(b=>({tasks:{},...b}));saveAll();renderView(currentWs);populateSelects();
      closeModal('driveImportModal');toast(`All data overwritten with ${incoming.length} bookings.`,'success');
    });
  };
  openModal('driveImportModal');
}

// ============================================================
// XLSX BUILDER
// ============================================================
function buildXLSX(){
  const rows=[
    ['ID','Guest','Check-in','Check-out','Nights','Platform','Property','City','Rate','Promo','Special Offer','Guest Service Fee','Stay Fee','Extra Fee','Booking Fee','Platform Fee','Net Revenue','Store Sales','Deposit','Dep Collected','Dep Refunded','Payment','Status','Notes','Guest Prefs','Created At'],
    ...bookings.map(b=>{
      const t=calcTotals(b);
      return[b.id||'',b.guest||'',b.checkin||'',b.checkout||'',t.nights,b.platform||'',propName(b.property),propCity(b.property),b.rate||0,b.promo||0,b.specialOffer||0,b.guestServiceFee||0,t.stayFee.toFixed(2),t.extraFee.toFixed(2),t.bkFee.toFixed(2),t.platFee.toFixed(2),t.netRevenue.toFixed(2),b.storeSales||0,b.deposit||0,b.depositCollected?'Yes':'No',b.depositRefunded?'Yes':'No',b.payment||'',b.status||'',b.notes||'',b.guestPrefs||'',b.createdAt||''];
    })
  ];
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\n');
  return new TextEncoder().encode('\ufeff'+csv);
}

// ============================================================
// CSV EXPORT
// ============================================================
function downloadCSV(filename,rows){
  const content=rows.map(r=>r.map(v=>'"'+String(v||'').replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob(['\ufeff'+content],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
}

document.getElementById('repExportCSV').addEventListener('click',()=>{
  const{groups,list,group}=getReportData();
  const keys=Object.keys(groups).sort();
  const rows=[['Period','Bookings','Nights','Net Revenue','Store Sales','Total']];
  keys.forEach(k=>{const g=groups[k];rows.push([group==='yearly'?k:fmtMonthYear(k+'-01'),g.bookings.length,g.nights,g.revenue.toFixed(2),g.store.toFixed(2),(g.revenue+g.store).toFixed(2)]);});
  downloadCSV('bloomstone-report.csv',rows);
});
document.getElementById('repExportDrive').addEventListener('click',()=>driveExport(true));

// ============================================================
// SETTINGS SAVE
// ============================================================
function saveSettings(){
  const n=document.getElementById('setting-appname')?.value||'Bloomstone';
  const c=document.getElementById('setting-currency')?.value||'\u20b1';
  settings={appName:n,currency:c};
  localStorage.setItem(LS_SETTINGS,JSON.stringify(settings));
  const logo=document.querySelector('.sidebar-logo');
  if(logo)logo.innerHTML=`${n.toLowerCase()}<span style="color:var(--text-3);font-weight:400">pms</span>`;
  toast('Settings saved.');
}

// ============================================================
// DARK MODE
// ============================================================
function setTheme(theme){
  const html=document.documentElement;
  if(theme==='system'){
    html.setAttribute('data-theme',window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
  }else{
    html.setAttribute('data-theme',theme);
  }
  localStorage.setItem('bloomstone_theme',theme);
  const icon=document.getElementById('themeIcon');
  const label=document.getElementById('themeLabel');
  if(icon)icon.textContent=theme==='dark'?'\u263e':theme==='system'?'\u25d0':'\u2600';
  if(label)label.textContent=theme==='dark'?'Dark mode':theme==='system'?'System':'Light mode';
  // Also update overflow menu icon/label
  const oi=document.getElementById('themeOverflowIcon');const ol=document.getElementById('themeOverflowLabel');
  if(oi)oi.textContent=theme==='dark'?'\u263e':theme==='system'?'\u25d0':'\u2600';
  if(ol)ol.textContent=theme==='dark'?'Dark mode':theme==='system'?'System':'Light mode';
}
document.getElementById('themeToggleBtn').addEventListener('click',()=>{
  const current=localStorage.getItem('bloomstone_theme')||'light';
  setTheme(current==='light'?'dark':current==='dark'?'system':'light');
});
document.getElementById('themeOverflowBtn')?.addEventListener('click',()=>{
  const current=localStorage.getItem('bloomstone_theme')||'light';
  setTheme(current==='light'?'dark':current==='dark'?'system':'light');
});
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{
  if(localStorage.getItem('bloomstone_theme')==='system')setTheme('system');
});

// Topbar overflow menu toggle
document.getElementById('topbarMoreBtn')?.addEventListener('click',e=>{
  e.stopPropagation();
  document.getElementById('topbarOverflowMenu').classList.toggle('open');
});
document.addEventListener('click',e=>{
  if(!e.target.closest('#topbarOverflow'))document.getElementById('topbarOverflowMenu')?.classList.remove('open');
});

// \u2500\u2500 Sync status dot \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
let _syncState='synced'; // 'synced' | 'pending' | 'error' | 'offline'
function setSyncDot(state){
  _syncState=state;
  const dot=document.getElementById('syncDot');if(!dot)return;
  dot.className='sync-dot '+state;
  const labels={synced:'Synced with Google Sheets',pending:'Syncing\u2026',error:'Sync error \u2014 tap to retry',offline:'Offline'};
  dot.title=labels[state]||state;
}
// Patch sheetsPush / sheetsQuietPull to update dot
const _origPush=sheetsPush;
window._wrappedSheetsPush=async function(silent){
  setSyncDot('pending');
  try{const r=await _origPush(silent);setSyncDot('synced');return r;}
  catch(e){setSyncDot('error');throw e;}
};
// Patch sheetsQuietPull similarly via _isPulling state
const _dotPullInterval=setInterval(()=>{
  if(typeof _isPulling!=='undefined'&&_isPulling)setSyncDot('pending');
  else if(_syncState==='pending')setSyncDot('synced');
},800);

// ============================================================
// SIDEBAR & RESPONSIVE
// ============================================================
document.getElementById('sidebarCollapseBtn').addEventListener('click',()=>{
  const sb=document.getElementById('sidebar');sb.classList.toggle('collapsed');
  document.getElementById('sidebarCollapseBtn').textContent=sb.classList.contains('collapsed')?'\u203a':'\u2039';
});
document.getElementById('mobileMenuBtn').addEventListener('click',()=>{
  document.getElementById('sidebar').classList.toggle('mobile-open');
  document.getElementById('sidebarOverlay').classList.toggle('open');
});
document.getElementById('sidebarOverlay').addEventListener('click',()=>{
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('open');
});
document.getElementById('addBookingBtn').addEventListener('click',()=>openBookingDrawer());
document.getElementById('addBookingBtnOps').addEventListener('click',()=>openBookingDrawer());
document.getElementById('fabAddBooking').addEventListener('click',()=>openBookingDrawer());
['bk-month','bk-prop','bk-plat','bk-status'].forEach(id=>{const el=document.getElementById(id);if(el)el.addEventListener('change',renderBookings);});

let resizeTimer;
window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>renderView(currentWs),200);});

// ============================================================
// GOOGLE SHEETS SYNC
// ============================================================
const LS_SHEETS = 'bloomstone_sheets';
let sheetsConfig = {url:'', connected:false, lastSync:null};

function loadSheetsConfig(){
  try{const s=localStorage.getItem(LS_SHEETS);if(s)sheetsConfig={...sheetsConfig,...JSON.parse(s)};}catch(e){}
}
function saveSheetsConfig(){localStorage.setItem(LS_SHEETS,JSON.stringify(sheetsConfig));}

function renderSheetsStatus(){
  const dot=document.getElementById('sheetsDot');
  const txt=document.getElementById('sheetsStatusText');
  const last=document.getElementById('sheetsLastSync');
  const urlEl=document.getElementById('sheetsWebAppUrl');
  const pushBtn=document.getElementById('sheetsPushBtn');
  const pullBtn=document.getElementById('sheetsPullBtn');
  if(!dot)return;
  if(sheetsConfig.connected&&sheetsConfig.url){
    dot.classList.add('connected');
    txt.textContent='Connected';
    if(last)last.textContent=sheetsConfig.lastSync?'Last sync: '+new Date(sheetsConfig.lastSync).toLocaleString():'Never synced';
    if(urlEl)urlEl.value=sheetsConfig.url;
    if(pushBtn)pushBtn.disabled=false;
    if(pullBtn)pullBtn.disabled=false;
  }else{
    dot.classList.remove('connected');
    txt.textContent='Not connected';
    if(last)last.textContent='';
    if(pushBtn)pushBtn.disabled=true;
    if(pullBtn)pullBtn.disabled=true;
  }
}

function sheetsConnect(){
  const url=(document.getElementById('sheetsWebAppUrl')?.value||'').trim();
  if(!url){toast('Paste your Apps Script Web App URL first.','error');return;}
  if(!url.includes('script.google.com')&&!url.includes('macros')){
    toast('That does not look like an Apps Script URL. Copy the URL from Deploy → Manage Deployments.','error');return;
  }
  setSheetsProgress(true,'Verifying connection…',10);
  // Test GET request to verify the URL works
  fetch(url+'?user='+encodeURIComponent(currentUser?.username||'app'),{method:'GET'})
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(data=>{
      if(data.error)throw new Error(data.error);
      sheetsConfig={url,connected:true,lastSync:null};
      saveSheetsConfig();renderSheetsStatus();
      setSheetsProgress(false);
      startSheetsPolling(); // start 30-second live poll
      toast('Connected to Google Sheets! Sheet: "'+(data.sheetTitle||'Bloomstone')+'". Live sync enabled ✅','success');
    })
    .catch(err=>{
      setSheetsProgress(false);
      toast('Connection failed: '+err.message+'. Check the URL and make sure "Who has access" is set to Anyone.','error');
    });
}

function sheetsDisconnect(){
  stopSheetsPolling();
  sheetsConfig={url:'',connected:false,lastSync:null};
  saveSheetsConfig();renderSheetsStatus();
  const urlEl=document.getElementById('sheetsWebAppUrl');if(urlEl)urlEl.value='';
  toast('Disconnected from Google Sheets.','warning');
}

function setSheetsProgress(show,msg='',pct=0){
  const wrap=document.getElementById('sheetsSyncProgress');
  const msgEl=document.getElementById('sheetsSyncMsg');
  const bar=document.getElementById('sheetsSyncBar');
  if(!wrap)return;
  if(show){
    wrap.style.display='block';
    if(msgEl)msgEl.textContent=msg;
    if(bar)bar.style.width=pct+'%';
  }else{
    setTimeout(()=>{wrap.style.display='none';if(bar)bar.style.width='0%';},600);
    if(bar)bar.style.width='100%';
  }
}

// ── PUSH: send all data to Sheets ─────────────────────────────
// silent=true → no progress bar, no toast (used by auto-push)
async function sheetsPush(silent=false){
  if(!sheetsConfig.connected||!sheetsConfig.url){if(!silent)toast('Connect to Google Sheets first.','error');return;}
  if(!silent)setSheetsProgress(true,'Building data…',15);
  // Show a small live-sync dot pulse when auto-pushing
  if(silent){const d=document.getElementById('sheetsDot');if(d)d.classList.add('syncing');}
  try{
    const payload={
      user: currentUser?.username||'app',
      bookings: bookings.map(b=>{
        const t=calcTotals(b);
        return{
          ID:b.id,Guest:b.guest,'Check-in':b.checkin||'','Check-out':b.checkout||'',
          Nights:t.nights,Platform:b.platform,Property:propName(b.property),
          Rate:b.rate||0,
          'Total Promo (Manual Set by User)':b.promo||0,
          'Booking Fee':t.bkFee,
          'Total Promo':t.promoTotal,
          'Special Promo (Auto From Airbnb)':b.specialOffer||0,
          'Platform Commission':b.platformCommission??t.platFee,
          'Service Fee (Auto From Airbnb)':b.serviceFee||0,
          'Extra Guests':b.extraGuests||0,
          'Extra Guest Fee':b.extraGuestFee||0,
          'Adjustments':JSON.stringify(b.adjustments||[]),
          'Adjustments (Readable)':(b.adjustments||[]).filter(a=>a.desc||a.amount).map(a=>`${a.desc||'Adjustment'}: ₱${(+a.amount||0).toLocaleString()}`).join(' | ')||'',
          'Adjustments Total':t.adjTotal,
          'Guest Service Fee':b.guestServiceFee||t.guestServiceFee||0,
          'Total (excl. Extra Guests)':t.totalWithout,
          'Total Charged to Guest':t.guestTotal,
          'Total Guest Paid to Platform':t.totalGuestPaid,
          'Net Revenue':t.netRevenue,'Store Sales':b.storeSales||0,'Cleaning Fee':b.cleaningFee||0,
          Deposit:b.deposit||0,'Deposit Refunded':b.depositRefundedAmt||0,
          'Dep Collected':b.depositCollected?'Yes':'No',
          'Dep Refunded':b.depositRefunded?'Yes':'No',
          Payment:b.payment||'',Status:b.status||'Confirmed',
          'Guest Count':b.guestCount||1,Notes:b.notes||'',
          'Guest Phone':b.guestPhone||'',
          'Guest Prefs':b.guestPrefs||'',
          'Created At':b.createdAt||'','Updated At':b.updatedAt||''
        };
      }),
      properties: properties.map(p=>({
        ID:p.id,Name:p.name,City:p.city,Address:p.address||'',Beds:p.beds||0,
        'Base Guests':p.baseGuests||2,'Max Guests':p.maxGuests||4,
        'Base Rate':p.baseRate||0,'Extra Guest Fee':p.extraGuestFee||0,
        'Blocked Dates':(p.blockedDates||[]).join(','),
        'Map URL':p.map||'',Notes:p.notes||'',
        'Airbnb URL':p.airbnbUrl||'',Icon:p.iconId||'house',
        'Owner Name':p.ownerName||'','Owner Phone':p.ownerPhone||'',
        'Owner Email':p.ownerEmail||'','Owner Address':p.ownerAddress||'',
        'Owner Pct':p.ownerPct??100,
        'Payout Method':p.payoutMethod||'','Payout Account':p.payoutAccount||'',
        'Contract Start':p.contractStart||'','Contract End':p.contractEnd||''
      })),
      platforms: platforms.map(p=>({
        ID:p.id,Name:p.name,'Commission %':p.commission,'VAT %':p.vat,'Guest Fee %':p.guestFee||0,Color:p.color||'#888'
      })),
      expenses: expenses.map(e=>{
        const bksCI=bookings.filter(b=>b.status!=='Cancelled'&&b.checkin&&b.checkin.startsWith(e.month)&&(e.prop==='all'||b.property===e.prop));
        const bksCO=expBookings(e.month,e.prop);
        const platFeeCost=bksCI.reduce((s,b)=>s+calcTotals(b).platFee,0);
        const promoCost=bksCI.reduce((s,b)=>s+(+b.promo||0),0);
        const cleaningFromBks=bksCO.reduce((s,b)=>s+(+b.cleaningFee||0),0);
        const cleaningCost=cleaningFromBks||e.cleaning||0;
        const rowTotal=platFeeCost+promoCost+cleaningCost+(e.water||0)+(e.electricity||0)+(e.supplies||0)+(e.maintenance||0)+(e.other||0);
        return{
          ID:e.id,Month:e.month,Property:e.prop==='all'?'All':propName(e.prop),
          'Platform Fees':+platFeeCost.toFixed(2),
          'Promo Cost':promoCost,'Cleaning Cost':cleaningCost,Cleaning:e.cleaning||0,
          Water:e.water||0,Electricity:e.electricity||0,Supplies:e.supplies||0,
          Maintenance:e.maintenance||0,'Other Expenses':e.other||0,
          Total:+rowTotal.toFixed(2),Notes:e.notes||''
        };
      }),
      // Platform commission breakdown: month × platform (full data, no UI filter)
      platformFees:(()=>{
        const pmap={};
        bookings.filter(b=>b.status!=='Cancelled'&&b.checkin).forEach(b=>{
          const key=b.checkin.substring(0,7)+'|'+(b.platform||'Unknown')+'|'+(b.property||'');
          if(!pmap[key])pmap[key]={Month:b.checkin.substring(0,7),Platform:b.platform||'Unknown',Property:propName(b.property),Bookings:0,Commission:0};
          pmap[key].Bookings++;
          pmap[key].Commission+=calcTotals(b).platFee;
        });
        return Object.values(pmap)
          .sort((a,b)=>b.Month.localeCompare(a.Month)||a.Platform.localeCompare(b.Platform))
          .map(r=>({...r,Commission:+r.Commission.toFixed(2)}));
      })(),
    };
    if(!silent)setSheetsProgress(true,'Uploading to Google Sheets…',45);
    const resp=await fetch(sheetsConfig.url,{
      method:'POST',
      body:JSON.stringify(payload),
      headers:{'Content-Type':'text/plain'} // text/plain avoids CORS preflight for Apps Script
    });
    if(!resp.ok)throw new Error('HTTP '+resp.status);
    const result=await resp.json();
    if(result.error)throw new Error(result.error);
    sheetsConfig.lastSync=new Date().toISOString();saveSheetsConfig();renderSheetsStatus();
    if(!silent){setSheetsProgress(true,'Done!',100);setSheetsProgress(false);toast(`✅ Pushed ${result.records||''} records to Google Sheets!`,'success');}
    else{const d=document.getElementById('sheetsDot');if(d)d.classList.remove('syncing');}
  }catch(err){
    const d=document.getElementById('sheetsDot');if(d)d.classList.remove('syncing');
    if(!silent){setSheetsProgress(false);toast('Sync failed: '+err.message,'error');}
    else{toast('⚠️ Sheets sync failed — data saved locally only.','warning',5000);}
    console.error('Sheets push error:',err);
  }
}

// ── PULL: fetch data from Sheets ──────────────────────────────
async function sheetsPull(){
  if(!sheetsConfig.connected||!sheetsConfig.url){toast('Connect to Google Sheets first.','error');return;}
  confirmDialog(
    '⬇ Pull from Google Sheets',
    'This will REPLACE your current local data with data from Google Sheets. Any unsaved local changes will be lost. Make sure Google Sheets has the latest data before pulling.',
    '📊',
    async ()=>{
      _isPulling=true;
      clearTimeout(_autoPushTimer); // cancel any pending auto-push
      _pullCooldownUntil=Date.now()+60000; // block auto-push for 60s after pull
      setSheetsProgress(true,'Fetching from Google Sheets…',20);
      try{
        const url=sheetsConfig.url+'?user='+encodeURIComponent(currentUser?.username||'app')+'&t='+Date.now();
        const resp=await fetch(url);
        if(!resp.ok)throw new Error('HTTP '+resp.status);
        const data=await resp.json();
        if(data.error)throw new Error(data.error);
        // DEBUG: log raw column names from first booking row
        if(data.bookings&&data.bookings.length){
          const firstRow=data.bookings[0];
          const keys=Object.keys(firstRow);
          toast('Sheet columns: '+keys.slice(0,8).join(', ')+'…','info',8000);
        }
        setSheetsProgress(true,'Processing data…',60);
        const beforeCount=bookings.length;
        applySheetsPullData(data);
        if(bookings.length===0&&(data.bookings?.length||0)>0){
          throw new Error(`Data mapping failed — ${data.bookings.length} rows received but 0 bookings mapped. Check that your Sheet column names match exactly.`);
        }
        localStorage.setItem(LS_KEY,JSON.stringify({bookings,properties,platforms,expenses,trash}));
        populateSelects();
        // Navigate to bookings list so user can see pulled data
        subClick('operations','bookings');
        // Use sheet's exportedAt as lastSync so subsequent polls correctly compare timestamps
        sheetsConfig.lastSync=data.exportedAt||new Date().toISOString();
        saveSheetsConfig();renderSheetsStatus();
        setSheetsProgress(true,'Done!',100);setSheetsProgress(false);
        toast(`✅ Pulled ${bookings.length} bookings, ${properties.length} properties from Sheets!`,'success');
      }catch(err){
        _pullCooldownUntil=0; // release cooldown on error
        setSheetsProgress(false);
        toast('Pull failed: '+err.message,'error');
        console.error('Sheets pull error:',err);
      }finally{
        _isPulling=false;
        // extend cooldown to cover the auto-push window too
        if(_pullCooldownUntil>Date.now())clearTimeout(_autoPushTimer);
      }
    },
    'Yes, Replace Local Data'
  );
}

// Strip currency symbols, commas, spaces then parse — handles "₱2,500.00" / "$2,500" / 2500
function pNum(v){
  if(v===null||v===undefined||v==='')return 0;
  const n=parseFloat(String(v).replace(/[₱$,\s]/g,''));
  return isNaN(n)?0:n;
}

// ── Shared: map Sheets JSON → app data arrays ─────────────────
function applySheetsPullData(data){
  if(Array.isArray(data.properties)&&data.properties.length){
    properties=data.properties.map(r=>({
      ...(() => {
        const prev = properties.find(p => p.id === r.ID || p.name === r.Name) || {};
        return {
          photos: prev.photos || [],
          // Preserve custom icon — saved under 'iconCustom' key, also handle legacy 'customIcon'
          iconCustom: prev.iconCustom || prev.customIcon || '',
        };
      })(),
      id:r.ID||genId(),name:r.Name||'',city:r.City||'',
      address:r.Address||'',beds:+r.Beds||0,
      baseGuests:+r['Base Guests']||2,maxGuests:+r['Max Guests']||4,
      baseRate:+r['Base Rate']||0,extraGuestFee:+r['Extra Guest Fee']||300,
      blockedDates:r['Blocked Dates']?String(r['Blocked Dates']).split(',').filter(Boolean):[],
      map:r['Map URL']||'',notes:r.Notes||'',
      airbnbUrl:r['Airbnb URL']||'',iconId:r.Icon||'house',
      ownerName:r['Owner Name']||'',ownerPhone:r['Owner Phone']||'',
      ownerEmail:r['Owner Email']||'',ownerAddress:r['Owner Address']||'',
      ownerPct:r['Owner Pct']!=null?+r['Owner Pct']:100,
      payoutMethod:r['Payout Method']||'',payoutAccount:r['Payout Account']||'',
      contractStart:r['Contract Start']||'',contractEnd:r['Contract End']||'',
    }));
  }
  if(Array.isArray(data.platforms)&&data.platforms.length){
    const rawPlats=data.platforms.map(r=>{
      const normName=normPlatform(r.Name||'');
      const def=DEFAULT_PLATFORMS.find(d=>d.name===normName);
      // Color priority: sheet Color column → existing platform → DEFAULT_PLATFORMS hardcoded → grey
      const existingColor=platforms.find(p=>normPlatform(p.name)===normName)?.color;
      const fallbackColor=def?.color||'#888';
      const chosenColor=r.Color||(existingColor&&existingColor!=='#888'?existingColor:null)||fallbackColor;
      return{
        id:r.ID||genId(),
        name:normName,
        commission:pNum(r['Commission %']),vat:pNum(r['VAT %']),guestFee:pNum(r['Guest Fee %']),
        color:chosenColor
      };
    });
    // Deduplicate by normalized name — merge colors, prefer non-grey
    const platSeen={};
    platforms=rawPlats.filter(p=>{
      if(!platSeen[p.name]){platSeen[p.name]=p;return true;}
      // Merge color if this duplicate has a better (non-grey) color
      if(platSeen[p.name].color==='#888'&&p.color!=='#888')platSeen[p.name].color=p.color;
      return false;
    });
  }
  if(Array.isArray(data.bookings)&&data.bookings.length){
    bookings=data.bookings.map(r=>{
      return{
        id:r.ID||genId(),guest:r.Guest||'',
        checkin:isoDate(r['Check-in']),checkout:isoDate(r['Check-out']),
        platform:normPlatform(r.Platform||''),
        property:properties.find(p=>p.id===r.Property||p.name===r.Property)?.id||r.Property||'',
        rate:pNum(r.Rate),
        promo:pNum(r['Total Promo (Manual Set by User)']),
        specialOffer:pNum(r['Special Promo (Auto From Airbnb)']),
        bookingFee:pNum(r['Booking Fee']),
        serviceFee:pNum(r['Service Fee (Auto From Airbnb)'])||pNum(r['Service Fee (Auto From Aibnb)'])||pNum(r['Service Fee']),
        platformCommission:pNum(r['Platform Commission'])||pNum(r['Platform Comm']),
        extraGuests:pNum(r['Extra Guests'])||pNum(r['Extra Guest']),
        extraGuestFee:pNum(r['Extra Guest Fee']),
        guestServiceFee:pNum(r['Guest Service Fee'])||0,
        storeSales:pNum(r['Store Sales'])||pNum(r['Store Sale']),
        cleaningFee:pNum(r['Cleaning Fee'])||pNum(r['Cleaning']),
        deposit:pNum(r.Deposit),
        depositRefundedAmt:pNum(r['Deposit Refunded'])||pNum(r['Deposit Refunded Amt']),
        depositCollected:r['Dep Collected']==='Yes',
        depositRefunded:r['Dep Refunded']==='Yes',
        adjustments:(()=>{
          const raw=r['Adjustments']||'';
          if(!raw)return bookings.find(bk=>bk.id===r.ID)?.adjustments||[];
          // Try JSON first (new format), then fall back to preserving existing local data
          try{const a=JSON.parse(raw);if(Array.isArray(a))return a;}catch(e){}
          // Legacy human-readable: "Desc: ₱500 | Desc2: ₱200" — parse back
          return raw.split(' | ').map(s=>{const m=s.match(/^(.*?):\s*[₱]?([\d,.]+)$/);return m?{desc:m[1].trim(),amount:+m[2].replace(/,/g,'')}:{desc:s.trim(),amount:0};}).filter(a=>a.desc||a.amount);
        })(),
        // Preserve existing local value if Sheet column is blank — prevents a missing/
        // misnamed Sheet column from silently wiping data the user already entered
        payment:r.Payment||(bookings.find(bk=>bk.id===r.ID)?.payment)||'',
        status:r.Status||(bookings.find(bk=>bk.id===r.ID)?.status)||'Confirmed',
        guestCount:pNum(r['Guest Count'])||1,
        notes:r.Notes||(bookings.find(bk=>bk.id===r.ID)?.notes)||'',
        guestPhone:r['Guest Phone']||(bookings.find(bk=>bk.id===r.ID)?.guestPhone)||'',
        guestPrefs:r['Guest Prefs']||(bookings.find(bk=>bk.id===r.ID)?.guestPrefs)||'',
        createdAt:r['Created At']||'',updatedAt:r['Updated At']||'',
        tasks:{},
      };
    }).filter(b=>b.checkin&&b.checkout&&b.guest)
    .map(b=>{
      const t=calcTotals(b);
      b.bookingFee=t.bkFee;
      if(!b.platformCommission) b.platformCommission=t.platFee;
      return b;
    });
  }
  if(Array.isArray(data.expenses)&&data.expenses.length){
    expenses=data.expenses.map(r=>({
      id:r.ID||genId(),month:r.Month||'',
      prop:properties.find(p=>p.id===r.Property||p.name===r.Property)?.id||'all',
      water:pNum(r.Water),electricity:pNum(r.Electricity),supplies:pNum(r.Supplies),
      maintenance:pNum(r.Maintenance),
      cleaning:pNum(r['Cleaning Cost'])||pNum(r.Cleaning),
      other:pNum(r.Other)||pNum(r['Other Expenses']),
      amount:pNum(r.Total),notes:r.Notes||''
    }));
  }
}

// Helper: ensure ISO date string from various formats
function isoDate(v){return parseAnyDate(v);}

// Wire up Sheets buttons (done here so they're always wired regardless of render order)
function wireSheetsButtons(){
  document.getElementById('sheetsConnectBtn')?.addEventListener('click',sheetsConnect);
  document.getElementById('sheetsPushBtn')?.addEventListener('click',sheetsPush);
  document.getElementById('sheetsPullBtn')?.addEventListener('click',sheetsPull);
  document.getElementById('sheetsDisconnectBtn')?.addEventListener('click',()=>{
    confirmDialog('Disconnect Sheets?','Your local data will be kept. You can reconnect at any time.','📊',sheetsDisconnect,'Disconnect');
  });
}


// ============================================================
// INIT
// ============================================================
function init(){
  loadAll();loadSettings();loadDriveConfig();loadSheetsConfig();
  buildSidebarNav();
  wireSheetsButtons();
  if(sheetsConfig.connected&&sheetsConfig.url){
    startSheetsPolling();
    // Force-pull on startup: every device always gets the latest Sheet data within 1.5s
    // of opening the app, regardless of cooldowns, pending pushes, or timestamp comparisons.
    // This guarantees mobile and desktop show identical data immediately on open.
    setTimeout(()=>sheetsQuietPull(true),1500);
  }
  document.querySelector('.ws-btn[data-ws="today"]')?.classList.add('active');
  // E7: Set correct active state on mobile bottom nav based on initial view
  document.querySelector('.mobile-nav-btn[data-ws="today"]')?.classList.add('active');
  const savedTheme=localStorage.getItem('bloomstone_theme')||'light';
  setTheme(savedTheme);
  dpInit(); // initialize date picker view state
  populateSelects();
  renderToday();
  renderCalPropPills();
  // Auto daily brief
  setTimeout(()=>{
    const today=todayISO();
    if(bookings.some(b=>b.status!=='Cancelled'&&(b.checkin===today||b.checkout===today)))openDailyBrief();
  },800);
  // (store sales / cleaning fee notifications removed)
  // Auto Drive backup
  setTimeout(()=>driveAutoBackup(),2000);
}

// ============================================================
// PWA INSTALL PROMPT
// ============================================================
let _pwaPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaPrompt = e;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = '';
});

window.addEventListener('appinstalled', () => {
  _pwaPrompt = null;
  const btn = document.getElementById('pwaInstallBtn');
  if (btn) btn.style.display = 'none';
  toast('Bloomstone installed as app!', 'success');
});

function pwaInstall() {
  if (!_pwaPrompt) return;
  _pwaPrompt.prompt();
  _pwaPrompt.userChoice.then(result => {
    if (result.outcome === 'accepted') {
      _pwaPrompt = null;
      const btn = document.getElementById('pwaInstallBtn');
      if (btn) btn.style.display = 'none';
    }
  });
}

// ============================================================
// TRIP.COM STYLE DATE PICKER
// ============================================================
const DP={
  open:false,
  mode:'ci',       // 'ci' | 'co'
  ci:null,         // selected check-in ISO string
  co:null,         // selected check-out ISO string
  hover:null,      // hovered date ISO string (for range preview)
  vy:0,            // view year (left month)
  vm:0             // view month 0-11 (left month)
};

function dpInit(){
  const t=new Date();DP.vy=t.getFullYear();DP.vm=t.getMonth();
}

// ============================================================
// FULL-SCREEN DATE PICKER  (mobile ≤600px)
// ============================================================
const DPF={mode:'ci',ci:null,co:null};
const MNAMES_FS=['January','February','March','April','May','June','July','August','September','October','November','December'];

function dpFsOpen(mode){
  DPF.mode=mode;
  DPF.ci=document.getElementById('f-checkin').value||null;
  DPF.co=document.getElementById('f-checkout').value||null;
  const el=document.getElementById('dpFullScreen');
  el.style.display='flex';
  dpFsRender();
  dpFsUpdateFooter();
  dpFsUpdateTitle();
  // Scroll to relevant month after render
  requestAnimationFrame(()=>{
    const target=DPF.ci||todayISO();
    const cell=document.querySelector(`#dp-fs-body [data-date="${target}"]`);
    if(cell){
      const hdr=cell.closest('.dp-fs-month-block');
      if(hdr)hdr.scrollIntoView({block:'start',behavior:'smooth'});
    }
  });
}

function dpFsClose(){
  document.getElementById('dpFullScreen').style.display='none';
  // Commit selections to hidden inputs
  document.getElementById('f-checkin').value=DPF.ci||'';
  document.getElementById('f-checkout').value=DPF.co||'';
  // Sync desktop DP state so dpRefreshTriggers() shows correct values in drawer buttons
  DP.ci=DPF.ci;DP.co=DPF.co;
  if(DPF.ci)document.getElementById('dp-ci-btn')?.classList.remove('error');
  if(DPF.co)document.getElementById('dp-co-btn')?.classList.remove('error');
  dpRefreshTriggers();
  onDatesChange();
}

function dpFsConfirm(){
  dpFsClose();
}

function dpFsSetMode(mode){
  DPF.mode=mode;
  dpFsUpdateFooter();
  dpFsUpdateTitle();
}

function dpFsUpdateTitle(){
  const el=document.getElementById('dp-fs-title');
  if(!el)return;
  if(DPF.ci&&DPF.co){
    const n=Math.max(0,Math.round((new Date(DPF.co+'T12:00:00')-new Date(DPF.ci+'T12:00:00'))/86400000));
    el.textContent=`${n} night${n!==1?'s':''} selected`;
  }else{
    el.textContent=DPF.mode==='ci'?'Pick check-in date':'Pick check-out date';
  }
}

function dpFsUpdateFooter(){
  const ciVal=document.getElementById('dp-fs-ci-val');
  const coVal=document.getElementById('dp-fs-co-val');
  const ciBox=document.getElementById('dp-fs-ci-box');
  const coBox=document.getElementById('dp-fs-co-box');
  const nightsEl=document.getElementById('dp-fs-nights');
  const confirmBtn=document.getElementById('dp-fs-confirm-btn');
  if(ciVal){
    if(DPF.ci){ciVal.textContent=fmtDate(DPF.ci);ciVal.classList.remove('fs-empty-val');}
    else{ciVal.textContent='Select date';ciVal.classList.add('fs-empty-val');}
  }
  if(coVal){
    if(DPF.co){coVal.textContent=fmtDate(DPF.co);coVal.classList.remove('fs-empty-val');}
    else{coVal.textContent='Select date';coVal.classList.add('fs-empty-val');}
  }
  if(ciBox)ciBox.classList.toggle('fs-active',DPF.mode==='ci');
  if(coBox)coBox.classList.toggle('fs-active',DPF.mode==='co');
  // Nights count
  if(nightsEl){
    if(DPF.ci&&DPF.co){
      const n=Math.max(0,Math.round((new Date(DPF.co+'T12:00:00')-new Date(DPF.ci+'T12:00:00'))/86400000));
      nightsEl.textContent=`${n} night${n!==1?'s':''}`;
    }else{
      nightsEl.textContent='';
    }
  }
  // Enable confirm only when check-in is set
  if(confirmBtn){
    confirmBtn.disabled=!DPF.ci;
    confirmBtn.style.opacity=DPF.ci?'1':'0.5';
  }
}

function dpFsSelectDay(dateStr){
  if(DPF.mode==='ci'){
    DPF.ci=dateStr;
    if(DPF.co&&DPF.co<=DPF.ci)DPF.co=null;
    DPF.mode='co';
  }else{
    if(DPF.ci&&dateStr<=DPF.ci){
      DPF.ci=dateStr;DPF.co=null;DPF.mode='co';
    }else{
      DPF.co=dateStr;
      DPF.mode='ci';
    }
  }
  dpFsApplyClasses();
  dpFsUpdateFooter();
  dpFsUpdateTitle();
}

function dpFsRender(){
  const today=todayISO();
  const now=new Date();
  // Start 6 months back so past bookings can be edited
  let y=now.getFullYear(),m=now.getMonth()-6;
  if(m<0){m+=12;y--;}
  let html='';
  for(let i=0;i<20;i++){
    html+=dpFsRenderMonth(y,m,today);
    m++;if(m>11){m=0;y++;}
  }
  document.getElementById('dp-fs-body').innerHTML=html;
  dpFsApplyClasses();
}

function dpFsRenderMonth(year,month,today){
  const firstDay=new Date(year,month,1).getDay();
  const daysInMo=new Date(year,month+1,0).getDate();
  let h=`<div class="dp-fs-month-block" data-ym="${year}-${month}">`;
  h+=`<div class="dp-fs-month-hdr">${MNAMES_FS[month]} ${year}</div>`;
  h+=`<div class="dp-fs-days">`;
  for(let i=0;i<firstDay;i++)h+=`<div class="dp-fs-day fs-empty"></div>`;
  for(let d=1;d<=daysInMo;d++){
    const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls='dp-fs-day';
    if(ds<today)cls+=' fs-past';
    if(ds===today)cls+=' fs-today';
    h+=`<div class="${cls}" data-date="${ds}" onclick="dpFsSelectDay('${ds}')"><div class="dp-fs-num">${d}</div></div>`;
  }
  h+=`</div></div>`;
  return h;
}

function dpFsApplyClasses(){
  document.querySelectorAll('#dp-fs-body .dp-fs-day').forEach(el=>{
    el.classList.remove('fs-sel-start','fs-sel-end','fs-in-range');
    const num=el.querySelector('.dp-fs-num');
    if(num){num.style.background='';num.style.color='';}
  });
  if(!DPF.ci&&!DPF.co)return;
  document.querySelectorAll('#dp-fs-body .dp-fs-day[data-date]').forEach(el=>{
    const ds=el.dataset.date;
    const num=el.querySelector('.dp-fs-num');if(!num)return;
    const isCI=ds===DPF.ci;
    const isCO=ds===DPF.co;
    const inRange=DPF.ci&&DPF.co&&ds>DPF.ci&&ds<DPF.co;
    if(isCI){el.classList.add('fs-sel-start');num.style.background='#1a56db';num.style.color='#fff';}
    if(isCO){el.classList.add('fs-sel-end');num.style.background='#1a56db';num.style.color='#fff';}
    if(inRange)el.classList.add('fs-in-range');
  });
}

function dpOpen(mode){
  // On mobile: use the full-screen picker instead
  if(window.innerWidth<=600){dpFsOpen(mode);return;}

  DP.mode=mode;
  // Sync current values from hidden inputs
  DP.ci=document.getElementById('f-checkin').value||null;
  DP.co=document.getElementById('f-checkout').value||null;
  DP.hover=null;
  // Mark active trigger
  document.getElementById('dp-ci-btn').classList.toggle('active-pick',mode==='ci');
  document.getElementById('dp-co-btn').classList.toggle('active-pick',mode==='co');
  // Set view to show the relevant month
  const ref=DP.ci?new Date(DP.ci+'T12:00:00'):new Date();
  DP.vy=ref.getFullYear();DP.vm=ref.getMonth();
  // If editing co and checkout is in a later month, show that month on left
  if(mode==='co'&&DP.co){
    const coRef=new Date(DP.co+'T12:00:00');
    DP.vy=coRef.getFullYear();DP.vm=coRef.getMonth();
    // Back up one month so checkout appears on right
    DP.vm--;if(DP.vm<0){DP.vm=11;DP.vy--;}
  }
  dpRender();
  dpPosition(document.getElementById(mode==='ci'?'dp-ci-btn':'dp-co-btn'));
  document.getElementById('bsDatePicker').style.display='block';
  DP.open=true;
}

function dpPosition(triggerEl){
  const popup=document.getElementById('bsDatePicker');
  // On mobile: CSS handles positioning as a bottom sheet
  if(window.innerWidth<=600){
    popup.style.top='';popup.style.left='';popup.style.bottom='';
    return;
  }
  popup.style.display='block'; // need it visible to measure
  const rect=triggerEl.getBoundingClientRect();
  const vw=window.innerWidth;
  const vh=window.innerHeight;
  const pw=Math.max(popup.offsetWidth,520);
  const ph=popup.offsetHeight||360;
  let top=rect.bottom+6;
  let left=rect.left;
  if(left+pw>vw-12)left=vw-pw-12;
  if(left<8)left=8;
  if(top+ph>vh-12)top=Math.max(8,rect.top-ph-6);
  popup.style.top=top+'px';
  popup.style.left=left+'px';
  popup.style.display=''; // let CSS class control
}

function dpClose(){
  if(!DP.open)return;
  document.getElementById('bsDatePicker').style.display='none';
  document.getElementById('dpBackdrop').style.display='none';
  document.getElementById('dp-ci-btn').classList.remove('active-pick');
  document.getElementById('dp-co-btn').classList.remove('active-pick');
  DP.open=false;DP.hover=null;
}

function dpClearAll(){
  DP.ci=null;DP.co=null;DP.hover=null;
  document.getElementById('f-checkin').value='';
  document.getElementById('f-checkout').value='';
  dpRefreshTriggers();dpRender();
  onDatesChange();
  DP.mode='ci';dpUpdateHint();
}

function dpClearOne(which){
  if(which==='ci'){DP.ci=null;DPF.ci=null;document.getElementById('f-checkin').value='';}
  else{DP.co=null;DPF.co=null;document.getElementById('f-checkout').value='';}
  dpRefreshTriggers();dpRender();
  onDatesChange();
}

function dpPrevMonth(){
  DP.vm--;if(DP.vm<0){DP.vm=11;DP.vy--;}dpRender();
}
function dpNextMonth(){
  DP.vm++;if(DP.vm>11){DP.vm=0;DP.vy++;}dpRender();
}

function dpSelectDay(dateStr){
  if(DP.mode==='ci'){
    DP.ci=dateStr;
    if(DP.co&&DP.co<=DP.ci)DP.co=null;
    DP.mode='co';
  }else{
    if(DP.ci&&dateStr<=DP.ci){
      DP.ci=dateStr;DP.co=null;DP.mode='co';
    }else{
      DP.co=dateStr;
      DP.mode='ci';
    }
  }
  document.getElementById('f-checkin').value=DP.ci||'';
  document.getElementById('f-checkout').value=DP.co||'';
  // Clear validation errors when dates are filled
  if(DP.ci)document.getElementById('dp-ci-btn')?.classList.remove('error');
  if(DP.co)document.getElementById('dp-co-btn')?.classList.remove('error');
  dpRefreshTriggers();dpRender();
  onDatesChange();
  // Mark active trigger
  document.getElementById('dp-ci-btn').classList.toggle('active-pick',DP.mode==='ci');
  document.getElementById('dp-co-btn').classList.toggle('active-pick',DP.mode==='co');
  // Auto-close when both set
  if(DP.ci&&DP.co)setTimeout(dpClose,260);
}

function dpHover(dateStr){
  if(DP.mode==='co'&&DP.ci&&dateStr>DP.ci){
    if(DP.hover===dateStr)return; // no change needed
    DP.hover=dateStr;dpRender();
  }
}
function dpLeave(){
  if(DP.hover){DP.hover=null;dpRender();}
}

function dpRefreshTriggers(){
  const ciBtn=document.getElementById('dp-ci-btn');
  const coBtn=document.getElementById('dp-co-btn');
  const ciTxt=document.getElementById('dp-ci-text');
  const coTxt=document.getElementById('dp-co-text');
  if(DP.ci){ciTxt.textContent=fmtDate(DP.ci);ciBtn.classList.add('has-value');}
  else{ciTxt.textContent='Select date';ciBtn.classList.remove('has-value');}
  if(DP.co){coTxt.textContent=fmtDate(DP.co);coBtn.classList.add('has-value');}
  else{coTxt.textContent='Select date';coBtn.classList.remove('has-value');}
}

function dpSyncFromHidden(){
  DP.ci=document.getElementById('f-checkin').value||null;
  DP.co=document.getElementById('f-checkout').value||null;
  DPF.ci=DP.ci;DPF.co=DP.co; // keep full-screen state in sync
  dpRefreshTriggers();
}

function dpUpdateHint(){
  const h=document.getElementById('dp-hint');if(!h)return;
  if(DP.ci&&DP.co){
    const n=nightsBetween(DP.ci,DP.co);
    h.textContent=`${fmtDate(DP.ci)} → ${fmtDate(DP.co)}  ·  ${n} night${n!==1?'s':''}`;
  }else if(DP.mode==='co'&&DP.ci){
    h.textContent='Now pick your check-out date';
  }else{
    h.textContent='Pick your check-in date';
  }
}

function dpRenderMonth(elId,year,month){
  const el=document.getElementById(elId);if(!el)return;
  const WD=['Su','Mo','Tu','We','Th','Fr','Sa'];
  const MNAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const today=todayISO();
  const firstDay=new Date(year,month,1).getDay();
  const daysInMo=new Date(year,month+1,0).getDate();
  const effectiveEnd=DP.co||(DP.mode==='co'&&DP.hover&&DP.hover>(DP.ci||'')?DP.hover:null);

  let h=`<div class="dp-month-hdr">${MNAMES[month]} ${year}</div>`;
  h+=`<div class="dp-weekdays">${WD.map(d=>`<div class="dp-wd">${d}</div>`).join('')}</div>`;
  h+=`<div class="dp-days">`;
  // Empty leading cells
  for(let i=0;i<firstDay;i++)h+=`<button class="dp-day dp-empty" disabled></button>`;
  for(let d=1;d<=daysInMo;d++){
    const ds=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let cls='dp-day';
    if(ds<today)cls+=' dp-past';
    if(ds===today)cls+=' dp-today';
    const isCI=ds===DP.ci;
    const isCO=ds===DP.co||(DP.mode==='co'&&ds===DP.hover&&ds>(DP.ci||''));
    const inRange=DP.ci&&effectiveEnd&&ds>DP.ci&&ds<effectiveEnd;
    if(isCI&&isCO)cls+=' dp-sel';
    else if(isCI)cls+=' dp-range-start';
    else if(isCO)cls+=' dp-range-end';
    else if(inRange)cls+=' dp-in-range';
    h+=`<button class="${cls}"
      onclick="dpSelectDay('${ds}')"
      onmouseenter="dpHover('${ds}')"
      onmouseleave="dpLeave()"
      >${d}</button>`;
  }
  h+=`</div>`;
  el.innerHTML=h;
}

function dpRender(){
  dpRenderMonth('dp-month-left',DP.vy,DP.vm);
  let ry=DP.vy,rm=DP.vm+1;if(rm>11){rm=0;ry++;}
  dpRenderMonth('dp-month-right',ry,rm);
  dpUpdateHint();
}

// Close on outside click
document.addEventListener('click',e=>{
  if(!DP.open)return;
  const popup=document.getElementById('bsDatePicker');
  const ci=document.getElementById('dp-ci-btn');
  const co=document.getElementById('dp-co-btn');
  if(popup&&!popup.contains(e.target)&&!ci?.contains(e.target)&&!co?.contains(e.target))dpClose();
});

// Bootstrap: check session first, show login or app
(function bootstrap(){
  const savedTheme=localStorage.getItem('bloomstone_theme')||'light';
  document.documentElement.setAttribute('data-theme',savedTheme);
  if(resumeSession()){
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('app').style.display='flex';
    init();
  }else{
    document.getElementById('loginScreen').style.display='flex';
    document.getElementById('app').style.display='none';
  }
})();
