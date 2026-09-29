(() => {
  "use strict";
  const HOURS = { 0:null, 1:[9,19], 2:[9,19], 3:[9,19], 4:[9,19], 5:[9,19], 6:[9,13] };
  const WHEN = ["no domingo","na segunda","na terça","na quarta","na quinta","na sexta","no sábado"];
  const status = document.querySelector("#status"), statusText = document.querySelector("#statusText"), toastEl = document.querySelector("#toast");
  let timer;
  const nextOpening = day => { for (let s=1;s<=7;s++){ const d=(day+s)%7; if(HOURS[d]) return `abre ${s===1?"amanhã":WHEN[d]} às ${HOURS[d][0]}h`; } return "sem expediente"; };
  const describe = now => { const r=HOURS[now.getDay()], m=now.getHours()*60+now.getMinutes(); if(!r) return {open:false,text:`Fechado · ${nextOpening(now.getDay())}`}; if(m<r[0]*60) return {open:false,text:`Abre hoje às ${r[0]}h`}; if(m>=r[1]*60) return {open:false,text:`Fechado · ${nextOpening(now.getDay())}`}; return {open:true,text:`Aberto agora · até ${r[1]}h`}; };
  const render = () => { const n=describe(new Date()); if(statusText.textContent!==n.text) statusText.textContent=n.text; status.classList.toggle("is-open", n.open); };
  const toast = m => { toastEl.textContent=m; toastEl.classList.add("show"); clearTimeout(timer); timer=setTimeout(()=>toastEl.classList.remove("show"),2400); };
  const copyText = (value, success) => { const fallback=()=>{ const a=document.createElement("textarea"); a.value=value; a.style.cssText="position:fixed;left:-9999px"; document.body.append(a); a.select(); toast(document.execCommand("copy")?success:"Não foi possível copiar"); a.remove(); }; if(navigator.clipboard&&window.isSecureContext) navigator.clipboard.writeText(value).then(()=>toast(success)).catch(fallback); else fallback(); };
  document.querySelector("#copyAddress").onclick = () => copyText(document.querySelector("#copyAddress").dataset.copy, "Endereço copiado");
  document.querySelector("#share").onclick = async () => { if(navigator.share){ try{ await navigator.share({title:"Clara",url:location.href}); return;}catch(e){ if(e.name==="AbortError") return;} } copyText(location.href,"Link copiado"); };
  document.querySelector("#year").textContent = String(new Date().getFullYear());
  render(); setInterval(render, 30000);
})();
