/*
  Balcão Luma — agenda de demonstração.
  WEBHOOK_URL vazio confirma neste aparelho (localStorage ag8_bookings).
  Cole uma URL para também enviar o pedido em JSON.
*/
const WEBHOOK_URL = "";
const KEY = "ag8_bookings";
const CLOSED = new Set([0]);
const TIMES = ["09:00", "09:45", "10:30", "11:15", "13:00", "13:45", "14:30", "15:15", "16:00", "16:45", "17:30"];
const SERVICES = [
  { name: "Revitalização", price: 80, minutes: 45 },
  { name: "Tonificação", price: 60, minutes: 40 },
  { name: "Drenagem", price: 190, minutes: 120 },
  { name: "Protocolo", price: 40, minutes: 40 }
];

const desk = document.getElementById("desk");
const form = document.getElementById("form");
const done = document.getElementById("done");
const msg = document.getElementById("msg");
const daysBox = document.getElementById("days");
const monthLabel = document.getElementById("month");
const prev = document.getElementById("prev");
const next = document.getElementById("next");
const slotsBox = document.getElementById("slots");
const timeTitle = document.getElementById("timeTitle");
const sum = document.getElementById("sum");
const phone = document.getElementById("phone");

const today = new Date();
today.setHours(0, 0, 0, 0);
let view = new Date(today.getFullYear(), today.getMonth(), 1);
let selected = SERVICES[0];
let selectedDate = "";
let selectedTime = "";

function money(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function ymd(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function parseYmd(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function taken(key, time) {
  let n = 0;
  const s = key + time;
  for (let i = 0; i < s.length; i++) n += s.charCodeAt(i);
  return n % 7 === 0;
}
function slotsFor(date) {
  const key = ymd(date);
  const now = new Date();
  return TIMES.filter((time) => {
    if (taken(key, time)) return false;
    const [h, mi] = time.split(":").map(Number);
    const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi);
    if (date.getTime() === today.getTime()) return slot.getTime() > now.getTime();
    return date.getTime() > today.getTime();
  });
}
function canPick(date) {
  if (date < today || CLOSED.has(date.getDay())) return false;
  return slotsFor(date).length > 0;
}
function longDate(key) {
  return parseYmd(key).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

function paintServices() {
  const box = document.getElementById("services");
  box.innerHTML = "";
  SERVICES.forEach((service) => {
    const b = document.createElement("button");
    b.type = "button";
    const on = service.name === selected.name;
    b.className = "svc" + (on ? " on" : "");
    b.setAttribute("aria-pressed", String(on));
    b.innerHTML = "<b>" + service.name + "</b><small>" + service.minutes + " min</small><strong>" + money(service.price) + "</strong>";
    b.addEventListener("click", () => { selected = service; paintServices(); paintSummary(); clearMsg(); });
    box.appendChild(b);
  });
}
function paintMonth() {
  const label = view.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  monthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  daysBox.innerHTML = "";
  const first = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  for (let i = 0; i < first; i++) {
    const blank = document.createElement("span");
    blank.className = "blank";
    daysBox.appendChild(blank);
  }
  for (let day = 1; day <= count; day++) {
    const date = new Date(view.getFullYear(), view.getMonth(), day);
    const key = ymd(date);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day";
    b.textContent = String(day);
    const ok = canPick(date);
    b.disabled = !ok;
    if (ok) b.classList.add("ok");
    if (key === ymd(today)) b.classList.add("today");
    if (key === selectedDate) b.classList.add("on");
    b.setAttribute("aria-pressed", String(key === selectedDate));
    b.setAttribute("aria-label", date.toLocaleDateString("pt-BR", { day: "numeric", month: "long" }));
    b.addEventListener("click", () => {
      selectedDate = key;
      selectedTime = "";
      clearMsg();
      paintMonth();
      paintSlots();
      paintSummary();
    });
    daysBox.appendChild(b);
  }
  prev.disabled = view.getFullYear() === today.getFullYear() && view.getMonth() <= today.getMonth();
}
function paintSlots() {
  slotsBox.innerHTML = "";
  if (!selectedDate) {
    timeTitle.textContent = "Escolha um dia";
    slotsBox.innerHTML = '<p class="empty">Os horários livres aparecem aqui.</p>';
    return;
  }
  timeTitle.textContent = longDate(selectedDate);
  const slots = slotsFor(parseYmd(selectedDate));
  if (!slots.length) {
    slotsBox.innerHTML = '<p class="empty">Este dia não tem horário livre.</p>';
    return;
  }
  slots.forEach((time) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (time === selectedTime ? " on" : "");
    b.textContent = time;
    b.setAttribute("aria-pressed", String(time === selectedTime));
    b.addEventListener("click", () => { selectedTime = time; clearMsg(); paintSlots(); paintSummary(); });
    slotsBox.appendChild(b);
  });
}
function paintSummary() {
  const when = selectedDate && selectedTime ? longDate(selectedDate) + " às " + selectedTime : "Selecione dia e horário";
  sum.textContent = selected.name + " · " + money(selected.price) + " · " + when;
}
function clearMsg() { msg.textContent = ""; }
function contact() {
  const name = document.getElementById("name").value.trim();
  const digits = phone.value.replace(/\D/g, "");
  const email = document.getElementById("email").value.trim();
  if (name.length < 2) return { error: "Escreva seu nome." };
  if (digits.length < 10 || digits.length > 11) return { error: "WhatsApp precisa ter DDD e número." };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "E-mail inválido." };
  return { name, phone: phone.value.trim(), email };
}
function showDone(data) {
  desk.hidden = true;
  form.hidden = true;
  done.hidden = false;
  document.getElementById("doneTitle").textContent = data.servico;
  document.getElementById("doneWhen").textContent = longDate(data.data) + " às " + data.horario + " · " + money(data.valor);
  document.getElementById("doneWho").textContent = data.nome + " · " + data.whatsapp;
  done.scrollIntoView({ block: "nearest" });
}

phone.addEventListener("input", () => {
  const d = phone.value.replace(/\D/g, "").slice(0, 11);
  if (!d) phone.value = "";
  else if (d.length <= 2) phone.value = "(" + d;
  else if (d.length <= 7) phone.value = "(" + d.slice(0, 2) + ") " + d.slice(2);
  else if (d.length <= 10) phone.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  else phone.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
});
prev.addEventListener("click", () => {
  if (prev.disabled) return;
  view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
  paintMonth();
});
next.addEventListener("click", () => {
  view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
  paintMonth();
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMsg();
  if (!selectedDate || !selectedTime) { msg.textContent = "Escolha um dia e um horário."; return; }
  if (!canPick(parseYmd(selectedDate)) || slotsFor(parseYmd(selectedDate)).indexOf(selectedTime) < 0) {
    msg.textContent = "Esse horário não está mais livre.";
    return;
  }
  const who = contact();
  if (who.error) { msg.textContent = who.error; return; }
  const data = {
    event: "novo_agendamento",
    origem: "balcao_luma",
    nome: who.name,
    whatsapp: who.phone,
    email: who.email || null,
    servico: selected.name,
    minutos: selected.minutes,
    valor: selected.price,
    data: selectedDate,
    horario: selectedTime,
    enviado_em: new Date().toISOString()
  };
  const all = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.push(data);
  localStorage.setItem(KEY, JSON.stringify(all));
  if (WEBHOOK_URL) {
    try {
      const response = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error("webhook");
    } catch (error) {
      msg.textContent = "Você sai sem venda de produto. O foco é o atendimento marcado.";
    }
  }
  showDone(data);
});
document.getElementById("again").addEventListener("click", () => {
  selectedDate = "";
  selectedTime = "";
  selected = SERVICES[0];
  form.reset();
  done.hidden = true;
  desk.hidden = false;
  form.hidden = false;
  paintServices();
  paintMonth();
  paintSlots();
  paintSummary();
});

document.getElementById("todayLabel").textContent = today.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
paintServices();
paintMonth();
paintSlots();
paintSummary();
