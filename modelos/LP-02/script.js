(() => {
  "use strict";

  // Para receber agendamentos reais, informe aqui a URL do seu webhook.
  // Exemplo: const WEBHOOK_URL = "https://seu-dominio.com/webhook/agendamentos";
  const WEBHOOK_URL = "";

  const form = document.querySelector("#booking-form");
  const steps = [...document.querySelectorAll(".form-step")];
  const indicators = [...document.querySelectorAll("[data-step-indicator]")];
  const progressBar = document.querySelector("#progress-bar");
  const stepLabel = document.querySelector("#step-label");
  const progressPercent = document.querySelector("#progress-percent");
  const serviceCards = [...document.querySelectorAll(".service-card")];
  const categoryTabs = [...document.querySelectorAll(".category-tab")];
  const dateInput = document.querySelector("#booking-date");
  const timeButtons = [...document.querySelectorAll(".time-slot")];
  const toast = document.querySelector("#toast");
  const submitButton = document.querySelector("#submit-booking");
  let currentStep = 1;
  let selectedTime = "";
  let toastTimer;

  const money = value => new Intl.NumberFormat("pt-BR", {style:"currency", currency:"BRL"}).format(value);
  const selectedService = () => {
    const input = form.querySelector('input[name="service"]:checked');
    return input ? {name:input.value, price:Number(input.dataset.price), duration:Number(input.dataset.duration)} : null;
  };
  const showToast = message => {
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
  };
  const showError = (id, message) => {
    document.querySelector(`#${id}`).textContent = message;
  };
  const clearErrors = () => document.querySelectorAll(".form-error").forEach(el => el.textContent = "");

  function goToStep(step) {
    currentStep = step;
    steps.forEach(el => el.classList.toggle("active", Number(el.dataset.step) === step));
    indicators.forEach(el => {
      const n = Number(el.dataset.stepIndicator);
      el.classList.toggle("active", n === step);
      el.classList.toggle("done", n < step);
      el.querySelector(".step-number").textContent = n < step ? "✓" : String(n);
    });
    progressBar.style.width = `${step * 25}%`;
    stepLabel.textContent = `ETAPA ${step} DE 4`;
    progressPercent.textContent = `${step * 25}%`;
    clearErrors();
  }

  function filterServices(category) {
    categoryTabs.forEach(tab => tab.classList.toggle("active", tab.dataset.category === category));
    serviceCards.forEach(card => {
      card.hidden = category !== "Todos" && card.dataset.category !== category;
    });
  }

  categoryTabs.forEach(tab => tab.addEventListener("click", () => filterServices(tab.dataset.category)));
  serviceCards.forEach(card => {
    card.addEventListener("click", () => {
      const radio = card.querySelector("input");
      radio.checked = true;
      serviceCards.forEach(item => item.classList.toggle("selected", item === card));
    });
  });

  // A data mínima é hoje; horários são apenas demonstrativos até conectar uma agenda real.
  const today = new Date();
  const localISODate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  dateInput.min = localISODate(today);
  dateInput.addEventListener("change", () => {
    selectedTime = "";
    timeButtons.forEach(btn => btn.classList.remove("selected"));
    const date = new Date(`${dateInput.value}T12:00:00`);
    if (dateInput.value && date < new Date(`${localISODate(today)}T00:00:00`)) {
      dateInput.value = "";
      showToast("Escolha uma data a partir de hoje.");
      return;
    }
    if (dateInput.value && date.getDay() === 0) {
      dateInput.value = "";
      showToast("Não atendemos aos domingos. Escolha outra data.");
    }
  });
  timeButtons.forEach(btn => btn.addEventListener("click", () => {
    if (!dateInput.value) {
      showError("date-error", "Selecione uma data antes de escolher o horário.");
      dateInput.focus();
      return;
    }
    timeButtons.forEach(item => item.classList.toggle("selected", item === btn));
    selectedTime = btn.dataset.time;
    showError("date-error", "");
  }));

  function validateStep(step) {
    clearErrors();
    if (step === 1) {
      if (!selectedService()) {
        showError("service-error", "Selecione um serviço para continuar.");
        return false;
      }
    }
    if (step === 2) {
      if (!dateInput.value) {
        showError("date-error", "Selecione a data do atendimento.");
        dateInput.focus();
        return false;
      }
      if (!selectedTime) {
        showError("date-error", "Selecione um horário disponível.");
        return false;
      }
      const day = new Date(`${dateInput.value}T12:00:00`).getDay();
      if (day === 0) {
        showError("date-error", "Você pode remarcar pelo mesmo WhatsApp, com antecedência.");
        return false;
      }
    }
    if (step === 3) {
      const name = form.elements.name.value.trim();
      const phone = form.elements.phone.value.replace(/\D/g, "");
      const email = form.elements.email.value.trim();
      if (name.length < 3) {
        showError("customer-error", "Informe seu nome completo.");
        form.elements.name.focus();
        return false;
      }
      if (phone.length < 10 || phone.length > 13) {
        showError("customer-error", "Informe um número de WhatsApp válido com DDD.");
        form.elements.phone.focus();
        return false;
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError("customer-error", "Confira o formato do e-mail.");
        form.elements.email.focus();
        return false;
      }
      updateSummary();
    }
    return true;
  }

  document.querySelectorAll(".next-step").forEach(button => button.addEventListener("click", () => {
    if (validateStep(currentStep)) goToStep(Math.min(4, currentStep + 1));
  }));
  document.querySelectorAll(".prev-step").forEach(button => button.addEventListener("click", () => goToStep(Math.max(1, currentStep - 1))));

  function formatDate(value) {
    if (!value) return "—";
    return new Intl.DateTimeFormat("pt-BR", {weekday:"long", day:"2-digit", month:"long", year:"numeric"}).format(new Date(`${value}T12:00:00`));
  }
  function updateSummary() {
    const service = selectedService();
    document.querySelector("#summary-service").textContent = service ? `${service.name} · ${service.duration} min` : "—";
    document.querySelector("#summary-date").textContent = formatDate(dateInput.value);
    document.querySelector("#summary-time").textContent = selectedTime || "—";
    document.querySelector("#summary-name").textContent = form.elements.name.value.trim() || "—";
    document.querySelector("#summary-phone").textContent = form.elements.phone.value || "—";
    document.querySelector("#summary-price").textContent = service ? money(service.price) : "—";
  }

  const phoneInput = form.elements.phone;
  phoneInput.addEventListener("input", () => {
    let digits = phoneInput.value.replace(/\D/g, "").slice(0, 11);
    if (digits.length > 10) digits = digits.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    else if (digits.length > 6) digits = digits.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    else if (digits.length > 2) digits = digits.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
    else if (digits.length > 0) digits = digits.replace(/^(\d*)/, "($1");
    phoneInput.value = digits;
  });

  function buildBooking() {
    const service = selectedService();
    return {
      id: `FL-${Date.now().toString().slice(-8)}`,
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
      source: "Flora Beauty Studio"
    };
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (currentStep !== 4) return;
    const consent = document.querySelector("#confirm-consent");
    if (!consent.checked) {
      showError("confirm-error", "Marque a confirmação para concluir.");
      return;
    }
    const booking = buildBooking();
    submitButton.disabled = true;
    submitButton.textContent = "Enviando...";
    try {
      if (WEBHOOK_URL) {
        const response = await fetch(WEBHOOK_URL, {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify(booking)
        });
        if (!response.ok) throw new Error("Não foi possível enviar o agendamento.");
      } else {
        const key = "flora_demo_bookings";
        const bookings = JSON.parse(localStorage.getItem(key) || "[]");
        bookings.push(booking);
        localStorage.setItem(key, JSON.stringify(bookings));
      }
      steps.forEach(el => el.classList.remove("active"));
      document.querySelector("#success-panel").hidden = false;
      document.querySelector("#success-reference").textContent = `Código da solicitação: ${booking.id}`;
      document.querySelector(".progress-top").style.display = "none";
      document.querySelector(".progress-track").style.display = "none";
      indicators.forEach(el => el.classList.add("done"));
      document.querySelector("#agendamento").scrollIntoView({behavior:"smooth", block:"start"});
    } catch (error) {
      showError("confirm-error", "Não foi possível enviar agora. Confira a conexão e tente novamente.");
      showToast(error.message || "Erro ao enviar.");
    } finally {
      submitButton.disabled = false;
      submitButton.innerHTML = 'Confirmar agendamento <span>♡</span>';
    }
  });

  document.querySelector("#new-booking").addEventListener("click", () => {
    form.reset();
    selectedTime = "";
    timeButtons.forEach(btn => btn.classList.remove("selected"));
    serviceCards.forEach(card => card.classList.toggle("selected", card.querySelector("input").checked));
    document.querySelector("#success-panel").hidden = true;
    document.querySelector(".progress-top").style.display = "";
    document.querySelector(".progress-track").style.display = "";
    goToStep(1);
    document.querySelector("#agendamento").scrollIntoView({behavior:"smooth", block:"start"});
  });

  goToStep(1);
})();