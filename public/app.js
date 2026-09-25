let scanner = null;
let currentOrder = null;
let extraOrders = [];
let scanMode = "main";
let photoFiles = [];
let photoBusy = false;

function $(id){return document.getElementById(id)}
function esc(v){const d=document.createElement("div");d.textContent=v==null?"":String(v);return d.innerHTML}

function businessDayKey(d=new Date()){
  const x=new Date(d);
  if(x.getHours()<7)x.setDate(x.getDate()-1);
  return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
}
function auth(){return localStorage.getItem("collected_auth")}
function user(){return localStorage.getItem("collected_user")||""}

function show(name){
  ["login","scan","result"].forEach(x=>$("screen-"+x).classList.remove("active"));
  $("screen-"+name).classList.add("active");
}
function stopScanner(){
  if(scanner){try{scanner.stop().catch(()=>{})}catch(e){}scanner=null}
}
function startScanner(){
  stopScanner();
  $("reader").innerHTML="";
  scanner=new Html5Qrcode("reader");
  Html5Qrcode.getCameras().then(cameras=>{
    if(!cameras.length){$("reader").innerHTML='<p class="error">Камера не найдена.</p>';return}
    const cam=cameras.find(c=>/back|rear|environment/i.test(c.label))||cameras[0];
    scanner.start(cam.id,{fps:10,qrbox:{width:270,height:150},formatsToSupport:[Html5QrcodeSupportedFormats.CODE_128]},
      text=>{stopScanner();handleScanResult(text.trim())},()=>{}
    ).catch(()=>{$("reader").innerHTML='<p class="error">Не удалось открыть камеру. Разрешите доступ к камере.</p><button class="btn-secondary" onclick="startScanner()">Повторить</button>'});
  }).catch(()=>{$("reader").innerHTML='<p class="error">Нет доступа к камере.</p>'});
}
function enterScan(){
  scanMode="main";
  $("who-label").textContent=user();$("who-label-2").textContent=user();
  show("scan");setTimeout(startScanner,250);
}
function addExtraOrderScan(){
  scanMode="extra";
  $("who-label").textContent=user();$("who-label-2").textContent=user();
  show("scan");setTimeout(startScanner,250);
}
function handleScanResult(code){
  if(!code)return;
  if(scanMode==="extra"){
    addExtraNumber(code);
    scanMode="main";
    show("result");
    renderOrder(currentOrder);
    return;
  }
  lookup(code);
}
function renderScannedList(){
  const el=$("scanned-list");
  if(!el)return;
  if(!currentOrder){el.innerHTML="";return}
  const items=[currentOrder.name,...extraOrders];
  el.innerHTML=`<div class="hint">Отсканировано (${items.length}):</div><div class="chips">${items.map((n,i)=>i===0
    ?`<span class="chip-main">${esc(n)}</span>`
    :`<button type="button" class="chip chip-active" onclick="removeExtraNumber('${esc(n).replace(/'/g,"\\'")}')">${esc(n)} ✕</button>`
  ).join("")}</div>`;
}
function addExtraNumber(code){
  if(!currentOrder)return;
  if(code===currentOrder.name){alert("Это и есть первая отсканированная накладная");return}
  if(extraOrders.includes(code))return;
  extraOrders.push(code);
  renderScannedList();
}
function removeExtraNumber(code){
  extraOrders=extraOrders.filter(x=>x!==code);
  renderScannedList();
}
function showManual(){$("manual").classList.toggle("hidden")}
function manualLookup(){
  const v=$("manual-code").value.trim();if(v){stopScanner();handleScanResult(v)}
}
function backToScan(){
  $("manual").classList.add("hidden");$("manual-code").value="";
  show("scan");setTimeout(startScanner,150);
}

async function doLogin(){
  const login=$("login-user").value.trim(), pass=$("login-pass").value, err=$("login-error");
  err.textContent="";
  if(!login||!pass){err.textContent="Заполните логин и пароль";return}
  const h="Basic "+btoa(unescape(encodeURIComponent(login+":"+pass)));
  try{
    const r=await fetch(`${CONFIG.PROXY_URL}/find?code=__login_check__`,{headers:{Authorization:h},cache:"no-store"});
    if(r.status===401){err.textContent="Неверный логин или пароль";return}
    if(!r.ok){err.textContent="Не удалось связаться с сервером";return}
    localStorage.setItem("collected_auth",h);
    localStorage.setItem("collected_user",login);
    localStorage.setItem("collected_day",businessDayKey());
    enterScan();
  }catch(e){err.textContent="Нет соединения с сервером"}
}
function logout(){
  ["collected_auth","collected_user","collected_day"].forEach(k=>localStorage.removeItem(k));
  scanMode="main";extraOrders=[];currentOrder=null;
  if($("scanned-list"))$("scanned-list").innerHTML="";
  stopScanner();show("login");
}

async function lookup(code){
  show("result");
  $("result-body").innerHTML='<div class="spinner"></div><p class="hint" style="text-align:center">Ищу отгрузку '+esc(code)+'…</p>';
  try{
    const r=await fetch(`${CONFIG.PROXY_URL}/find?code=${encodeURIComponent(code)}&_=${Date.now()}`,{headers:{Authorization:auth()},cache:"no-store"});
    if(r.status===401){logout();return}
    const d=await r.json();
    if(!d.found){renderNotFound(code);return}
    currentOrder=d;
    extraOrders=[];
    renderScannedList();
    if(d.alreadyCollected){renderCollected(d);return}
    if(!d.collectable){renderWrongStatus(d);return}
    renderOrder(d);
  }catch(e){
    $("result-body").innerHTML='<div class="card bad"><div class="badge bad">ОШИБКА</div><p>Не удалось связаться с сервером.</p></div>';
  }
}

function renderNotFound(code){
  $("result-body").innerHTML=`<div class="card bad"><div class="badge bad">НЕ НАЙДЕНО</div><div class="num">№ ${esc(code)}</div><p class="meta">Отгрузка с таким номером не найдена.</p></div>`;
}
function renderWrongStatus(d){
  $("result-body").innerHTML=`<div class="card bad"><div class="badge bad">НЕ ГОТОВО</div><div class="num">№ ${esc(d.name)}</div><div class="meta">Покупатель: <b>${esc(d.agentName)}</b></div><div class="meta">Текущий статус: <b>${esc(d.stateName||"—")}</b></div><p class="meta">Для этого приложения допустимы статусы «${esc(CONFIG.STATUS_NOT_COLLECTED_NAME)}» и «${esc(CONFIG.STATUS_URGENT_NAME)}».</p></div>`;
}
function pickersLabel(p1,p2){
  if(!p1)return "—";
  return p2?`${p1}, ${p2}`:p1;
}
function renderCollected(d){
  $("result-body").innerHTML=`<div class="card ok"><div class="badge ok">УЖЕ СОБРАНО ✓</div><div class="num">№ ${esc(d.name)}</div><div class="meta">Покупатель: <b>${esc(d.agentName)}</b></div><div class="meta">Сборщик(и): <b>${esc(pickersLabel(d.pickerName1,d.pickerName2))}</b></div><div class="meta">Количество мест: <b>${esc(d.places==null?"—":d.places)}</b></div>${d.dimensions?`<div class="meta">Габариты: <b>${esc(d.dimensions)}</b></div>`:""}</div>`;
}
function pickerChips(selected,targetId){
  return CONFIG.PICKER_NAMES.map(n=>`<button type="button" class="chip${n===selected?" chip-active":""}" onclick="selectPicker('${esc(n).replace(/'/g,"\\'")}','${targetId}')">${esc(n)}</button>`).join("");
}
function selectPicker(name,targetId){
  $(targetId).value=name;
  document.querySelectorAll(`#${targetId}-chips .chip`).forEach(c=>c.classList.toggle("chip-active",c.textContent===name));
}
function renderOrder(d){
  $("result-body").innerHTML=`
  <div class="card ok">
    <div class="badge ok">НАЙДЕНА ОТГРУЗКА</div>
    <div class="num">№ ${esc(d.name)}</div>
    <div class="meta">Покупатель: <b>${esc(d.agentName)}</b></div>
    <div class="meta">Текущий статус: <b>${esc(d.stateName)}</b></div>
    <div class="meta">Количество мест: <b>${esc(d.places==null?"—":d.places)}</b></div>
  </div>
  <button class="btn-secondary" onclick="addExtraOrderScan()">+ Ещё (доп. накладная)</button>
  <button class="btn-success" onclick="openCollectModal()">Сменить статус</button>
  <button class="btn-secondary" onclick="openPhotoModal()">Сделать фото</button>`;
}
let dimensionRows=[];
function renderDimensionRows(){
  $("dimensions-list").innerHTML=dimensionRows.map((row,i)=>`
    <div class="dim-row">
      <input type="text" inputmode="decimal" class="dim-input" placeholder="Длина" value="${esc(row.l)}" oninput="updateDim(${i},'l',this.value)">
      <input type="text" inputmode="decimal" class="dim-input" placeholder="Ширина/Ø" value="${esc(row.w)}" oninput="updateDim(${i},'w',this.value)">
      <input type="text" inputmode="decimal" class="dim-input" placeholder="Высота" value="${esc(row.h)}" oninput="updateDim(${i},'h',this.value)">
      <input type="text" inputmode="decimal" class="dim-input" placeholder="Вес,кг" value="${esc(row.kg)}" oninput="updateDim(${i},'kg',this.value)">
      <button type="button" class="dim-dup" onclick="duplicateDimRow(${i})" title="Дублировать строку">⧉</button>
      <button type="button" class="dim-remove" onclick="removeDimRow(${i})">✕</button>
    </div>`).join("");
}
function updateDim(i,key,val){dimensionRows[i][key]=val}
function addDimensionRow(){dimensionRows.push({l:"",w:"",h:"",kg:""});renderDimensionRows()}
function duplicateDimRow(i){dimensionRows.splice(i+1,0,{...dimensionRows[i]});renderDimensionRows()}
function removeDimRow(i){dimensionRows.splice(i,1);renderDimensionRows()}
function buildDimensionsString(){
  return dimensionRows.map(r=>{
    const dims=[r.l,r.w,r.h].map(v=>String(v||"").trim()).filter(Boolean);
    const kg=String(r.kg||"").trim();
    if(!dims.length&&!kg)return null;
    return dims.join("*")+(kg?` ${kg} кг`:"");
  }).filter(Boolean).join("; ");
}
function openCollectModal(){
  dimensionRows=[{l:"",w:"",h:"",kg:""}];
  $("order-content").innerHTML=`
    <div class="num">№ ${esc(currentOrder.name)}</div>
    <p class="meta">Выберите сборщика(ов) и укажите количество мест.</p>
    <label class="hint">Сборщик №1</label>
    <input id="picker-input-1" type="text" placeholder="Впишите имя или выберите ниже" value="${currentOrder.pickerName1?esc(currentOrder.pickerName1):""}" autocomplete="off">
    <div id="picker-input-1-chips" class="chips">${pickerChips(currentOrder.pickerName1,"picker-input-1")}</div>
    <label class="hint">Сборщик №2 (если собирали вдвоём — необязательно)</label>
    <input id="picker-input-2" type="text" placeholder="Впишите имя или выберите ниже" value="${currentOrder.pickerName2?esc(currentOrder.pickerName2):""}" autocomplete="off">
    <div id="picker-input-2-chips" class="chips">${pickerChips(currentOrder.pickerName2,"picker-input-2")}</div>
    <label class="hint">Количество мест</label>
    <input id="places-input" type="number" min="1" step="1" inputmode="numeric" value="${currentOrder.places==null?"":esc(currentOrder.places)}" placeholder="Количество мест">
    <label class="hint">Габариты (необязательно)</label>
    <div id="dimensions-list"></div>
    <button type="button" class="btn-secondary dim-add" onclick="addDimensionRow()">+ Добавить габариты</button>
    <button class="btn-success" onclick="collectOrder()">Сменить статус</button>`;
  renderDimensionRows();
  $("order-modal").classList.add("active");
}
function closeOrderModal(){$("order-modal").classList.remove("active")}

async function collectOrder(){
  const picker1=$("picker-input-1").value.trim();
  const picker2=$("picker-input-2").value.trim();
  const places=Number($("places-input").value);
  let dimensions=buildDimensionsString();
  if(extraOrders.length){
    const suffix=`вместе с ${extraOrders.join(", ")}`;
    dimensions=dimensions?`${dimensions} ${suffix}`:suffix;
  }
  if(!picker1){alert("Впишите имя сборщика №1");return}
  if(!Number.isInteger(places)||places<1){alert("Укажите количество мест");return}
  const btn=document.querySelector("#order-content .btn-success");
  btn.disabled=true;btn.textContent="Сохраняю…";
  try{
    const r=await fetch(`${CONFIG.PROXY_URL}/collect`,{
      method:"POST",headers:{"Authorization":auth(),"Content-Type":"application/json"},
      body:JSON.stringify({id:currentOrder.id,picker1,picker2,places,dimensions})
    });
    if(r.status===401){logout();return}
    const d=await r.json();
    if(!d.ok){alert(d.error||"Не удалось изменить статус");btn.disabled=false;btn.textContent="Сменить статус";return}

    const failed=[];
    for(const num of extraOrders){
      try{
        const fr=await fetch(`${CONFIG.PROXY_URL}/find?code=${encodeURIComponent(num)}&_=${Date.now()}`,{headers:{Authorization:auth()},cache:"no-store"});
        const fd=await fr.json();
        if(!fd.found){failed.push(`${num}: не найдена`);continue}
        if(fd.alreadyCollected)continue;
        if(!fd.collectable){failed.push(`${num}: статус "${fd.stateName||"—"}"`);continue}
        const cr=await fetch(`${CONFIG.PROXY_URL}/collect`,{
          method:"POST",headers:{"Authorization":auth(),"Content-Type":"application/json"},
          body:JSON.stringify({id:fd.id,picker1,picker2})
        });
        const cd=await cr.json();
        if(!cd.ok)failed.push(`${num}: ${cd.error||"ошибка"}`);
      }catch(e){failed.push(`${num}: нет соединения`)}
    }

    currentOrder.stateName=CONFIG.STATUS_COLLECTED_NAME;
    currentOrder.alreadyCollected=true;
    currentOrder.pickerName1=picker1;currentOrder.pickerName2=picker2||null;currentOrder.places=places;currentOrder.dimensions=dimensions||null;
    closeOrderModal();
    const allNumbers=[currentOrder.name,...extraOrders];
    $("result-body").innerHTML=`<div class="card ok"><div class="badge ok">СОБРАНО ✓</div><div class="num">№ ${esc(allNumbers.join(", "))}</div><div class="meta">Сборщик(и): <b>${esc(pickersLabel(picker1,picker2))}</b></div><div class="meta">Количество мест: <b>${places}</b></div>${dimensions?`<div class="meta">Габариты: <b>${esc(dimensions)}</b></div>`:""}<p class="meta">Статус успешно изменён в МойСклад.</p>${d.warning?`<p class="meta" style="color:#f59e0b">${esc(d.warning)}</p>`:""}${failed.length?`<p class="meta" style="color:#f87171">Не удалось для: ${esc(failed.join("; "))}</p>`:""}</div><button class="btn-secondary" onclick="openPhotoModal()">Сделать фото</button>`;
  }catch(e){alert("Нет соединения с сервером")}
  finally{btn.disabled=false;btn.textContent="Сменить статус"}
}

let lastPhotoSource="gallery";
function openPhotoModal(){
  if(!currentOrder)return;
  photoFiles=[];
  $("photo-title").textContent=`Фото отгрузки № ${currentOrder.name}`;
  $("photo-status").textContent="";
  $("photo-input-camera").value="";
  $("photo-input-gallery").value="";
  renderPhotoGrid();
  $("photo-modal").classList.add("active");
}
function closePhotoModal(){$("photo-modal").classList.remove("active")}
function openCamera(){lastPhotoSource="camera";$("photo-input-camera").click()}
function openGallery(){lastPhotoSource="gallery";$("photo-input-gallery").click()}
function addAnotherPhoto(){lastPhotoSource==="camera"?$("photo-input-camera").click():$("photo-input-gallery").click()}
function handlePhotoFiles(files){
  [...files].forEach(f=>{if(f.type.startsWith("image/"))photoFiles.push(f)});
  $("photo-input-camera").value="";$("photo-input-gallery").value="";renderPhotoGrid();
}
function renderPhotoGrid(){
  const grid=$("photo-grid");
  grid.innerHTML="";
  photoFiles.forEach((file,i)=>{
    const url=URL.createObjectURL(file);
    const div=document.createElement("div");div.className="photo-item";
    div.innerHTML=`<img src="${url}"><button class="btn-danger photo-remove" onclick="removePhoto(${i})">×</button>`;
    grid.appendChild(div);
  });
}
function removePhoto(i){photoFiles.splice(i,1);renderPhotoGrid()}

async function compressPhoto(file){
  return new Promise((resolve,reject)=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{
      const max=1600, scale=Math.min(1,max/Math.max(img.width,img.height));
      const c=document.createElement("canvas");c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);
      c.toBlob(b=>{URL.revokeObjectURL(url);b?resolve(b):reject(new Error("compress"))},"image/jpeg",.82)
    };img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("image"))};img.src=url;
  })
}
function blobToBase64(blob){
  return new Promise((resolve,reject)=>{
    const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]);r.onerror=reject;r.readAsDataURL(blob)
  })
}
async function uploadPhotos(){
  if(!photoFiles.length){alert("Сначала сделайте хотя бы одно фото");return}
  if(photoBusy)return;
  photoBusy=true;$("photo-status").textContent="Загружаю фото в Битрикс24…";
  try{
    const photos=[];
    for(const f of photoFiles){
      const b=await compressPhoto(f);
      photos.push({name:f.name.replace(/\.[^.]+$/,"")+".jpg",content:await blobToBase64(b)});
    }
    const r=await fetch(`${CONFIG.PROXY_URL}/photo/upload`,{
      method:"POST",headers:{"Authorization":auth(),"Content-Type":"application/json"},
      body:JSON.stringify({number:[currentOrder.name,...extraOrders].join("_"),photos,by:user()})
    });
    if(r.status===401){logout();return}
    const d=await r.json();
    if(!d.ok)throw new Error(d.error||"upload");
    $("photo-status").textContent=`Загружено: ${d.uploaded} фото`;
    setTimeout(closePhotoModal,700);
  }catch(e){$("photo-status").textContent="Не удалось загрузить фото. Проверьте настройки Bitrix24."}
  finally{photoBusy=false}
}

window.addEventListener("load",()=>{
  const day=localStorage.getItem("collected_day");
  if(auth()&&day===businessDayKey())enterScan();
  else logout();
});
