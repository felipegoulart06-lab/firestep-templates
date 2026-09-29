(() => {
  "use strict";
  const HOURS = { 0: null, 1: null, 2: [10, 19], 3: [10, 19], 4: [10, 19], 5: [10, 19], 6: [9, 17] };
  const WHEN = ["no domingo", "na segunda", "na terça", "na quarta", "na quinta", "na sexta", "no sábado"];
  const status = document.querySelector("#status");
  const statusText = document.querySelector("#statusText");
  const toastEl = document.querySelector("#toast");
  let toastTimer;

  function nextOpening(day) {
    for (let step = 1; step <= 7; step += 1) {
      const nextDay = (day + step) % 7;
      if (!HOURS[nextDay]) continue;
      const when = step === 1 ? "amanhã" : WHEN[nextDay];
      return `abre ${when} às ${HOURS[nextDay][0]}h`;
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
    const done = () => toast(success);
    const fallback = () => {
      const area = document.createElement("textarea");
      area.value = value;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      toast(ok ? success : "Não foi possível copiar");
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done).catch(fallback);
      return;
    }
    fallback();
  }

  document.querySelectorAll("[data-filter]").forEach(button => {
    button.addEventListener("click", () => {
      const kind = button.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("on", item === button));
      let visible = 0;
      document.querySelectorAll(".tile").forEach(tile => {
        const show = kind === "todos" || tile.dataset.kind === kind;
        tile.hidden = !show;
        if (show) visible += 1;
      });
      document.querySelector("#empty").hidden = visible > 0;
    });
  });

  document.querySelector("#copyAddress").addEventListener("click", () => {
    copyText(document.querySelector("#copyAddress").dataset.copy, "Endereço copiado");
  });
  document.querySelector("#share").addEventListener("click", async () => {
    const data = { title: "Vértice Studio", text: "Agende no Vértice Studio.", url: location.href };
    if (navigator.share) {
      try { await navigator.share(data); return; } catch (error) { if (error.name === "AbortError") return; }
    }
    copyText(location.href, "Link copiado");
  });

  document.querySelector("#year").textContent = String(new Date().getFullYear());
  renderStatus();
  setInterval(renderStatus, 30000);
})();
