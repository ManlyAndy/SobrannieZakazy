const API_BASE="https://api.moysklad.ru/api/remap/1.2";
const STATUS_NOT_COLLECTED_NAME="Не собрано";
const STATUS_URGENT_NAME="Срочнее некуда";
const STATUS_COLLECTED_NAME="Собрано";
const PLACES_FIELD_NAME="Количество мест";
const PICKER_FIELD_NAME="Имя Сборщика";
const BITRIX_CHAT_ID=11359;
const BITRIX_DIALOG_ID=`chat${BITRIX_CHAT_ID}`;
const ALLOWED_ORIGIN="*";

function corsHeaders(){return{"Access-Control-Allow-Origin":ALLOWED_ORIGIN,"Access-Control-Allow-Headers":"Authorization, Content-Type","Access-Control-Allow-Methods":"GET, POST, OPTIONS"}}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",...corsHeaders()}})}
async function verifyAuth(auth){
  const r=await fetch(`${API_BASE}/entity/employee?limit=1`,{headers:{Authorization:auth}});
  return r.ok;
}
function getAttr(row,name){
  const attrs=Array.isArray(row.attributes)?row.attributes:[];
  const n=String(name).trim().toLowerCase();
  const a=attrs.find(x=>String(x.name||"").trim().toLowerCase()===n) ||
          attrs.find(x=>/количеств.*мест/i.test(String(x.name||"")) && /мест/i.test(name));
  if(!a)return null;
  const v=a.value;
  if(v&&typeof v==="object")return v.name??v.value??null;
  return v??null;
}
function getAttrObject(row,name){
  const attrs=Array.isArray(row.attributes)?row.attributes:[];
  const n=String(name).trim().toLowerCase();
  return attrs.find(x=>String(x.name||"").trim().toLowerCase()===n)||null;
}
async function findDemand(code,auth){
  const filter=encodeURIComponent(`name=${code}`);
  const r=await fetch(`${API_BASE}/entity/demand?filter=${filter}&expand=agent,state,attributes`,{headers:{Authorization:auth},cf:{cacheTtl:0,cacheEverything:false}});
  if(r.status===401)return {status:401};
  if(!r.ok)return {error:"Ошибка МойСклад",status:r.status};
  const data=await r.json(),row=data.rows?.[0];
  if(!row)return {found:false};
  const detailR=await fetch(`${API_BASE}/entity/demand/${row.id}?expand=agent,state,attributes`,{headers:{Authorization:auth},cf:{cacheTtl:0,cacheEverything:false}});
  if(!detailR.ok)return {error:"Не удалось получить данные отгрузки",status:detailR.status};
  const d=await detailR.json(),stateName=d.state?.name||null;
  const places=getAttr(d,PLACES_FIELD_NAME);
  const picker=getAttr(d,PICKER_FIELD_NAME);
  return {found:true,id:d.id,name:d.name,agentName:d.agent?.name||"—",sum:d.sum?(d.sum/100).toFixed(2):"—",
    positionsCount:d.positions?.meta?.size??"—",places,pickerName:picker,stateName,
    collectable:stateName===STATUS_NOT_COLLECTED_NAME||stateName===STATUS_URGENT_NAME,
    alreadyCollected:stateName===STATUS_COLLECTED_NAME};
}
async function handleFind(url,auth){
  const code=(url.searchParams.get("code")||"").trim();
  if(!code)return json({error:"Не передан номер"},400);
  if(code==="__login_check__"){
    const ok=await verifyAuth(auth);
    return ok?json({ok:true}):json({error:"Неверный логин или пароль"},401);
  }
  const d=await findDemand(code,auth);if(d.status===401)return json({error:"Неверный логин или пароль"},401);
  return json(d,d.error?502:200);
}
async function handleCollect(req,auth){
  const body=await req.json(),id=String(body.id||"").trim(),picker=String(body.pickerName||"").trim(),places=Number(body.places);
  if(!id)return json({error:"Не передан id отгрузки"},400);
  if(!picker)return json({error:"Не выбран сборщик"},400);
  if(!Number.isInteger(places)||places<1)return json({error:"Количество мест должно быть целым числом больше нуля"},400);

  const r=await fetch(`${API_BASE}/entity/demand/${encodeURIComponent(id)}?expand=state,attributes`,{headers:{Authorization:auth},cf:{cacheTtl:0,cacheEverything:false}});
  if(r.status===401)return json({error:"Неверный логин или пароль"},401);
  if(!r.ok)return json({error:"Не удалось проверить отгрузку"},502);
  const d=await r.json(),current=d.state?.name||null;
  if(current===STATUS_COLLECTED_NAME)return json({ok:true,alreadyCollected:true});
  if(current!==STATUS_NOT_COLLECTED_NAME&&current!==STATUS_URGENT_NAME)
    return json({error:`Статус уже изменился: сейчас "${current||"—"}"`},409);

  const stateMetaR=await fetch(`${API_BASE}/entity/demand/metadata`,{headers:{Authorization:auth}});
  if(!stateMetaR.ok)return json({error:"Не удалось получить статусы"},502);
  const meta=await stateMetaR.json();
  const state=(meta.states||[]).find(s=>s.name===STATUS_COLLECTED_NAME);
  if(!state)return json({error:`Статус "${STATUS_COLLECTED_NAME}" не найден в МойСклад`},500);

  const pickerAttr=getAttrObject(d,PICKER_FIELD_NAME);
  const placesAttr=getAttrObject(d,PLACES_FIELD_NAME);
  if(!pickerAttr)return json({error:`Поле "${PICKER_FIELD_NAME}" не найдено в отгрузке`},500);
  if(!placesAttr)return json({error:`Поле "${PLACES_FIELD_NAME}" не найдено в отгрузке`},500);

  const payload={
    state:{meta:{href:state.meta.href,type:"state",mediaType:"application/json"}},
    attributes:[
      {meta:pickerAttr.meta,value:picker},
      {meta:placesAttr.meta,value:places}
    ]
  };
  const put=await fetch(`${API_BASE}/entity/demand/${encodeURIComponent(id)}`,{
    method:"PUT",headers:{Authorization:auth,"Content-Type":"application/json"},body:JSON.stringify(payload)
  });
  if(put.status===401)return json({error:"Неверный логин или пароль"},401);
  if(!put.ok){let details="";try{details=await put.text()}catch(e){}return json({error:"Не удалось сохранить статус и данные сборки",status:put.status,details},502)}

  const verify=await findDemand(d.name,auth);
  if(verify.stateName!==STATUS_COLLECTED_NAME)return json({error:"Данные сохранены, но статус не подтвердился при проверке"},502);
  return json({ok:true,name:d.name,places,pickerName:picker,stateName:STATUS_COLLECTED_NAME});
}

async function bitrixCall(webhook,method,payload){
  const r=await fetch(`${webhook}/${method}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data=await r.json().catch(()=>({}));
  if(!r.ok||data.error)throw new Error(data.error_description||data.error||`Bitrix ${r.status}`);
  return data;
}
async function handlePhotoUpload(req,auth,env){
  if(!env.BITRIX_WEBHOOK_URL)return json({error:"Интеграция с Bitrix24 не настроена"},500);
  if(!(await verifyAuth(auth)))return json({error:"Неверный логин или пароль"},401);
  const body=await req.json(),number=String(body.number||"").trim(),photos=Array.isArray(body.photos)?body.photos:[];
  if(!number)return json({error:"Не передан номер отгрузки"},400);
  if(!photos.length)return json({error:"Нет фотографий"},400);
  if(photos.length>10)return json({error:"За один раз можно загрузить максимум 10 фото"},400);

  const webhook=env.BITRIX_WEBHOOK_URL.replace(/\/$/,"");
  let uploaded=0;const results=[];
  for(let i=0;i<photos.length;i++){
    const p=photos[i];
    if(!p?.content)continue;
    const name=String(p.name||`order-${number}-${i+1}.jpg`).replace(/[^a-zA-Z0-9А-Яа-я._-]/g,"_");
    const data=await bitrixCall(webhook,"im.v2.File.upload",{
      dialogId:BITRIX_DIALOG_ID,
      fields:{name,content:p.content,message:`Отгрузка № ${number}`}
    });
    uploaded++;results.push({name,result:data.result});
  }
  return json({ok:true,number,uploaded,results});
}

async function handleBitrixTest(auth,env){
  if(!env.BITRIX_WEBHOOK_URL)return json({ok:false,error:"BITRIX_WEBHOOK_URL не задан в Cloudflare Worker"},500);
  if(!(await verifyAuth(auth)))return json({ok:false,error:"Неверный логин или пароль"},401);
  const webhook=env.BITRIX_WEBHOOK_URL.replace(/\/$/,"");
  try{
    const data=await bitrixCall(webhook,"im.dialog.get",{DIALOG_ID:BITRIX_DIALOG_ID});
    return json({ok:true,chatId:BITRIX_CHAT_ID,dialogId:BITRIX_DIALOG_ID,chat:data.result||null,message:"Вебхук имеет доступ к чату. Загрузка через im.v2.File.upload должна выполняться от имени пользователя-владельца вебхука при наличии доступа к этому чату."});
  }catch(e){
    return json({ok:false,chatId:BITRIX_CHAT_ID,dialogId:BITRIX_DIALOG_ID,error:String(e)},502);
  }
}

export default {async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==="OPTIONS")return new Response(null,{headers:corsHeaders()});

  const isApi = url.pathname==="/find" || url.pathname==="/collect" ||
    url.pathname==="/photo/upload" || url.pathname==="/bitrix/test";

  // Все не-API запросы обслуживает папка public через Workers Static Assets.
  if(!isApi) return env.ASSETS.fetch(request);

  const auth=request.headers.get("Authorization");
  if(!auth?.startsWith("Basic "))return json({error:"Нет авторизации"},401);
  try{
    if(url.pathname==="/find"&&request.method==="GET")return await handleFind(url,auth);
    if(url.pathname==="/collect"&&request.method==="POST")return await handleCollect(request,auth);
    if(url.pathname==="/photo/upload"&&request.method==="POST")return await handlePhotoUpload(request,auth,env);
    if(url.pathname==="/bitrix/test"&&request.method==="GET")return await handleBitrixTest(auth,env);
    return json({error:"Действие не разрешено"},403);
  }catch(e){return json({error:"Внутренняя ошибка",details:String(e)},500)}
}}
