const SVG_NS="http://www.w3.org/2000/svg";
const svg=document.getElementById("svg");
const gGuides=document.getElementById("gGuides");
const gEdges=document.getElementById("gEdges");
const gNodes=document.getElementById("gNodes");
const viewport=document.getElementById("viewport");
const ctxMenu=document.getElementById("ctxMenu");
const wedit=document.getElementById("wedit");
const R=22;
let view={tx:0,ty:0,k:1};
function applyView(){viewport.setAttribute("transform",`translate(${view.tx} ${view.ty}) scale(${view.k})`);updateStatus();}

let state={nodes:[],edges:[],directed:true,nextId:1,nextLabel:1,result:null};
let mode="move";
let edgeStart=null;
let dragNode=null, dragDX=0, dragDY=0, dragged=false, dragSnapshot=null;
let hoverTarget=null;
let selected=null;        // {type:'node'|'edge', id}
let guides=[];
let calcDir="from";       // 'from' = desde un origen · 'to' = hacia un destino

/* ---------- utilidades ---------- */
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("show"),1800);}
function svgPoint(evt){const r=svg.getBoundingClientRect();return{x:(evt.clientX-r.left-view.tx)/view.k,y:(evt.clientY-r.top-view.ty)/view.k};}
function nodeById(id){return state.nodes.find(n=>n.id===id);}
function findEdge(from,to){return state.edges.find(e=>e.from===from&&e.to===to);}
function updateDirUI(){document.querySelectorAll("#dirSwitch button").forEach(x=>x.classList.toggle("on",(x.dataset.dir==="1")===state.directed));}
function dims(){return{w:svg.clientWidth||900,h:svg.clientHeight||600};}
function hintFor(m){return{
  move:"Arrastra nodos para moverlos o el fondo para navegar. Clic = seleccionar, doble clic en un peso para editar, clic derecho para más opciones.",
  node:"Haz clic en un espacio vacío para crear un nodo.",
  edge:"Haz clic en el nodo de origen y luego en el de destino; escribe el peso.",
  delete:"Haz clic en un nodo o arista para eliminarlo."}[m];}

/* ---------- estado / barra ---------- */
function updateStatus(){
  document.getElementById("stMode").textContent={move:"Mover",node:"Agregar nodo",edge:"Agregar arista",delete:"Borrar"}[mode];
  document.getElementById("stCounts").textContent=state.nodes.length+" nodos · "+state.edges.length+" aristas";
  document.getElementById("stDir").textContent=state.directed?"dirigido":"no dirigido";
  document.getElementById("stZoom").textContent=Math.round(view.k*100)+"%";
  document.getElementById("stHint").textContent=hintFor(mode);
  document.getElementById("undoBtn").disabled=!history.length;
  document.getElementById("redoBtn").disabled=!future.length;
  document.getElementById("empty").style.display=state.nodes.length?"none":"flex";
}

/* ---------- historial ---------- */
let history=[], future=[];
function snapshot(){return JSON.stringify({nodes:state.nodes,edges:state.edges,directed:state.directed,nextId:state.nextId,nextLabel:state.nextLabel});}
function pushHistory(){history.push(snapshot());if(history.length>200)history.shift();future=[];}
function restore(s){const o=JSON.parse(s);state.nodes=o.nodes;state.edges=o.edges;state.directed=o.directed;state.nextId=o.nextId;state.nextLabel=o.nextLabel;edgeStart=null;hoverTarget=null;selected=null;updateDirUI();clearResult();render();refreshSrc();}
function undo(){if(!history.length){toast("Nada que deshacer");return;}future.push(snapshot());restore(history.pop());}
function redo(){if(!future.length){toast("Nada que rehacer");return;}history.push(snapshot());restore(future.pop());}
document.getElementById("undoBtn").onclick=undo;
document.getElementById("redoBtn").onclick=redo;

/* ---------- creación / borrado ---------- */
function addNode(x,y){pushHistory();state.nodes.push({id:state.nextId++,label:String(state.nextLabel++),x,y});clearResult();render();refreshSrc();}
function addEdge(from,to,w){
  if(from===to){toast("No se permiten lazos");return;}
  pushHistory();
  let e=findEdge(from,to);
  if(e){e.w=w;}else state.edges.push({id:"e"+(state.nextId++),from,to,w});
  clearResult();render();
}
function deleteNode(id){pushHistory();state.nodes=state.nodes.filter(n=>n.id!==id);state.edges=state.edges.filter(e=>e.from!==id&&e.to!==id);if(selected&&selected.type==="node"&&selected.id===id)selected=null;clearResult();render();refreshSrc();}
function deleteEdge(id){pushHistory();state.edges=state.edges.filter(e=>e.id!==id);if(selected&&selected.type==="edge"&&selected.id===id)selected=null;clearResult();render();}
function clearAll(){state.nodes=[];state.edges=[];state.nextId=1;state.nextLabel=1;edgeStart=null;selected=null;view={tx:0,ty:0,k:1};applyView();clearResult();render();refreshSrc();}

/* ---------- modos ---------- */
function setMode(m){
  mode=m;edgeStart=null;
  document.querySelectorAll(".tool").forEach(x=>x.classList.toggle("active",x.dataset.mode===m));
  svg.style.cursor=m==="move"?"grab":(m==="delete"?"pointer":"crosshair");
  render();updateStatus();
}
document.querySelectorAll(".tool").forEach(b=>{b.onclick=()=>setMode(b.dataset.mode);});
document.querySelectorAll("#dirSwitch button").forEach(b=>{
  b.onclick=()=>{if((b.dataset.dir==="1")===state.directed)return;pushHistory();state.directed=b.dataset.dir==="1";updateDirUI();clearResult();render();};
});

/* ---------- paneo y arrastre ---------- */
let panning=false, panStartX=0, panStartY=0, panOrig=null;
svg.addEventListener("mousedown",e=>{
  hideMenu();
  const target=e.target.closest("[data-node]");
  if(mode==="move"&&target&&e.button===0){
    dragNode=nodeById(+target.dataset.node);dragged=false;dragSnapshot=snapshot();
    selected={type:"node",id:dragNode.id};
    const p=svgPoint(e);dragDX=p.x-dragNode.x;dragDY=p.y-dragNode.y;
    svg.style.cursor="grabbing";render();return;
  }
  if(e.button===1 || (mode==="move"&&!target&&e.button===0)){
    panning=true;panStartX=e.clientX;panStartY=e.clientY;panOrig={tx:view.tx,ty:view.ty};
    svg.style.cursor="grabbing";e.preventDefault();
  }
});
svg.addEventListener("mousemove",e=>{
  if(panning){view.tx=panOrig.tx+(e.clientX-panStartX);view.ty=panOrig.ty+(e.clientY-panStartY);applyView();return;}
  if(dragNode){
    const p=svgPoint(e);let nx=p.x-dragDX, ny=p.y-dragDY;const snap=7/view.k;guides=[];
    state.nodes.forEach(o=>{if(o.id===dragNode.id)return;
      if(Math.abs(nx-o.x)<=snap){nx=o.x;if(!guides.some(g=>g.type==="v"&&g.v===o.x))guides.push({type:"v",v:o.x});}
      if(Math.abs(ny-o.y)<=snap){ny=o.y;if(!guides.some(g=>g.type==="h"&&g.v===o.y))guides.push({type:"h",v:o.y});}
    });
    dragNode.x=nx;dragNode.y=ny;dragged=true;render();return;
  }
  if(state.result){const el=e.target.closest("[data-node]");const h=el?+el.dataset.node:null;if(h!==hoverTarget){hoverTarget=h;render();}}
});
svg.addEventListener("mouseleave",()=>{if(hoverTarget!==null){hoverTarget=null;render();}});
window.addEventListener("mouseup",()=>{
  if(dragNode){if(dragged&&dragSnapshot){history.push(dragSnapshot);if(history.length>200)history.shift();future=[];}dragSnapshot=null;dragNode=null;guides=[];svg.style.cursor=mode==="move"?"grab":"crosshair";render();}
  if(panning){panning=false;svg.style.cursor=mode==="move"?"grab":"crosshair";}
});

/* zoom */
svg.addEventListener("wheel",e=>{
  e.preventDefault();const r=svg.getBoundingClientRect();
  const mx=e.clientX-r.left, my=e.clientY-r.top;
  const newK=Math.max(0.2,Math.min(4,view.k*(e.deltaY<0?1.12:1/1.12)));
  view.tx=mx-(mx-view.tx)*(newK/view.k);view.ty=my-(my-view.ty)*(newK/view.k);view.k=newK;applyView();
},{passive:false});
function zoomBy(f){const {w,h}=dims();const mx=w/2,my=h/2;const newK=Math.max(0.2,Math.min(4,view.k*f));view.tx=mx-(mx-view.tx)*(newK/view.k);view.ty=my-(my-view.ty)*(newK/view.k);view.k=newK;applyView();}
function fitView(){
  if(!state.nodes.length){view={tx:0,ty:0,k:1};applyView();return;}
  let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
  state.nodes.forEach(n=>{a=Math.min(a,n.x);b=Math.min(b,n.y);c=Math.max(c,n.x);d=Math.max(d,n.y);});
  const pad=70;a-=pad;b-=pad;c+=pad;d+=pad;const {w,h}=dims();
  const k=Math.max(0.2,Math.min(2.2,Math.min(w/(c-a),h/(d-b))));
  view.k=k;view.tx=(w-(c+a)*k)/2;view.ty=(h-(d+b)*k)/2;applyView();
}
document.getElementById("zoomIn").onclick=()=>zoomBy(1.2);
document.getElementById("zoomOut").onclick=()=>zoomBy(1/1.2);
document.getElementById("zoomFit").onclick=fitView;

/* ---------- clic: crear / seleccionar / borrar ---------- */
svg.addEventListener("click",e=>{
  const p=svgPoint(e);
  const nodeEl=e.target.closest("[data-node]");
  const edgeEl=e.target.closest("[data-edge]");
  if(mode==="node"){if(!nodeEl)addNode(p.x,p.y);return;}
  if(mode==="delete"){if(nodeEl){deleteNode(+nodeEl.dataset.node);}else if(edgeEl){deleteEdge(edgeEl.dataset.edge);}return;}
  if(mode==="edge"){
    if(nodeEl){
      const id=+nodeEl.dataset.node;
      if(edgeStart===null){edgeStart=id;render();}
      else{const from=edgeStart,to=id;edgeStart=null;render();if(from!==to)startEdgeWeight(from,to);}
    }else{edgeStart=null;render();}
    return;
  }
  if(mode==="move"&&!dragged){
    if(nodeEl)selected={type:"node",id:+nodeEl.dataset.node};
    else if(edgeEl)selected={type:"edge",id:edgeEl.dataset.edge};
    else selected=null;
    render();
  }
});
svg.addEventListener("dblclick",e=>{
  const edgeEl=e.target.closest("[data-edge]");
  if(edgeEl){const ed=state.edges.find(x=>x.id===edgeEl.dataset.edge);if(ed)editEdgeWeight(ed);}
});

/* ---------- edición inline de peso ---------- */
let weditCb=null;
function showWeightEditor(gx,gy,val,cb){
  weditCb=cb;wedit.value=val;
  wedit.style.left=(view.tx+gx*view.k-26)+"px";
  wedit.style.top=(view.ty+gy*view.k-14)+"px";
  wedit.style.display="block";wedit.focus();wedit.select();
}
function commitWeight(){if(weditCb===null)return;const w=parseFloat(wedit.value);const cb=weditCb;weditCb=null;wedit.style.display="none";if(isNaN(w)||w<0){toast("Peso inválido (≥ 0)");return;}cb(w);}
function cancelWeight(){weditCb=null;wedit.style.display="none";}
wedit.addEventListener("keydown",e=>{e.stopPropagation();if(e.key==="Enter")commitWeight();else if(e.key==="Escape")cancelWeight();});
wedit.addEventListener("blur",()=>{if(weditCb!==null)commitWeight();});
function startEdgeWeight(from,to){const a=nodeById(from),b=nodeById(to);showWeightEditor((a.x+b.x)/2,(a.y+b.y)/2,1,w=>addEdge(from,to,w));}
function editEdgeWeight(ed){const a=nodeById(ed.from),b=nodeById(ed.to);showWeightEditor((a.x+b.x)/2,(a.y+b.y)/2,ed.w,w=>{pushHistory();ed.w=w;clearResult();render();});}

/* ---------- menú contextual ---------- */
function hideMenu(){ctxMenu.style.display="none";}
function openMenu(x,y,t){
  let html;
  if(t.type==="node")html=`<button data-a="src">Definir como origen</button><button data-a="dst">Definir como destino</button><div class="mdiv"></div><button class="danger" data-a="del">Eliminar nodo</button>`;
  else html=`<button data-a="edit">Editar peso</button><button class="danger" data-a="del">Eliminar arista</button>`;
  ctxMenu.innerHTML=html;ctxMenu.style.left=x+"px";ctxMenu.style.top=y+"px";ctxMenu.style.display="block";
  ctxMenu.querySelectorAll("button").forEach(btn=>btn.onclick=()=>{menuAction(btn.dataset.a,t);hideMenu();});
}
function menuAction(a,t){
  if(t.type==="node"){
    if(a==="src"){document.getElementById("srcSel").value=String(t.id);toast("Origen: nodo "+nodeById(t.id).label);}
    else if(a==="dst"){document.getElementById("dstSel").value=String(t.id);if(state.result&&state.result.mode==="from"){render();showResult();}toast("Destino: nodo "+nodeById(t.id).label);}
    else if(a==="del")deleteNode(t.id);
  }else{
    const ed=state.edges.find(x=>x.id===t.id);if(!ed)return;
    if(a==="edit")editEdgeWeight(ed);else if(a==="del")deleteEdge(t.id);
  }
}
svg.addEventListener("contextmenu",e=>{
  const nodeEl=e.target.closest("[data-node]");const edgeEl=e.target.closest("[data-edge]");
  if(nodeEl){e.preventDefault();openMenu(e.clientX,e.clientY,{type:"node",id:+nodeEl.dataset.node});}
  else if(edgeEl){e.preventDefault();openMenu(e.clientX,e.clientY,{type:"edge",id:edgeEl.dataset.edge});}
});
document.addEventListener("mousedown",e=>{if(!ctxMenu.contains(e.target))hideMenu();});

/* ---------- render ---------- */
function edgeGeom(e){
  const a=nodeById(e.from),b=nodeById(e.to);
  let dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;const ux=dx/len,uy=dy/len;
  const curve=(state.directed&&findEdge(e.to,e.from))?1:0;const nx=-uy,ny=ux;const off=curve?16:0;
  const x1=a.x+ux*R+nx*off,y1=a.y+uy*R+ny*off,x2=b.x-ux*R+nx*off,y2=b.y-uy*R+ny*off;
  const mx=(x1+x2)/2+nx*off,my=(y1+y2)/2+ny*off;
  return{x1,y1,x2,y2,mx,my,off,nx,ny};
}
function activeTarget(){
  if(hoverTarget!==null)return hoverTarget;
  if(state.result&&state.result.mode==="from"){const d=document.getElementById("dstSel").value;return d?+d:null;}
  return null;
}
// Resaltado: _relSet = aristas que están en ALGÚN camino origen→destino (azul);
//            _redSet = aristas del camino más corto (rojo).
let _relSet=null, _redSet=null;
function reachable(start,reverse){
  const seen=new Set([start]),stack=[start];
  while(stack.length){const u=stack.pop();
    state.edges.forEach(e=>{let nb=null;
      if(!reverse){if(e.from===u)nb=e.to;else if(!state.directed&&e.to===u)nb=e.from;}
      else{if(e.to===u)nb=e.from;else if(!state.directed&&e.from===u)nb=e.to;}
      if(nb!==null&&!seen.has(nb)){seen.add(nb);stack.push(nb);}});}
  return seen;
}
function edgeSetFromSeq(seq){const s=new Set();if(!seq)return s;
  for(let i=0;i+1<seq.length;i++){const a=seq[i],b=seq[i+1];
    const e=findEdge(a,b)||(!state.directed?findEdge(b,a):null);if(e)s.add(e.id);}
  return s;}
// todas las aristas que participan en algún camino de A a B
function relevantEdges(A,B){
  const fwd=reachable(A,false),back=reachable(B,true),s=new Set();
  state.edges.forEach(e=>{
    if(fwd.has(e.from)&&back.has(e.to))s.add(e.id);
    if(!state.directed&&fwd.has(e.to)&&back.has(e.from))s.add(e.id);});
  return s;}
// cuenta cuántos caminos simples (sin repetir nodos) hay de A a B
function countPaths(A,B){
  let count=0, steps=0, capped=false; const LIM=400000; const visited=new Set();
  (function dfs(u){
    if(capped)return;
    if(++steps>LIM){capped=true;return;}
    if(u===B){count++;return;}
    visited.add(u);
    for(const e of state.edges){
      let nb=null;
      if(e.from===u)nb=e.to;else if(!state.directed&&e.to===u)nb=e.from;
      if(nb!==null&&!visited.has(nb)){dfs(nb);if(capped)break;}
    }
    visited.delete(u);
  })(A);
  return {count,capped};
}
// enumera caminos simples de A a B y devuelve los K de menor costo, ordenados
function kShortestPaths(A,B,K){
  const found=[]; let steps=0,capped=false; const STEPLIM=300000, MAXFOUND=5000;
  const visited=new Set(), seq=[];
  (function dfs(u,cost){
    if(capped)return;
    if(++steps>STEPLIM){capped=true;return;}
    visited.add(u);seq.push(u);
    if(u===B){found.push({cost,seq:seq.slice()});}
    else{
      for(const e of state.edges){
        let nb=null,w=0;
        if(e.from===u){nb=e.to;w=e.w;}else if(!state.directed&&e.to===u){nb=e.from;w=e.w;}
        if(nb!==null&&!visited.has(nb)){dfs(nb,cost+w);if(capped||found.length>=MAXFOUND)break;}
      }
    }
    seq.pop();visited.delete(u);
  })(A,0);
  found.sort((p,q)=>p.cost-q.cost);
  return {list:found.slice(0,K), total:found.length, capped:capped||found.length>=MAXFOUND};
}
// árbol de caminos mínimos (cuando no hay destino enfocado)
function sptEdgeSet(){const s=new Set(),r=state.result;if(!r)return s;
  state.edges.forEach(e=>{
    if(r.mode==="from"){if(r.link[e.to]===e.from||(!state.directed&&r.link[e.from]===e.to))s.add(e.id);}
    else{if(r.link[e.from]===e.to||(!state.directed&&r.link[e.to]===e.from))s.add(e.id);}});
  return s;}
function computeHighlight(){
  _relSet=null;_redSet=null;
  const r=state.result;if(!r)return;
  const tgt=activeTarget();
  if(tgt!==null&&tgt!==r.anchor&&r.dist[tgt]<Infinity){
    _redSet=edgeSetFromSeq(pathTo(tgt));
    const A=r.mode==="from"?r.anchor:tgt, B=r.mode==="from"?tgt:r.anchor;
    _relSet=relevantEdges(A,B);     // todos los caminos origen→destino
  }else{
    _relSet=sptEdgeSet();           // sin destino: todo el árbol de caminos mínimos
  }
}
// 0 = nada · 1 = parte de los caminos origen→destino (azul) · 2 = camino más corto (rojo)
function edgeLevel(e){
  if(_redSet&&_redSet.has(e.id))return 2;
  if(_relSet&&_relSet.has(e.id))return 1;
  return 0;
}
function pathNodeSet(){const tgt=activeTarget();if(state.result===null||tgt===null)return null;const seq=pathTo(tgt);return seq?new Set(seq):null;}
function render(){
  gGuides.innerHTML="";gEdges.innerHTML="";gNodes.innerHTML="";
  computeHighlight();
  guides.forEach(g=>{const l=document.createElementNS(SVG_NS,"line");
    if(g.type==="v"){l.setAttribute("x1",g.v);l.setAttribute("y1",-100000);l.setAttribute("x2",g.v);l.setAttribute("y2",100000);}
    else{l.setAttribute("x1",-100000);l.setAttribute("y1",g.v);l.setAttribute("x2",100000);l.setAttribute("y2",g.v);}
    l.setAttribute("class","guide");gGuides.appendChild(l);});
  state.edges.forEach(e=>{
    const g=edgeGeom(e),lvl=edgeLevel(e),sel=selected&&selected.type==="edge"&&selected.id===e.id;
    const path=document.createElementNS(SVG_NS,"path");
    path.setAttribute("d",g.off?`M ${g.x1} ${g.y1} Q ${g.mx+g.nx*14} ${g.my+g.ny*14} ${g.x2} ${g.y2}`:`M ${g.x1} ${g.y1} L ${g.x2} ${g.y2}`);
    path.setAttribute("fill","none");path.setAttribute("class","edge-line"+(lvl===2?" hi":lvl===1?" tree":"")+(sel?" sel":""));path.setAttribute("data-edge",e.id);
    if(state.directed)path.setAttribute("marker-end",lvl===2?"url(#arrowHi)":lvl===1?"url(#arrowTree)":"url(#arrow)");
    path.style.cursor="pointer";gEdges.appendChild(path);
    const t=document.createElementNS(SVG_NS,"text");
    t.setAttribute("x",g.off?(g.mx+g.nx*22):(g.x1+g.x2)/2);t.setAttribute("y",(g.off?(g.my+g.ny*22):(g.y1+g.y2)/2)-4);
    t.setAttribute("class","edge-w");t.setAttribute("text-anchor","middle");t.setAttribute("data-edge",e.id);t.textContent=e.w;gEdges.appendChild(t);
  });
  const r=state.result,pset=pathNodeSet(),tgt=activeTarget();
  state.nodes.forEach(n=>{
    const g=document.createElementNS(SVG_NS,"g");g.setAttribute("data-node",n.id);
    g.style.cursor=mode==="move"?"grab":(mode==="delete"?"pointer":"crosshair");
    const c=document.createElementNS(SVG_NS,"circle");c.setAttribute("cx",n.x);c.setAttribute("cy",n.y);c.setAttribute("r",R);
    let cls="node-c";
    if(r){if(n.id===r.anchor)cls+=" src";else if(r.dist[n.id]<Infinity)cls+=" done";}
    if(pset&&pset.has(n.id)&&n.id!==(r&&r.anchor))cls+=" onpath";
    if(tgt!==null&&n.id===tgt&&n.id!==(r&&r.anchor))cls+=" dest";
    if(selected&&selected.type==="node"&&selected.id===n.id)cls+=" sel";
    if(edgeStart===n.id)cls+=" pick";
    c.setAttribute("class",cls);c.setAttribute("data-node",n.id);g.appendChild(c);
    const t=document.createElementNS(SVG_NS,"text");t.setAttribute("x",n.x);t.setAttribute("y",n.y);t.setAttribute("class","node-t");t.textContent=n.label;g.appendChild(t);
    if(r&&r.dist[n.id]!==undefined){const d=document.createElementNS(SVG_NS,"text");d.setAttribute("x",n.x);d.setAttribute("y",n.y+R+14);d.setAttribute("class","node-d");d.textContent=r.dist[n.id]===Infinity?"∞":("d="+r.dist[n.id]);g.appendChild(d);}
    gNodes.appendChild(g);
  });
  updateStatus();
}

/* ---------- selectores ---------- */
function refreshSrc(){
  const sel=document.getElementById("srcSel"),cur=sel.value,dst=document.getElementById("dstSel"),curD=dst.value;
  sel.innerHTML='<option value="">Selecciona…</option>';dst.innerHTML='<option value="">'+(calcDir==="to"?"Selecciona…":"Todos los nodos")+'</option>';
  state.nodes.forEach(n=>{
    const o=document.createElement("option");o.value=n.id;o.textContent="Nodo "+n.label;sel.appendChild(o);
    const o2=document.createElement("option");o2.value=n.id;o2.textContent="Nodo "+n.label;dst.appendChild(o2);
  });
  if(state.nodes.some(n=>String(n.id)===cur))sel.value=cur;
  if(state.nodes.some(n=>String(n.id)===curD))dst.value=curD;
}
document.getElementById("dstSel").addEventListener("change",()=>{if(state.result&&state.result.mode==="from"){render();showResult();}});

/* ---------- Dijkstra ---------- */
// Desde un origen hacia todos: link[x] = nodo anterior en la ruta origen→x
function dijkstraFrom(srcId){
  const dist={},link={},visited={},order=[];
  state.nodes.forEach(n=>{dist[n.id]=Infinity;link[n.id]=null;});dist[srcId]=0;
  const ids=state.nodes.map(n=>n.id);
  while(true){
    let u=null,best=Infinity;for(const id of ids){if(!visited[id]&&dist[id]<best){best=dist[id];u=id;}}
    if(u===null)break;visited[u]=true;order.push(u);
    state.edges.forEach(e=>{let nb=null;if(e.from===u)nb=e.to;else if(!state.directed&&e.to===u)nb=e.from;
      if(nb!==null&&!visited[nb]&&dist[u]+e.w<dist[nb]){dist[nb]=dist[u]+e.w;link[nb]=u;}});
  }
  return{mode:"from",anchor:srcId,dist,link,order};
}
// Desde todos hacia un destino (Dijkstra sobre el grafo invertido):
// link[x] = siguiente nodo en la ruta x→destino
function dijkstraTo(dstId){
  const dist={},link={},visited={},order=[];
  state.nodes.forEach(n=>{dist[n.id]=Infinity;link[n.id]=null;});dist[dstId]=0;
  const ids=state.nodes.map(n=>n.id);
  while(true){
    let u=null,best=Infinity;for(const id of ids){if(!visited[id]&&dist[id]<best){best=dist[id];u=id;}}
    if(u===null)break;visited[u]=true;order.push(u);
    state.edges.forEach(e=>{let nb=null;if(e.to===u)nb=e.from;else if(!state.directed&&e.from===u)nb=e.to;
      if(nb!==null&&!visited[nb]&&dist[u]+e.w<dist[nb]){dist[nb]=dist[u]+e.w;link[nb]=u;}});
  }
  return{mode:"to",anchor:dstId,dist,link,order};
}
function pathTo(node){
  const r=state.result;if(!r||r.dist[node]===Infinity)return null;
  const seq=[];let cur=node;
  if(r.mode==="from"){while(cur!==null){seq.unshift(cur);cur=r.link[cur];}}   // origen…node
  else{while(cur!==null){seq.push(cur);cur=r.link[cur];}}                      // node…destino
  return seq;
}
function clearResult(){state.result=null;document.getElementById("resultBox").innerHTML='<div class="placeholder">Elige un origen y pulsa <b>Calcular</b> para ver las distancias mínimas y resaltar las rutas.</div>';}

document.getElementById("runBtn").onclick=()=>{
  if(!state.nodes.length){toast("El grafo está vacío");return;}
  if(calcDir==="from"){
    const sel=document.getElementById("srcSel");
    if(!sel.value){toast("Elige primero el nodo origen");sel.focus();return;}
    state.result=dijkstraFrom(+sel.value);
  }else{
    const dst=document.getElementById("dstSel");
    if(!dst.value){toast("Elige primero el nodo destino");dst.focus();return;}
    state.result=dijkstraTo(+dst.value);
  }
  render();showResult();
  // aviso si el nodo enfocado no tiene camino
  if(calcDir==="from"){
    const dv=document.getElementById("dstSel").value;
    if(dv&&state.result.dist[+dv]===Infinity) toast("No hay camino al nodo "+nodeById(+dv).label);
  }else{
    if(state.nodes.some(n=>state.result.dist[n.id]===Infinity)) toast("Algunos nodos no tienen camino al destino");
  }
};
document.getElementById("resetBtn").onclick=()=>{clearResult();render();};

function showResult(){
  const r=state.result;if(!r)return;const box=document.getElementById("resultBox");
  const anchorLabel=nodeById(r.anchor).label;
  const hiVal=r.mode==="from"?document.getElementById("dstSel").value:"";
  const rutaCol=r.mode==="from"?("Ruta desde "+anchorLabel):("Ruta hacia "+anchorLabel);

  // intro explicativa según el modo
  const intro=r.mode==="from"
    ? `<div class="explain">Distancia mínima y ruta más corta <b>desde el nodo ${anchorLabel}</b> hacia cada nodo del grafo. Una casilla con <b>∞</b> significa que ese nodo no es alcanzable.</div>`
    : `<div class="explain">Distancia mínima y ruta más corta <b>desde cada nodo hacia el nodo ${anchorLabel}</b>. Una casilla con <b>∞</b> significa que ese nodo no puede llegar al destino.</div>`;

  // recuadro destacado del destino elegido (modo origen)
  let focus="";
  if(hiVal){
    const dv=+hiVal, hl=nodeById(dv).label, dd=r.dist[dv];
    if(dd===Infinity){
      focus=`<div class="notice">No existe ningún camino del nodo <b>${anchorLabel}</b> al nodo <b>${hl}</b>. El destino no es alcanzable.</div>`;
    }else{
      const cp=countPaths(r.anchor,dv);
      const nTxt=cp.capped?("más de "+cp.count):cp.count;
      const plural=(cp.count===1&&!cp.capped)?"camino posible":"caminos posibles";
      const ks=kShortestPaths(r.anchor,dv,4);
      const listHtml=ks.list.map((p,i)=>{
        const seqTxt=p.seq.map(id=>nodeById(id).label).join(" → ");
        return `<div class="pl${i===0?' best':''}"><span class="n">${i+1}.</span><span class="seq">${seqTxt}</span><span class="c">${p.cost}</span></div>`;
      }).join("");
      const remaining=cp.capped?"muchas":(cp.count-ks.list.length);
      const moreTxt=(cp.capped||cp.count>ks.list.length)?`<div class="meta" style="margin-top:5px">… y ${remaining} ruta(s) más.</div>`:"";
      focus=`<div class="okline">
        <div>Del nodo <b>${anchorLabel}</b> al nodo <b>${hl}</b> existen <b>${nTxt}</b> ${plural}. El más corto cuesta <b>${dd}</b>.</div>
        <div style="margin-top:6px;font-weight:600">Rutas ordenadas de menor a mayor costo:</div>
        <div class="pathlist">${listHtml}</div>${moreTxt}
        <div class="legend-mini">
          <span><i style="background:var(--edge-hi)"></i>más corta (en rojo en el grafo)</span>
          <span><i style="background:var(--accent)"></i>otras rutas</span>
        </div>
      </div>`;
    }
  }

  let rows="";
  state.nodes.slice().sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true})).forEach(n=>{
    const d=r.dist[n.id],seq=pathTo(n.id);
    const pth=seq?seq.map(id=>nodeById(id).label).join(" → "):'<span style="color:var(--danger)">sin camino</span>';
    const tcls=hiVal&&String(n.id)===hiVal?' class="target"':'';
    rows+=`<tr${tcls}><td>${n.label}</td><td class="dist${d===Infinity?' inf':''}">${d===Infinity?"∞":d}</td><td style="color:var(--muted)">${pth}</td></tr>`;
  });
  const unreachable=state.nodes.filter(n=>r.dist[n.id]===Infinity).length;
  const foot=unreachable?`<div class="meta">${unreachable} nodo(s) con ∞: sin camino ${r.mode==="from"?"desde":"hacia"} el nodo ${anchorLabel}.</div>`:"";
  box.innerHTML=`${intro}${focus}<table><thead><tr><th>Nodo</th><th>Dist.</th><th>${rutaCol}</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="meta">Orden en que el algoritmo fijó los nodos: ${r.order.map(id=>nodeById(id).label).join(" · ")}.</div>${foot}`;
}

/* ---------- ejemplos ---------- */
function placeCircle(n,pad){const {w,h}=dims();const cx=w/2,cy=h/2,rad=Math.min(cx,cy)-(pad||60);
  for(let i=0;i<n;i++){const ang=-Math.PI/2+i*2*Math.PI/n;state.nodes.push({id:i+1,label:String(i+1),x:cx+rad*Math.cos(ang),y:cy+rad*Math.sin(ang)});}
  state.nextId=n+1;state.nextLabel=n+1;}
function addEdgesList(E){E.forEach(([a,b,w])=>{if(!findEdge(a,b))state.edges.push({id:"e"+(state.nextId++),from:a,to:b,w});});}
function finishLoad(msg){clearResult();render();refreshSrc();fitView();document.getElementById("srcSel").value="1";toast(msg);}

function loadExample(){
  pushHistory();clearAll();state.directed=true;updateDirUI();placeCircle(7,70);
  const M=[[-1,10,18,-1,-1,-1,-1],[-1,-1,6,-1,3,-1,-1],[-1,-1,-1,3,-1,20,-1],[-1,-1,2,-1,-1,-1,2],[-1,-1,-1,8,-1,-1,10],[-1,-1,-1,-1,-1,-1,-1],[-1,-1,-1,-1,-1,5,-1]];
  for(let i=0;i<7;i++)for(let j=0;j<7;j++)if(M[i][j]>=0)state.edges.push({id:"e"+(state.nextId++),from:i+1,to:j+1,w:M[i][j]});
  finishLoad("Ejemplo de la guía (7 nodos)");
}
function loadMedium(){
  pushHistory();clearAll();state.directed=true;updateDirUI();placeCircle(10,60);
  addEdgesList([[1,2,4],[1,3,2],[2,3,5],[2,4,10],[2,5,6],[3,5,3],[3,6,8],[3,4,7],[4,7,11],[4,9,2],[5,4,2],[5,6,1],[6,7,6],[6,8,7],[6,10,14],[7,9,4],[8,9,3],[8,10,9],[9,10,5]]);
  finishLoad("Ejemplo mediano (10 nodos)");
}
function loadLarge(){
  pushHistory();clearAll();state.directed=true;updateDirUI();const n=15;placeCircle(n,45);
  const E=[];for(let i=1;i<n;i++)E.push([i,i+1,2+((i*3)%7)]);for(let i=1;i<=12;i++)E.push([i,i+3,4+((i*5)%9)]);
  E.push([2,8,7],[5,11,3],[1,6,9],[3,10,6],[7,14,5],[9,15,4],[4,12,8],[6,13,7],[10,2,5],[13,5,6],[12,4,4],[15,8,6]);
  addEdgesList(E);finishLoad("Ejemplo grande (15 nodos)");
}
function loadGrid(){
  pushHistory();clearAll();state.directed=false;updateDirUI();
  const cols=4,rows=4,n=cols*rows;const {w,h}=dims();const mx=Math.max(80,w*0.18),my=70,gw=(w-2*mx)/(cols-1),gh=(h-2*my)/(rows-1);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const idx=r*cols+c+1;state.nodes.push({id:idx,label:String(idx),x:mx+c*gw,y:my+r*gh});}
  state.nextId=n+1;state.nextLabel=n+1;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){const idx=r*cols+c+1;
    if(c<cols-1)state.edges.push({id:"e"+(state.nextId++),from:idx,to:idx+1,w:(r+c)%5+2});
    if(r<rows-1)state.edges.push({id:"e"+(state.nextId++),from:idx,to:idx+cols,w:(r*2+c)%6+1});}
  finishLoad("Malla 4×4 (16 nodos, no dirigido)");
}
function loadRandom(){
  pushHistory();clearAll();updateDirUI();const n=8+Math.floor(Math.random()*5);const {w,h}=dims();const m=70;
  for(let i=0;i<n;i++)state.nodes.push({id:i+1,label:String(i+1),x:m+Math.random()*(w-2*m),y:m+Math.random()*(h-2*m)});
  state.nextId=n+1;state.nextLabel=n+1;
  for(let i=1;i<n;i++)state.edges.push({id:"e"+(state.nextId++),from:i,to:i+1,w:1+Math.floor(Math.random()*9)});
  const extra=Math.floor(n*1.4);
  for(let k=0;k<extra;k++){const a=1+Math.floor(Math.random()*n),b=1+Math.floor(Math.random()*n);if(a!==b&&!findEdge(a,b))state.edges.push({id:"e"+(state.nextId++),from:a,to:b,w:1+Math.floor(Math.random()*9)});}
  finishLoad("Grafo aleatorio ("+n+" nodos)");
}
document.getElementById("exampleBtn").onclick=loadExample;
document.getElementById("example2Btn").onclick=loadMedium;
document.getElementById("example3Btn").onclick=loadLarge;
document.getElementById("gridBtn").onclick=loadGrid;
document.getElementById("randomBtn").onclick=loadRandom;
document.getElementById("clearBtn").onclick=()=>{if(state.nodes.length&&confirm("¿Vaciar todo el grafo?")){pushHistory();clearAll();}};

/* ---------- matriz ---------- */
function parseMatrix(text){
  const rows=text.trim().split(/\r?\n+/).map(r=>r.trim()).filter(r=>r.length);
  if(!rows.length)throw "La matriz está vacía.";
  const M=rows.map(r=>r.split(/[\s,;]+/).filter(t=>t.length).map(tok=>{
    if(/^(-1|inf|infinito|∞|x|\.|_)$/i.test(tok))return -1;const v=parseFloat(tok);if(isNaN(v))throw "Valor no válido: «"+tok+"».";return v;}));
  const n=M.length;if(M.some(r=>r.length!==n))throw "La matriz debe ser cuadrada (n×n).";
  return M;
}
function buildFromMatrix(){
  let M;try{M=parseMatrix(document.getElementById("matrixInput").value);}catch(err){toast(typeof err==="string"?err:"No se pudo leer la matriz");return;}
  const n=M.length;pushHistory();clearAll();
  const {w,h}=dims();const cx=w/2,cy=h/2,rad=Math.min(cx,cy)-60;
  for(let i=0;i<n;i++){const ang=-Math.PI/2+i*2*Math.PI/Math.max(n,1);state.nodes.push({id:i+1,label:String(i+1),x:cx+rad*Math.cos(ang),y:cy+rad*Math.sin(ang)});}
  state.nextId=n+1;state.nextLabel=n+1;
  if(state.directed){for(let i=0;i<n;i++)for(let j=0;j<n;j++)if(i!==j&&M[i][j]>=0)state.edges.push({id:"e"+(state.nextId++),from:i+1,to:j+1,w:M[i][j]});}
  else{for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){const wt=M[i][j]>=0?M[i][j]:(M[j][i]>=0?M[j][i]:-1);if(wt>=0)state.edges.push({id:"e"+(state.nextId++),from:i+1,to:j+1,w:wt});}}
  clearResult();render();refreshSrc();fitView();if(state.nodes.length)document.getElementById("srcSel").value="1";
  toast("Grafo construido ("+n+" nodos, "+state.edges.length+" aristas)");
}
function currentMatrixText(){
  const ns=state.nodes.slice().sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));if(!ns.length)return "";
  const idx={};ns.forEach((n,i)=>idx[n.id]=i);const n=ns.length;const M=Array.from({length:n},()=>Array(n).fill(-1));
  for(let i=0;i<n;i++)M[i][i]=0;
  state.edges.forEach(e=>{const i=idx[e.from],j=idx[e.to];if(i!=null&&j!=null){M[i][j]=e.w;if(!state.directed)M[j][i]=e.w;}});
  return M.map(r=>r.map(v=>String(v).padStart(3)).join(" ")).join("\n");
}
document.getElementById("buildMatrixBtn").onclick=buildFromMatrix;
document.getElementById("showMatrixBtn").onclick=()=>{if(!state.nodes.length){toast("El grafo está vacío");return;}document.getElementById("matrixInput").value=currentMatrixText();toast("Matriz exportada (orden 1…n)");};

/* ---------- estado vacío ---------- */
document.querySelectorAll("#empty [data-act]").forEach(b=>b.onclick=()=>{
  const a=b.dataset.act;if(a==="node")setMode("node");else if(a==="example")loadExample();else if(a==="random")loadRandom();
});

/* ---------- ayuda ---------- */
const helpPop=document.getElementById("helpPop");
document.getElementById("helpBtn").onclick=e=>{e.stopPropagation();helpPop.style.display=helpPop.style.display==="block"?"none":"block";};
document.addEventListener("mousedown",e=>{if(!helpPop.contains(e.target)&&e.target.id!=="helpBtn"&&!e.target.closest("#helpBtn"))helpPop.style.display="none";});

/* ---------- dirección del cálculo (desde origen / hacia destino) ---------- */
function updateCalcUI(){
  document.querySelectorAll("#calcDir button").forEach(x=>x.classList.toggle("on",x.dataset.calc===calcDir));
  document.getElementById("srcField").style.display=calcDir==="to"?"none":"block";
  document.getElementById("dstLbl").innerHTML=calcDir==="to"
    ? "Nodo de destino"
    : 'Nodo de destino <span style="opacity:.7">(opcional)</span>';
  refreshSrc();
}
document.querySelectorAll("#calcDir button").forEach(b=>{
  b.onclick=()=>{if(b.dataset.calc===calcDir)return;calcDir=b.dataset.calc;clearResult();updateCalcUI();render();};
});

/* ---------- panel redimensionable ---------- */
const resizer=document.getElementById("resizer"),sidebar=document.getElementById("sidebar");
let resizing=false;
resizer.addEventListener("mousedown",e=>{resizing=true;resizer.classList.add("active");document.body.style.cursor="col-resize";document.body.style.userSelect="none";e.preventDefault();});
window.addEventListener("mousemove",e=>{if(!resizing)return;let wpx=Math.max(240,Math.min(560,e.clientX-sidebar.getBoundingClientRect().left));sidebar.style.width=wpx+"px";render();});
window.addEventListener("mouseup",()=>{if(resizing){resizing=false;resizer.classList.remove("active");document.body.style.cursor="";document.body.style.userSelect="";}});

/* ---------- teclado ---------- */
document.addEventListener("keydown",e=>{
  const tag=(e.target.tagName||"").toLowerCase();
  if(tag==="input"||tag==="textarea"||tag==="select")return;
  const k=e.key.toLowerCase();
  if((e.ctrlKey||e.metaKey)&&k==="z"&&!e.shiftKey){e.preventDefault();undo();return;}
  if((e.ctrlKey||e.metaKey)&&(k==="y"||(k==="z"&&e.shiftKey))){e.preventDefault();redo();return;}
  if(e.ctrlKey||e.metaKey)return;
  if((e.key==="Delete"||e.key==="Backspace")&&selected){e.preventDefault();if(selected.type==="node")deleteNode(selected.id);else deleteEdge(selected.id);return;}
  if(k==="v")setMode("move");else if(k==="n")setMode("node");else if(k==="e")setMode("edge");else if(k==="d")setMode("delete");
  else if(k==="escape"){selected=null;edgeStart=null;hideMenu();render();}
});

/* ---------- init ---------- */
window.addEventListener("resize",()=>render());
clearResult();render();updateCalcUI();updateStatus();
