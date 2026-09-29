(() => {
  "use strict";
  const HOURS = { 0: [11, 18], 1: null, 2: null, 3: [11, 20], 4: [11, 20], 5: [11, 20], 6: [10, 20] };
  const WHEN = ["no domingo", "na segunda", "na terça", "na quarta", "na quinta", "na sexta", "no sábado"];
  const status = document.querySelector("#status");
  const statusText = document.querySelector("#statusText");
  const toastEl = document.querySelector("#toast");
  let toastTimer;

  function nextOpening(day) {
    for (let step = 1; step <= 7; step += 1) {
      const nextDay = (day + step) % 7;
      if (!HOURS[nextDay]) continue;
      return `abre ${step === 1 ? "amanhã" : WHEN[nextDay]} às ${HOURS[nextDay][0]}h`;
    }
    return "sem expediente esta semana";
  }
  function describe(now) {
    const range = HOURS[now.getDay()];
    const minutes = now.getHours() * 60 + now.getMinutes();
    if (!range) return { open: false, text: `Fechado · ${nextOpening(now.getDay())}` };
    if (minutes < range[0] * 60) return { open: false, text: `Abre hoje às ${range[0]}h` };
    if (minutes >= range[1] * 60) return { open: false, text: `Fechado · ${nextOpening(now.getDay())}` };
    return { open: true, text: `Aberto agora · até ${range[1]}h` };
  }
  function renderStatus() {
    const next = describe(new Date());
    if (statusText.textContent !== next.text) statusText.textContent = next.text;
    status.classList.toggle("is-open", next.open);
  }
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
  }
  function copyText(value, success) {
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = value;
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      toast(document.execCommand("copy") ? success : "Não foi possível copiar");
      area.remove();
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(() => toast(success)).catch(fallback);
      return;
    }
    fallback();
  }

  document.querySelector("#copyAddress").addEventListener("click", () => {
    copyText(document.querySelector("#copyAddress").dataset.copy, "Endereço copiado");
  });
  document.querySelector("#share").addEventListener("click", async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Casa Maré", text: "Agende na Casa Maré.", url: location.href }); return; }
      catch (error) { if (error.name === "AbortError") return; }
    }
    copyText(location.href, "Link copiado");
  });
  document.querySelector("#year").textContent = String(new Date().getFullYear());
  renderStatus();
  setInterval(renderStatus, 30000);
})();
