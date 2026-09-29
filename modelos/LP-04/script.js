(() => {
  "use strict";
  // Para receber agendamentos reais, informe a URL do seu webhook aqui.
  const WEBHOOK_URL = "";
  const form = document.querySelector("#booking-form");
  const formSteps = [...document.querySelectorAll(".form-step")];
  const services = [...document.querySelectorAll(".service-card")];
  const dateInput = document.querySelector("#date");
  const timeButtons = [...document.querySelectorAll("[data-time]")];
  const toast = document.querySelector("#toast");
  const submit = document.querySelector("#submit");
  let currentStep = 1, selectedTime = "", toastTimer;

  const digits = value => value.replace(/\D/g, "");
  const money = value => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const chosenService = () => {
    const input = form.querySelector('[name="service"]:checked');
    return input ? { name: input.value, price: Number(input.dataset.price), duration: Number(input.dataset.duration) } : null;
  };
  const setError = (id, message = "") => { document.querySelector("#" + id).textContent = message; };
  const clearErrors = () => document.querySelectorAll(".error").forEach(el => { el.textContent = ""; });
  const showToast = message => {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  };
  const localISO = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  const today = new Date();
  dateInput.min = localISO(today);

  function setStep(step) {
    currentStep = step;
    formSteps.forEach(section => section.classList.toggle("active", Number(section.dataset.step) === step));
    document.querySelector("#progress").style.width = `${step / 3 * 100}%`;
    document.querySelector("#step-label").textContent = `ETAPA ${step} DE 3`;
    document.querySelector("#step-name").textContent = ["Escolha seu serviço", "Seus dados", "Revise e confirme"][step - 1];
    clearErrors();
  }

  services.forEach(card => card.addEventListener("click", () => {
    card.querySelector("input").checked = true;
    services.forEach(item => item.classList.toggle("selected", item === card));
    document.querySelector("#starting-price").textContent = money(chosenService().price);
  }));

  dateInput.addEventListener("change", () => {
    selectedTime = "";
    timeButtons.forEach(button => button.classList.remove("selected"));
    if (!dateInput.value) return;
    const picked = new Date(`${dateInput.value}T12:00:00`);
    if (dateInput.value < localISO(today)) {
      dateInput.value = "";
      showToast("Escolha uma data a partir de hoje.");
    } else if (picked.getDay() === 0) {
      dateInput.value = "";
      showToast("Não atendemos aos domingos. Escolha outro dia.");
    }
  });

  timeButtons.forEach(button => button.addEventListener("click", () => {
    if (!dateInput.value) {
      setError("step1-error", "Escolha uma data antes de selecionar o horário.");
      dateInput.focus();
      return;
    }
    timeButtons.forEach(item => item.classList.toggle("selected", item === button));
    selectedTime = button.dataset.time;
    setError("step1-error");
  }));

  function validateStep(step) {
    clearErrors();
    if (step === 1) {
      if (!chosenService()) { setError("step1-error", "Selecione um serviço para continuar."); return false; }
      if (!dateInput.value) { setError("step1-error", "Selecione a data do atendimento."); dateInput.focus(); return false; }
      if (!selectedTime) { setError("step1-error", "Agora escolha um dos horários disponíveis."); return false; }
      const day = new Date(`${dateInput.value}T12:00:00`).getDay();
      if (day === 0 || dateInput.value < localISO(today)) { setError("step1-error", "Selecione uma data válida."); return false; }
    }
    if (step === 2) {
      const name = form.elements.name.value.trim();
      const phone = digits(form.elements.phone.value);
      const email = form.elements.email.value.trim();
      if (name.length < 3) { setError("step2-error", "Informe seu nome completo."); form.elements.name.focus(); return false; }
      if (phone.length < 10 || phone.length > 11) { setError("step2-error", "Informe um WhatsApp válido com DDD."); form.elements.phone.focus(); return false; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("step2-error", "Confira o e-mail informado."); form.elements.email.focus(); return false; }
      fillSummary();
    }
    return true;
  }

  document.querySelectorAll(".next").forEach(button => button.addEventListener("click", () => {
    if (validateStep(currentStep)) setStep(Math.min(3, currentStep + 1));
  }));
  document.querySelectorAll(".back").forEach(button => button.addEventListener("click", () => setStep(Math.max(1, currentStep - 1))));
  document.querySelector("#edit-booking").addEventListener("click", () => setStep(1));

  function formatDate(value) {
    return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  }
  function fillSummary() {
    const service = chosenService();
    document.querySelector("#summary-service").textContent = `${service.name} · ${service.duration} min`;
    document.querySelector("#summary-date").textContent = formatDate(dateInput.value);
    document.querySelector("#summary-time").textContent = selectedTime;
    document.querySelector("#summary-name").textContent = form.elements.name.value.trim();
    document.querySelector("#summary-phone").textContent = form.elements.phone.value;
    document.querySelector("#summary-price").textContent = money(service.price);
  }

  form.elements.phone.addEventListener("input", event => {
    let value = digits(event.target.value).slice(0, 11);
    if (value.length > 10) value = value.replace(/^(\d{2})(\d{5})(\d{0,4})$/, "($1) $2-$3");
    else if (value.length > 6) value = value.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
    else if (value.length > 2) value = value.replace(/^(\d{2})(\d+)/, "($1) $2");
    else if (value.length) value = "(" + value;
    event.target.value = value;
  });

  function buildPayload() {
    const service = chosenService();
    return {
      id: "AMORA-" + Date.now().toString().slice(-8),
      service: service.name,
      price: service.price,
      duration_minutes: service.duration,
      date: dateInput.value,
      time: selectedTime,
      customer: {
        name: form.elements.name.value.trim(),
        phone: form.elements.phone.value.trim(),
        email: form.elements.email.value.trim(),
        notes: form.elements.notes.value.trim()
      },
      created_at: new Date().toISOString(),
      source: "Maison Amora"
    };
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (currentStep !== 3) return;
    if (!document.querySelector("#confirm").checked) {
      setError("step3-error", "Marque a confirmação para enviar sua solicitação.");
      return;
    }
    const payload = buildPayload();
    submit.disabled = true;
    submit.innerHTML = "Enviando...";
    try {
      if (WEBHOOK_URL) {
        const response = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("O servidor não aceitou a solicitação.");
      } else {
        const key = "maison_amora_demo_bookings";
        const existing = JSON.parse(localStorage.getItem(key) || "[]");
        existing.push(payload);
        localStorage.setItem(key, JSON.stringify(existing));
      }
      formSteps.forEach(section => section.classList.remove("active"));
      document.querySelector(".booking-heading").hidden = true;
      document.querySelector(".progress-track").hidden = true;
      document.querySelector(".step-label").hidden = true;
      document.querySelector("#success").hidden = false;
      document.querySelector("#protocol").textContent = "Protocolo: " + payload.id;
      document.querySelector("#agendar").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      setError("step3-error", "Não foi possível enviar. Verifique a conexão e tente novamente.");
      showToast(error.message || "Erro ao enviar a solicitação.");
    } finally {
      submit.disabled = false;
      submit.innerHTML = 'Solicitar horário <span>♡</span>';
    }
  });

  document.querySelector("#new-booking").addEventListener("click", () => {
    form.reset();
    selectedTime = "";
    timeButtons.forEach(button => button.classList.remove("selected"));
    services.forEach(card => card.classList.toggle("selected", card.querySelector("input").checked));
    document.querySelector("#starting-price").textContent = money(chosenService().price);
    document.querySelector("#success").hidden = true;
    document.querySelector(".booking-heading").hidden = false;
    document.querySelector(".progress-track").hidden = false;
    document.querySelector(".step-label").hidden = false;
    setStep(1);
    document.querySelector("#agendar").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  setStep(1);
})();