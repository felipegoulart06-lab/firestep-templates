const WEBHOOK_URL = ""; // Cole aqui a URL do webhook (n8n, CRM etc.).

const form = document.querySelector("#bookingForm");
const formSteps = [...document.querySelectorAll(".form-step")];
const stepIndicators = [...document.querySelectorAll(".step")];
const success = document.querySelector("#success");
const submitBtn = document.querySelector("#submitBtn");
let currentStep = 1;

const now = new Date();
document.querySelector("#date").min = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function goToStep(step) {
  currentStep = step;
  formSteps.forEach(el => el.classList.toggle("active", Number(el.dataset.step) === step));
  stepIndicators.forEach((el, index) => {
    el.classList.toggle("active", index + 1 <= step);
  });
}
function validateFields(fields) {
  for (const field of fields) {
    if (field.name === "email" && !field.value.trim()) continue;
    if (!field.checkValidity()) {
      field.reportValidity();
      field.focus();
      return false;
    }
  }
  return true;
}
function selectedService() {
  return form.querySelector('input[name="service"]:checked')?.value || "";
}
document.querySelectorAll(".service").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".service").forEach(el => el.classList.remove("selected"));
    card.classList.add("selected");
    card.querySelector("input").checked = true;
  });
});
document.querySelectorAll(".next").forEach(button => {
  if (button.type === "submit") return;
  button.addEventListener("click", () => {
    if (currentStep === 1) goToStep(2);
    else if (currentStep === 2) {
      if (!validateFields([form.elements.date, form.elements.time])) return;
      goToStep(3);
    } else if (currentStep === 3) {
      if (!validateFields([form.elements.name, form.elements.phone, form.elements.email])) return;
      const digits = form.elements.phone.value.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 11) {
        form.elements.phone.setCustomValidity("Informe um telefone com DDD.");
        form.elements.phone.reportValidity();
        return;
      }
      form.elements.phone.setCustomValidity("");
      updateSummary();
      goToStep(4);
    }
  });
});
document.querySelectorAll(".prev").forEach(button => button.addEventListener("click", () => goToStep(Math.max(1, currentStep - 1))));
function updateSummary() {
  const date = form.elements.date.value;
  document.querySelector("#sumService").textContent = selectedService();
  document.querySelector("#sumDate").textContent = date ? new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {day:"2-digit",month:"long",year:"numeric"}) : "—";
  document.querySelector("#sumTime").textContent = form.elements.time.value;
  document.querySelector("#sumName").textContent = form.elements.name.value.trim();
}
form.elements.phone.addEventListener("input", event => {
  let d = event.target.value.replace(/\D/g, "").slice(0, 11);
  if (d.length > 10) d = d.replace(/^(\d{2})(\d{5})(\d{0,4})$/, "($1) $2-$3");
  else if (d.length > 6) d = d.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
  else if (d.length > 2) d = d.replace(/^(\d{2})(\d+)/, "($1) $2");
  else if (d.length) d = "(" + d;
  event.target.value = d;
  event.target.setCustomValidity("");
});
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!document.querySelector("#consent").checked) {
    document.querySelector("#consent").reportValidity();
    return;
  }
  const payload = {
    business: "Bella Vita",
    service: selectedService(),
    date: form.elements.date.value,
    time: form.elements.time.value,
    name: form.elements.name.value.trim(),
    phone: form.elements.phone.value.trim(),
    email: form.elements.email.value.trim(),
    source: "landing-page",
    createdAt: new Date().toISOString()
  };
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";
  try {
    if (WEBHOOK_URL.trim()) {
      const response = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error("Falha no envio");
    } else {
      const records = JSON.parse(localStorage.getItem("bella_vita_bookings") || "[]");
      records.push(payload);
      localStorage.setItem("bella_vita_bookings", JSON.stringify(records));
    }
    form.hidden = true;
    document.querySelector(".steps").hidden = true;
    success.hidden = false;
  } catch (err) {
    alert("Não foi possível enviar agora. Confira a conexão e tente novamente.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Solicitar horário ↗";
  }
});
document.querySelector("#restart").addEventListener("click", () => {
  form.reset();
  form.hidden = false;
  success.hidden = true;
  document.querySelector(".steps").hidden = false;
  document.querySelectorAll(".service").forEach(el => el.classList.remove("selected"));
  const first = document.querySelector(".service");
  first.classList.add("selected");
  first.querySelector("input").checked = true;
  goToStep(1);
});
const menuBtn = document.querySelector("#menuBtn");
const nav = document.querySelector("#nav");
menuBtn.addEventListener("click", () => {
  const open = nav.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", String(open));
  menuBtn.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
});
nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
  nav.classList.remove("open");
  menuBtn.setAttribute("aria-expanded", "false");
}));
