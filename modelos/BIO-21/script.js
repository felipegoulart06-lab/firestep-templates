(() => {
  "use strict";
  const HOURS = { 0:[12,18], 1:null, 2:null, 3:null, 4:[14,22], 5:[14,22], 6:[12,20] };
  const WHEN = ["no domingo","na segunda","na terça","na quarta","na quinta","na sexta","no sábado"];
  const status = document.querySelector("#status"), statusText = document.querySelector("#statusText"), toastEl = document.querySelector("#toast");
  const sky = document.querySelector("#sky");
  const svg = sky.querySelector("svg");
  let timer;
  const nextOpening = day => { for (let s=1;s<=7;s++){ const d=(day+s)%7; if(HOURS[d]) return `abre ${s===1?"amanhã":WHEN[d]} às ${HOURS[d][0]}h`; } return "sem expediente"; };
  const describe = now => { const r=HOURS[now.getDay()], m=now.getHours()*60+now.getMinutes(); if(!r) return {open:false,text:`Fechado · ${nextOpening(now.getDay())}`}; if(m<r[0]*60) return {open:false,text:`Abre hoje às ${r[0]}h`}; if(m>=r[1]*60) return {open:false,text:`Fechado · ${nextOpening(now.getDay())}`}; return {open:true,text:`Aberto agora · até ${r[1]}h`}; };
  const render = () => { const n=describe(new Date()); if(statusText.textContent!==n.text) statusText.textContent=n.text; status.classList.toggle("is-open", n.open); };
  const toast = m => { toastEl.textContent=m; toastEl.classList.add("show"); clearTimeout(timer); timer=setTimeout(()=>toastEl.classList.remove("show"),2400); };
  const copyText = (value, success) => { const fallback=()=>{ const a=document.createElement("textarea"); a.value=value; a.style.cssText="position:fixed;left:-9999px"; document.body.append(a); a.select(); toast(document.execCommand("copy")?success:"Não foi possível copiar"); a.remove(); }; if(navigator.clipboard&&window.isSecureContext) navigator.clipboard.writeText(value).then(()=>toast(success)).catch(fallback); else fallback(); };
  const draw = () => {
    const stars = [...sky.querySelectorAll(".star img")];
    const box = sky.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const ns = "http://www.w3.org/2000/svg";
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    svg.replaceChildren();
    const pts = stars.map(img => {
      const r = img.getBoundingClientRect();
      return [r.left - box.left + r.width / 2, r.top - box.top + r.height / 2];
    });
    [[0,1],[1,3],[3,2],[2,0]].forEach(([a,b]) => {
      if (!pts[a] || !pts[b]) return;
      const line = document.createElementNS(ns, "line");
      line.setAttribute("x1", pts[a][0]); line.setAttribute("y1", pts[a][1]);
      line.setAttribute("x2", pts[b][0]); line.setAttribute("y2", pts[b][1]);
      svg.append(line);
    });
  };
  document.querySelector("#copyAddress").onclick = () => copyText(document.querySelector("#copyAddress").dataset.copy, "Endereço copiado");
  document.querySelector("#share").onclick = async () => { if(navigator.share){ try{ await navigator.share({title:"Estrela",url:location.href}); return;}catch(e){ if(e.name==="AbortError") return;} } copyText(location.href,"Link copiado"); };
  document.querySelector("#year").textContent = String(new Date().getFullYear());
  window.addEventListener("resize", draw);
  sky.querySelectorAll("img").forEach(img => { if (!img.complete) img.addEventListener("load", draw, { once:true }); });
  render(); draw(); setInterval(render, 30000);
})();
