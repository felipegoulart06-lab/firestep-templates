const WEBHOOK_URL = "";
const KEY = "ag10_bookings";
const CLOSED = new Set([0, 1]);
const TIMES = ["11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
const SERVICES = [
  { name: "Design", price: 75, minutes: 45 },
  { name: "Protocolo", price: 120, minutes: 80 },
  { name: "Revitalização", price: 250, minutes: 150 },
  { name: "Drenagem", price: 50, minutes: 50 }
];
const today = new Date();
today.setHours(0, 0, 0, 0);
let step = 1;
let selected = null;
let selectedDate = "";
let selectedTime = "";
let view = new Date(today.getFullYear(), today.getMonth(), 1);

function money(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function ymd(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function parseYmd(key) { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); }
function taken(key, time) { let n = 0; const s = key + time; for (let i = 0; i < s.length; i++) n += s.charCodeAt(i); return n % 7 === 0; }
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
function canPick(date) { return date >= today && !CLOSED.has(date.getDay()) && slotsFor(date).length > 0; }
function show(n) {
  step = n;
  document.querySelectorAll(".step").forEach((el) => el.classList.toggle("on", Number(el.dataset.step) === n));
  document.getElementById("stepLabel").textContent = n + " de 5";
  document.getElementById("progress").style.width = (n * 20) + "%";
  document.getElementById("back").hidden = n === 1;
  document.getElementById("go").textContent = n === 5 ? "Marcar horário" : "Continuar";
  document.getElementById("msg").textContent = "";
  if (n === 5) paintReview();
}
function paintServices() {
  const box = document.getElementById("services");
  box.innerHTML = "";
  SERVICES.forEach((service) => {
    const b = document.createElement("button");
    b.type = "button";
    const on = selected && selected.name === service.name;
    b.className = "choice" + (on ? " on" : "");
    b.innerHTML = "<span><b>" + service.name + "</b><br><small>" + service.minutes + " min</small></span><strong>" + money(service.price) + "</strong>";
    b.addEventListener("click", () => { selected = service; paintServices(); });
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
    b.addEventListener("click", () => { selectedDate = key; selectedTime = ""; paintMonth(); paintSlots(); });
    box.appendChild(b);
  }
  document.getElementById("prev").disabled = view.getFullYear() === today.getFullYear() && view.getMonth() <= today.getMonth();
}
function paintSlots() {
  const box = document.getElementById("slots");
  box.innerHTML = "";
  document.getElementById("dayHint").textContent = selectedDate ? parseYmd(selectedDate).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) : "";
  if (!selectedDate) return;
  const slots = slotsFor(parseYmd(selectedDate));
  if (!slots.length) { box.innerHTML = '<p class="hint">Sem horário neste dia.</p>'; return; }
  slots.forEach((time) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "slot" + (time === selectedTime ? " on" : "");
    b.textContent = time;
    b.addEventListener("click", () => { selectedTime = time; paintSlots(); });
    box.appendChild(b);
  });
}
function paintReview() {
  const rows = [
    ["Serviço", selected ? selected.name : "—"],
    ["Quando", selectedDate && selectedTime ? parseYmd(selectedDate).toLocaleDateString("pt-BR") + " · " + selectedTime : "—"],
    ["Valor", selected ? money(selected.price) : "—"],
    ["Nome", document.getElementById("name").value.trim() || "—"],
    ["WhatsApp", document.getElementById("phone").value.trim() || "—"]
  ];
  document.getElementById("review").innerHTML = rows.map((row) => "<div><dt>" + row[0] + "</dt><dd>" + row[1] + "</dd></div>").join("");
}
function contactOk() {
  const name = document.getElementById("name").value.trim();
  const digits = document.getElementById("phone").value.replace(/\D/g, "");
  const email = document.getElementById("email").value.trim();
  if (name.length < 2) return "Escreva seu nome.";
  if (digits.length < 10 || digits.length > 11) return "WhatsApp precisa ter DDD e número.";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "E-mail inválido.";
  return "";
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
document.getElementById("prev").addEventListener("click", () => { if (!document.getElementById("prev").disabled) { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); paintMonth(); } });
document.getElementById("next").addEventListener("click", () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); paintMonth(); });
document.getElementById("back").addEventListener("click", () => { if (step > 1) show(step - 1); });
document.getElementById("go").addEventListener("click", async () => {
  const msg = document.getElementById("msg");
  msg.textContent = "";
  if (step === 1 && !selected) { msg.textContent = "Escolha um serviço."; return; }
  if (step === 2 && !selectedDate) { msg.textContent = "Escolha um dia."; return; }
  if (step === 3 && !selectedTime) { msg.textContent = "Escolha um horário."; return; }
  if (step === 4) { const err = contactOk(); if (err) { msg.textContent = err; return; } }
  if (step < 5) { show(step + 1); return; }
  if (!canPick(parseYmd(selectedDate)) || slotsFor(parseYmd(selectedDate)).indexOf(selectedTime) < 0) { msg.textContent = "Esse horário não está mais livre."; return; }
  const err = contactOk();
  if (err) { msg.textContent = err; return; }
  const data = { event: "novo_agendamento", origem: "casa_passo", nome: document.getElementById("name").value.trim(), whatsapp: document.getElementById("phone").value.trim(), email: document.getElementById("email").value.trim() || null, servico: selected.name, minutos: selected.minutes, valor: selected.price, data: selectedDate, horario: selectedTime, enviado_em: new Date().toISOString() };
  const all = JSON.parse(localStorage.getItem(KEY) || "[]");
  all.push(data);
  localStorage.setItem(KEY, JSON.stringify(all));
  if (WEBHOOK_URL) {
    try {
      const response = await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error("webhook");
    } catch (error) { msg.textContent = "Você sai sem venda de produto. O foco é o atendimento marcado."; }
  }
  document.getElementById("screens").hidden = true;
  document.querySelector(".nav").hidden = true;
  document.querySelector(".bar").hidden = true;
  document.getElementById("done").hidden = false;
  document.getElementById("doneTitle").textContent = data.servico;
  document.getElementById("doneMeta").textContent = parseYmd(data.data).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }) + " às " + data.horario + " · " + data.nome;
});
document.getElementById("again").addEventListener("click", () => {
  selected = null; selectedDate = ""; selectedTime = ""; step = 1;
  document.getElementById("form").reset();
  document.getElementById("done").hidden = true;
  document.getElementById("screens").hidden = false;
  document.querySelector(".nav").hidden = false;
  document.querySelector(".bar").hidden = false;
  paintServices(); paintMonth(); paintSlots(); show(1);
});
paintServices();
paintMonth();
show(1);
