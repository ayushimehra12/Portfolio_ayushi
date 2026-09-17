const cfg = window.KARO_CONFIG || {};
const hasSupabase = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('PASTE_');
const sb = hasSupabase ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

const state = { boards: [], board: null, columns: [], cards: [], people: ['AY','SA'], search:'', group:'none', dark:false, realtime:null };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const slugify = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || 'board';
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(window._toast);window._toast=setTimeout(()=>t.classList.remove('show'),2200)}
function saveLocal(){localStorage.setItem('karo-state',JSON.stringify({boards:state.boards,board:state.board,columns:state.columns,cards:state.cards,people:state.people}))}
function loadLocal(){try{const x=JSON.parse(localStorage.getItem('karo-state'));if(x){Object.assign(state,x);return true}}catch{}return false}

async function dbInsert(table, row){const {data,error}=await sb.from(table).insert(row).select().single();if(error)throw error;return data}
async function dbUpdate(table,id,row){const {data,error}=await sb.from(table).update(row).eq('id',id).select().single();if(error)throw error;return data}
async function dbDelete(table,id){const {error}=await sb.from(table).delete().eq('id',id);if(error)throw error}

async function init(){
  $('userName').value=localStorage.getItem('karo-user')||'name';
  $('userName').addEventListener('change',()=>localStorage.setItem('karo-user',$('userName').value||'name'));
  const local=loadLocal();
  if(sb){
    try{await loadDb(); setupRealtime(); toast('Shared sync connected')}catch(e){console.error(e);toast('Could not connect — using local mode')} 
  } else if(!local){seedLocal();}
  render();
}
function seedLocal(){state.boards=[{id:'local-1',name:'Sam & Ayushi',slug:'sam-ayushi'}];state.board=state.boards[0];state.columns=[{id:'c1',name:'TO DO',position:0},{id:'c2',name:'IN PROGRESS',position:1},{id:'c3',name:'IN REVIEW',position:2},{id:'c4',name:'DONE',position:3}];state.cards=[{id:'a1',column_id:'c1',title:'Write the MVP PRD',tag:'Planning',priority:'High',points:3,assignee:'AY',starred:true,position:0},{id:'a2',column_id:'c1',title:'Vibe-code a prototype',tag:'Build',priority:'Medium',points:5,assignee:'SA',starred:false,position:1}];state.people=['AY','SA'];saveLocal()}
async function loadDb(){
  const slug=(new URLSearchParams(location.search).get('board')||'sam-ayushi').toLowerCase();
  let {data:boards,error}=await sb.from('boards').select('*').order('created_at'); if(error)throw error;
  if(!boards.length){const b=await dbInsert('boards',{name:'Sam & Ayushi',slug:'sam-ayushi'});boards=[b]}
  let board=boards.find(x=>x.slug===slug)||boards[0];
  state.boards=boards;state.board=board;
  const [cs, cards]=await Promise.all([sb.from('columns').select('*').eq('board_id',board.id).order('position'),sb.from('cards').select('*').eq('board_id',board.id).order('position')]);
  if(cs.error)throw cs.error;if(cards.error)throw cards.error;
  state.columns=cs.data;state.cards=cards.data;
  if(!state.columns.length){await seedDbBoard(board);return loadDb()}
  state.people=[...new Set(state.cards.map(c=>c.assignee).filter(Boolean))].slice(0,6); if(state.people.length<2)state.people=['AY','SA',...state.people].filter((x,i,a)=>a.indexOf(x)===i).slice(0,6);
}
async function seedDbBoard(board){for(const [i,n] of ['TO DO','IN PROGRESS','IN REVIEW','DONE'].entries())await dbInsert('columns',{board_id:board.id,name:n,position:i})}
function setupRealtime(){if(state.realtime)sb.removeChannel(state.realtime);state.realtime=sb.channel('karo-'+state.board.id).on('postgres_changes',{event:'*',schema:'public',table:'cards',filter:`board_id=eq.${state.board.id}`},()=>loadDb().then(render)).on('postgres_changes',{event:'*',schema:'public',table:'columns',filter:`board_id=eq.${state.board.id}`},()=>loadDb().then(render)).subscribe()}

function render(){
  $('boardName').textContent=state.board?.name||'Board';
  $('boardList').innerHTML=state.boards.map(b=>`<button class="board-link ${b.id===state.board?.id?'active':''}" data-board="${b.id}">${esc(b.name)}</button>`).join('');
  document.querySelectorAll('[data-board]').forEach(b=>b.onclick=()=>switchBoard(b.dataset.board));
  $('people').innerHTML=state.people.slice(0,5).map(p=>`<span class="person">${esc(p.slice(0,2).toUpperCase())}</span>`).join('');
  const q=state.search.toLowerCase();
  const visible=state.cards.filter(c=>!q||c.title.toLowerCase().includes(q)||String(c.tag).toLowerCase().includes(q)||String(c.assignee).toLowerCase().includes(q));
  $('board').innerHTML=state.columns.sort((a,b)=>a.position-b.position).map(col=>renderColumn(col,visible)).join('');
  bindBoardActions();
}
function renderColumn(col, cards){
  let list=cards.filter(c=>c.column_id===col.id).sort((a,b)=>a.position-b.position);
  if(state.group!=='none')list.sort((a,b)=>String(a[state.group]).localeCompare(String(b[state.group])));
  return `<div class="column" data-column="${col.id}"><div class="column-header"><span>${esc(col.name)}</span><span class="count">${list.length}</span><button class="header-x" data-delete-column="${col.id}" title="Delete column">×</button></div><div class="card-list" data-drop-column="${col.id}">${list.map(renderCard).join('')||'<div class="empty">No cards</div>'}</div><button class="add-card" data-add-card="${col.id}">＋ Add card</button></div>`
}
function renderCard(c){const tagClass=String(c.tag).toLowerCase().replace(/\s+/g,'-');const pri=String(c.priority).toLowerCase();return `<article class="card" draggable="true" data-card="${c.id}"><button class="star ${c.starred?'active':''}" data-star="${c.id}" title="Star">${c.starred?'★':'☆'}</button><div class="card-title" data-edit-card="${c.id}">${esc(c.title)}</div><div class="pills"><span class="pill tag ${tagClass}">${esc(c.tag)}</span><span class="pill ${pri}">${esc(c.priority)}</span></div><div class="card-bottom"><span class="card-id">${esc(c.id.slice(0,4).toUpperCase())}</span><select class="status" data-status="${c.id}">${state.columns.map(col=>`<option value="${col.id}" ${col.id===c.column_id?'selected':''}>${esc(titleCase(col.name))}</option>`).join('')}</select><span class="points">${c.points} pts</span><span class="assignee">${esc((c.assignee||'?').slice(0,2).toUpperCase())}</span></div></article>`}
function titleCase(s){return s.toLowerCase().replace(/\b\w/g,m=>m.toUpperCase())}
function bindBoardActions(){
  document.querySelectorAll('[data-add-card]').forEach(x=>x.onclick=()=>openCardModal(null,x.dataset.addCard));
  document.querySelectorAll('[data-edit-card]').forEach(x=>x.ondblclick=()=>openCardModal(x.dataset.editCard));
  document.querySelectorAll('[data-star]').forEach(x=>x.onclick=()=>toggleStar(x.dataset.star));
  document.querySelectorAll('[data-status]').forEach(x=>x.onchange=()=>moveCard(x.dataset.status,x.value));
  document.querySelectorAll('[data-delete-column]').forEach(x=>x.onclick=()=>deleteColumn(x.dataset.deleteColumn));
  document.querySelectorAll('.card').forEach(card=>{card.addEventListener('dragstart',e=>{card.classList.add('dragging');e.dataTransfer.setData('text/plain',card.dataset.card)});card.addEventListener('dragend',()=>card.classList.remove('dragging'))});
  document.querySelectorAll('[data-drop-column]').forEach(zone=>{zone.addEventListener('dragover',e=>e.preventDefault());zone.addEventListener('drop',async e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');await moveCard(id,zone.dataset.dropColumn)})});
}
async function moveCard(id,column_id){const c=state.cards.find(x=>x.id===id);if(!c)return;c.column_id=column_id;c.position=state.cards.filter(x=>x.column_id===column_id).length;render();if(sb){try{await dbUpdate('cards',id,{column_id,position:c.position,updated_at:new Date().toISOString()})}catch(e){toast('Could not save move')}}else saveLocal()}
async function toggleStar(id){const c=state.cards.find(x=>x.id===id);c.starred=!c.starred;render();if(sb)await dbUpdate('cards',id,{starred:c.starred,updated_at:new Date().toISOString()});else saveLocal()}
async function deleteColumn(id){if(state.columns.length<=1)return toast('Keep at least one column');if(!confirm('Delete this column and its cards?'))return;const cards=state.cards.filter(c=>c.column_id===id);state.cards=state.cards.filter(c=>c.column_id!==id);state.columns=state.columns.filter(c=>c.id!==id);state.columns.forEach((c,i)=>c.position=i);render();if(sb){try{await dbDelete('columns',id)}catch(e){toast('Could not delete column')}}else saveLocal()}

function openCardModal(id=null,columnId=null){const c=id?state.cards.find(x=>x.id===id):null;$('modalTitle').textContent=c?'Edit card':'Add card';$('cardId').value=c?.id||'';$('cardTitle').value=c?.title||'';$('cardTag').value=c?.tag||'Planning';$('cardPriority').value=c?.priority||'Medium';$('cardPoints').value=c?.points??3;$('cardAssignee').value=c?.assignee||$('userName').value.slice(0,2).toUpperCase();$('cardColumn').innerHTML=state.columns.map(col=>`<option value="${col.id}" ${col.id===(c?.column_id||columnId||state.columns[0]?.id)?'selected':''}>${esc(col.name)}</option>`).join('');$('modalBackdrop').classList.remove('hidden');setTimeout(()=>$('cardTitle').focus(),20)}
function closeModal(){$('modalBackdrop').classList.add('hidden')}
$('cardForm').onsubmit=async e=>{e.preventDefault();const id=$('cardId').value;const payload={title:$('cardTitle').value.trim(),tag:$('cardTag').value,priority:$('cardPriority').value,points:Number($('cardPoints').value)||0,assignee:$('cardAssignee').value.trim().toUpperCase(),column_id:$('cardColumn').value,updated_at:new Date().toISOString()};if(!payload.title)return;if(id){const c=state.cards.find(x=>x.id===id);Object.assign(c,payload);render();if(sb)await dbUpdate('cards',id,payload)}else{const position=state.cards.filter(c=>c.column_id===payload.column_id).length;const local={id:crypto.randomUUID(),...payload,board_id:state.board.id,starred:false,position,created_at:new Date().toISOString()};if(sb){try{const saved=await dbInsert('cards',{board_id:state.board.id,title:payload.title,tag:payload.tag,priority:payload.priority,points:payload.points,assignee:payload.assignee,column_id:payload.column_id,starred:false,position});state.cards.push(saved)}catch(err){toast('Could not save card');return}}else state.cards.push(local)}closeModal();render();if(!sb)saveLocal()}
$('modalClose').onclick=closeModal;$('modalBackdrop').onclick=e=>{if(e.target===$('modalBackdrop'))closeModal()};document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
$('searchInput').oninput=e=>{state.search=e.target.value;render()};$('groupBy').onchange=e=>{state.group=e.target.value;render()};
$('addColumnBtn').onclick=async()=>{const name=prompt('Column name');if(!name?.trim())return;const position=state.columns.length; if(sb){try{const c=await dbInsert('columns',{board_id:state.board.id,name:name.trim().toUpperCase(),position});state.columns.push(c)}catch(e){toast('Could not add column');return}}else state.columns.push({id:crypto.randomUUID(),name:name.trim().toUpperCase(),position});render();if(!sb)saveLocal()}
$('newBoardBtn').onclick=async()=>{const name=prompt('New board name');if(!name?.trim())return;const slug=slugify(name)+'-'+Math.random().toString(36).slice(2,6);if(sb){try{const b=await dbInsert('boards',{name:name.trim(),slug});for(const [i,n] of ['TO DO','IN PROGRESS','IN REVIEW','DONE'].entries())await dbInsert('columns',{board_id:b.id,name:n,position:i});location.search='?board='+encodeURIComponent(slug)}catch(e){toast('Could not create board')}}else{const b={id:crypto.randomUUID(),name:name.trim(),slug};state.boards.push(b);state.board=b;state.columns=['TO DO','IN PROGRESS','IN REVIEW','DONE'].map((n,i)=>({id:crypto.randomUUID(),name:n,position:i}));state.cards=[];saveLocal();render()}}
$('addPersonBtn').onclick=()=>{const p=prompt('Enter initials/name for a teammate');if(p?.trim()){state.people=[...new Set([...state.people,p.trim().slice(0,2).toUpperCase()])];render();if(!sb)saveLocal();toast('Teammate added to this browser view')}}
$('profileBtn').onclick=()=>{const n=prompt('Your name',localStorage.getItem('karo-user')||'name');if(n!==null){localStorage.setItem('karo-user',n);$('userName').value=n;toast('Profile updated')}}
$('shareBtn').onclick=async()=>{const url=location.href;try{await navigator.clipboard.writeText(url);toast('Share link copied')}catch{prompt('Copy this share link',url)}};
$('presenceBtn').onclick=()=>toast(sb?'Live shared board — refresh to see connected changes':'Local demo mode — connect Supabase for sharing');
$('themeBtn').onclick=()=>{document.body.classList.toggle('dark');localStorage.setItem('karo-dark',document.body.classList.contains('dark')?'1':'0')};
$('exportBtn').onclick=()=>{const out={board:state.board,columns:state.columns,cards:state.cards};const blob=new Blob([JSON.stringify(out,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=slugify(state.board.name)+'.json';a.click();URL.revokeObjectURL(a.href)};
$('templateBtn').onclick=()=>toast('Template saved locally in this version');
async function switchBoard(id){const b=state.boards.find(x=>x.id===id);if(!b)return;if(sb){const u=new URL(location.href);u.searchParams.set('board',b.slug);location.href=u.toString()}else{state.board=b;state.columns=[];state.cards=[];render();toast('Local board created separately in this browser')}}
if(localStorage.getItem('karo-dark')==='1')document.body.classList.add('dark');
init();
