(() => {
  "use strict";
  const HOURS = { 0: null, 1: [8, 18], 2: [8, 18], 3: [8, 18], 4: [8, 18], 5: [8, 18], 6: [9, 14] };
  const WHEN = ["no domingo", "na segunda", "na terça", "na quarta", "na quinta", "na sexta", "no sábado"];
  const status = document.querySelector("#status");
  const statusText = document.querySelector("#statusText");
  const toastEl = document.querySelector("#toast");
  const tabs = [...document.querySelectorAll("[role='tab']")];
  const panels = [...document.querySelectorAll("[role='tabpanel']")];
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
  function selectTab(id) {
    tabs.forEach(tab => {
      const on = tab.getAttribute("aria-controls") === id;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.id !== id; });
  }

  tabs.forEach((tab, tabIndex) => {
    tab.addEventListener("click", () => selectTab(tab.getAttribute("aria-controls")));
    tab.addEventListener("keydown", event => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(tabIndex + direction + tabs.length) % tabs.length];
      next.focus();
      selectTab(next.getAttribute("aria-controls"));
    });
  });

  const today = document.querySelector(`#hours [data-day="${new Date().getDay()}"]`);
  if (today) {
    today.classList.add("is-today");
    const mark = document.createElement("em");
    mark.textContent = "hoje";
    today.querySelector("span").append(mark);
  }

  document.querySelector("#copyAddress").addEventListener("click", () => {
    copyText(document.querySelector("#copyAddress").dataset.copy, "Endereço copiado");
  });
  document.querySelector("#share").addEventListener("click", async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Oficina Rosa", text: "Agende na Oficina Rosa.", url: location.href }); return; }
      catch (error) { if (error.name === "AbortError") return; }
    }
    copyText(location.href, "Link copiado");
  });
  document.querySelector("#year").textContent = String(new Date().getFullYear());
  renderStatus();
  setInterval(renderStatus, 30000);
})();
