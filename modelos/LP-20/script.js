
(() => {
  "use strict";
  const BUSINESS = 'Brasa';
  const KEY = 'lp20_bookings';
  const form = document.querySelector("#bookingForm");
  const steps = [...document.querySelectorAll(".form-step")];
  const progressBar = document.querySelector("#progressBar");
  const stepNumber = document.querySelector("#stepNumber");
  const successPanel = document.querySelector("#successPanel");
  const submitButton = document.querySelector("#submitBooking");
  let currentStep = 1;
  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().split("T")[0];
  form.elements.date.min = localToday;
  const showStep = step => {
    currentStep = step;
    steps.forEach(section => section.classList.toggle("active", Number(section.dataset.step) === step));
    stepNumber.textContent = String(step).padStart(2, "0");
    progressBar.style.width = `${(step / 3) * 100}%`;
  };
  const selectedService = () => form.querySelector('input[name="service"]:checked')?.value || "";
  const validateStep = step => {
    const fields = step === 1 ? [form.elements.date, form.elements.time] : step === 2 ? [form.elements.name, form.elements.phone, form.elements.email] : [];
    for (const field of fields) {
      if (field.name === "email" && !field.value.trim()) continue;
      if (!field.checkValidity()) { field.reportValidity(); field.focus(); return false; }
    }
    if (step === 2) {
      const digits = form.elements.phone.value.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 11) {
        form.elements.phone.setCustomValidity("Informe um telefone com DDD.");
        form.elements.phone.reportValidity();
        form.elements.phone.focus();
        return false;
      }
      form.elements.phone.setCustomValidity("");
    }
    return true;
  };
  document.querySelectorAll(".service-option").forEach(option => option.addEventListener("click", () => {
    document.querySelectorAll(".service-option").forEach(item => item.classList.remove("selected"));
    option.classList.add("selected");
    option.querySelector("input").checked = true;
  }));
  const updateReview = () => {
    const dateValue = form.elements.date.value;
    const formatted = dateValue ? new Date(`${dateValue}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) : "—";
    document.querySelector("#reviewService").textContent = selectedService();
    document.querySelector("#reviewDate").textContent = formatted;
    document.querySelector("#reviewTime").textContent = form.elements.time.value || "—";
    document.querySelector("#reviewName").textContent = form.elements.name.value.trim() || "—";
  };
  document.querySelectorAll(".next-step").forEach(button => button.addEventListener("click", () => {
    if (!validateStep(currentStep)) return;
    if (currentStep === 2) updateReview();
    showStep(Math.min(3, currentStep + 1));
  }));
  document.querySelectorAll(".prev-step").forEach(button => button.addEventListener("click", () => showStep(Math.max(1, currentStep - 1))));
  form.elements.phone.addEventListener("input", event => {
    let value = event.target.value.replace(/\D/g, "").slice(0, 11);
    if (value.length > 10) value = value.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    else if (value.length > 6) value = value.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    else if (value.length > 2) value = value.replace(/^(\d{2})(\d{0,5})/, "($1) $2");
    else if (value.length) value = value.replace(/^(\d*)/, "($1");
    event.target.value = value;
    event.target.setCustomValidity("");
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!validateStep(1) || !validateStep(2) || !document.querySelector("#consent").checked) {
      if (!document.querySelector("#consent").checked) document.querySelector("#consent").reportValidity();
      return;
    }
    const payload = { business: BUSINESS, service: selectedService(), date: form.elements.date.value, time: form.elements.time.value, name: form.elements.name.value.trim(), phone: form.elements.phone.value.trim(), email: form.elements.email.value.trim(), createdAt: new Date().toISOString() };
    const existing = JSON.parse(localStorage.getItem(KEY) || "[]");
    existing.push(payload);
    localStorage.setItem(KEY, JSON.stringify(existing));
    form.hidden = true;
    document.querySelector(".booking-top").hidden = true;
    document.querySelector(".progress-track").hidden = true;
    successPanel.hidden = false;
  });
  document.querySelector("#newBooking").addEventListener("click", () => {
    form.reset();
    form.hidden = false;
    successPanel.hidden = true;
    document.querySelector(".booking-top").hidden = false;
    document.querySelector(".progress-track").hidden = false;
    document.querySelectorAll(".service-option").forEach(item => item.classList.remove("selected"));
    const first = document.querySelector(".service-option");
    first.classList.add("selected");
    first.querySelector("input").checked = true;
    showStep(1);
  });
  const menuToggle = document.querySelector("#menuToggle");
  const mainNav = document.querySelector("#mainNav");
  menuToggle.addEventListener("click", () => {
    const open = mainNav.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", String(open));
    menuToggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
  });
  mainNav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
    mainNav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  }));
  document.querySelector("#year").textContent = String(new Date().getFullYear());
})();
