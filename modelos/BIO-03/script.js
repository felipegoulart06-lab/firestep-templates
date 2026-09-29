(() => {
  "use strict";

  const HOURS = {
    0: null,
    1: [9, 19],
    2: [9, 19],
    3: [9, 19],
    4: [9, 19],
    5: [9, 19],
    6: [9, 16]
  };
  const WHEN = ["no domingo", "na segunda", "na terça", "na quarta", "na quinta", "na sexta", "no sábado"];

  const status = document.querySelector("#status");
  const statusText = document.querySelector("#statusText");
  const presence = document.querySelector("#presence");
  const toastEl = document.querySelector("#toast");
  let toastTimer;

  function nextOpening(day) {
    for (let step = 1; step <= 7; step += 1) {
      const nextDay = (day + step) % 7;
      const range = HOURS[nextDay];
      if (!range) continue;
      const when = step === 1 ? "amanhã" : WHEN[nextDay];
      return `abre ${when} às ${range[0]}h`;
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
    presence.classList.toggle("is-open", next.open);
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
  }

  function copyText(value, success) {
    const done = () => toast(success);
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(done).catch(() => fallbackCopy(value, success));
      return;
    }
    fallbackCopy(value, success);
  }

  function fallbackCopy(value, success) {
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
  }

  const today = document.querySelector(`#hours [data-day="${new Date().getDay()}"]`);
  if (today) {
    today.classList.add("is-today");
    const mark = document.createElement("em");
    mark.textContent = "hoje";
    today.querySelector("span").append(mark);
  }

  document.querySelector("#year").textContent = String(new Date().getFullYear());
  document.querySelector("#copyAddress").addEventListener("click", () => {
    copyText(document.querySelector("#copyAddress").dataset.copy, "Endereço copiado");
  });
  document.querySelector("#share").addEventListener("click", async () => {
    const data = {
      title: "Acolhida",
      text: "Traga o que quiser contar. Não há roteiro obrigatório.",
      url: location.href
    };
    if (navigator.share) {
      try {
        await navigator.share(data);
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    copyText(location.href, "Link copiado");
  });

  const shots = [...document.querySelectorAll(".shot")];
  const dialog = document.querySelector("#portfolio");
  const portfolioImage = document.querySelector("#portfolioImage");
  const portfolioCaption = document.querySelector("#portfolioCaption");
  const portfolioCount = document.querySelector("#portfolioCount");
  let index = 0;
  let lastTrigger = null;

  function showShot(next) {
    index = (next + shots.length) % shots.length;
    const shot = shots[index];
    const image = shot.querySelector("img");
    portfolioImage.src = image.currentSrc || image.src;
    portfolioImage.alt = shot.dataset.caption;
    portfolioCaption.textContent = shot.dataset.caption;
    portfolioCount.textContent = `${index + 1} / ${shots.length}`;
  }

  shots.forEach((shot, shotIndex) => {
    shot.addEventListener("click", () => {
      lastTrigger = shot;
      showShot(shotIndex);
      if (typeof dialog.showModal === "function") dialog.showModal();
    });
  });

  document.querySelector("#closePortfolio").addEventListener("click", () => dialog.close());
  document.querySelector("#prevShot").addEventListener("click", () => showShot(index - 1));
  document.querySelector("#nextShot").addEventListener("click", () => showShot(index + 1));
  dialog.addEventListener("close", () => lastTrigger?.focus());
  dialog.addEventListener("click", event => {
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });
  dialog.addEventListener("keydown", event => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      showShot(index + 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showShot(index - 1);
    }
  });

  const figure = document.querySelector("#portfolioFigure");
  let startX = 0;
  figure.addEventListener("touchstart", event => {
    startX = event.changedTouches[0].clientX;
  }, { passive: true });
  figure.addEventListener("touchend", event => {
    const delta = event.changedTouches[0].clientX - startX;
    if (delta > 48) showShot(index - 1);
    if (delta < -48) showShot(index + 1);
  }, { passive: true });

  const finePointer = window.matchMedia("(pointer: fine)");
  if (finePointer.matches) {
    window.addEventListener("pointermove", event => {
      document.documentElement.style.setProperty("--mx", `${event.clientX}px`);
      document.documentElement.style.setProperty("--my", `${event.clientY}px`);
    });
  }

  renderStatus();
  setInterval(renderStatus, 30000);
})();
