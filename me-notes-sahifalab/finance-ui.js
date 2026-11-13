(function(){
'use strict';
const F=window.MEFinanceCore,KEY='me_notes_finance_v1';
const $=id=>document.getElementById(id),fmt=F.money;
let state,blocked=false,editing=null,view='records',flashTimer;
function showError(message){$('error').textContent=message;$('error').classList.add('show');}
function notice(message){$('notice').textContent=message;$('notice').classList.add('show');clearTimeout(flashTimer);flashTimer=setTimeout(()=>$('notice').classList.remove('show'),6500);}
try {
 const raw=localStorage.getItem(KEY);
 state=raw?F.validate(JSON.parse(raw)):F.fresh();
 localStorage.setItem('__me_fin_test','1');localStorage.removeItem('__me_fin_test');
}catch(err){
 state=F.fresh();blocked=true;showError('Moliya xotirasini xavfsiz o‘qishning imkoni bo‘lmadi. Mavjud ma’lumotlar ustiga yozilmaydi. Qurilma saqlash ruxsatini tekshiring.');
}
function commit(){
 if(blocked){showError('Xotira xatosi: saqlash to‘xtatildi.');return false;}
 try{localStorage.setItem(KEY,JSON.stringify(state));return true;}
 catch(err){showError('Xotiraga yozib bo‘lmadi. Brauzer xotirasini tekshiring.');return false;}
}
function active(){return F.current(state);}
function month(){return $('month').value||F.today().slice(0,7);}
function asOption(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;return el;}
function picker(show){$('pick').classList.toggle('hidden',!show);}
function renderWorkspaces(){
 const w=active();
 $('workspace-controls').classList.toggle('hidden',!w);
 $('main-content').classList.toggle('hidden',!w);
 picker(!w);
 const select=$('workspace');select.replaceChildren(...state.workspaces.map(x=>asOption(x.id,x.name+' • '+F.KINDS[x.kind])));
 if(w){select.value=w.id;$('workspace-kind').textContent=F.KINDS[w.kind];}
}
function categoryOptions(){
 const w=active();if(!w)return;
 const kind=$('kind').value,selected=$('category').value;
 $('category').replaceChildren(...w.categories[kind].map(c=>asOption(c,c)));
 if(w.categories[kind].includes(selected))$('category').value=selected;
}
function renderTransactions(){
 const w=active();if(!w)return;
 const box=$('tx-list'),transactions=F.summary(w,month()).transactions;
 box.replaceChildren();
 if(!transactions.length){const empty=document.createElement('p');empty.className='small';empty.textContent='Bu oyda hozircha operatsiya yo‘q.';box.append(empty);return;}
 for(const t of transactions){
  const line=document.createElement('div');line.className='line row split';
  const a=document.createElement('div'),b=document.createElement('div');
  const h=document.createElement('strong');h.textContent=t.category;a.append(h);
  const meta=document.createElement('div');meta.className='small';meta.textContent=t.date+(t.note?' · '+t.note:'');a.append(meta);
  const sum=document.createElement('div');sum.className=t.kind==='income'?'positive':'negative';sum.style.fontWeight='800';sum.textContent=(t.kind==='income'?'+':'−')+fmt(t.amount);b.append(sum);
  for(const [act,text] of [['edit','Tahrir'],['remove','O‘chirish']]){const btn=document.createElement('button');btn.type='button';btn.className=act==='remove'?'danger':'alt';btn.style.cssText='font-size:11px;min-height:30px;padding:6px 8px;margin:5px 0 0 4px';btn.dataset.action=act;btn.dataset.id=t.id;btn.textContent=text;b.append(btn);}
  line.append(a,b);box.append(line);
 }
}
function renderBudgets(){
 const w=active();if(!w)return;
 const target=$('budget-list');target.replaceChildren();
 const info=F.summary(w,month());
 for(const item of info.budgets){
  const line=document.createElement('div');line.className='line';
  const head=document.createElement('div');head.className='row split';
  const name=document.createElement('strong');name.textContent=item.category;head.append(name);
  const used=document.createElement('span');used.className='small';used.textContent=fmt(item.spent)+(item.limit?' / '+fmt(item.limit):' · limit belgilanmagan');head.append(used);line.append(head);
  const bar=document.createElement('div');bar.className='bar';bar.style.margin='8px 0';
  const fill=document.createElement('div');fill.className='fill';fill.style.width=item.limit?Math.min(100,item.spent/item.limit*100)+'%':'0%';if(item.limit&&item.spent>=item.limit)fill.style.background='#c54b3e';bar.append(fill);line.append(bar);
  const row=document.createElement('div');row.className='row';
  const input=document.createElement('input');input.type='number';input.inputMode='numeric';input.min='0';input.step='1';input.max='1000000000000';input.value=item.limit||0;input.setAttribute('aria-label',item.category+' limiti');input.style.maxWidth='180px';
  const button=document.createElement('button');button.type='button';button.className='alt';button.textContent='Limitni saqlash';
  button.addEventListener('click',()=>{try{F.setBudget(w,month(),item.category,Number(input.value));if(commit()){renderBudgets();notice('Limit saqlandi ✓');}}catch(e){notice(e.message);}});
  row.append(input,button);line.append(row);target.append(line);
 }
}
function renderReport(){
 const w=active();if(!w)return;
 const s=F.summary(w,month());
 $('sum-income').textContent=fmt(s.income);$('sum-expense').textContent=fmt(s.expense);$('sum-net').textContent=fmt(s.net);
 $('sum-net').className='money '+(s.net<0?'negative':'positive');
 const target=$('report-categories');target.replaceChildren();
 for(const item of s.budgets.filter(x=>x.spent||x.limit)){
  const line=document.createElement('div');line.className='line row split';
  const label=document.createElement('span');label.textContent=item.category;
  const value=document.createElement('strong');value.textContent=fmt(item.spent)+(item.limit?' / '+fmt(item.limit):'');
  line.append(label,value);target.append(line);
 }
 if(!target.children.length){const p=document.createElement('p');p.className='small';p.textContent='Hali xarajat yoki limit yo‘q.';target.append(p);}
}
function render(){renderWorkspaces();if(!active())return;categoryOptions();renderTransactions();renderBudgets();renderReport();}
function setView(next){
 view=next;
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
 for(const name of ['records','budgets','report','settings'])$('view-'+name).classList.toggle('hidden',name!==next);
}
function resetForm(){
 editing=null;$('entry-form').reset();$('kind').value='expense';$('date').value=F.today();
 $('entry-title').textContent='Yozuvni qo‘lda kiritish';$('entry-submit').textContent='Yozuvni saqlash';$('cancel-edit').classList.add('hidden');categoryOptions();
}
function safeAction(action){try{if(blocked)throw Error('Ma’lumot xotirasi ishlamayapti');action();}catch(e){notice(e.message||'Xatolik yuz berdi');}}
document.querySelectorAll('[data-new]').forEach(btn=>btn.addEventListener('click',()=>safeAction(()=>{
 const kind=btn.dataset.new;const title=F.KINDS[kind];
 const name=$('workspace-name').value.trim()||title;
 F.create(state,kind,name);if(commit()){$('workspace-name').value='';picker(false);resetForm();render();setView('records');notice('Hisob ochildi: '+(active()?.name||title));}
})));
$('new-workspace').addEventListener('click',()=>picker(!$('pick').classList.contains('hidden')));
$('workspace').addEventListener('change',()=>safeAction(()=>{F.setActive(state,$('workspace').value);if(commit()){resetForm();render();setView('records');notice('Hisob almashtirildi');}}));
$('month').value=F.today().slice(0,7);
$('month').addEventListener('change',()=>{if(!F.validMonth(month())){$('month').value=F.today().slice(0,7);}render();});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
$('kind').addEventListener('change',categoryOptions);
$('quick-form').addEventListener('submit',e=>{e.preventDefault();safeAction(()=>{
 const w=active();const parsed=F.parseFast($('quick-text').value);
 if(!parsed)throw Error('Misol: 25000 taksi yoki +3000000 oylik');
 const result=F.addTransaction(w,{...parsed,date:F.today()});
 if(commit()){$('quick-text').value='';render();notice('Yozuv saqlandi ✓ '+(result.alert||''));}
});});
$('entry-form').addEventListener('submit',e=>{e.preventDefault();safeAction(()=>{
 const w=active();const values={kind:$('kind').value,date:$('date').value,amount:Number($('amount').value),category:$('category').value,note:$('note').value};
 if(editing){F.editTransaction(w,editing,values);if(commit()){resetForm();render();notice('Yozuv tahrirlandi ✓');}}
 else {const result=F.addTransaction(w,values);if(commit()){resetForm();render();notice('Yozuv saqlandi ✓ '+(result.alert||''));}}
});});
$('cancel-edit').addEventListener('click',resetForm);
$('tx-list').addEventListener('click',e=>safeAction(()=>{
 const b=e.target.closest('button');if(!b)return;
 const w=active();const t=w.transactions.find(t=>t.id===b.dataset.id);if(!t)return;
 if(b.dataset.action==='remove'){if(!confirm('Shu yozuvni o‘chirilsinmi?'))return;F.removeTransaction(w,t.id);if(commit()){render();notice('Yozuv o‘chirildi');}}
 else if(b.dataset.action==='edit'){editing=t.id;setView('records');$('kind').value=t.kind;categoryOptions();$('category').value=t.category;$('date').value=t.date;$('amount').value=t.amount;$('note').value=t.note;$('entry-title').textContent='Yozuvni tahrirlash';$('entry-submit').textContent='O‘zgarishni saqlash';$('cancel-edit').classList.remove('hidden');$('entry-form').scrollIntoView({behavior:'smooth'});}
}));
$('category-form').addEventListener('submit',e=>{e.preventDefault();safeAction(()=>{
 F.addCategory(active(),$('new-cat-kind').value,$('new-cat-name').value);
 if(commit()){$('new-cat-name').value='';render();notice('Kategoriya qo‘shildi ✓');}
});});
function download(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2500);}
$('export-json').addEventListener('click',()=>safeAction(()=>{download(JSON.stringify(F.validate(state),null,2),'application/json;charset=utf-8','me_notes_moliya_'+F.today()+'.json');notice('JSON zaxira tayyor');}));
$('export-csv').addEventListener('click',()=>safeAction(()=>{download(F.csv(active()),'text/csv;charset=utf-8','me_notes_'+active().kind+'_'+month()+'.csv');notice('CSV yuklandi');}));
$('import-json').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{
 if(blocked)throw Error('Xotira bloklangan');if(file.size>8*1024*1024)throw Error('Fayl katta');
 const next=F.validate(JSON.parse(await file.text()));
 if(!confirm('Moliya hisoblaridagi hozirgi ma’lumotlar zaxira bilan ALMASHTIRILADI. Davom etasizmi?'))return;
 if(!confirm('Bu amal boshqa mavjud moliya hisoblarini ham almashtiradi. Tasdiqlaysizmi?'))return;
 const old=state;state=next;if(commit()){render();resetForm();notice('Moliya zaxirasi tiklandi');}else state=old;
 }catch(err){notice('Tiklash xatosi: '+err.message);}finally{e.target.value='';}});
$('delete-workspace').addEventListener('click',()=>safeAction(()=>{
 const w=active();if(!w)return;
 if(!confirm('Faqat "'+w.name+'" moliya hisobini o‘chirilsinmi?'))return;
 if(!confirm('Bu hisobdagi barcha yozuvlar, limitlar va kategoriyalar butunlay o‘chiriladi. Tasdiqlaysizmi?'))return;
 const previous=state;state=F.validate(state);state.workspaces=state.workspaces.filter(x=>x.id!==w.id);state.active=state.workspaces[0]?.id||null;
 if(commit()){resetForm();render();setView('records');notice('Hisob o‘chirildi');}else state=previous;
}));
resetForm();render();setView('records');
})();
