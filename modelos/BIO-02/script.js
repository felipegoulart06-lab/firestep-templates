
document.querySelectorAll('.card').forEach(card=>{
card.addEventListener('mousemove',e=>{
const r=card.getBoundingClientRect();
const x=(e.clientX-r.left)/r.width-.5;
const y=(e.clientY-r.top)/r.height-.5;
card.style.transform=`perspective(1000px) rotateY(${x*8}deg) rotateX(${-y*8}deg) translateY(-8px)`;
});
card.addEventListener('mouseleave',()=>{
card.style.transform='perspective(1000px) rotateX(0) rotateY(0)';
});
});
