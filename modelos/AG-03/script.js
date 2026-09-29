(() => {
  "use strict";
  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const state = {
    service: { name: "Orientação", price: 45, duration: "45 min" },
    date: null, time: null, month: new Date(), step: 1, client: null
  };
  const monthLabel = $("#monthLabel"), calendarDays = $("#calendarDays");
  const timeSlots = $("#timeSlots"), chosenDateLabel = $("#chosenDateLabel");
  const toast = $("#toast");
  const monthNames = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const weekdays = ["domingo","segunda-feira","terça-feira","quarta-feira","quinta-feira","sexta-feira","sábado"];
  const pad = n => String(n).padStart(2,"0");
  const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const formatDate = d => `${weekdays[d.getDay()]}, ${d.getDate()} de ${monthNames[d.getMonth()]}`;
  let toastTimer;
  function showToast(message) {
    toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
  }
  function updateService() {
    $("#serviceChip").textContent = state.service.name;
    $("#serviceChip2").textContent = state.service.name;
  }
  $$(".service-card").forEach(card => card.addEventListener("click", () => {
    $$(".service-card").forEach(c => c.classList.remove("selected"));
    card.classList.add("selected");
    state.service = {name: card.dataset.service, price: Number(card.dataset.price), duration: card.dataset.duration};
    updateService();
  }));

  function renderCalendar() {
    const year = state.month.getFullYear(), month = state.month.getMonth();
    monthLabel.textContent = `${monthNames[month][0].toUpperCase()+monthNames[month].slice(1)} ${year}`;
    calendarDays.innerHTML = "";
    const first = new Date(year, month, 1);
    const offset = (first.getDay()+6)%7;
    const days = new Date(year, month+1, 0).getDate();
    for(let i=0;i<offset;i++) calendarDays.append(document.createElement("span"));
    const today = new Date(); today.setHours(0,0,0,0);
    for(let n=1;n<=days;n++){
      const d = new Date(year,month,n); d.setHours(0,0,0,0);
      const btn = document.createElement("button");
      btn.type = "button"; btn.textContent = n;
      const isPast = d < today, isSunday = d.getDay()===0;
      btn.disabled = isPast || isSunday;
      if(!btn.disabled) btn.classList.add("available");
      if(dateKey(d)===dateKey(today)) btn.classList.add("today");
      if(state.date && dateKey(d)===dateKey(state.date)) btn.classList.add("selected");
      btn.setAttribute("aria-label", `${n} de ${monthNames[month]}${btn.disabled ? ", indisponível" : ", disponível"}`);
      btn.addEventListener("click", () => {
        state.date = d; state.time = null; renderCalendar(); renderTimes();
        $("#toDetails").disabled = true;
      });
      calendarDays.append(btn);
    }
  }
  function renderTimes() {
    if(!state.date){chosenDateLabel.textContent="Escolha uma data";timeSlots.innerHTML='<div class="empty-state">Selecione uma data no calendário.</div>';return;}
    chosenDateLabel.textContent = formatDate(state.date);
    // Horários demonstrativos. Conecte a disponibilidade real ao backend antes de publicar.
    const all = ["09:00","09:45","10:30","11:15","13:30","14:15","15:00","15:45","16:30","17:15"];
    const seed = state.date.getDate() + state.date.getMonth();
    const available = all.filter((_,i) => (i+seed)%5!==0);
    timeSlots.innerHTML = "";
    available.forEach(time => {
      const btn = document.createElement("button"); btn.type="button"; btn.textContent=time;
      btn.classList.toggle("selected",state.time===time);
      btn.setAttribute("aria-pressed",String(state.time===time));
      btn.addEventListener("click",()=>{
        state.time=time; renderTimes(); $("#toDetails").disabled=false;
      });
      timeSlots.append(btn);
    });
  }
  function goStep(step) {
    state.step=step;
    [1,2,3].forEach(n=>{
      $(`#stage${n}`).classList.toggle("hidden",n!==step);
      const item=$(`.step[data-step="${n}"]`);
      item.classList.toggle("active",n===step); item.classList.toggle("done",n<step);
    });
    if(step===3) renderConfirmation();
  }
  $("#prevMonth").addEventListener("click",()=>{
    const now=new Date(); now.setHours(0,0,0,0);
    const prev=new Date(state.month.getFullYear(),state.month.getMonth()-1,1);
    if(prev.getFullYear()>now.getFullYear() || (prev.getFullYear()===now.getFullYear()&&prev.getMonth()>=now.getMonth())) state.month=prev;
    else showToast("Não há datas anteriores disponíveis.");
    renderCalendar();
  });
  $("#nextMonth").addEventListener("click",()=>{state.month=new Date(state.month.getFullYear(),state.month.getMonth()+1,1);renderCalendar();});
  $("#toDetails").addEventListener("click",()=>{if(!state.date||!state.time)return;goStep(2);});
  $("#backToDate").addEventListener("click",()=>goStep(1));
  $("#backToDetails").addEventListener("click",()=>goStep(2));
  $("#clientPhone").addEventListener("input",e=>{
    let v=e.target.value.replace(/\D/g,"").slice(0,11);
    if(v.length>10)v=v.replace(/^(\d{2})(\d{5})(\d{0,4}).*/,"($1) $2-$3");
    else if(v.length>6)v=v.replace(/^(\d{2})(\d{4})(\d{0,4}).*/,"($1) $2-$3");
    else if(v.length>2)v=v.replace(/^(\d{2})(\d{0,5})/,"($1) $2");
    else if(v.length>0)v=`(${v}`;
    e.target.value=v;
  });
  $("#clientForm").addEventListener("submit",e=>{
    e.preventDefault();
    const name=$("#clientName").value.trim(), phone=$("#clientPhone").value.trim();
    if(name.length<2){showToast("Informe seu nome completo.");$("#clientName").focus();return;}
    if(phone.replace(/\D/g,"").length<10){showToast("Informe um WhatsApp válido.");$("#clientPhone").focus();return;}
    state.client={name,phone,email:$("#clientEmail").value.trim(),note:$("#clientNote").value.trim()};
    goStep(3);
  });
  function addRow(label,value){
    const row=document.createElement("div");row.className="confirm-row";
    const l=document.createElement("span");l.textContent=label;
    const v=document.createElement("strong");v.textContent=value;
    row.append(l,v);$("#confirmationCard").append(row);
  }
  function renderConfirmation(){
    const card=$("#confirmationCard");card.innerHTML="";
    addRow("Serviço",state.service.name);
    addRow("Data",formatDate(state.date));
    addRow("Horário",state.time);
    addRow("Duração",state.service.duration);
    addRow("Valor",state.service.price.toLocaleString("pt-BR",{style:"currency",currency:"BRL"}));
    addRow("Nome",state.client.name);
    addRow("WhatsApp",state.client.phone);
    if(state.client.email)addRow("E-mail",state.client.email);
    if(state.client.note)addRow("Observação",state.client.note);
  }
  $("#confirmBooking").addEventListener("click",async()=>{
    const btn=$("#confirmBooking");btn.disabled=true;btn.innerHTML="Confirmando…";
    const booking={
      service:state.service.name,price:state.service.price,duration:state.service.duration,
      date:dateKey(state.date),time:state.time,client:state.client,
      source:"Plantão",createdAt:new Date().toISOString()
    };
    // Configure a URL do seu webhook para enviar o agendamento ao sistema.
    const WEBHOOK_URL = "";
    try{
      if(WEBHOOK_URL){
        const response=await fetch(WEBHOOK_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(booking)});
        if(!response.ok)throw new Error("Falha ao enviar");
      }else{
        // Modo demonstração: registra a solicitação somente neste navegador.
        const key="lumi-demo-bookings";
        const saved=JSON.parse(localStorage.getItem(key)||"[]");
        saved.push(booking);localStorage.setItem(key,JSON.stringify(saved));
      }
      $("#stage3").classList.add("hidden");$("#successState").classList.remove("hidden");
      $("#successText").textContent=`${state.client.name}, sua solicitação para ${formatDate(state.date)} às ${state.time} foi registrada${WEBHOOK_URL?" e enviada ao atelier":" neste navegador (modo demonstração)"}. ${state.service.name} · ${state.service.price.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}.`;
      $$(".step").forEach(s=>{s.classList.remove("active");s.classList.add("done")});
    }catch(err){showToast("Não foi possível enviar agora. Tente novamente.");}
    finally{btn.disabled=false;btn.innerHTML='Confirmar reserva <span>✓</span>';}
  });
  $("#newBooking").addEventListener("click",()=>{
    state.date=null;state.time=null;state.client=null;state.month=new Date();
    $("#clientForm").reset();$("#successState").classList.add("hidden");$("#stage1").classList.remove("hidden");
    $("#toDetails").disabled=true;goStep(1);renderCalendar();renderTimes();
    $("#agendamento").scrollIntoView({behavior:"smooth"});
  });
  $("#menuToggle").addEventListener("click",()=>{
    const open=$("#mobileNav").classList.toggle("open");
    $("#menuToggle").setAttribute("aria-expanded",String(open));
    $("#menuToggle").textContent=open?"×":"☰";
  });
  $$("#mobileNav a").forEach(a=>a.addEventListener("click",()=>{$("#mobileNav").classList.remove("open");$("#menuToggle").setAttribute("aria-expanded","false");$("#menuToggle").textContent="☰";}));
  $("#year").textContent=new Date().getFullYear();
  updateService();renderCalendar();renderTimes();
})();