const WEBHOOK_URL = "";
const KEY = "ag14_bookings";
const CLOSED = new Set([1, 2, 3]);
const TIMES = { 0: ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00"], 4: ["12:00", "13:30", "15:00", "16:30", "18:00", "19:30"], 5: ["12:00", "13:30", "15:00", "16:30", "18:00", "19:30"], 6: ["12:00", "13:30", "15:00", "16:30", "18:00", "19:30"] };
const SERVICES = [
  { name: "Pausa", price: 90, minutes: 45 },
  { name: "Roda", price: 40, minutes: 30 },
  { name: "Combo", price: 120, minutes: 70 },
  { name: "Acompanha", price: 35, minutes: 20 }
];
const today = new Date();
today.setHours(0, 0, 0, 0);
let view = new Date(today.getFullYear(), today.getMonth(), 1);
let selected = SERVICES[0];
let selectedDate = "";
let selectedTime = "";

function money(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function parseYmd(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function taken(key, time) { let n = 0; const s = key + time; for (let i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 7 === 0; }
function dayTimes(date) { return TIMES[date.getDay()] || []; }
function slotsFor(date) {
  const key = ymd(date); const now = new Date();
  return dayTimes(date).filter((time) => {
    if (taken(key, time)) return false;
    const [h, mi] = time.split(":").map(Number);
    const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi);
    if (date.getTime() === today.getTime()) return slot > now;
    return date > today;
  });
}
function canPick(date) { return date >= today && !CLOSED.has(date.getDay()) && slotsFor(date).length > 0; }
function paintServices() {
  const box = document.getElementById("services");
  box.innerHTML = "";
  SERVICES.forEach((service) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "svc" + (service.name === selected.name ? " on" : "");
    b.innerHTML = service.name + "<small>" + money(service.price) + " · " + service.minutes + " min</small>";
    b.addEventListener("click", () => { selected = service; paintServices(); });
    box.appendChild(b);
  });
}
function paintMonth() {
  const label = view.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  document.getElementById("month").textContent = (label.charAt(0).toUpperCase() + label.slice(1)).toUpperCase();
  const box = document.getElementById("days");
  box.innerHTML = "";
  const first = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const count = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  for (let i = 0; i < first; i++) box.appendChild(document.createElement("span"));
  for (let day = 1; day <= count; day++) {
    const date = new Date(view.getFullYear(), view.getMonth(), day);
    const key = ymd(date);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "day" + (canPick(date) ? " ok" : "") + (key === selectedDate ? " on" : "");
    b.textContent = String(day);
    b.disabled = !canPick(date);
    b.addEventListener("click", () => { selectedDate = key; selectedTime = ""; paintMonth(); paintSlots(); });
    box.appendChild(b);
  }
  document.getElementById("prev").disabled = view.getFullYear() === today.getFullYear() && view.getMonth() <= today.getMonth();
}
function paintSlots() {
  const box = document.getElementById("slots");
  box.innerHTML = "";
  if (!selectedDate) { box.innerHTML = '<p class="msg">SELECIONE UM DIA ABERTO</p>'; return; }
  slotsFor(parseYmd(selectedDate)).forEach((time) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (time === selectedTime ? " on" : "");
    b.textContent = time;
    b.addEventListener("click", () => { selectedTime = time; paintSlots(); document.getElementById("msg").textContent = ""; });
    box.appendChild(b);
  });
}
document.getElementById("clock").textContent = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
document.getElementById("prev").addEventListener("click", () => { if (!document.getElementById("prev").disabled) { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); paintMonth(); } });
document.getElementById("next").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); paintMonth(); });
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
  if (!selectedDate || !selectedTime) { msg.textContent = "ESCOLHA DIA E HORÁRIO."; return; }
  if (name.length < 2) { msg.textContent = "ESCREVA O NOME."; return; }
  if (phone.replace(/\D/g, "").length < 10) { msg.textContent = "WHATSAPP INVÁLIDO."; return; }
  const data = { event: "novo_agendamento", origem: "turno_14", nome: name, whatsapp: phone, servico: selected.name, minutos: selected.minutes, valor: selected.price, data: selectedDate, horario: selectedTime, enviado_em: new Date().toISOString() };
  const all = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.push(data);
  localStorage.setItem(KEY, JSON.stringify(all));
  if (WEBHOOK_URL) {
    try {
      const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("webhook");
    } catch (error) { msg.textContent = "SALVO AQUI. ENVIO FALHOU."; }
  }
  document.getElementById("work").hidden = true;
  document.getElementById("done").hidden = false;
  document.getElementById("doneTitle").textContent = selected.name + " · " + selectedTime;
  document.getElementById("doneMeta").textContent = parseYmd(selectedDate).toLocaleDateString("pt-BR") + " · " + name;
});
document.getElementById("again").addEventListener("click", () => {
  selectedDate = ""; selectedTime = "";
  document.getElementById("form").reset();
  document.getElementById("done").hidden = true;
  document.getElementById("work").hidden = false;
  paintServices(); paintMonth(); paintSlots();
});
paintServices(); paintMonth(); paintSlots();
