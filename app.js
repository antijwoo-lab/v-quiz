let words=[],mode="",qs=[],i=0,score=0;
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const show=id=>{$$(".screen").forEach(x=>x.classList.remove("active"));$(id).classList.add("active")};
const shuffle=a=>[...a].sort(()=>Math.random()-.5);
async function load(){if(!words.length)words=await (await fetch("data/words.json")).json()}
$$("[data-mode]").forEach(b=>b.onclick=async()=>{await load();mode=b.dataset.mode;qs=shuffle(words).slice(0,Math.min(10,words.length));i=score=0;show("#quiz");render()});
function render(){let q=qs[i];$("#progress").textContent=`${i+1} / ${qs.length}`;$("#word").textContent=q.word;$("#choices").innerHTML="";$("#answer").classList.add("hidden");$("#reaction").classList.toggle("hidden",mode!=="reaction");
if(mode==="multiple"){let opts=shuffle([q.meaning,...shuffle(words.filter(x=>x.word!==q.word)).slice(0,3).map(x=>x.meaning)]);opts.forEach(t=>{let b=document.createElement("button");b.textContent=t;b.onclick=()=>reveal(t===q.meaning);$("#choices").appendChild(b)})}}
function reveal(ok){if(ok)score++;$("#meaning").textContent=qs[i].meaning;$("#vp").textContent=qs[i].vPoint;$("#answer").classList.remove("hidden");$("#reaction").classList.add("hidden");$$("#choices button").forEach(b=>b.disabled=true)}
$$("[data-known]").forEach(b=>b.onclick=()=>reveal(b.dataset.known==="true"));
$("#next").onclick=()=>{if(++i>=qs.length){$("#score").textContent=`${qs.length}문제 중 ${score}개 확인`;show("#result")}else render()};
$("#quit").onclick=$("#homeBtn").onclick=()=>show("#home");