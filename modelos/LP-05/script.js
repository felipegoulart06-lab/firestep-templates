/* Agendamento Ateliê Aura — demonstração com opção de webhook */
const WEBHOOK_URL = ""; // Cole aqui a URL do seu webhook para receber solicitações reais.

const form = document.querySelector("#bookingForm");
const formSteps = [...document.querySelectorAll(".form-step")];
const stepIndicators = [...document.querySelectorAll(".stepper .step")];
const dateInput = document.querySelector("#date");
const timeButtons = [...document.querySelectorAll("#timeGrid button")];
const timeHint = document.querySelector("#timeHint");
const phoneInput = document.querySelector("#phone");
const submitButton = document.querySelector("#submitButton");
const successState = document.querySelector("#successState");

const state = {
  service: "Retorno",
  price: 69.90,
  duration: "45 min",
  date: "",
  time: "",
  professional: "Primeira disponível"
};

const pad = value => String(value).padStart(2, "0");
const now = new Date();
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
dateInput.min = today;

function formatMoney(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function goToStep(step) {
  formSteps.forEach(section => {
    section.classList.toggle("active", Number(section.dataset.step) === step);
  });
  stepIndicators.forEach((indicator, index) => {
    const number = index + 1;
    indicator.classList.toggle("active", number === step);
    indicator.classList.toggle("done", number < step);
    indicator.querySelector(".step-number").textContent = number < step ? "✓" : String(number);
  });
  if (step === 4) updateSummary();
}

function showError(step, message) {
  const target = document.querySelector(`#error${step}`);
  if (target) target.textContent = message;
}

document.querySelectorAll(".service-option").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".service-option").forEach(option => {
      option.classList.remove("selected");
      option.setAttribute("aria-pressed", "false");
    });
    button.classList.add("selected");
    button.setAttribute("aria-pressed", "true");
    state.service = button.dataset.service;
    state.price = Number(button.dataset.price);
    state.duration = button.dataset.duration;
    showError(1, "");
  });
});

document.querySelector("#professional").addEventListener("change", event => {
  state.professional = event.target.value;
});

function refreshTimes() {
  state.date = dateInput.value;
  state.time = "";
  const selectedDate = state.date ? new Date(`${state.date}T12:00:00`) : null;
  const isSunday = selectedDate && selectedDate.getDay() === 0;
  const slots = ["09:00", "10:30", "13:00", "14:30", "16:00", "17:30"];

  timeHint.textContent = !state.date
    ? "Selecione uma data"
    : isSunday
      ? "Fechado aos domingos"
      : "Escolha um horário";

  timeButtons.forEach((button, index) => {
    button.textContent = slots[index];
    button.disabled = !state.date || Boolean(isSunday);
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");

    if (state.date === today) {
      const [hours, minutes] = slots[index].split(":").map(Number);
      const slotMinutes = hours * 60 + minutes;
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      if (slotMinutes <= currentMinutes) button.disabled = true;
    }
  });
}
dateInput.addEventListener("change", refreshTimes);

timeButtons.forEach(button => {
  button.addEventListener("click", () => {
    if (button.disabled) return;
    timeButtons.forEach(option => {
      option.classList.remove("selected");
      option.setAttribute("aria-pressed", "false");
    });
    button.classList.add("selected");
    button.setAttribute("aria-pressed", "true");
    state.time = button.textContent;
    showError(2, "");
  });
});

document.querySelectorAll("[data-next]").forEach(button => {
  button.addEventListener("click", () => {
    const nextStep = Number(button.dataset.next);

    if (nextStep === 2) {
      showError(1, "");
      goToStep(2);
      return;
    }

    if (nextStep === 3) {
      if (!state.date) {
        showError(2, "Escolha uma data para continuar.");
        return;
      }
      if (!state.time) {
        showError(2, "Selecione um horário disponível.");
        return;
      }
      showError(2, "");
      goToStep(3);
      return;
    }

    if (nextStep === 4) {
      const name = document.querySelector("#name").value.trim();
      const phoneDigits = phoneInput.value.replace(/\D/g, "");
      if (name.length < 2) {
        showError(3, "Informe seu nome completo.");
        document.querySelector("#name").focus();
        return;
      }
      if (phoneDigits.length < 10 || phoneDigits.length > 11) {
        showError(3, "Informe um número de WhatsApp válido com DDD.");
        phoneInput.focus();
        return;
      }
      showError(3, "");
      goToStep(4);
    }
  });
});

document.querySelectorAll("[data-back]").forEach(button => {
  button.addEventListener("click", () => goToStep(Number(button.dataset.back)));
});

phoneInput.addEventListener("input", () => {
  const digits = phoneInput.value.replace(/\D/g, "").slice(0, 11);
  let formatted = digits;
  if (digits.length > 6) {
    formatted = digits.length > 10
      ? digits.replace(/^(\d{2})(\d{5})(\d{0,4})$/, "($1) $2-$3")
      : digits.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
  } else if (digits.length > 2) {
    formatted = digits.replace(/^(\d{2})(\d*)$/, "($1) $2");
  } else if (digits.length) {
    formatted = `(${digits}`;
  }
  phoneInput.value = formatted;
});

function updateSummary() {
  const [year, month, day] = state.date.split("-");
  document.querySelector("#summaryService").textContent = state.service;
  document.querySelector("#summaryPrice").textContent = formatMoney(state.price);
  document.querySelector("#summaryDate").textContent = `${day}/${month}/${year}`;
  document.querySelector("#summaryTime").textContent = state.time;
  document.querySelector("#summaryProfessional").textContent = document.querySelector("#professional").value;
  document.querySelector("#summaryName").textContent = document.querySelector("#name").value.trim();
  document.querySelector("#summaryPhone").textContent = phoneInput.value;
}

form.addEventListener("submit", async event => {
  event.preventDefault();

  const payload = {
    origem: "Ateliê Aura - agendamento",
    servico: state.service,
    preco: state.price,
    duracao: state.duration,
    data: state.date,
    horario: state.time,
    profissional: document.querySelector("#professional").value,
    nome: document.querySelector("#name").value.trim(),
    whatsapp: phoneInput.value,
    observacoes: document.querySelector("#notes").value.trim(),
    criado_em: new Date().toISOString()
  };

  submitButton.disabled = true;
  submitButton.innerHTML = "Enviando…";

  try {
    if (WEBHOOK_URL.trim()) {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Não foi possível enviar a solicitação.");
    } else {
      const current = JSON.parse(localStorage.getItem("Sessão") || "[]");
      current.push(payload);
      localStorage.setItem("Sessão", JSON.stringify(current));
    }

    formSteps.forEach(section => section.classList.remove("active"));
    document.querySelector(".stepper").hidden = true;
    document.querySelector(".booking-heading").hidden = true;
    successState.hidden = false;
    document.querySelector("#successMessage").textContent = WEBHOOK_URL.trim()
      ? "Sua solicitação foi enviada. Nossa equipe entrará em contato para confirmar o horário."
      : "Cada consulta tem um foco. Se precisar de outro tema, marque outra sessão.";
  } catch (error) {
    showError(4, "Não foi possível enviar agora. Verifique a conexão e tente novamente.");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Solicitar horário <span aria-hidden="true">↗</span>';
  }
});

document.querySelector("#newBooking").addEventListener("click", () => {
  form.reset();
  state.service = "Retorno";
  state.price = 69.90;
  state.duration = "45 min";
  state.date = "";
  state.time = "";
  state.professional = "Primeira disponível";

  document.querySelectorAll(".service-option").forEach(option => {
    const selected = option.dataset.service === state.service;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-pressed", String(selected));
  });
  timeButtons.forEach(button => {
    button.disabled = true;
    button.classList.remove("selected");
    button.setAttribute("aria-pressed", "false");
  });
  timeHint.textContent = "Selecione uma data";
  ["error1", "error2", "error3", "error4"].forEach(id => {
    document.getElementById(id).textContent = "";
  });
  successState.hidden = true;
  document.querySelector(".stepper").hidden = false;
  document.querySelector(".booking-heading").hidden = false;
  goToStep(1);
});

const menuToggle = document.querySelector("#menuToggle");
const headerNav = document.querySelector(".header-nav");
menuToggle.addEventListener("click", () => {
  const isOpen = headerNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Fechar menu" : "Abrir menu");
});
headerNav.querySelectorAll("a").forEach(link => {
  link.addEventListener("click", () => {
    headerNav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Abrir menu");
  });
});
