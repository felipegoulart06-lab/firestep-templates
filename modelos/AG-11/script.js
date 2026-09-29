const WEBHOOK_URL = "";
const KEY = "ag11_bookings";
const CLOSED = new Set([0]);
const TIMES = ["09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
const PEOPLE = [
  { id: "ana", name: "Ana", role: "Acompanha", color: "#1f4b99", services: [
    { name: "Cuidado", price: 80, minutes: 45 },
    { name: "Retorno", price: 180, minutes: 120 },
    { name: "Presença", price: 60, minutes: 40 }
  ]},
  { id: "bia", name: "Bia", role: "Roda", color: "#9a3d73", services: [
    { name: "Pausa", price: 40, minutes: 40 },
    { name: "Escuta", price: 50, minutes: 50 },
    { name: "Sessão", price: 70, minutes: 60 }
  ]},
  { id: "caio", name: "Caio", role: "Encontro", color: "#1f6b4a", services: [
    { name: "Encontro", price: 35, minutes: 30 },
    { name: "Acolhida", price: 55, minutes: 40 },
    { name: "Escuta", price: 80, minutes: 60 }
  ]}
];
const WEEK = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const today = new Date();
today.setHours(0, 0, 0, 0);
let person = PEOPLE[0];
let service = person.services[0];
let selectedDate = "";
let selectedTime = "";

function money(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function parseYmd(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function taken(key, time) { let n = 0; const s = person.id + key + time; for (let i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 6 === 0; }
function slotsFor(date) {
  const key = ymd(date);
  const now = new Date();
  return TIMES.filter((time) => {
    if (taken(key, time)) return false;
    const [h, mi] = time.split(":").map(Number);
    const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi);
    if (date.getTime() === today.getTime()) return slot > now;
    return date > today;
  });
}
function nextDays() {
  const out = [];
  let d = new Date(today);
  for (let i = 0; i < 40 && out.length < 8; i++) {
    if (!CLOSED.has(d.getDay()) && slotsFor(d).length) out.push(new Date(d));
    d = addDays(d, 1);
  }
  return out;
}
function paintPeople() {
  const box = document.getElementById("people");
  box.innerHTML = "";
  PEOPLE.forEach((item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "person" + (item.id === person.id ? " on" : "");
    b.innerHTML = '<span class="avatar" style="background:' + item.color + '">' + item.name.slice(0, 1) + "</span><b>" + item.name + "</b><small>" + item.role + "</small>";
    b.addEventListener("click", () => {
      person = item;
      service = item.services[0];
      selectedTime = "";
      document.getElementById("whoName").textContent = item.name;
      paintAll();
    });
    box.appendChild(b);
  });
}
function paintServices() {
  const box = document.getElementById("services");
  box.innerHTML = "";
  person.services.forEach((item) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "svc" + (item.name === service.name ? " on" : "");
    b.textContent = item.name + " · " + money(item.price);
    b.addEventListener("click", () => { service = item; paintServices(); });
    box.appendChild(b);
  });
}
function paintDays() {
  const box = document.getElementById("days");
  box.innerHTML = "";
  const days = nextDays();
  if (!selectedDate || !days.some((d) => ymd(d) === selectedDate)) selectedDate = days.length ? ymd(days[0]) : "";
  days.forEach((date) => {
    const key = ymd(date);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day" + (key === selectedDate ? " on" : "");
    b.innerHTML = "<small>" + WEEK[date.getDay()] + "</small><b>" + date.getDate() + "</b>";
    b.addEventListener("click", () => { selectedDate = key; selectedTime = ""; paintDays(); paintSlots(); });
    box.appendChild(b);
  });
}
function paintSlots() {
  const box = document.getElementById("slots");
  box.innerHTML = "";
  if (!selectedDate) { box.textContent = "Sem dia livre."; return; }
  slotsFor(parseYmd(selectedDate)).forEach((time) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (time === selectedTime ? " on" : "");
    b.textContent = time;
    b.addEventListener("click", () => { selectedTime = time; paintSlots(); document.getElementById("msg").textContent = ""; });
    box.appendChild(b);
  });
}
function paintAll() { paintPeople(); paintServices(); paintDays(); paintSlots(); }
document.getElementById("phone").addEventListener("input", () => {
  const input = document.getElementById("phone");
  const d = input.value.replace(/\D/g, "").slice(0, 11);
  if (!d) input.value = "";
  else if (d.length <= 2) input.value = "(" + d;
  else if (d.length <= 7) input.value = "(" + d.slice(0, 2) + ") " + d.slice(2);
  else if (d.length <= 10) input.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  else input.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
});
document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const msg = document.getElementById("msg");
  msg.textContent = "";
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const digits = phone.replace(/\D/g, "");
  if (!selectedTime) { msg.textContent = "Escolha um horário."; return; }
  if (name.length < 2) { msg.textContent = "Escreva seu nome."; return; }
  if (digits.length < 10 || digits.length > 11) { msg.textContent = "WhatsApp precisa ter DDD e número."; return; }
  const data = { event: "novo_agendamento", origem: "equipe_norte", profissional: person.name, nome: name, whatsapp: phone, servico: service.name, minutos: service.minutes, valor: service.price, data: selectedDate, horario: selectedTime, enviado_em: new Date().toISOString() };
  const all = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.push(data);
  localStorage.setItem(KEY, JSON.stringify(all));
  if (WEBHOOK_URL) {
    try {
      const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("webhook");
    } catch (error) { msg.textContent = "O acolhimento começa na pontualidade e no silêncio da sala."; }
  }
  document.getElementById("work").hidden = true;
  document.getElementById("done").hidden = false;
  document.getElementById("doneTitle").textContent = person.name + " · " + service.name;
  document.getElementById("doneMeta").textContent = parseYmd(selectedDate).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) + " às " + selectedTime + " · " + name;
});
document.getElementById("again").addEventListener("click", () => {
  selectedTime = "";
  document.getElementById("form").reset();
  document.getElementById("done").hidden = true;
  document.getElementById("work").hidden = false;
  paintAll();
});
document.getElementById("whoName").textContent = person.name;
paintAll();
