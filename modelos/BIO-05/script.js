(() => {
  "use strict";
  const HOURS = { 0: null, 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 18], 5: [9, 18], 6: [9, 16] };
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
      const ok = document.execCommand("copy");
      area.remove();
      toast(ok ? success : "Não foi possível copiar");
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).then(() => toast(success)).catch(fallback);
      return;
    }
    fallback();
  }

  const menu = document.querySelector("#menu");
  document.querySelector("#openMenu").addEventListener("click", () => menu.showModal());
  document.querySelector("#closeMenu").addEventListener("click", () => menu.close());
  menu.addEventListener("click", event => {
    const rect = menu.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) menu.close();
  });

  const stories = [...document.querySelectorAll(".story")];
  const dialog = document.querySelector("#storyDialog");
  const storyImage = document.querySelector("#storyImage");
  const storyCaption = document.querySelector("#storyCaption");
  const storyCount = document.querySelector("#storyCount");
  let index = 0;
  function showStory(next) {
    index = (next + stories.length) % stories.length;
    const image = stories[index].querySelector("img");
    storyImage.src = image.currentSrc || image.src;
    storyImage.alt = stories[index].dataset.caption;
    storyCaption.textContent = stories[index].dataset.caption;
    storyCount.textContent = `${index + 1} / ${stories.length}`;
  }
  stories.forEach((story, storyIndex) => {
    story.addEventListener("click", () => {
      showStory(storyIndex);
      dialog.showModal();
    });
  });
  document.querySelector("#closeStory").addEventListener("click", () => dialog.close());
  document.querySelector("#prevStory").addEventListener("click", () => showStory(index - 1));
  document.querySelector("#nextStory").addEventListener("click", () => showStory(index + 1));
  dialog.addEventListener("click", event => {
    const rect = dialog.getBoundingClientRect();
    const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    if (!inside) dialog.close();
  });

  document.querySelector("#copyAddress").addEventListener("click", () => {
    copyText(document.querySelector("#copyAddress").dataset.copy, "Endereço copiado");
  });
  document.querySelector("#share").addEventListener("click", async () => {
    if (navigator.share) {
      try { await navigator.share({ title: "Luma Beauty", text: "Agende na Luma Beauty.", url: location.href }); return; }
      catch (error) { if (error.name === "AbortError") return; }
    }
    copyText(location.href, "Link copiado");
  });
  document.querySelector("#year").textContent = String(new Date().getFullYear());
  renderStatus();
  setInterval(renderStatus, 30000);
})();
