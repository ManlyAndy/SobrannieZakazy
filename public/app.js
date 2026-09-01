let scanner = null;
let currentOrder = null;
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
      text=>{stopScanner();lookup(text.trim())},()=>{}
    ).catch(()=>{$("reader").innerHTML='<p class="error">Не удалось открыть камеру. Разрешите доступ к камере.</p><button class="btn-secondary" onclick="startScanner()">Повторить</button>'});
  }).catch(()=>{$("reader").innerHTML='<p class="error">Нет доступа к камере.</p>'});
}
function enterScan(){
  $("who-label").textContent=user();$("who-label-2").textContent=user();
  show("scan");setTimeout(startScanner,250);
}
function showManual(){$("manual").classList.toggle("hidden")}
function manualLookup(){
  const v=$("manual-code").value.trim();if(v){stopScanner();lookup(v)}
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
function renderCollected(d){
  $("result-body").innerHTML=`<div class="card ok"><div class="badge ok">УЖЕ СОБРАНО ✓</div><div class="num">№ ${esc(d.name)}</div><div class="meta">Покупатель: <b>${esc(d.agentName)}</b></div><div class="meta">Сборщик: <b>${esc(d.pickerName||"—")}</b></div><div class="meta">Количество мест: <b>${esc(d.places==null?"—":d.places)}</b></div></div>`;
}
function pickerChips(selected){
  return CONFIG.PICKER_NAMES.map(n=>`<button type="button" class="chip${n===selected?" chip-active":""}" onclick="selectPicker('${esc(n).replace(/'/g,"\\'")}')">${esc(n)}</button>`).join("");
}
function selectPicker(name){
  $("picker-input").value=name;
  document.querySelectorAll("#picker-chips .chip").forEach(c=>c.classList.toggle("chip-active",c.textContent===name));
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
  <button class="btn-success" onclick="openCollectModal()">Сменить статус</button>
  <button class="btn-secondary" onclick="openPhotoModal()">Сделать фото</button>`;
}
function openCollectModal(){
  $("order-content").innerHTML=`
    <div class="num">№ ${esc(currentOrder.name)}</div>
    <p class="meta">Выберите сборщика и укажите количество мест.</p>
    <label class="hint">Имя Сборщика</label>
    <input id="picker-input" type="text" placeholder="Впишите имя или выберите ниже" value="${currentOrder.pickerName?esc(currentOrder.pickerName):""}" autocomplete="off">
    <div id="picker-chips" class="chips">${pickerChips(currentOrder.pickerName)}</div>
    <label class="hint">Количество мест</label>
    <input id="places-input" type="number" min="1" step="1" inputmode="numeric" value="${currentOrder.places==null?"":esc(currentOrder.places)}" placeholder="Количество мест">
    <button class="btn-success" onclick="collectOrder()">Сменить статус</button>`;
  $("order-modal").classList.add("active");
}
function closeOrderModal(){$("order-modal").classList.remove("active")}

async function collectOrder(){
  const picker=$("picker-input").value.trim();
  const places=Number($("places-input").value);
  if(!picker){alert("Впишите имя сборщика");return}
  if(!Number.isInteger(places)||places<1){alert("Укажите количество мест");return}
  const btn=document.querySelector("#order-content .btn-success");
  btn.disabled=true;btn.textContent="Сохраняю…";
  try{
    const r=await fetch(`${CONFIG.PROXY_URL}/collect`,{
      method:"POST",headers:{"Authorization":auth(),"Content-Type":"application/json"},
      body:JSON.stringify({id:currentOrder.id,pickerName:picker,places})
    });
    if(r.status===401){logout();return}
    const d=await r.json();
    if(!d.ok){alert(d.error||"Не удалось изменить статус");btn.disabled=false;btn.textContent="Сменить статус";return}
    currentOrder.stateName=CONFIG.STATUS_COLLECTED_NAME;
    currentOrder.alreadyCollected=true;
    currentOrder.pickerName=picker;currentOrder.places=places;
    closeOrderModal();
    $("result-body").innerHTML=`<div class="card ok"><div class="badge ok">СОБРАНО ✓</div><div class="num">№ ${esc(currentOrder.name)}</div><div class="meta">Сборщик: <b>${esc(picker)}</b></div><div class="meta">Количество мест: <b>${places}</b></div><p class="meta">Статус успешно изменён в МойСклад.</p></div><button class="btn-secondary" onclick="openPhotoModal()">Сделать фото</button>`;
  }catch(e){alert("Нет соединения с сервером")}
  finally{btn.disabled=false;btn.textContent="Сменить статус"}
}

function openPhotoModal(){
  if(!currentOrder)return;
  photoFiles=[];
  $("photo-title").textContent=`Фото отгрузки № ${currentOrder.name}`;
  $("photo-status").textContent="";
  $("photo-input").value="";
  renderPhotoGrid();
  $("photo-modal").classList.add("active");
}
function closePhotoModal(){$("photo-modal").classList.remove("active")}
function addAnotherPhoto(){$("photo-input").click()}
function handlePhotoFiles(files){
  [...files].forEach(f=>{if(f.type.startsWith("image/"))photoFiles.push(f)});
  $("photo-input").value="";renderPhotoGrid();
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
      body:JSON.stringify({number:currentOrder.name,photos})
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

