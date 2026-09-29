(() => {
"use strict";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const state={service:{name:"Consulta",price:75,duration:"1h",desc:"Você pode remarcar pelo mesmo WhatsApp, com antecedência."},date:null,time:null,month:new Date(),client:null,step:1};
const months=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const days=["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
const pad=n=>String(n).padStart(2,"0");
const key=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const niceDate=d=>`${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
let toastTimer;
function toast(msg){$("#toast").textContent=msg;$("#toast").classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").classList.remove("show"),2600)}
function setStep(n){
 state.step=n;
 for(let i=1;i<=4;i++){
  $(`#step${i}`).classList.toggle("hidden",i!==n);
  const p=$(`[data-progress="${i}"]`);p.classList.toggle("active",i===n);p.classList.toggle("done",i<n);
 }
 $("#stepKicker").textContent=`PASSO ${n} DE 4`;$("#stepPercent").textContent=`${n*25}%`;$("#progressBar").style.width=`${n*25}%`;
}
$$(".service-option").forEach(btn=>btn.addEventListener("click",()=>{
 $$(".service-option").forEach(b=>b.classList.remove("chosen"));btn.classList.add("chosen");
 state.service={name:btn.dataset.name,price:+btn.dataset.price,duration:btn.dataset.duration,desc:btn.dataset.desc};
}));
$("#next1").addEventListener("click",()=>{setStep(2);renderCalendar();});
$("#back1").addEventListener("click",()=>setStep(1));$("#changeService").addEventListener("click",()=>setStep(1));
$("#prevMonth").addEventListener("click",()=>{
 const now=new Date();now.setHours(0,0,0,0);
 const prev=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);
 if(prev.getFullYear()>now.getFullYear()||(prev.getFullYear()===now.getFullYear()&&prev.getMonth()>=now.getMonth()))state.month=prev;
 else toast("Este mês já é o primeiro disponível.");
 renderCalendar();
});
$("#nextMonth").addEventListener("click",()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);renderCalendar()});
function renderCalendar(){
 const y=state.month.getFullYear(),m=state.month.getMonth(),first=new Date(y,m,1),offset=(first.getDay()+6)%7,total=new Date(y,m+1,0).getDate();
 $("#monthLabel").textContent=months[m][0].toUpperCase()+months[m].slice(1)+" "+y;
 const grid=$("#calendarGrid");grid.innerHTML="";
 for(let i=0;i<offset;i++)grid.append(document.createElement("span"));
 const today=new Date();today.setHours(0,0,0,0);
 for(let n=1;n<=total;n++){
  const d=new Date(y,m,n);d.setHours(0,0,0,0);
  const b=document.createElement("button");b.type="button";b.textContent=n;
  b.disabled=d<today||d.getDay()===0;
  if(!b.disabled)b.classList.add("available");
  if(key(d)===key(today))b.classList.add("today");
  if(state.date&&key(d)===key(state.date))b.classList.add("selected");
  b.setAttribute("aria-label",`${n} de ${months[m]}${b.disabled?", indisponível":", disponível"}`);
  b.addEventListener("click",()=>{state.date=d;state.time=null;renderCalendar();renderTimes();$("#next2").disabled=true});
  grid.append(b);
 }
}
function renderTimes(){
 if(!state.date){$("#selectedDateLabel").textContent="Selecione uma data";$("#timesSub").textContent="Horários para atendimento";$("#timeGrid").innerHTML='<div class="time-placeholder">Primeiro, escolha uma data no calendário.</div>';return}
 $("#selectedDateLabel").textContent=`${days[state.date.getDay()]}, ${state.date.getDate()} de ${months[state.date.getMonth()]}`;
 $("#timesSub").textContent="Escolha um horário disponível";
 $("#durationLabel").textContent=state.service.duration;
 const all=["09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30"];
 const seed=state.date.getDate()+state.date.getMonth();
 const slots=all.filter((_,i)=>(i+seed)%6!==0);
 const grid=$("#timeGrid");grid.innerHTML="";
 slots.forEach(t=>{const b=document.createElement("button");b.type="button";b.textContent=t;b.classList.toggle("selected",state.time===t);b.setAttribute("aria-pressed",String(state.time===t));b.addEventListener("click",()=>{state.time=t;renderTimes();$("#next2").disabled=false});grid.append(b)});
}
$("#next2").addEventListener("click",()=>{if(!state.date||!state.time)return;setStep(3)});
$("#back2").addEventListener("click",()=>setStep(2));
$("#phone").addEventListener("input",e=>{let v=e.target.value.replace(/\D/g,"").slice(0,11);if(v.length>10)v=v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/,"($1) $2-$3");else if(v.length>6)v=v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/,"($1) $2-$3");else if(v.length>2)v=v.replace(/^(\d{2})(\d{0,5})/,"($1) $2");else if(v)v="("+v;e.target.value=v});
$("#detailsForm").addEventListener("submit",e=>{e.preventDefault();const name=$("#fullName").value.trim(),phone=$("#phone").value.trim();if(name.length<2){toast("Informe seu nome.");$("#fullName").focus();return}if(phone.replace(/\D/g,"").length<10){toast("Informe um WhatsApp válido.");$("#phone").focus();return}
 state.client={name,phone,email:$("#email").value.trim(),notes:$("#notes").value.trim()};renderReview();setStep(4);
});
function money(v){return v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function renderReview(){
 $("#reviewService").textContent=state.service.name;$("#reviewDuration").textContent=state.service.duration+" de duração";
 $("#reviewDate").textContent=niceDate(state.date);$("#reviewTime").textContent=state.time;$("#reviewName").textContent=state.client.name;$("#reviewPhone").textContent=state.client.phone;$("#reviewPrice").textContent=money(state.service.price);
 $("#reviewEmailRow").classList.toggle("hidden",!state.client.email);$("#reviewEmail").textContent=state.client.email;
 $("#reviewNotesRow").classList.toggle("hidden",!state.client.notes);$("#reviewNotes").textContent=state.client.notes;
}
$("#editService").addEventListener("click",()=>setStep(1));$("#back3").addEventListener("click",()=>setStep(3));
$("#confirm").addEventListener("click",async()=>{
 const btn=$("#confirm");btn.disabled=true;btn.textContent="Enviando…";
 const payload={service:state.service.name,price:state.service.price,duration:state.service.duration,date:key(state.date),time:state.time,client:state.client,source:"iris-booking",createdAt:new Date().toISOString()};
 const WEBHOOK_URL="";
 try{
  if(WEBHOOK_URL){const r=await fetch(WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});if(!r.ok)throw new Error("webhook")}
  else{const k="iris-demo-bookings";const arr=JSON.parse(localStorage.getItem(k)||"[]");arr.push(payload);localStorage.setItem(k,JSON.stringify(arr))}
  $("#successName").textContent=state.client.name.split(" ")[0];$("#successWhen").textContent=`${niceDate(state.date)} · ${state.time}`;$("#successService").textContent=state.service.name;
  $("#successMessage").textContent=WEBHOOK_URL?"A primeira conversa serve para entender o que você busca neste momento.":"Sua solicitação foi registrada neste navegador em modo demonstração. Para receber reservas de clientes, conecte o webhook do seu sistema.";
  $("#step4").classList.add("hidden");$("#successView").classList.remove("hidden");
  $$(".progress-item").forEach(p=>{p.classList.remove("active");p.classList.add("done")});
 }catch(e){toast("Não foi possível enviar. Tente novamente.")}
 finally{btn.disabled=false;btn.innerHTML="Confirmar agendamento <span>✓</span>"}
});
$("#restart").addEventListener("click",()=>{state.date=null;state.time=null;state.client=null;state.month=new Date();$("#detailsForm").reset();$("#successView").classList.add("hidden");$("#step1").classList.remove("hidden");$$(".progress-item").forEach(p=>p.classList.remove("done","active"));setStep(1);$("#next2").disabled=true;renderCalendar();renderTimes();window.scrollTo({top:0,behavior:"smooth"})});
function contact(){toast("Não prometemos resultado em uma sessão. O cuidado é contínuo.")}
$("#helpButton").addEventListener("click",contact);$("#contactButton").addEventListener("click",contact);
$("#year").textContent=new Date().getFullYear();
renderCalendar();renderTimes();
})();