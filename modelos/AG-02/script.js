// MODELO 2 — personalize a URL e, se necessário, os serviços/horários abaixo.
const WEBHOOK_URL = "https://SEU-WEBHOOK-AQUI";
const SERVICES = [
  {name:"Retorno",price:60,duration:45},
  {name:"Encontro",price:70,duration:60},
  {name:"Sessão",price:40,duration:30},
  {name:"Orientação",price:50,duration:45},
  {name:"Plantão",price:120,duration:120},
  {name:"Consulta",price:80,duration:60},
  {name:"Avaliação",price:40,duration:30},
  {name:"Acolhida",price:100,duration:60}
];
const TIMES=["08:00","09:00","10:00","11:00","13:30","14:30","15:00","16:30","18:00"];
const $=id=>document.getElementById(id);
const today=new Date(); today.setHours(0,0,0,0);
let month=new Date(today.getFullYear(),today.getMonth(),1), date="", time="", service=SERVICES[0];

function key(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function fromKey(k){const [y,m,d]=k.split("-").map(Number);return new Date(y,m-1,d)}
function money(n){return n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function dateText(k,opts={day:"2-digit",month:"long",year:"numeric"}){return fromKey(k).toLocaleDateString("pt-BR",opts)}
function available(d){return d>=today&&d.getDay()!==0}
function message(text,type){$("message").textContent=text;$("message").className=`message show ${type}`}
function clearMessage(){$("message").className="message";$("message").textContent=""}

function renderCalendar(){
  const label=month.toLocaleDateString("pt-BR",{month:"long",year:"numeric"});
  $("monthLabel").textContent=label[0].toUpperCase()+label.slice(1);
  $("days").innerHTML="";
  const y=month.getFullYear(),m=month.getMonth(),offset=new Date(y,m,1).getDay(),count=new Date(y,m+1,0).getDate();
  for(let i=0;i<offset;i++){const blank=document.createElement("span");$("days").appendChild(blank)}
  for(let n=1;n<=count;n++){
    const d=new Date(y,m,n),k=key(d),b=document.createElement("button");
    b.type="button";b.className="day";b.textContent=n;b.disabled=!available(d);
    b.setAttribute("aria-label",dateText(k));b.setAttribute("aria-pressed",String(k===date));
    if(available(d))b.classList.add("available");if(k===key(today))b.classList.add("today");if(k===date)b.classList.add("selected");
    b.addEventListener("click",()=>{date=k;time="";clearMessage();renderCalendar();renderSlots();summary()});
    $("days").appendChild(b);
  }
  $("prevMonth").disabled=y===today.getFullYear()&&m<=today.getMonth();
  $("prevMonth").style.opacity=$("prevMonth").disabled?".35":"1";
}
function renderSlots(){
  $("slots").innerHTML="";
  if(!date){$("slotDate").textContent="Selecione uma data";$("slots").innerHTML='<p class="empty">O calendário mostra as datas disponíveis.</p>';return}
  $("slotDate").textContent=dateText(date,{weekday:"short",day:"numeric",month:"short"});
  const options=TIMES.filter(t=>{const [h,min]=t.split(":").map(Number),d=fromKey(date);d.setHours(h,min,0,0);return fromKey(date)>today||d>new Date()});
  if(!options.length){$("slots").innerHTML='<p class="empty">Não há horários restantes neste dia. Escolha outra data.</p>';return}
  options.forEach(t=>{const b=document.createElement("button");b.type="button";b.className=`slot${time===t?" selected":""}`;b.textContent=t;b.setAttribute("aria-pressed",String(time===t));b.addEventListener("click",()=>{time=t;clearMessage();renderSlots();summary()});$("slots").appendChild(b)});
}
function summary(){
  $("summaryService").textContent=service.name;$("summaryDuration").textContent=`${service.duration} minutos`;
  $("summaryPrice").textContent=money(service.price);$("summaryTotal").textContent=money(service.price);
  $("summaryDate").textContent=date?dateText(date):"A definir";$("summaryTime").textContent=time||"A definir";
}
$("services").addEventListener("click",e=>{
  const b=e.target.closest(".service");if(!b)return;
  service=SERVICES.find(s=>s.name===b.dataset.service)||SERVICES[0];
  document.querySelectorAll(".service").forEach(el=>{const active=el===b;el.classList.toggle("selected",active);el.setAttribute("aria-pressed",String(active))});
  clearMessage();summary();
});
$("prevMonth").addEventListener("click",()=>{if($("prevMonth").disabled)return;month=new Date(month.getFullYear(),month.getMonth()-1,1);renderCalendar()});
$("nextMonth").addEventListener("click",()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderCalendar()});
$("phone").addEventListener("input",e=>{
  const d=e.target.value.replace(/\D/g,"").slice(0,11);
  if(!d)e.target.value="";else if(d.length<3)e.target.value=`(${d}`;else if(d.length<=7)e.target.value=`(${d.slice(0,2)}) ${d.slice(2)}`;else if(d.length<=10)e.target.value=`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;else e.target.value=`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
});
$("bookingForm").addEventListener("submit",async e=>{
  e.preventDefault();clearMessage();
  if(!date||!time){message("Selecione uma data e um horário para continuar.","error");return}
  if(!available(fromKey(date))){message("Escolha uma data disponível.","error");return}
  const payload={
    event:"novo_agendamento",origem:"Plantão",
    cliente:{nome:$("name").value.trim(),whatsapp:$("phone").value.trim(),email:$("email").value.trim()||null},
    agendamento:{servico:service.name,duracao_minutos:service.duration,valor:service.price,data:date,horario:time,observacoes:$("notes").value.trim()||null,status:"solicitado"},
    enviado_em:new Date().toISOString()
  };
  if(!payload.cliente.nome||!payload.cliente.whatsapp){message("Preencha seu nome e WhatsApp.","error");return}
  if(WEBHOOK_URL.includes("SEU-WEBHOOK-AQUI")){message("Configure a URL do webhook no início do arquivo script.js.","error");return}
  const btn=$("submitButton");btn.disabled=true;btn.innerHTML='Enviando solicitação <span>…</span>';
  try{
    const response=await fetch(WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    message("Cada consulta tem um foco. Se precisar de outro tema, marque outra sessão.","success");
    $("bookingForm").reset();date="";time="";service=SERVICES[0];
    document.querySelectorAll(".service").forEach((el,i)=>{el.classList.toggle("selected",i===0);el.setAttribute("aria-pressed",String(i===0))});
    renderCalendar();renderSlots();summary();
  }catch(err){console.error(err);message("Não foi possível enviar. Verifique a conexão e tente novamente.","error")}
  finally{btn.disabled=false;btn.innerHTML='Solicitar agendamento <span>→</span>'}
});
renderCalendar();renderSlots();summary();
