
const $ = id => document.getElementById(id);
const cfg = window.APP_CONFIG;
const templates = window.REPORT_TEMPLATES;
const cats = [...new Set(templates.map(t=>t.cat))];
let selected = templates[0];
let reports = [];
let currentReport = null;
let db = null;
let useSupabase = false;
let analytics = JSON.parse(localStorage.getItem('school_reports_analytics') || '{"visits":0,"views":0,"prints":0}');
const visitorId = localStorage.getItem('school_reports_visitor') || crypto.randomUUID();
localStorage.setItem('school_reports_visitor', visitorId);
const sessionId = sessionStorage.getItem('school_reports_session') || crypto.randomUUID();
sessionStorage.setItem('school_reports_session', sessionId);

const catIcons = {
  'التقارير العامة والتقييم':'📄','التحصيل وتشخيص النتائج':'📈','النشاط الطلابي':'🎯',
  'الصحة المدرسية':'🩺','الأعمال الإدارية':'🗃️','الأمن والسلامة والمرافق':'🛡️',
  'الكشوف والمتابعة':'📋','لوحات الاختبارات':'🚪','الشهادات':'🏅','التقنيات التعليمية':'💻'
};

function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2600); }
function escapeHtml(v){ return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s])); }
function go(id){
  document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.id===id));
  document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  window.scrollTo({top:0,behavior:'smooth'});
  if(id==='archive') renderArchive();
  if(id==='home'||id==='analytics') refreshMetrics();
}
document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click',()=>go(b.dataset.page)));

async function initStorage(){
  const ready = cfg.supabaseUrl && cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.includes('PUT_YOUR_') && !cfg.supabaseAnonKey.includes('PUT_YOUR_') &&
    window.supabase;
  if(ready){
    try{
      db = window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
      const {data:{session}} = await db.auth.getSession();
      if(!session){
        const {error} = await db.auth.signInAnonymously();
        if(error) throw error;
      }
      useSupabase = true;
      $('storageMode').textContent='Supabase متصل';
      $('saveMode').textContent='حفظ سحابي + مسودة تلقائية';
    }catch(e){
      console.warn(e);
      useSupabase = false;
    }
  }
  analytics.visits++;
  localStorage.setItem('school_reports_analytics',JSON.stringify(analytics));
  await track('page_view');
  await loadReports();
}

async function loadReports(){
  if(useSupabase){
    const {data,error}=await db.from('reports').select('*').order('created_at',{ascending:false});
    if(error){ console.warn(error); reports=[]; }
    else reports=(data||[]).map(r=>({...r,template:r.template_name,cat:r.category,data:r.payload||{},benef:r.beneficiaries_count||0,number:r.report_number,date:r.report_date,dept:r.department||''}));
  }else{
    reports=JSON.parse(localStorage.getItem('school_reports_records')||'[]');
  }
  renderArchive(); refreshMetrics();
}

async function track(eventType, reportId=null){
  if(useSupabase){
    try{ await db.from('analytics_events').insert({anonymous_visitor_id:visitorId,session_id:sessionId,event_type:eventType,report_id:reportId}); }catch(e){ console.warn(e); }
  }
}

function renderHomeCategories(){
  $('homeCategories').innerHTML = cats.map(c=>`<div class="category-card" onclick="openCategory('${escapeHtml(c)}')"><div class="cicon">${catIcons[c]||'✨'}</div><b>${escapeHtml(c)}</b><small>${templates.filter(t=>t.cat===c).length} قوالب</small></div>`).join('');
}
function renderCats(){
  $('catbar').innerHTML = `<button class="catbtn active" onclick="filterTemplates('الكل',this)">الكل</button>`+
    cats.map(c=>`<button class="catbtn" onclick="filterTemplates('${escapeHtml(c)}',this)">${escapeHtml(c)}</button>`).join('');
  $('filterCat').innerHTML = `<option value="">كل المجالات</option>`+cats.map(c=>`<option>${escapeHtml(c)}</option>`).join('');
}
function filterTemplates(cat,btn){
  document.querySelectorAll('.catbtn').forEach(b=>b.classList.remove('active')); if(btn) btn.classList.add('active');
  renderTemplates(cat);
}
function renderTemplates(cat='الكل'){
  const list=cat==='الكل'?templates:templates.filter(t=>t.cat===cat);
  $('templates').innerHTML=list.map(t=>`<div class="template" onclick="chooseTemplate('${t.code}')"><b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.fields.slice(0,3).join(' · '))}</small><span class="tag">${escapeHtml(t.cat)}</span></div>`).join('');
}
function openCategory(cat){
  go('library');
  const buttons=[...document.querySelectorAll('.catbtn')];
  const btn=buttons.find(b=>b.textContent===cat);
  if(btn){ filterTemplates(cat,btn); btn.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}); }
}
function chooseTemplate(code){
  selected=templates.find(t=>t.code===code)||templates[0];
  $('chosen').textContent=`${selected.name} — ${selected.cat}`;
  $('title').value=selected.name; $('dept').value=selected.cat;
  $('dynamicFields').innerHTML=selected.fields.map((f,i)=>{
    const long = /وصف|أهداف|آلية|خطوات|نتائج|توصيات|ملاحظات|تحليل|المهام|المسؤوليات|الخطة|القرارات|الإجراءات|نقاط|الأثر|أسماء/.test(f);
    return `<div class="field ${long?'full':''}"><label>${escapeHtml(f)}</label>${long?`<textarea id="df_${i}" data-label="${escapeHtml(f)}"></textarea>`:`<input id="df_${i}" data-label="${escapeHtml(f)}">`}</div>`;
  }).join('');
  restoreDraft();
  go('create');
}

function draftKey(){ return `draft_${selected.code}`; }
function saveDraft(){
  const data={title:$('title').value,date:$('date').value,dept:$('dept').value,benef:$('benef').value,fields:{}};
  selected.fields.forEach((f,i)=>data.fields[f]=$(`df_${i}`)?.value||'');
  localStorage.setItem(draftKey(),JSON.stringify(data));
}
function restoreDraft(){
  const d=JSON.parse(localStorage.getItem(draftKey())||'null'); if(!d) return;
  $('title').value=d.title||selected.name; $('date').value=d.date||$('date').value; $('dept').value=d.dept||selected.cat; $('benef').value=d.benef||'';
  selected.fields.forEach((f,i)=>{ if($(`df_${i}`)) $(`df_${i}`).value=d.fields?.[f]||''; });
}
document.addEventListener('input',e=>{ if(e.target.closest('#create')) saveDraft(); });

function currentPayload(){
  const data={}; selected.fields.forEach((f,i)=>data[f]=($(`df_${i}`)?.value||'').trim());
  return {
    id: crypto.randomUUID(), type_code:selected.code, template:selected.name, cat:selected.cat,
    title:$('title').value.trim(), date:$('date').value, dept:$('dept').value.trim(),
    benef:Number($('benef').value)||0, data, attachmentNames:[...($('attachments').files||[])].map(f=>f.name)
  };
}
function localReportNumber(code){
  const year=new Date().getFullYear();
  const seq=String(reports.filter(r=>r.type_code===code && String(r.number||'').includes(`SCH-${year}-${code}`)).length+1).padStart(4,'0');
  return `SCH-${year}-${code}-${seq}`;
}

async function uploadAttachments(reportId,files){
  if(!useSupabase || !files.length) return [];
  const uploaded=[];
  for(const file of files){
    const safe=file.name.replace(/[^\w.\-]+/g,'_');
    const path=`${reportId}/${Date.now()}-${safe}`;
    const {error}=await db.storage.from(cfg.storageBucket).upload(path,file,{contentType:file.type||'application/octet-stream'});
    if(error){ console.warn(error); continue; }
    await db.from('report_attachments').insert({report_id:reportId,file_name:file.name,storage_path:path,mime_type:file.type,size_bytes:file.size});
    uploaded.push(file.name);
  }
  return uploaded;
}

async function saveReport(){
  const r=currentPayload();
  if(!r.title||!r.date){ toast('العنوان والتاريخ حقول إلزامية'); return; }
  const files=[...($('attachments').files||[])];
  if(useSupabase){
    const payload={type_code:r.type_code,template_name:r.template,category:r.cat,title:r.title,report_date:r.date,department:r.dept,beneficiaries_count:r.benef,payload:r.data};
    const {data,error}=await db.from('reports').insert(payload).select().single();
    if(error){ toast('تعذر الحفظ: '+error.message); return; }
    await uploadAttachments(data.id,files);
    currentReport={...r,id:data.id,number:data.report_number};
    await track('report_created',data.id);
    toast('تم حفظ التقرير في Supabase');
  }else{
    r.number=localReportNumber(r.type_code); r.created_at=new Date().toISOString();
    reports.unshift(r); localStorage.setItem('school_reports_records',JSON.stringify(reports)); currentReport=r;
    toast('تم حفظ التقرير على هذا الجهاز');
  }
  localStorage.removeItem(draftKey());
  await loadReports();
  previewReport(currentReport);
  go('preview');
}

function previewCurrent(){
  const r=currentPayload(); r.number=r.number||localReportNumber(r.type_code); currentReport=r;
  analytics.views++; localStorage.setItem('school_reports_analytics',JSON.stringify(analytics)); track('report_view');
  previewReport(r); go('preview');
}
function previewReport(r){
  $('pTitle').textContent=r.title||r.template; $('pNum').textContent=r.number||r.report_number||'—';
  $('pDate').textContent=r.date||r.report_date||'—'; $('pTemplate').textContent=r.template||r.template_name||'—';
  $('pCat').textContent=r.cat||r.category||'—'; $('pDept').textContent=r.dept||r.department||'—'; $('pBenef').textContent=r.benef??r.beneficiaries_count??0;
  const payload=r.data||r.payload||{};
  $('pFields').innerHTML=Object.entries(payload).filter(([,v])=>String(v||'').trim()).map(([k,v])=>`<div class="block"><h4>${escapeHtml(k)}</h4><p>${escapeHtml(v)}</p></div>`).join('')||'<div class="empty">لا توجد تفاصيل مدخلة.</div>';
  const names=r.attachmentNames||[];
  $('pAttachments').innerHTML=names.length?`<h4>الشواهد والمرفقات</h4><p>${names.map(escapeHtml).join(' • ')}</p>`:'';
}
async function openSaved(id){
  const r=reports.find(x=>String(x.id)===String(id)); if(!r) return;
  currentReport=r; analytics.views++; localStorage.setItem('school_reports_analytics',JSON.stringify(analytics)); await track('report_view',r.id);
  previewReport(r); go('preview');
}
async function printReport(){
  analytics.prints++; localStorage.setItem('school_reports_analytics',JSON.stringify(analytics)); await track('report_print',currentReport?.id||null); refreshMetrics(); window.print();
}
function renderArchive(){
  if(!$('archiveRows')) return;
  const q=($('search')?.value||'').trim().toLowerCase(), cat=$('filterCat')?.value||'', month=$('filterMonth')?.value||'';
  const list=reports.filter(r=>{
    const title=(r.title||'').toLowerCase(), num=(r.number||r.report_number||'').toLowerCase(), rc=r.cat||r.category||'', rd=r.date||r.report_date||'';
    return (!q||title.includes(q)||num.includes(q)) && (!cat||rc===cat) && (!month||rd.startsWith(month));
  });
  $('archiveCount').textContent=`${list.length} تقرير`;
  $('archiveRows').innerHTML=list.length?list.map(r=>`<tr><td>${escapeHtml(r.number||r.report_number||'—')}</td><td>${escapeHtml(r.title)}</td><td>${escapeHtml(r.template||r.template_name||'')}</td><td>${escapeHtml(r.cat||r.category||'')}</td><td>${escapeHtml(r.date||r.report_date||'')}</td><td>${r.benef??r.beneficiaries_count??0}</td><td><button class="btn secondary" onclick="openSaved('${r.id}')">عرض</button></td></tr>`).join(''):'<tr><td colspan="7" class="empty">لا توجد تقارير مطابقة.</td></tr>';
}

function refreshMetrics(){
  const month=new Date().toISOString().slice(0,7);
  const totalBenef=reports.reduce((s,r)=>s+Number(r.benef??r.beneficiaries_count??0),0);
  const monthCount=reports.filter(r=>String(r.date||r.report_date||'').startsWith(month)).length;
  const uses=analytics.views+analytics.prints;
  [['kReports',reports.length],['kMonth',monthCount],['kBenef',totalBenef],['kVisits',analytics.visits],['kUses',uses],['aReports',reports.length],['aBenef',totalBenef],['aVisits',analytics.visits],['aViews',analytics.views],['aPrints',analytics.prints],['aUses',uses]].forEach(([id,v])=>{if($(id))$(id).textContent=v});
  drawAllCharts();
}
function canvasPrep(id){
  const c=$(id); if(!c) return null; const dpr=devicePixelRatio||1; const rect=c.getBoundingClientRect();
  c.width=Math.max(300,rect.width*dpr); c.height=Math.max(180,rect.height*dpr); const ctx=c.getContext('2d'); ctx.scale(dpr,dpr); return {ctx,w:rect.width,h:rect.height};
}
function barChart(id,labels,values){
  const o=canvasPrep(id); if(!o)return; const {ctx,w,h}=o; ctx.clearRect(0,0,w,h); const max=Math.max(1,...values); const pad=30,gap=10,bw=(w-pad*2-gap*(labels.length-1))/Math.max(1,labels.length);
  values.forEach((v,i)=>{const bh=(h-65)*(v/max); const x=pad+i*(bw+gap),y=h-35-bh; const grad=ctx.createLinearGradient(0,y,0,h-35);grad.addColorStop(0,'#8BE0BF');grad.addColorStop(.55,'#35B9B0');grad.addColorStop(1,'#8C6DE8');ctx.fillStyle=grad;ctx.beginPath();ctx.roundRect(x,y,bw,bh,8);ctx.fill();ctx.fillStyle='#6F7F7A';ctx.font='10px Arial';ctx.textAlign='center';ctx.fillText(labels[i].slice(0,10),x+bw/2,h-14)});
}
function lineChart(id,labels,values){
  const o=canvasPrep(id); if(!o)return; const {ctx,w,h}=o; ctx.clearRect(0,0,w,h); const max=Math.max(1,...values),min=Math.min(0,...values); const pad=34;
  ctx.strokeStyle='#e3eee9';ctx.lineWidth=1;for(let i=0;i<4;i++){let y=pad+i*(h-pad*2)/3;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-pad,y);ctx.stroke()}
  const grad=ctx.createLinearGradient(pad,0,w-pad,0);grad.addColorStop(0,'#20A77E');grad.addColorStop(.55,'#35B9B0');grad.addColorStop(1,'#8C6DE8');ctx.strokeStyle=grad;ctx.lineWidth=4;ctx.beginPath();
  values.forEach((v,i)=>{let x=pad+i*((w-pad*2)/Math.max(1,values.length-1)), y=h-pad-((v-min)/(max-min||1))*(h-pad*2); if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();
}
function donutChart(id,vals){
  const o=canvasPrep(id); if(!o)return; const {ctx,w,h}=o;ctx.clearRect(0,0,w,h);const total=Math.max(1,vals.reduce((a,b)=>a+b,0)),colors=['#20A77E','#35B9B0','#8BE0BF','#8C6DE8'];let start=-Math.PI/2;const r=Math.min(w,h)*.32,cx=w/2,cy=h/2;
  vals.forEach((v,i)=>{const a=(v/total)*Math.PI*2;ctx.beginPath();ctx.arc(cx,cy,r,start,start+a);ctx.arc(cx,cy,r*.58,start+a,start,true);ctx.closePath();ctx.fillStyle=colors[i%colors.length];ctx.fill();start+=a});
  ctx.fillStyle='#2C5148';ctx.font='bold 18px Arial';ctx.textAlign='center';ctx.fillText(total,cx,cy+6);
}
function drawAllCharts(){
  const catCounts=cats.map(c=>reports.filter(r=>(r.cat||r.category)===c).length);
  barChart('catChart',cats,catCounts);barChart('catChart2',cats,catCounts);
  donutChart('useChart',[analytics.views,analytics.prints,reports.length,Math.max(0,analytics.visits-reports.length)]);
  const now=new Date(), months=[]; for(let i=5;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({key:d.toISOString().slice(0,7),label:d.toLocaleDateString('ar-SA',{month:'short'})});}
  const mv=months.map(m=>reports.filter(r=>String(r.date||r.report_date||'').startsWith(m.key)).length); lineChart('monthChart',months.map(m=>m.label),mv);lineChart('monthChart2',months.map(m=>m.label),mv);
  const top=templates.map(t=>({name:t.name,count:reports.filter(r=>(r.type_code||'')===t.code).length})).sort((a,b)=>b.count-a.count).slice(0,6);barChart('topChart',top.map(x=>x.name),top.map(x=>x.count));
}

renderHomeCategories(); renderCats(); renderTemplates();
$('date').value=new Date().toISOString().slice(0,10);
chooseTemplate(templates[0].code); go('home');
window.addEventListener('resize',()=>drawAllCharts());
initStorage();
