const WEBHOOK_URL = "";
const KEY = "ag12_bookings";
const CLOSED = new Set([1]);
const TIMES = ["08:00", "09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const SERVICES = [
  { name: "Acompanha", price: 65, minutes: 40 },
  { name: "Encontro", price: 35, minutes: 30 },
  { name: "Tratamento", price: 130, minutes: 70 }
];
const today = new Date();
today.setHours(0, 0, 0, 0);
let selected = SERVICES[0];
let cursor = new Date(today);
let selectedTime = "";

function money(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function taken(key, time) { let n = 0; const s = key + time; for (let i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 5 === 0; }
function slotsFor(date) {
  const key = ymd(date);
  const now = new Date();
  return TIMES.map((time) => {
    const [h, mi] = time.split(":").map(Number);
    const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi);
    const past = date < today || (date.getTime() === today.getTime() && slot <= now);
    return { time: time, free: !past && !CLOSED.has(date.getDay()) && !taken(key, time) };
  });
}
function firstOpen() {
  let d = new Date(today);
  for (let i = 0; i < 30; i++) {
    if (slotsFor(d).some((s) => s.free)) return d;
    d = addDays(d, 1);
  }
  return today;
}
function step(dir) {
  let d = addDays(cursor, dir);
  for (let i = 0; i < 30; i++) {
    if (d < today) return;
    if (slotsFor(d).some((s) => s.free)) { cursor = d; selectedTime = ""; paint(); return; }
    d = addDays(d, dir);
  }
}
function paintServices() {
  const box = document.getElementById("services");
  box.innerHTML = "";
  SERVICES.forEach((service) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "svc" + (service.name === selected.name ? " on" : "");
    b.textContent = service.name + " · " + money(service.price);
    b.addEventListener("click", () => { selected = service; paintServices(); });
    box.appendChild(b);
  });
}
function paint() {
  document.getElementById("dayTitle").textContent = cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
  const free = slotsFor(cursor).filter((s) => s.free).length;
  document.getElementById("daySub").textContent = free + " horários livres · até 20h";
  document.getElementById("prev").disabled = ymd(cursor) === ymd(firstOpen());
  const box = document.getElementById("slots");
  box.innerHTML = "";
  slotsFor(cursor).forEach((slot) => {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.className = "time";
    label.textContent = slot.time;
    if (slot.free) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pick" + (selectedTime === slot.time ? " on" : "");
      b.textContent = selectedTime === slot.time ? "Escolhido" : "Livre";
      b.addEventListener("click", () => { selectedTime = slot.time; document.getElementById("msg").textContent = ""; paint(); });
      row.append(label, b);
    } else {
      const span = document.createElement("span");
      span.className = "busy";
      span.textContent = "Ocupado";
      row.append(label, span);
    }
    box.appendChild(row);
  });
}
document.getElementById("prev").addEventListener("click", () => step(-1));
document.getElementById("next").addEventListener("click", () => step(1));
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
  if (!selectedTime) { msg.textContent = "Escolha um horário livre na linha."; return; }
  if (name.length < 2) { msg.textContent = "Escreva seu nome."; return; }
  if (phone.replace(/\D/g, "").length < 10) { msg.textContent = "WhatsApp precisa ter DDD e número."; return; }
  const data = { event: "novo_agendamento", origem: "linha_do_dia", nome: name, whatsapp: phone, servico: selected.name, minutos: selected.minutes, valor: selected.price, data: ymd(cursor), horario: selectedTime, enviado_em: new Date().toISOString() };
  const all = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.push(data);
  localStorage.setItem(KEY, JSON.stringify(all));
  if (WEBHOOK_URL) {
    try {
      const res = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!res.ok) throw new Error("webhook");
    } catch (error) { msg.textContent = "Remarcações pedem aviso prévio pelo mesmo contato."; }
  }
  document.getElementById("work").hidden = true;
  document.getElementById("done").hidden = false;
  document.getElementById("doneTitle").textContent = selected.name + " às " + selectedTime;
  document.getElementById("doneMeta").textContent = cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) + " · " + name;
});
document.getElementById("again").addEventListener("click", () => {
  selectedTime = "";
  document.getElementById("form").reset();
  document.getElementById("done").hidden = true;
  document.getElementById("work").hidden = false;
  paint();
});
cursor = firstOpen();
paintServices();
paint();
