const WEBHOOK_URL = "";
const KEY = "ag13_bookings";
const CLOSED = new Set([1, 2]);
const TIMES = ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const SERVICES = [
  { name: "Encontro", price: 140, minutes: 60 },
  { name: "Pele", price: 160, minutes: 70 },
  { name: "Cuidado", price: 90, minutes: 50 }
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
function slotsFor(date) {
  const key = ymd(date); const now = new Date();
  return TIMES.filter((time) => {
    if (taken(key, time)) return false;
    const [h, mi] = time.split(":").map(Number);
    const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi);
    if (date.getTime() === today.getTime()) return slot > now;
    return date > today;
  });
}
function canPick(date) { return date >= today && !CLOSED.has(date.getDay()) && slotsFor(date).length > 0; }
function slip() {
  document.getElementById("sSvc").textContent = selected.name + " · " + selected.minutes + " min";
  document.getElementById("sPrice").textContent = money(selected.price);
  document.getElementById("sWhen").textContent = selectedDate && selectedTime ? parseYmd(selectedDate).toLocaleDateString("pt-BR") + " às " + selectedTime : "—";
  const name = document.getElementById("name").value.trim();
  document.getElementById("sWho").textContent = name || "—";
}
function paintServices() {
  const box = document.getElementById("services");
  box.innerHTML = "";
  SERVICES.forEach((service) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "svc" + (service.name === selected.name ? " on" : "");
    b.textContent = service.name;
    b.addEventListener("click", () => { selected = service; paintServices(); slip(); });
    box.appendChild(b);
  });
}
function paintMonth() {
  const label = view.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  document.getElementById("month").textContent = label.charAt(0).toUpperCase() + label.slice(1);
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
    b.addEventListener("click", () => { selectedDate = key; selectedTime = ""; paintMonth(); paintSlots(); slip(); });
    box.appendChild(b);
  }
  document.getElementById("prev").disabled = view.getFullYear() === today.getFullYear() && view.getMonth() <= today.getMonth();
}
function paintSlots() {
  const box = document.getElementById("slots");
  box.innerHTML = "";
  if (!selectedDate) return;
  slotsFor(parseYmd(selectedDate)).forEach((time) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (time === selectedTime ? " on" : "");
    b.textContent = time;
    b.addEventListener("click", () => { selectedTime = time; paintSlots(); slip(); document.getElementById("msg").textContent = ""; });
    box.appendChild(b);
  });
}
document.getElementById("prev").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); paintMonth(); });
document.getElementById("next").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); paintMonth(); });
document.getElementById("name").addEventListener("input", slip);
document.getElementById("phone").addEventListener("input", () => {
  const input = document.getElementById("phone");
  const d = input.value.replace(/\D/g, "").slice(0, 11);
  if (!d) input.value = "";
  else if (d.length <= 2) input.value = "(" + d;
  else if (d.length <= 7) input.value = "(" + d.slice(0, 2) + ") " + d.slice(2);
  else if (d.length <= 10) input.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  else input.value = "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  slip();
});
document.getElementById("form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const msg = document.getElementById("msg");
  msg.textContent = "";
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  if (!selectedDate || !selectedTime) { msg.textContent = "Escolha dia e horário na ficha."; return; }
  if (name.length < 2) { msg.textContent = "Escreva o nome."; return; }
  if (phone.replace(/\D/g, "").length < 10) { msg.textContent = "WhatsApp precisa ter DDD e número."; return; }
  const data = { event: "novo_agendamento", origem: "ficha_rosa", nome: name, whatsapp: phone, servico: selected.name, minutos: selected.minutes, valor: selected.price, data: selectedDate, horario: selectedTime, enviado_em: new Date().toISOString() };
  const all = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.push(data);
  localStorage.setItem(KEY, JSON.stringify(all));
  if (WEBHOOK_URL) {
    try {
      const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("webhook");
    } catch (error) { msg.textContent = "O processo é no seu ritmo. Não há meta prometida de antemão."; }
  }
  document.querySelector(".split").hidden = true;
  document.getElementById("done").hidden = false;
  document.getElementById("doneTitle").textContent = selected.name;
  document.getElementById("doneMeta").textContent = parseYmd(selectedDate).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) + " às " + selectedTime + " · " + name;
});
document.getElementById("again").addEventListener("click", () => {
  selectedDate = ""; selectedTime = "";
  document.getElementById("form").reset();
  document.getElementById("done").hidden = true;
  document.querySelector(".split").hidden = false;
  paintServices(); paintMonth(); paintSlots(); slip();
});
paintServices(); paintMonth(); paintSlots(); slip();
