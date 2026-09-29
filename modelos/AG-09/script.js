const WEBHOOK_URL = "";
const KEY = "ag9_bookings";
const CLOSED = new Set([0]);
const SERVICES = [
  { name: "Facial", price: 70, minutes: 40 },
  { name: "Revitalização", price: 90, minutes: 50 },
  { name: "Design", price: 40, minutes: 30 },
  { name: "Limpeza", price: 110, minutes: 60 }
];
const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const today = new Date();
today.setHours(0, 0, 0, 0);
let selected = SERVICES[0];
let picked = null;
let mobileKey = "";

function money(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function parseYmd(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
function taken(key, time) { let n = 0; const s = key + time; for (let i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 7 === 0; }
function timesFor(date) {
  const day = date.getDay();
  const list = day === 6 ? ["09:00", "09:40", "10:20", "11:00", "11:40", "12:20"] : ["10:00", "10:40", "11:20", "13:00", "13:40", "14:20", "15:00", "15:40", "16:20", "17:00"];
  const key = ymd(date);
  const now = new Date();
  return list.filter((time) => {
    if (taken(key, time)) return false;
    const [h, mi] = time.split(":").map(Number);
    const slot = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, mi);
    if (date.getTime() === today.getTime()) return slot > now;
    return date > today;
  });
}
function upcoming() {
  const out = [];
  let d = new Date(today);
  for (let i = 0; i < 40 && out.length < 6; i++) {
    if (!CLOSED.has(d.getDay()) && timesFor(d).length) out.push(new Date(d));
    d = addDays(d, 1);
  }
  return out;
}
function paintServices() {
  const box = document.getElementById("services");
  box.innerHTML = "";
  SERVICES.forEach((service) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "svc" + (service.name === selected.name ? " on" : "");
    b.textContent = service.name + " · " + money(service.price);
    b.setAttribute("aria-pressed", String(service.name === selected.name));
    b.addEventListener("click", () => { selected = service; paintServices(); paintSum(); });
    box.appendChild(b);
  });
}
function paintWeek() {
  const days = upcoming();
  const week = document.getElementById("week");
  const sw = document.getElementById("switch");
  week.innerHTML = "";
  sw.innerHTML = "";
  if (!mobileKey || !days.some((d) => ymd(d) === mobileKey)) mobileKey = days.length ? ymd(days[0]) : "";
  days.forEach((date) => {
    const key = ymd(date);
    const col = document.createElement("article");
    col.className = "col" + (key === mobileKey ? " on" : "");
    const head = document.createElement("header");
    head.innerHTML = "<b>" + WEEK[date.getDay()] + "</b><span>" + date.getDate() + "</span>";
    const list = document.createElement("div");
    list.className = "list";
    timesFor(date).forEach((time) => {
      const b = document.createElement("button");
      b.type = "button";
      const on = picked && picked.date === key && picked.time === time;
      b.className = "slot" + (on ? " on" : "");
      b.textContent = time;
      b.setAttribute("aria-pressed", String(!!on));
      b.addEventListener("click", () => { picked = { date: key, time: time }; mobileKey = key; paintWeek(); paintSum(); document.getElementById("msg").textContent = ""; });
      list.appendChild(b);
    });
    col.append(head, list);
    week.appendChild(col);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "daybtn" + (key === mobileKey ? " on" : "");
    chip.textContent = WEEK[date.getDay()] + " " + date.getDate();
    chip.addEventListener("click", () => { mobileKey = key; paintWeek(); });
    sw.appendChild(chip);
  });
  if (!days.length) week.innerHTML = '<p class="empty">Nenhum dia livre nesta janela.</p>';
}
function paintSum() {
  const el = document.getElementById("sum");
  if (!picked) { el.textContent = selected.name + " · toque em um horário da grade"; return; }
  const date = parseYmd(picked.date);
  el.textContent = selected.name + " · " + date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }) + " às " + picked.time;
}
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
  if (!picked) { msg.textContent = "Escolha um horário na grade."; return; }
  const name = document.getElementById("name").value.trim();
  const phone = document.getElementById("phone").value.trim();
  const digits = phone.replace(/\D/g, "");
  if (name.length < 2) { msg.textContent = "Escreva seu nome."; return; }
  if (digits.length < 10 || digits.length > 11) { msg.textContent = "WhatsApp precisa ter DDD e número."; return; }
  const fresh = timesFor(parseYmd(picked.date));
  if (fresh.indexOf(picked.time) < 0) { msg.textContent = "Esse horário não está mais livre."; return; }
  const data = { event: "novo_agendamento", origem: "grade_viva", nome: name, whatsapp: phone, notas: document.getElementById("notes").value.trim() || null, servico: selected.name, minutos: selected.minutes, valor: selected.price, data: picked.date, horario: picked.time, enviado_em: new Date().toISOString() };
  const all = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.push(data);
  localStorage.setItem(KEY, JSON.stringify(all));
  if (WEBHOOK_URL) {
    try {
      const response = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error("webhook");
    } catch (error) { msg.textContent = "O atendimento é com hora marcada, um cuidado por vez."; }
  }
  document.getElementById("work").hidden = true;
  document.getElementById("done").hidden = false;
  document.getElementById("doneTitle").textContent = data.servico + " · " + money(data.valor);
  document.getElementById("doneWhen").textContent = parseYmd(data.data).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) + " às " + data.horario;
  document.getElementById("doneWho").textContent = data.nome + " · " + data.whatsapp;
});
document.getElementById("again").addEventListener("click", () => {
  picked = null;
  selected = SERVICES[0];
  document.getElementById("form").reset();
  document.getElementById("done").hidden = true;
  document.getElementById("work").hidden = false;
  paintServices();
  paintWeek();
  paintSum();
});
paintServices();
paintWeek();
paintSum();
