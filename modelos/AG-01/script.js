/*
  CONFIGURAÇÃO
  1. Troque WEBHOOK_URL pela URL do seu webhook (n8n, Make ou backend).
  2. Ajuste os serviços em SERVICES e os horários em TIME_OPTIONS.
  3. Os horários são demonstrativos. Para produção, consulte o backend para
     bloquear horários já ocupados e validar a disponibilidade no envio.
*/
const WEBHOOK_URL = "https://SEU-WEBHOOK-AQUI";

const SERVICES = [
  { name: "Sessão", price: 75, duration: 45 },
  { name: "Avaliação", price: 55, duration: 40 },
  { name: "Orientação", price: 35, duration: 40 },
  { name: "Retorno", price: 180, duration: 120 }
];

const TIME_OPTIONS = ["09:00", "09:45", "10:30", "11:15", "13:00", "13:45", "14:30", "15:15", "16:00", "16:45", "17:30"];

const form = document.getElementById("bookingForm");
const serviceGrid = document.getElementById("serviceGrid");
const calendarDays = document.getElementById("calendarDays");
const monthLabel = document.getElementById("monthLabel");
const prevMonth = document.getElementById("prevMonth");
const nextMonth = document.getElementById("nextMonth");
const timeSlots = document.getElementById("timeSlots");
const selectedDateLabel = document.getElementById("selectedDateLabel");
const slotCount = document.getElementById("slotCount");
const summaryService = document.getElementById("summaryService");
const summaryWhen = document.getElementById("summaryWhen");
const summaryPrice = document.getElementById("summaryPrice");
const submitButton = document.getElementById("submitButton");
const formMessage = document.getElementById("formMessage");
const phoneInput = document.getElementById("phone");

const today = new Date();
today.setHours(0, 0, 0, 0);
let viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
let selectedDate = "";
let selectedTime = "";
let selectedService = SERVICES[0];

function formatCurrency(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function parseDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function formatDate(key, options = { weekday: "long", day: "2-digit", month: "long" }) {
  return parseDate(key).toLocaleDateString("pt-BR", options);
}
function isAvailableDate(date) {
  // Demonstração: fechado aos domingos; datas passadas não podem ser selecionadas.
  return date >= today && date.getDay() !== 0;
}
function showMessage(message, type) {
  formMessage.textContent = message;
  formMessage.className = `form-message show ${type}`;
}
function clearMessage() {
  formMessage.textContent = "";
  formMessage.className = "form-message";
}

function renderCalendar() {
  const label = viewMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  monthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  calendarDays.innerHTML = "";

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const blank = document.createElement("span");
    blank.className = "day-blank";
    blank.setAttribute("aria-hidden", "true");
    calendarDays.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = dateKey(date);
    const available = isAvailableDate(date);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day";
    button.textContent = day;
    button.disabled = !available;
    button.setAttribute("aria-label", formatDate(key, { day: "numeric", month: "long", year: "numeric" }));
    button.setAttribute("aria-pressed", String(key === selectedDate));
    if (available) button.classList.add("available");
    if (key === dateKey(today)) button.classList.add("today");
    if (key === selectedDate) button.classList.add("selected");

    button.addEventListener("click", () => {
      selectedDate = key;
      selectedTime = "";
      clearMessage();
      renderCalendar();
      renderTimeSlots();
      updateSummary();
    });
    calendarDays.appendChild(button);
  }

  prevMonth.disabled = year === today.getFullYear() && month <= today.getMonth();
  prevMonth.style.opacity = prevMonth.disabled ? ".35" : "1";
}

function getSlotsForSelectedDate() {
  if (!selectedDate) return [];
  const chosen = parseDate(selectedDate);
  const now = new Date();
  return TIME_OPTIONS.filter((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    const slotDate = new Date(chosen.getFullYear(), chosen.getMonth(), chosen.getDate(), hours, minutes);
    return chosen > today || slotDate > now;
  });
}

function renderTimeSlots() {
  timeSlots.innerHTML = "";
  if (!selectedDate) {
    selectedDateLabel.textContent = "Selecione uma data";
    slotCount.textContent = "—";
    timeSlots.innerHTML = '<p class="empty-state">Escolha uma data no calendário para ver os horários.</p>';
    return;
  }

  selectedDateLabel.textContent = formatDate(selectedDate, { weekday: "short", day: "numeric", month: "short" });
  const slots = getSlotsForSelectedDate();
  slotCount.textContent = `${slots.length} horários`;

  if (!slots.length) {
    timeSlots.innerHTML = '<p class="empty-state">Não há horários disponíveis para esta data. Escolha outro dia.</p>';
    return;
  }

  slots.forEach((time) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `time-slot${time === selectedTime ? " selected" : ""}`;
    button.textContent = time;
    button.setAttribute("aria-pressed", String(time === selectedTime));
    button.addEventListener("click", () => {
      selectedTime = time;
      clearMessage();
      renderTimeSlots();
      updateSummary();
    });
    timeSlots.appendChild(button);
  });
}

function updateSummary() {
  summaryService.textContent = selectedService.name;
  summaryPrice.textContent = formatCurrency(selectedService.price);
  summaryWhen.textContent = selectedDate && selectedTime
    ? `${formatDate(selectedDate, { day: "2-digit", month: "long", year: "numeric" })} às ${selectedTime}`
    : "Selecione data e horário";
}

serviceGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".service-option");
  if (!button) return;
  selectedService = SERVICES.find((service) => service.name === button.dataset.service) || SERVICES[0];
  serviceGrid.querySelectorAll(".service-option").forEach((option) => {
    const active = option === button;
    option.classList.toggle("selected", active);
    option.setAttribute("aria-pressed", String(active));
  });
  clearMessage();
  updateSummary();
});

prevMonth.addEventListener("click", () => {
  if (prevMonth.disabled) return;
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1);
  renderCalendar();
});
nextMonth.addEventListener("click", () => {
  viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1);
  renderCalendar();
});

phoneInput.addEventListener("input", () => {
  const digits = phoneInput.value.replace(/\D/g, "").slice(0, 11);
  if (!digits) phoneInput.value = "";
  else if (digits.length <= 2) phoneInput.value = `(${digits}`;
  else if (digits.length <= 7) phoneInput.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  else if (digits.length <= 10) phoneInput.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  else phoneInput.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  if (!selectedDate || !selectedTime) {
    showMessage("Selecione uma data e um horário antes de solicitar o agendamento.", "error");
    return;
  }
  if (!isAvailableDate(parseDate(selectedDate))) {
    showMessage("Essa data não está disponível. Escolha outra data.", "error");
    return;
  }

  const payload = {
    event: "novo_agendamento",
    origem: "Escuta",
    cliente: {
      nome: document.getElementById("name").value.trim(),
      whatsapp: phoneInput.value.trim(),
      email: document.getElementById("email").value.trim() || null
    },
    agendamento: {
      servico: selectedService.name,
      duracao_minutos: selectedService.duration,
      valor: selectedService.price,
      data: selectedDate,
      horario: selectedTime,
      observacoes: document.getElementById("notes").value.trim() || null,
      status: "solicitado"
    },
    enviado_em: new Date().toISOString()
  };

  if (!payload.cliente.nome || !payload.cliente.whatsapp) {
    showMessage("Preencha seu nome e WhatsApp.", "error");
    return;
  }
  if (!WEBHOOK_URL || WEBHOOK_URL.includes("SEU-WEBHOOK-AQUI")) {
    showMessage("O formulário está pronto, mas falta configurar a URL do webhook no arquivo script.js.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.innerHTML = 'Enviando solicitação <span aria-hidden="true">…</span>';

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`Webhook respondeu com status ${response.status}`);

    showMessage("O pedido desta página não cobra agora. O consultório confirma a vaga.", "success");
    form.reset();
    selectedDate = "";
    selectedTime = "";
    selectedService = SERVICES[0];
    serviceGrid.querySelectorAll(".service-option").forEach((option, index) => {
      option.classList.toggle("selected", index === 0);
      option.setAttribute("aria-pressed", String(index === 0));
    });
    renderCalendar();
    renderTimeSlots();
    updateSummary();
  } catch (error) {
    console.error("Falha ao enviar agendamento:", error);
    showMessage("Não foi possível enviar agora. Verifique sua conexão ou tente novamente em instantes.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Solicitar agendamento <span aria-hidden="true">→</span>';
  }
});

renderCalendar();
renderTimeSlots();
updateSummary();
