updateShelfCounts();
$('#eyebrow').textContent=new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}).toUpperCase();
const initialView=location.hash.slice(1);
if(Object.hasOwn(titles,initialView))showView(initialView);
window.addEventListener('popstate',()=>showView(Object.hasOwn(titles,location.hash.slice(1))?location.hash.slice(1):'home'));
