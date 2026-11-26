import * as THREE from 'three';
import {createSim, stepFrame, designCost, MATS, MAT_ORDER, VEH, vehMass, compLimit, isRope, GRID, KN, breakBeam, addDebrisBody, removeBody} from './sim.js';
import {LEVELS, REFS, SOLUTIONS, segmentsToDesign} from './levels.js';
import * as T from './textures.js';
import * as A from './audio.js';

// ================= Grundlagen =================
const U = 1/40;                                   // Welt-px -> 3D-Einheiten
const X = x => (x-720)*U, Y = y => (360-y)*U;
const ZT = 0.85;                                  // Abstand der beiden Fachwerkebenen
const DECK_W = 1.9;
const $ = id => document.getElementById(id);
const stage = $('stage');
const isCoarse = matchMedia('(pointer:coarse)').matches;

const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, isCoarse?1.75:2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.prepend(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb9d3ea, 60, 190);
const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 600);

// ---------- Himmel (Shader) + Umgebungskarte für Reflexionen ----------
const SUN_DIR = new THREE.Vector3(-0.45, 0.62, 0.65).normalize();
function skyMaterial(){
  return new THREE.ShaderMaterial({side:THREE.BackSide, depthWrite:false, fog:false, uniforms:{sun:{value:SUN_DIR}},
    vertexShader:'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader:`varying vec3 vP; uniform vec3 sun;
      void main(){ float h=vP.y; vec3 top=vec3(0.16,0.42,0.82); vec3 hor=vec3(0.78,0.88,0.97); vec3 gnd=vec3(0.42,0.47,0.42);
        vec3 c = h>0.0 ? mix(hor, top, pow(clamp(h,0.0,1.0),0.55)) : mix(hor, gnd, clamp(-h*4.0,0.0,1.0));
        float s = max(dot(vP, sun),0.0); c += vec3(1.0,0.85,0.6)*pow(s,8.0)*0.35 + vec3(1.0,0.95,0.8)*pow(s,900.0)*6.0;
        gl_FragColor=vec4(c,1.0); }`});
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMaterial()); scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
{ const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16), skyMaterial()));
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(3,16,8), new THREE.MeshBasicMaterial({color:new THREE.Color(12,11,9)})); sunBall.position.copy(SUN_DIR).multiplyScalar(40); envScene.add(sunBall);
  // ein paar helle/dunkle Flächen, damit Stahl interessante Reflexe bekommt
  const panel = (c,x,y,z,s)=>{ const m=new THREE.Mesh(new THREE.PlaneGeometry(s,s*0.4), new THREE.MeshBasicMaterial({color:c, side:THREE.DoubleSide})); m.position.set(x,y,z); m.lookAt(0,0,0); envScene.add(m); };
  panel(new THREE.Color(2.2,2.2,2.2), 30,18,-30,30); panel(new THREE.Color(0.08,0.1,0.12), -35,-5,20,40); panel(new THREE.Color(1.6,1.7,1.9), -10,30,35,25);
  scene.environment = pmrem.fromScene(envScene, 0.03).texture; }

// ---------- Licht ----------
scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x5d4a35, 0.55));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.copy(SUN_DIR).multiplyScalar(60); sun.castShadow = true;
sun.shadow.mapSize.set(isCoarse?1024:2048, isCoarse?1024:2048);
Object.assign(sun.shadow.camera, {left:-30, right:30, top:18, bottom:-18, near:1, far:160});
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);

// ---------- Materialien ----------
const texWood = T.woodTexture(), texAsph = T.asphaltTexture(), texRock = T.rockTexture(), texGrass = T.grassTexture(), texConc = T.concreteTexture(), texWater = T.waterNormal();
texRock.repeat.set(0.18,0.18); texGrass.repeat.set(0.25,0.25); texConc.repeat.set(0.5,0.5);
const M = {
  wood: new THREE.MeshStandardMaterial({map:texWood, roughness:0.72, metalness:0, color:0xffffff}),
  steel: new THREE.MeshPhysicalMaterial({color:0xc9d3de, metalness:1, roughness:0.24, clearcoat:1, clearcoatRoughness:0.12, envMapIntensity:1.35}),
  cable: new THREE.MeshPhysicalMaterial({color:0xe6b43a, metalness:0.9, roughness:0.3, clearcoat:0.6, envMapIntensity:1.2}),
  alu: new THREE.MeshPhysicalMaterial({color:0xe3e8ee, metalness:0.82, roughness:0.46, clearcoat:0.15, clearcoatRoughness:0.5, envMapIntensity:1.0}),
  cast: new THREE.MeshStandardMaterial({map:T.castTexture(), color:0x8d939b, metalness:0.72, roughness:0.82, envMapIntensity:0.7}),
  concreteBeam: new THREE.MeshStandardMaterial({map:T.concreteBeamTexture(), color:0x9fa3a6, roughness:0.95, metalness:0}),
  rope: new THREE.MeshPhysicalMaterial({map:T.ropeTexture(), color:0xdfe7ef, metalness:1, roughness:0.22, clearcoat:0.7, envMapIntensity:1.5}),
  asphalt: new THREE.MeshStandardMaterial({map:texAsph, roughness:0.85, metalness:0}),
  deckSide: new THREE.MeshStandardMaterial({color:0x3b4048, roughness:0.6, metalness:0.4}),
  rail: new THREE.MeshPhysicalMaterial({color:0xdfe6ee, metalness:1, roughness:0.3, clearcoat:0.8}),
  rock: new THREE.MeshStandardMaterial({map:texRock, roughness:0.95}),
  grass: new THREE.MeshStandardMaterial({map:texGrass, roughness:1}),
  concrete: new THREE.MeshStandardMaterial({map:texConc, roughness:0.9}),
  anchor: new THREE.MeshStandardMaterial({color:0xe03131, roughness:0.45, metalness:0.2, emissive:0x400000}),
  bolt: new THREE.MeshPhysicalMaterial({color:0x8d99a6, metalness:1, roughness:0.35}),
  water: new THREE.MeshPhysicalMaterial({color:0x1f6f8b, roughness:0.06, metalness:0.05, normalMap:texWater, normalScale:new THREE.Vector2(0.35,0.35), envMapIntensity:1.1, transparent:true, opacity:0.93}),
};
texWater.repeat.set(10,10);
M.cast.map.repeat.set(3,0.5); M.rope.map.repeat.set(1,14); M.cast.bumpMap = M.cast.map; M.cast.bumpScale = 1.5;
const BEAM_MAT = {wood:M.wood, alu:M.alu, cast:M.cast, steel:M.steel, concrete:M.concreteBeam, cable:M.cable, rope:M.rope};
const TINT = new Set(['steel','alu','cast']);   // metallische Stäbe glimmen im Test in Belastungsfarbe

// ================= Zustand =================
let levelIdx = 0, L = LEVELS[0];
let nodes = [], beams = [], nextId = 1, history = [];
let tool = 'road', mode = 'build', vehType = 'car', usedExample = false;
let pending = null, ptr = null, hover = null;
let sim = null, simAcc = 0, ipK = 1;
let timeScale = +(localStorage.getItem('captain2.ts')||1) || 1, showPct = localStorage.getItem('captain2.pct')==='1';
const progress = JSON.parse(localStorage.getItem('captain2.progress')||'{}');

const dist = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
const nodeById = id => nodes.find(n=>n.id===id);
const fmt = v => Math.round(v).toLocaleString('de-DE') + ' €';
const beamLen = b => dist(nodeById(b.a), nodeById(b.b));
const totalCost = () => designCost({nodes, beams});

// ================= Szene: Gelände =================
const levelGroup = new THREE.Group(); scene.add(levelGroup);
const bridgeGroup = new THREE.Group(); scene.add(bridgeGroup);
const fxGroup = new THREE.Group(); scene.add(fxGroup);
let waterMesh = null;

function hash(i){ const s = Math.sin(i*127.1)*43758.5453; return s - Math.floor(s); }
function buildTerrain(){
  levelGroup.traverse(o=>{ if(o.geometry) o.geometry.dispose(); });
  levelGroup.clear();
  const floorY = L.floorY || 640;
  // Klippen als extrudierte Felsprofile
  for (const c of L.cliffs){
    const x0 = Math.max(c[0], -700), x1 = Math.min(c[1], 2140), top = c[2]-4;
    const leftEdge = c[0] > -1000, rightEdge = c[1] < 3000;   // Kante zur Schlucht?
    const sh = new THREE.Shape(); const bottom = floorY + 140;
    sh.moveTo(X(x0), Y(bottom));
    if (leftEdge){ for (let y=bottom; y>top; y-=24){ const j = (y<top+30)?0: hash(y+x0)*14; sh.lineTo(X(x0+j), Y(y)); } }
    else sh.lineTo(X(x0), Y(top));
    sh.lineTo(X(x0), Y(top)); sh.lineTo(X(x1), Y(top));
    if (rightEdge){ for (let y=top; y<bottom; y+=24){ const j = (y<top+30)?0: hash(y+x1)*14; sh.lineTo(X(x1-j), Y(y)); } }
    sh.lineTo(X(x1), Y(bottom));
    const depth = 16;
    const g = new THREE.ExtrudeGeometry(sh, {depth, bevelEnabled:true, bevelThickness:0.25, bevelSize:0.18, bevelSegments:2, steps:1});
    g.translate(0,0,-depth+4.2);
    const m = new THREE.Mesh(g, M.rock); m.receiveShadow = true; m.castShadow = true; levelGroup.add(m);
    // Gras + Straße oben
    const grass = new THREE.Mesh(new THREE.BoxGeometry(X(x1)-X(x0), 0.16, depth+0.4), M.grass);
    grass.position.set((X(x0)+X(x1))/2, Y(top)+0.02, -depth/2+4.2); grass.receiveShadow = true; levelGroup.add(grass);
    const rl = X(x1)-X(x0);
    const rg = new THREE.BoxGeometry(rl, 0.1, DECK_W); scaleUV(rg, rl/2);
    const road = new THREE.Mesh(rg, M.asphalt); road.position.set((X(x0)+X(x1))/2, Y(top)+0.06, 0); road.receiveShadow = true; levelGroup.add(road);
    // Bäume
    const trees = Math.floor((x1-x0)/120);
    for (let i=0;i<trees;i++){ const tx = x0 + 40 + hash(i*3+x0)*(x1-x0-80); if (Math.abs(tx - L.gapL) < 60 || Math.abs(tx-L.gapR) < 60) continue;
      for (const zz of [-3.2-hash(i)*8, 2.2+hash(i+9)*1.6]) addTree(X(tx), Y(top), zz, 0.8+hash(i*7)*0.7); }
  }
  for (const p of (L.pillars||[])){
    const sh = new THREE.Shape(); const bottom = floorY+140;
    sh.moveTo(X(p[0]-20), Y(bottom)); sh.lineTo(X(p[0]), Y(p[2])); sh.lineTo(X(p[1]), Y(p[2])); sh.lineTo(X(p[1]+20), Y(bottom));
    const g = new THREE.ExtrudeGeometry(sh, {depth:4.4, bevelEnabled:true, bevelThickness:0.3, bevelSize:0.2, bevelSegments:2}); g.translate(0,0,-2.2);
    const m = new THREE.Mesh(g, M.rock); m.castShadow = m.receiveShadow = true; levelGroup.add(m);
  }
  for (const t of (L.towers||[])){
    // Betonpylon mit zwei Beinen + Querriegel, Anker an der Spitze
    for (const z of [-ZT-0.25, ZT+0.25]){
      const h = Y(t[1]) - Y(360) + 0.4; const leg = new THREE.Mesh(new THREE.BoxGeometry(0.42, h+2, 0.42), M.concrete);
      leg.position.set(X(t[0]), Y(360) + (h+2)/2 - 2, z); leg.castShadow = leg.receiveShadow = true; levelGroup.add(leg);
    }
    for (const yy of [t[1]+10, t[1]+120]){ const bar = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 2*ZT+0.9), M.concrete); bar.position.set(X(t[0]), Y(yy), 0); bar.castShadow = true; levelGroup.add(bar); }
  }
  // Wasser und Talgrund
  waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(260, 120), M.water); waterMesh.rotation.x = -Math.PI/2; waterMesh.position.set(0, Y(floorY), -30); waterMesh.receiveShadow = true; levelGroup.add(waterMesh);
  const bed = new THREE.Mesh(new THREE.PlaneGeometry(260,120), new THREE.MeshStandardMaterial({color:0x2c4a3a, roughness:1})); bed.rotation.x=-Math.PI/2; bed.position.set(0,Y(floorY)-1.2,-30); levelGroup.add(bed);
  // Ferne Berge
  const mm = new THREE.MeshStandardMaterial({color:0x6f8fae, roughness:1, flatShading:true});
  const mm2 = new THREE.MeshStandardMaterial({color:0x5b7b5a, roughness:1, flatShading:true});
  for (let i=0;i<14;i++){ const r = 14+hash(i*5)*22, h = 12+hash(i*11)*26; const cone = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7, 1), i%3?mm:mm2);
    cone.position.set(-120 + i*19 + hash(i)*10, Y(floorY)+h/2-6+ (i%3?4:0), -95 - hash(i*2)*50); cone.rotation.y = hash(i*13)*3; levelGroup.add(cone); }
  // Wolken
  const cm = new THREE.MeshStandardMaterial({color:0xffffff, roughness:1, transparent:true, opacity:0.95});
  for (let i=0;i<9;i++){ const cl = new THREE.Group(); for (let k=0;k<5;k++){ const s = new THREE.Mesh(new THREE.IcosahedronGeometry(2+hash(i*9+k)*2.4,1), cm); s.position.set(k*2.4-5, hash(k+i)*1.5, hash(k*3+i)); s.scale.y = 0.65; cl.add(s); }
    cl.position.set(-90 + i*24, 14 + hash(i*4)*12, -70 - hash(i*6)*30); cl.userData.speed = 0.3+hash(i)*0.4; cl.userData.cloud = true; levelGroup.add(cl); }
  // Zielflagge + Startbereich
  const fx = X(L.gapR+150);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,3.2,8), M.rail); pole.position.set(fx, Y(356)+1.6, -1.25); pole.castShadow = true; levelGroup.add(pole);
  const fc = document.createElement('canvas'); fc.width=64; fc.height=48; const g2=fc.getContext('2d'); for(let i=0;i<8;i++) for(let j=0;j<6;j++){ g2.fillStyle=(i+j)%2?'#111':'#fff'; g2.fillRect(i*8,j*8,8,8); }
  const ft = new THREE.CanvasTexture(fc); ft.colorSpace = THREE.SRGBColorSpace;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4,1.0,10,1), new THREE.MeshStandardMaterial({map:ft, side:THREE.DoubleSide, roughness:0.8}));
  flag.position.set(fx+0.72, Y(356)+2.65, -1.25); flag.castShadow = true; flag.userData.flag = true; levelGroup.add(flag);
  const arch = (x, label, col)=>{ const c2=document.createElement('canvas'); c2.width=256; c2.height=64; const g3=c2.getContext('2d'); g3.fillStyle=col; g3.fillRect(0,0,256,64); g3.fillStyle='#fff'; g3.font='bold 40px system-ui,Arial'; g3.textAlign='center'; g3.fillText(label,128,46);
    const t3=new THREE.CanvasTexture(c2); t3.colorSpace=THREE.SRGBColorSpace; const sign=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.6,0.08), [M.deckSide,M.deckSide,M.deckSide,M.deckSide,new THREE.MeshStandardMaterial({map:t3}),M.deckSide]);
    sign.position.set(x, Y(356)+2.6, -1.6); levelGroup.add(sign);
    for (const dx of [-1.1,1.1]){ const p2=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,2.6,6), M.rail); p2.position.set(x+dx, Y(356)+1.3, -1.6); levelGroup.add(p2);} };
  arch(X((L.startX ?? L.gapL-170)), 'START', '#2563eb'); arch(fx-2.2, 'ZIEL', '#16a34a');
}
function scaleUV(geo, su, sv=1){ const uv = geo.attributes.uv; for (let i=0;i<uv.count;i++) uv.setXY(i, uv.getX(i)*su, uv.getY(i)*sv); uv.needsUpdate = true; }
const treeGeoF = new THREE.ConeGeometry(0.7, 2.2, 7), treeGeoT = new THREE.CylinderGeometry(0.1, 0.14, 0.7, 6);
const treeMatF = new THREE.MeshStandardMaterial({color:0x2f6b3a, roughness:0.9, flatShading:true}), treeMatT = new THREE.MeshStandardMaterial({color:0x6b4a2b});
function addTree(x,y,z,s){ const f = new THREE.Mesh(treeGeoF, treeMatF); f.position.set(x, y+1.5*s, z); f.scale.setScalar(s); f.castShadow = true; levelGroup.add(f);
  const t = new THREE.Mesh(treeGeoT, treeMatT); t.position.set(x, y+0.35*s, z); t.scale.setScalar(s); t.castShadow = true; levelGroup.add(t); }

// ================= Brücken-Meshes =================
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCyl = new THREE.CylinderGeometry(1, 1, 1, 10); unitCyl.rotateZ(Math.PI/2);  // entlang x
const boltGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.26, 12); boltGeo.rotateX(Math.PI/2);
const anchorGeo = new THREE.BoxGeometry(0.5, 0.5, 2*ZT+0.6);
const stripeMats = new Map();
// kräftige, gesättigte Belastungsskala: Grün -> Gelb -> Orange -> Rot -> Magenta-Rot (Fließen/Überlast)
const STRESS_STOPS = [[0,[0.0,0.85,0.25]],[0.35,[0.55,0.95,0.0]],[0.55,[1.0,0.9,0.0]],[0.72,[1.0,0.55,0.0]],[0.88,[1.0,0.12,0.05]],[1.0,[0.95,0.0,0.35]]];
function stressColor(r){
  r = Math.max(0, Math.min(1, r)); const c = new THREE.Color();
  for (let i=1;i<STRESS_STOPS.length;i++){ const [t1,c1] = STRESS_STOPS[i]; if (r <= t1){ const [t0,c0] = STRESS_STOPS[i-1], k = (r-t0)/(t1-t0); c.setRGB(c0[0]+(c1[0]-c0[0])*k, c0[1]+(c1[1]-c0[1])*k, c0[2]+(c1[2]-c0[2])*k); return c; } }
  return c.setRGB(0.95,0,0.35);
}
// ===== Biegung: segmentierte Geometrie, die pro Frame entlang der Stabachse verformt wird =====
const NSEG = isCoarse ? 8 : 12;
function segBox(w,h,d){ const g = new THREE.BoxGeometry(w,h,d,NSEG,1,1); g.userData.base = g.attributes.position.array.slice(); return g; }
function bendGeo(mesh, off, inv){
  const g = mesh.geometry, base = g.userData.base; if (!base) return;
  if (off){ let mx = 0; for (let k=0;k<off.length;k++){ const a = Math.abs(off[k]); if (a > mx) mx = a; } if (mx*inv < 0.004 && mx < 0.0015) off = null; }
  if (!off){ if (!g.userData.bent) return; g.attributes.position.array.set(base); g.attributes.position.needsUpdate = true; g.userData.bent = false; return; }
  const pos = g.attributes.position.array;
  for (let i=0;i<pos.length;i+=3){ const k = Math.max(0, Math.min(NSEG, Math.round((base[i]+0.5)*NSEG))); pos[i+1] = base[i+1] + off[k]*inv; }
  g.attributes.position.needsUpdate = true; g.userData.bent = true;
}
const crackMatWood = new THREE.MeshBasicMaterial({color:0xfff0a0, transparent:true, opacity:1, depthWrite:false});
const crackMatConc = new THREE.MeshBasicMaterial({color:0x26282b, transparent:true, opacity:0.85, depthWrite:false});
const SIZES = { wood:{h:0.17,d:0.17}, alu:{h:0.14,d:0.11}, cast:{h:0.19,d:0.15}, steel:{h:0.15,d:0.12}, concrete:{h:0.25,d:0.21}, cable:{r:0.035}, rope:{r:0.05} };
let beamViews = new Map(), nodeViews = new Map(), ghost = null;

function makeBeamView(b){
  const v = {b, parts:[], stripes:[], mat:b.mat};
  if (b.mat==='road'){
    const L0 = beamLen(b);
    const g = segBox(1, 0.2, DECK_W); scaleUV(g, L0/80*1.2);
    v.sideMat = M.deckSide.clone(); v.mats = [v.sideMat];
    const deck = new THREE.Mesh(g, [v.sideMat, v.sideMat, M.asphalt, v.sideMat, v.sideMat, v.sideMat]);
    deck.castShadow = deck.receiveShadow = true; deck.frustumCulled = false; v.deck = deck; bridgeGroup.add(deck);
    for (const z of [-DECK_W/2+0.05, DECK_W/2-0.05]){ const r = new THREE.Mesh(segBox(1,1,1), M.rail); r.castShadow = true; r.frustumCulled = false; r.userData.z = z; v.rails = (v.rails||[]); v.rails.push(r); bridgeGroup.add(r); }
    for (const z of [DECK_W/2+0.01, -DECK_W/2-0.01]){ const s = new THREE.Mesh(segBox(1,1,1), new THREE.MeshBasicMaterial({color:0x22c55e})); s.visible = false; s.frustumCulled = false; v.stripes.push(s); s.userData.z = z; bridgeGroup.add(s); }
  } else {
    for (const z of [-ZT, ZT]){
      let m;
      if (isRope(b.mat)){ m = new THREE.Group(); const rm = BEAM_MAT[b.mat].clone(); (v.mats ||= []).push(rm); m.userData.mat = rm; for (let k=0;k<2;k++){ const seg = new THREE.Mesh(unitCyl, rm); seg.castShadow = true; m.add(seg); } }
      else { m = new THREE.Mesh(segBox(1,1,1), BEAM_MAT[b.mat].clone()); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; }
      m.userData.z = z; v.parts.push(m); bridgeGroup.add(m);
      if (!isRope(b.mat)){ const s = new THREE.Mesh(segBox(1,1,1), new THREE.MeshBasicMaterial({color:0x22c55e})); s.visible=false; s.frustumCulled = false; s.userData.z = z + Math.sign(z)*(SIZES[b.mat].d/2+0.008); bridgeGroup.add(s); v.stripes.push(s); }
      else { const s = new THREE.Mesh(unitCyl, new THREE.MeshBasicMaterial({color:0x22c55e})); s.visible=false; s.userData.z = z; bridgeGroup.add(s); v.stripes.push(s); }
    }
  }
  return v;
}
function placeBox(m, ax, ay, bx, by, z, h, d, jit=0){
  const dx=bx-ax, dy=by-ay, len=Math.hypot(dx,dy);
  m.position.set((ax+bx)/2 + (jit?(Math.random()-0.5)*jit:0), (ay+by)/2 + (jit?(Math.random()-0.5)*jit:0), z);
  m.rotation.set(0,0,Math.atan2(dy,dx)); m.scale.set(len, h, d);
}
function updateBeamView(v, A, B, st){
  // A,B in 3D-Einheiten; st = {ratio, tension, test, slack, warn}
  const jit = st && st.warn ? Math.min(0.05, (st.ratio-0.85)*0.35) : 0;
  const off = st && st.off;
  const glow = st && st.test ? emissiveFor(v.mat, st.ratio) : null;
  if (v.mat==='road'){
    placeBox(v.deck, A.x, A.y, B.x, B.y, 0, 0.2, DECK_W, jit); v.deck.scale.set(Math.hypot(B.x-A.x,B.y-A.y), 1, 1); bendGeo(v.deck, off, 1);
    for (const r of v.rails){ placeBox(r, A.x, A.y+0.32, B.x, B.y+0.32, r.userData.z, 0.06, 0.06); bendGeo(r, off, 1/0.06); }
    for (const s of v.stripes){ s.visible = !!(st && st.test);
      if (s.visible){ placeBox(s, A.x, A.y-0.01, B.x, B.y-0.01, s.userData.z, 0.17, 0.02); bendGeo(s, off, 1/0.17); s.material.color.copy(stressColor(st.ratio)); } }
    if (glow) v.sideMat.emissive.copy(glow); else v.sideMat.emissive.setRGB(0,0,0);
    return;
  }
  const sz = SIZES[v.mat];
  v.parts.forEach((m,i)=>{
    const z = m.userData.z;
    if (isRope(v.mat)){
      const sag = (st && st.slack ? st.slack : 0) + (st && st.ropeOsc || 0);
      const mx = (A.x+B.x)/2, my = (A.y+B.y)/2 - sag;
      if (m.userData.mat){ if (glow) m.userData.mat.emissive.copy(glow); else m.userData.mat.emissive.setRGB(0,0,0); }
      placeBox(m.children[0], A.x, A.y, mx, my, z, sz.r, sz.r); placeBox(m.children[1], mx, my, B.x, B.y, z, sz.r, sz.r);
      const s = v.stripes[i]; s.visible = !!(st && st.test && !sag);
      if (s.visible){ placeBox(s, A.x, A.y, B.x, B.y, z, sz.r*1.4, sz.r*1.4); s.scale.x *= 0.7; s.material.color.copy(stressColor(st.ratio)); }
    } else {
      placeBox(m, A.x, A.y, B.x, B.y, z, sz.h, sz.d, jit);
      const s = v.stripes[i]; s.visible = !!(st && st.test);
      bendGeo(m, off, 1/sz.h);
      if (s.visible){ placeBox(s, A.x, A.y, B.x, B.y, s.userData.z, sz.h*0.62, 0.012); bendGeo(s, off, 1/(sz.h*0.62)); s.scale.x *= 0.9; s.material.color.copy(stressColor(st.ratio)); }
      if (glow) m.material.emissive.copy(glow); else m.material.emissive.setRGB(0,0,0);
      updateCracks(v, m, i, st, off, sz);
    }
  });
}
const _glow = new THREE.Color();
function emissiveFor(mat, r){
  r = Math.max(0, Math.min(1.2, r||0));
  const metal = TINT.has(mat) || isRope(mat) || mat==='road';
  let k = metal ? 0.16 + 0.75*Math.max(0, (r-0.5)/0.5) : 0.07 + 0.5*Math.max(0, (r-0.6)/0.4);
  if (r > 0.85) k *= 0.8 + 0.35*Math.sin(performance.now()*0.018);   // Pulsieren kurz vor dem Bruch
  return _glow.copy(stressColor(Math.min(1,r))).multiplyScalar(Math.min(1.1,k));
}
// Risse: Holz bekommt glühende Risse, Beton dunkle Haarrisse – wachsen mit der (höchsten erreichten) Belastung
function updateCracks(v, m, side, st, off, sz){
  if (v.mat!=='wood' && v.mat!=='concrete') return;
  const lvl = st && st.test ? (st.crack||0) : 0;
  const n = lvl < 0.68 ? 0 : Math.min(5, 1 + Math.floor((lvl-0.68)/0.07));
  if (!n && !m.userData.cracks) return;
  if (!m.userData.cracks){
    const mat = v.mat==='wood' ? crackMatWood.clone() : crackMatConc; if (v.mat==='wood') (v.mats ||= []).push(mat);
    m.userData.cracks = []; m.userData.crackMat = mat;
    for (let k=0;k<5;k++){ const c = new THREE.Mesh(unitBox, mat); const sd = hash(side*31 + k*7 + (v.b.id||'').length*3 + k);
      c.userData.x = -0.4 + 0.8*hash(k*13.7 + sd*91); c.userData.y = (hash(k*5.1+sd)-0.5)*0.55; c.userData.rz = (hash(k*2.3+sd*7)-0.5)*0.12; c.userData.len = 0.16 + 0.22*hash(k*9.9+sd);
      c.visible = false; m.add(c); m.userData.cracks.push(c); }
  }
  const cur = st && st.test ? Math.max(0, Math.min(1, st.ratio||0)) : 0;
  if (v.mat==='wood'){ const pulse = 0.55 + 0.45*Math.max(0,(cur-0.6)/0.4) + (cur>0.85 ? 0.25*Math.sin(performance.now()*0.025) : 0); m.userData.crackMat.opacity = Math.max(0.25, Math.min(1, pulse)); m.userData.crackMat.color.setRGB(1, 0.75 + 0.25*cur, 0.35 + 0.5*Math.max(0,cur-0.6)); }
  m.userData.cracks.forEach((c,k)=>{
    c.visible = k < n; if (!c.visible) return;
    const grow = Math.min(1, (lvl - 0.68 - k*0.07)/0.12 + 0.35);
    const idx = Math.max(0, Math.min(NSEG, Math.round((c.userData.x+0.5)*NSEG)));
    c.position.set(c.userData.x, c.userData.y + (off ? off[idx]/sz.h : 0), 0);
    c.rotation.set(0, 0, c.userData.rz); c.scale.set(c.userData.len*grow*(0.6+0.8*lvl), 0.17, 1 + 0.045/sz.d);
  });
}
function disposeView(v){
  for (const mt of (v.mats||[])) mt.dispose();
  for (const o of [v.deck, ...(v.rails||[]), ...v.parts, ...v.stripes]){ if(!o) continue; bridgeGroup.remove(o); if (o.material && !Object.values(M).includes(o.material) && !Array.isArray(o.material)) o.material.dispose(); if (o.geometry && o.geometry!==unitBox && o.geometry!==unitCyl) o.geometry.dispose(); }
}
function setBeamVisible(v, vis){ for (const o of [v.deck, ...(v.rails||[]), ...v.parts, ...v.stripes]) if(o) o.visible = vis && (v.stripes.includes(o) ? o.visible : true); }
function makeNodeView(n){
  const g = new THREE.Group();
  if (n.anchor){ const a = new THREE.Mesh(anchorGeo, M.concrete); a.castShadow = true; g.add(a);
    for (const z of [-ZT, ZT]){ const r = new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.17,0.3,16).rotateX(Math.PI/2), M.anchor); r.position.z = z + Math.sign(z)*0.16; g.add(r); } }
  else for (const z of [-ZT, ZT]){ const b = new THREE.Mesh(boltGeo, M.bolt); b.position.z = z; b.castShadow = true; g.add(b); }
  bridgeGroup.add(g); return g;
}
// Querträger unter der Fahrbahn an Straßenknoten
let crossViews = new Map();
function rebuildDesignViews(){
  for (const v of beamViews.values()) disposeView(v);
  for (const g of nodeViews.values()) bridgeGroup.remove(g);
  for (const c of crossViews.values()) bridgeGroup.remove(c);
  beamViews = new Map(); nodeViews = new Map(); crossViews = new Map();
  for (const b of beams) beamViews.set(b.id, makeBeamView(b));
  for (const n of nodes) nodeViews.set(n.id, makeNodeView(n));
  const roadNodes = new Set(); for (const b of beams) if (b.mat==='road'){ roadNodes.add(b.a); roadNodes.add(b.b); }
  for (const id of roadNodes){ const n = nodeById(id); if (n.anchor) continue; const c = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.16,2*ZT+0.2), M.steel); c.castShadow = true; bridgeGroup.add(c); crossViews.set(id, c); }
  layoutDesign();
}
function layoutDesign(){
  for (const b of beams){ const v = beamViews.get(b.id); if(!v) continue; const a = nodeById(b.a), c = nodeById(b.b); setBeamVisible(v,true); updateBeamView(v, {x:X(a.x),y:Y(a.y)}, {x:X(c.x),y:Y(c.y)}, null); }
  for (const n of nodes){ const g = nodeViews.get(n.id); if (g) g.position.set(X(n.x), Y(n.y), 0); }
  for (const [id,c] of crossViews){ const n = nodeById(id); c.position.set(X(n.x), Y(n.y)-0.12, 0); }
}

// ================= Fahrzeuge =================
function carShape(w,h){ // Seitenprofil Auto (Einheiten)
  const s = new THREE.Shape(); const hw=w/2;
  s.moveTo(-hw, -h*0.45); s.lineTo(hw, -h*0.45); s.quadraticCurveTo(hw+0.05, h*0.25, hw-0.25, h*0.35);
  s.lineTo(hw*0.45, h*0.42); s.quadraticCurveTo(hw*0.2, h*1.35, -hw*0.15, h*1.32); s.lineTo(-hw*0.55, h*1.25);
  s.quadraticCurveTo(-hw*0.8, h*0.55, -hw+0.05, h*0.42); s.quadraticCurveTo(-hw-0.06, 0, -hw, -h*0.45); return s;
}
function makeVehicleMesh(type){
  const v = VEH[type], grp = new THREE.Group(), w = v.w*U, h = v.h*U;
  const paint = new THREE.MeshPhysicalMaterial({color: {car:0x2f7bd8, van:0xf2b705, truck:0xe0482b, hauler:0x7d3cc4}[type], metalness:0.55, roughness:0.32, clearcoat:1, clearcoatRoughness:0.06, envMapIntensity:1.2});
  const glass = new THREE.MeshPhysicalMaterial({color:0x14202c, metalness:0.2, roughness:0.05, clearcoat:1, envMapIntensity:1.6});
  const trim = new THREE.MeshStandardMaterial({color:0x22262b, roughness:0.6});
  const lightM = new THREE.MeshStandardMaterial({color:0xfff7cc, emissive:0xfff1a8, emissiveIntensity:2});
  const tailM = new THREE.MeshStandardMaterial({color:0xff3333, emissive:0xff1111, emissiveIntensity:1.5});
  const bodyD = 0.95;
  if (type==='car'){
    const g = new THREE.ExtrudeGeometry(carShape(w,h), {depth:bodyD, bevelEnabled:true, bevelThickness:0.08, bevelSize:0.06, bevelSegments:3}); g.translate(0,0,-bodyD/2);
    const body = new THREE.Mesh(g, paint); body.castShadow = true; grp.add(body);
    const ws = new THREE.Shape(); const hw=w/2; ws.moveTo(hw*0.38, h*0.5); ws.quadraticCurveTo(hw*0.16, h*1.22, -hw*0.12, h*1.2); ws.lineTo(-hw*0.5,h*1.15); ws.quadraticCurveTo(-hw*0.7,h*0.6,-hw*0.72,h*0.5); ws.lineTo(hw*0.38,h*0.5);
    const wg = new THREE.ExtrudeGeometry(ws, {depth:bodyD+0.1, bevelEnabled:false}); wg.translate(0,0,-(bodyD+0.1)/2);
    grp.add(new THREE.Mesh(wg, glass));
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.1,0.22), lightM); for (const z of [-0.33,0.33]){ const c=hl.clone(); c.position.set(w/2+0.03, h*0.05, z); grp.add(c);} 
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.1,0.2), tailM); for (const z of [-0.33,0.33]){ const c=tl.clone(); c.position.set(-w/2-0.02, h*0.15, z); grp.add(c);} 
    const bump = new THREE.Mesh(new THREE.BoxGeometry(w+0.12, 0.09, bodyD+0.12), trim); bump.position.y = -h*0.42; grp.add(bump);
  } else if (type==='van'){
    // Lieferwagen: hoher Kastenaufbau mit schräger Front
    const vs = new THREE.Shape(); const hw=w/2;
    vs.moveTo(-hw,-h*0.45); vs.lineTo(hw,-h*0.45); vs.lineTo(hw, h*0.1); vs.quadraticCurveTo(hw-0.02, h*0.3, hw-0.3, h*0.42); vs.lineTo(hw*0.55, h*0.95); vs.quadraticCurveTo(hw*0.45, h*1.05, hw*0.3, h*1.05); vs.lineTo(-hw+0.06, h*1.05); vs.lineTo(-hw, h*0.95); vs.lineTo(-hw,-h*0.45);
    const g = new THREE.ExtrudeGeometry(vs, {depth:bodyD+0.05, bevelEnabled:true, bevelThickness:0.06, bevelSize:0.05, bevelSegments:2}); g.translate(0,0,-(bodyD+0.05)/2);
    const body = new THREE.Mesh(g, paint); body.castShadow = true; grp.add(body);
    const ws = new THREE.Mesh(new THREE.BoxGeometry(0.05, h*0.42, bodyD*0.85), glass); ws.position.set(hw*0.66, h*0.72, 0); ws.rotation.z = -0.55; grp.add(ws);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(w*0.16, h*0.32, bodyD+0.12), glass); sw.position.set(hw*0.38, h*0.72, 0); grp.add(sw);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(w*0.62, h*0.12, bodyD+0.13), new THREE.MeshStandardMaterial({color:0x1f2937, roughness:0.5})); stripe.position.set(-hw*0.3, h*0.2, 0); grp.add(stripe);
    const bump = new THREE.Mesh(new THREE.BoxGeometry(w+0.1, 0.1, bodyD+0.1), trim); bump.position.y = -h*0.42; grp.add(bump);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.1,0.22), lightM); for (const z of [-0.36,0.36]){ const c=hl.clone(); c.position.set(hw+0.03, 0, z); grp.add(c);} 
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.16,0.14), tailM); for (const z of [-0.4,0.4]){ const c=tl.clone(); c.position.set(-hw-0.02, h*0.2, z); grp.add(c);} 
  } else if (type==='hauler'){
    // Schwerlast-Zugmaschine mit Tieflader und Stahlbrammen-Ladung (24 t)
    const cabL = w*0.22, bedL = w - cabL - 0.08;
    const cs = new THREE.Shape(); cs.moveTo(0,-h*0.3); cs.lineTo(cabL,-h*0.3); cs.lineTo(cabL, h*0.6); cs.quadraticCurveTo(cabL-0.04,h*1.45,cabL-0.3,h*1.55); cs.lineTo(0.05,h*1.58); cs.lineTo(0,-h*0.3);
    const cg = new THREE.ExtrudeGeometry(cs, {depth:1.0, bevelEnabled:true, bevelThickness:0.06, bevelSize:0.05, bevelSegments:2}); cg.translate(w/2-cabL, 0, -0.5);
    const cab = new THREE.Mesh(cg, paint); cab.castShadow = true; grp.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, h*0.5, 0.86), glass); win.position.set(w/2-0.08, h*1.08, 0); win.rotation.z = -0.18; grp.add(win);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(cabL*0.5, h*0.42, 1.12), glass); sw.position.set(w/2-cabL*0.42, h*1.1, 0); grp.add(sw);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.05,h*1.3,10), M.rail); stack.position.set(w/2-cabL-0.02, h*1.0, 0.45); grp.add(stack);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(bedL, h*0.28, 1.05), trim); bed.position.set(-w/2+bedL/2, -h*0.12, 0); bed.castShadow = true; grp.add(bed);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.5, h*0.4, 0.9), paint); neck.position.set(w/2-cabL-0.25, h*0.05, 0); grp.add(neck);
    const slabM = new THREE.MeshPhysicalMaterial({color:0x9aa3ad, metalness:1, roughness:0.35, clearcoat:0.4});
    for (let k=0;k<3;k++){ const sl = new THREE.Mesh(new THREE.BoxGeometry(bedL*0.82, h*0.3, 0.95), slabM); sl.position.set(-w/2+bedL*0.48, h*0.17 + k*h*0.32, 0); sl.castShadow = true; grp.add(sl); }
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.06, h*1.05, 1.0), new THREE.MeshStandardMaterial({color:0xf59f00})); for (const xx of [-0.25,0.25]){ const c=strap.clone(); c.position.set(-w/2+bedL*(0.48+xx), h*0.5, 0); grp.add(c);} 
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.12,0.24), lightM); for (const z of [-0.36,0.36]){ const c=hl.clone(); c.position.set(w/2+0.02, 0, z); grp.add(c);} 
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.12,0.2), tailM); for (const z of [-0.4,0.4]){ const c=tl.clone(); c.position.set(-w/2-0.02, 0, z); grp.add(c);} 
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.8), new THREE.MeshStandardMaterial({color:0xfacc15, emissive:0x553300})); sign.position.set(w/2+0.03, h*1.65, 0); grp.add(sign);
  } else {
    const cargoL = w*0.7, cabL = w*0.27;
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(cargoL, h*1.75, 1.05), [new THREE.MeshStandardMaterial({color:0xf4f6f8, roughness:0.5}), new THREE.MeshStandardMaterial({color:0xf4f6f8, roughness:0.5}), new THREE.MeshStandardMaterial({color:0xe9edf1}), trim, new THREE.MeshStandardMaterial({map:T.cargoTexture(), roughness:0.45}), new THREE.MeshStandardMaterial({map:T.cargoTexture(), roughness:0.45})]);
    cargo.position.set(-w/2+cargoL/2, h*0.55, 0); cargo.castShadow = true; grp.add(cargo);
    const cs = new THREE.Shape(); cs.moveTo(0,-h*0.3); cs.lineTo(cabL,-h*0.3); cs.lineTo(cabL, h*0.55); cs.quadraticCurveTo(cabL-0.05,h*1.3,cabL-0.35,h*1.4); cs.lineTo(0.05,h*1.42); cs.lineTo(0,-h*0.3);
    const cg = new THREE.ExtrudeGeometry(cs, {depth:1.0, bevelEnabled:true, bevelThickness:0.06, bevelSize:0.05, bevelSegments:2}); cg.translate(w/2-cabL-0.02, 0, -0.5);
    const cab = new THREE.Mesh(cg, paint); cab.castShadow = true; grp.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.06, h*0.55, 0.85), glass); win.position.set(w/2-0.1, h*0.95, 0); win.rotation.z = -0.25; grp.add(win);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(cabL*0.55, h*0.45, 1.12), glass); sw.position.set(w/2-cabL*0.45, h*0.98, 0); grp.add(sw);
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.9), trim); chassis.position.y = -h*0.38; grp.add(chassis);
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.06,0.12,0.24), lightM); for (const z of [-0.35,0.35]){ const c=hl.clone(); c.position.set(w/2+0.02, 0, z); grp.add(c);} 
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.12,0.2), tailM); for (const z of [-0.38,0.38]){ const c=tl.clone(); c.position.set(-w/2-0.02, 0.05, z); grp.add(c);} 
  }
  const wheels = [];
  const tireG = new THREE.CylinderGeometry(v.r*U, v.r*U, 0.26, 24); tireG.rotateX(Math.PI/2);
  const rimG = new THREE.CylinderGeometry(v.r*U*0.58, v.r*U*0.58, 0.28, 12); rimG.rotateX(Math.PI/2);
  const tireM = new THREE.MeshStandardMaterial({color:0x17191c, roughness:0.85});
  const rimM = new THREE.MeshPhysicalMaterial({color:0xd5dde6, metalness:1, roughness:0.2, clearcoat:1});
  for (const wx of v.wheels){
    const wg = new THREE.Group();
    for (const z of [-0.56, 0.56]){ const t = new THREE.Mesh(tireG, tireM); t.position.z = z; t.castShadow = true; wg.add(t);
      const r = new THREE.Mesh(rimG, rimM); r.position.z = z; wg.add(r);
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(v.r*U*1.0, 0.05, 0.3), rimM); spoke.position.z = z; wg.add(spoke); const s2 = spoke.clone(); s2.rotation.z = Math.PI/2; wg.add(s2); }
    wheels.push(wg); scene.add(wg);
  }
  scene.add(grp);
  return {grp, wheels, type};
}
let vehView = null;
function setVehicleView(type){
  if (vehView){ scene.remove(vehView.grp); for (const w of vehView.wheels) scene.remove(w); }
  vehView = makeVehicleMesh(type); placeVehicleStatic();
}
function placeVehicleStatic(){
  const v = VEH[vehView.type], x = L.startX ?? (L.gapL-170), gy = L.roadY-4, cy = gy - v.r - v.h/2 - 2;
  vehView.grp.position.set(X(x), Y(cy), 0); vehView.grp.rotation.set(0,0,0);
  v.wheels.forEach((wx,i)=>{ vehView.wheels[i].position.set(X(x+wx), Y(cy+v.h/2+2), 0); vehView.wheels[i].rotation.set(0,0,0); });
}

// ================= Effekte: Splitter, Staub, Funken, Bruchstücke =================
const POOL = {splinter: isCoarse?90:160, dust: isCoarse?50:90, spark: isCoarse?80:140, chunk: isCoarse?40:80};
function makePool(geo, mat, n){ const im = new THREE.InstancedMesh(geo, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = false; im.count = n;
  const p = {im, n, items: Array.from({length:n}, ()=>({life:0})), next:0}; const m0 = new THREE.Matrix4().makeScale(0,0,0); for (let i=0;i<n;i++) im.setMatrixAt(i, m0); fxGroup.add(im); return p; }
const splinters = makePool(new THREE.BoxGeometry(1,1,1), M.wood, POOL.splinter);
const dust = makePool(new THREE.IcosahedronGeometry(1,0), new THREE.MeshBasicMaterial({color:0xcbb99a, transparent:true, opacity:0.45, depthWrite:false}), POOL.dust);
const chunks = makePool(new THREE.DodecahedronGeometry(1,0), new THREE.MeshStandardMaterial({color:0x9a9d9f, roughness:1, flatShading:true}), POOL.chunk);
const sparks = makePool(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0xffb347, blending:THREE.AdditiveBlending, transparent:true, depthWrite:false}), POOL.spark);
function emit(pool, init){ const it = pool.items[pool.next]; pool.next = (pool.next+1)%pool.n; Object.assign(it, init); return it; }
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
function updatePools(dt){
  const floorY = Y(L.floorY||640);
  for (const p of [splinters, dust, sparks, chunks]){
    let any = false;
    p.items.forEach((it,i)=>{
      if (it.life <= 0){ if (it.wasAlive){ tmpM.makeScale(0,0,0); p.im.setMatrixAt(i,tmpM); it.wasAlive=false; any=true; } return; }
      it.wasAlive = true; any = true; it.life -= dt;
      if (p===dust){ it.vx*=0.97; it.vy = it.vy*0.97 + 0.15*dt; it.s += dt*0.9; }
      else { it.vy -= (p===sparks?7:9.8)*dt; }
      it.x += it.vx*dt; it.y += it.vy*dt; it.z += it.vz*dt;
      if ((p===splinters||p===chunks) && it.y < floorY){ it.y = floorY; it.vy *= -0.3; it.vx *= 0.6; it.vz*=0.6; it.wa*=0.5; }
      it.rx += it.wa*dt; it.rz += it.wb*dt;
      const k = Math.max(0, Math.min(1, it.life/it.max*3));
      if (p===sparks){ const sp = Math.hypot(it.vx,it.vy); tmpE.set(0,0,Math.atan2(it.vy,it.vx)); tmpS.set(0.05+sp*0.03, 0.025, 0.025).multiplyScalar(k); }
      else if (p===dust){ tmpE.set(it.rx,0,it.rz); tmpS.setScalar(it.s*k); }
      else if (p===chunks){ tmpE.set(it.rx,it.rz,0); tmpS.setScalar(it.l*Math.min(1,it.life*2)); }
      else { tmpE.set(it.rx,0,it.rz); tmpS.set(it.l, it.t, it.t).multiplyScalar(Math.min(1,it.life*2)); }
      tmpQ.setFromEuler(tmpE); tmpM.compose(tmpV.set(it.x,it.y,it.z), tmpQ, tmpS); p.im.setMatrixAt(i, tmpM);
    });
    if (any) p.im.instanceMatrix.needsUpdate = true;
  }
}
// Bruchstücke: Matter-Körper (fallen physikalisch) + Mesh mit gezacktem Ende
let pieces = [];
function jaggedGeo(len, th, depth, jagEnd, seed){
  const s = new THREE.Shape(); const hl = len/2, ht = th/2;
  if (jagEnd > 0){ s.moveTo(-hl,-ht); const n=5; for(let i=0;i<=n;i++){ const y=-ht+th*i/n; s.lineTo(hl - (i%2? 0.03+hash(seed+i)*0.12 : 0), y); } s.lineTo(-hl, ht); }
  else { s.moveTo(hl,-ht); s.lineTo(hl,ht); const n=5; for(let i=n;i>=0;i--){ const y=-ht+th*i/n; s.lineTo(-hl + (i%2? 0.03+hash(seed+i)*0.12 : 0), y); } }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, {depth, bevelEnabled:false}); g.translate(0,0,-depth/2); return g;
}
function spawnPieces(ev){
  if (!sim) return;
  const mat = ev.mat, A = ev.A, B = ev.B, w = ev.where;
  const P = {x: A.x+(B.x-A.x)*w, y: A.y+(B.y-A.y)*w};
  const ang = Math.atan2(B.y-A.y, B.x-A.x);
  const halves = [[A,P,1],[P,B,-1]];
  const v = beamViews.get(ev.id);
  if (mat==='road') {
    for (const z of [-0.6, 0, 0.6]) for (let i=0;i<(isCoarse?3:6);i++) emit(dust, {x:X(P.x)+(Math.random()-0.5)*0.4, y:Y(P.y), z, vx:(Math.random()-0.5)*1.5, vy:Math.random()*0.8, vz:(Math.random()-0.5), rx:0, rz:0, wa:0, wb:0, s:0.1+Math.random()*0.12, life:1.5+Math.random(), max:2.5});
    return; }
  if (isRope(mat)){
    // Kabel/Seil reißt und schnellt zu den Knoten zurück
    for (const [p0,p1,s] of halves){ const anchorEnd = s>0 ? p0 : p1; const free = s>0 ? p1 : p0;
      pieces.push({cable:true, r:SIZES[mat].r, nodeRef: s>0 ? ev.beam.A : ev.beam.B, len: Math.hypot(free.x-anchorEnd.x, free.y-anchorEnd.y), ang: Math.atan2(free.y-anchorEnd.y, free.x-anchorEnd.x), va:0, t:0, life:6,
        meshes:[-ZT,ZT].map(z=>{ const m=new THREE.Mesh(unitCyl, BEAM_MAT[mat]); m.userData.z=z; fxGroup.add(m); return m; })}); }
    if (mat==='rope'){ const px=X(P.x), py=Y(P.y); for (const z of [-ZT,ZT]) for (let i=0;i<(isCoarse?8:14);i++){ const a=Math.random()*Math.PI*2, sp=2+Math.random()*5; emit(sparks,{x:px,y:py,z,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp+1,vz:(Math.random()-0.5)*3,rx:0,rz:0,wa:0,wb:0,life:0.3+Math.random()*0.4,max:0.7}); } }
    return;
  }
  if (pieces.length > (isCoarse?16:28)){ const old = pieces.shift(); killPiece(old); }
  const th = mat==='concrete'?10: mat==='wood'?7: mat==='cast'?8: 6;
  const knick = ev.reason==='knick';
  for (const [p0,p1,s] of halves){
    const len = Math.hypot(p1.x-p0.x, p1.y-p0.y); if (len < 6) continue;
    const cx=(p0.x+p1.x)/2, cy=(p0.y+p1.y)/2;
    // geknickte Stäbe klappen seitlich weg (Knickfigur)
    const nx = -(B.y-A.y), ny = (B.x-A.x), nl = Math.hypot(nx,ny)||1;
    const kv = knick ? 1.6 : 0;
    const body = addDebrisBody(sim, cx, cy, len, th, ang, (Math.random()-0.5)*1.2 + s*-0.4 + nx/nl*kv, -0.5-Math.random()*1.2 + ny/nl*kv, (Math.random()-0.5)*0.08 + (knick ? s*0.12 : 0));
    const sz = SIZES[mat];
    const geo = (mat==='wood'||mat==='concrete'||mat==='cast') ? jaggedGeo(len*U, sz.h, sz.d, s, Math.random()*100) : new THREE.BoxGeometry(len*U, sz.h, sz.d);
    const meshes = [-ZT, ZT].map(z=>{ const m = new THREE.Mesh(geo, BEAM_MAT[mat]); m.castShadow = true; m.userData.z = z + (Math.random()-0.5)*0.1; fxGroup.add(m); return m; });
    pieces.push({body, meshes, geo, life: 7, t:0});
  }
  // Partikel
  const px = X(P.x), py = Y(P.y);
  if (mat==='wood'){
    for (const z of [-ZT, ZT]){
      for (let i=0;i<(isCoarse?9:16);i++){ const a = Math.random()*Math.PI*2, sp = 1+Math.random()*4;
        emit(splinters, {x:px, y:py, z, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp+2, vz:(Math.random()-0.5)*2, rx:Math.random()*3, rz:Math.random()*3, wa:(Math.random()-0.5)*20, wb:(Math.random()-0.5)*20, l:0.06+Math.random()*0.2, t:0.012+Math.random()*0.02, life:1.6+Math.random(), max:2.6}); }
      for (let i=0;i<(isCoarse?4:7);i++) emit(dust, {x:px+(Math.random()-0.5)*0.3, y:py, z:z+(Math.random()-0.5)*0.3, vx:(Math.random()-0.5)*1.2, vy:Math.random()*0.6, vz:(Math.random()-0.5)*0.8, rx:0, rz:0, wa:0, wb:0, s:0.08+Math.random()*0.1, life:1.4+Math.random()*0.8, max:2.2});
    }
  } else if (mat==='concrete' || mat==='cast'){
    // Beton/Guss: spröder Bruch – Brocken und grauer Staub
    for (const z of [-ZT, ZT]){
      for (let i=0;i<(isCoarse?7:12);i++){ const a = Math.random()*Math.PI*2, sp = 0.8+Math.random()*3;
        emit(chunks, {x:px, y:py, z, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp+1.5, vz:(Math.random()-0.5)*2, rx:Math.random()*3, rz:Math.random()*3, wa:(Math.random()-0.5)*12, wb:(Math.random()-0.5)*12, l:0.04+Math.random()*0.08, t:0, life:1.8+Math.random(), max:2.8, c: mat==='cast'?1:0}); }
      for (let i=0;i<(isCoarse?5:9);i++) emit(dust, {x:px+(Math.random()-0.5)*0.3, y:py, z:z+(Math.random()-0.5)*0.3, vx:(Math.random()-0.5)*1.4, vy:Math.random()*0.7, vz:(Math.random()-0.5)*0.8, rx:0, rz:0, wa:0, wb:0, s:0.1+Math.random()*0.14, life:1.6+Math.random(), max:2.6});
    }
    if (mat==='cast') for (const z of [-ZT, ZT]) for (let i=0;i<(isCoarse?6:10);i++){ const a = Math.random()*Math.PI*2, sp = 2+Math.random()*5; emit(sparks, {x:px, y:py, z, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp+1.5, vz:(Math.random()-0.5)*3, rx:0, rz:0, wa:0, wb:0, life:0.3+Math.random()*0.4, max:0.7}); }
  } else {
    // Stahl / Alu: Funken (Alu heller und weniger)
    const n = mat==='alu' ? (isCoarse?9:16) : (isCoarse?14:26);
    for (const z of [-ZT, ZT]) for (let i=0;i<n;i++){ const a = Math.random()*Math.PI*2, sp = 2+Math.random()*7;
      emit(sparks, {x:px, y:py, z, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp+1.5, vz:(Math.random()-0.5)*3, rx:0, rz:0, wa:0, wb:0, life:0.4+Math.random()*0.6, max:1}); }
  }
}
function killPiece(p){ if (p.body && sim) removeBody(sim, p.body); for (const m of p.meshes) fxGroup.remove(m); if (p.geo) p.geo.dispose(); }
function updatePieces(dt){
  pieces = pieces.filter(p=>{
    p.t += dt;
    if (p.cable){
      // Rückschnellen: Länge schrumpft, danach pendelt es nach unten
      const n = p.nodeRef.position, k = Math.min(1, p.t/0.25);
      const len = p.len*(1-0.55*k);
      const target = Math.PI/2; p.va += ((target - p.ang)*14 - p.va*2.2)*dt; p.ang += p.va*dt*(k<1?0.3:1);
      const ex = n.x + Math.cos(p.ang)*len, ey = n.y + Math.sin(p.ang)*len;
      const wob = k<1 ? Math.sin(p.t*60)*8*(1-k) : 0;
      for (const m of p.meshes){ placeBox(m, X(n.x), Y(n.y), X(ex), Y(ey)+wob*U, m.userData.z, p.r||0.035, p.r||0.035); }
    } else {
      const b = ip(p.body); const fade = Math.min(1, (p.life - p.t)/1.0);
      for (const m of p.meshes){ m.position.set(X(b.x), Y(b.y), m.userData.z); m.rotation.set(0,0,-b.a); m.scale.setScalar(Math.max(0.001,fade)); }
    }
    if (p.t > p.life){ killPiece(p); return false; }
    return true;
  });
}
function clearFx(){ for (const p of pieces) killPiece(p); pieces = []; for (const pool of [splinters,dust,sparks,chunks]) pool.items.forEach(it=>it.life=0); updatePools(0); }

// ================= Kamera & Ansicht =================
const cam = {tx:0, ty:-1, d:40, yaw:-0.16, pitch:0.1};
let userMovedCam = false;
function applyCamera(){
  const {tx,ty,d,yaw,pitch} = cam;
  camera.position.set(tx + d*Math.sin(yaw)*Math.cos(pitch), ty + d*Math.sin(pitch), d*Math.cos(yaw)*Math.cos(pitch));
  camera.lookAt(tx, ty, 0);
  sun.target.position.set(tx, ty, 0); sun.position.copy(SUN_DIR).multiplyScalar(60).add(sun.target.position);
  sky.position.copy(camera.position);
}
function fitView(){
  const r = stage.getBoundingClientRect(), aspect = r.width/Math.max(1,r.height);
  const topY = Math.min(L.roadY-60, ...(L.anchors.map(a=>a[1]-60)));
  const portrait = aspect < 1;
  const x0 = portrait ? L.gapL-90 : (L.startX ?? L.gapL-170) - 120, x1 = portrait ? L.gapR+90 : L.gapR + 210, y0 = topY, y1 = Math.max(L.roadY+200, ...L.anchors.map(a=>a[1]+80));
  const wU = (x1-x0)*U, hU = (y1-y0)*U, th = Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  cam.d = (portrait ? wU/(2*th*aspect) : Math.max(hU/(2*th), wU/(2*th*aspect))) * 1.04;
  cam.tx = X((x0+x1)/2); cam.ty = Y((y0+y1)/2) + (aspect<1 ? -0.0 : 0);
  cam.d = Math.min(cam.d, 140);
  userMovedCam = false; applyCamera();
}
function resize(){
  const r = stage.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false); camera.aspect = r.width/Math.max(1,r.height); camera.updateProjectionMatrix();
}
window.addEventListener('resize', ()=>{ resize(); fitView(); });
window.addEventListener('orientationchange', ()=>setTimeout(()=>{ resize(); fitView(); }, 250));
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0,0,1), 0), hitV = new THREE.Vector3();
function toWorld(cx, cy){
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx-r.left)/r.width)*2-1, -((cy-r.top)/r.height)*2+1);
  ray.setFromCamera(ndc, camera); ray.ray.intersectPlane(plane, hitV);
  return {x: hitV.x/U + 720, y: 360 - hitV.y/U};
}
function toScreen(x, y, z=0){
  const v = new THREE.Vector3(X(x), Y(y), z).project(camera); const r = canvas.getBoundingClientRect();
  return {x: (v.x+1)/2*r.width, y: (1-v.y)/2*r.height};
}
function pxPerWorld(){ const a = toScreen(720,360), b = toScreen(760,360); return Math.hypot(b.x-a.x,b.y-a.y)/40; }
function zoomAt(cx, cy, f){
  const before = toWorld(cx, cy);
  cam.d = Math.max(8, Math.min(150, cam.d*f)); applyCamera();
  const after = toWorld(cx, cy);
  cam.tx += X(before.x) - X(after.x); cam.ty += Y(before.y) - Y(after.y); applyCamera(); userMovedCam = true;
}
function panBy(dxPx, dyPx){
  const r = canvas.getBoundingClientRect();
  const upp = 2*cam.d*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/r.height;
  cam.tx -= dxPx*upp; cam.ty += dyPx*upp; applyCamera(); userMovedCam = true;
}

// ================= Bau-Logik =================
function inTerrain(x,y){
  for (const c of L.cliffs) if (x > c[0]+0.5 && x < c[1]-0.5 && y > c[2]-4+0.5) return true;
  for (const p of (L.pillars||[])) if (x > p[0]+0.5 && x < p[1]-0.5 && y > p[2]+0.5) return true;
  return false;
}
const validPoint = (x,y) => x>=0 && x<=1440 && y>=0 && y<=(L.floorY||640)-30 && !inTerrain(x,y);
function segBlocked(a,b){ for (let t=0.1;t<0.95;t+=0.1) if (inTerrain(a.x+(b.x-a.x)*t, a.y+(b.y-a.y)*t)) return true; return false; }
function nodeAt(p, rad){ let best=null, bd=rad; for (const n of nodes){ const d=dist(n,p); if (d<bd){bd=d;best=n;} } return best; }
function snapEnd(start, p, mat){
  const max = MATS[mat].maxLen; let target = p; const d = dist(start,p);
  if (d > max) target = {x:start.x+(p.x-start.x)/d*max, y:start.y+(p.y-start.y)/d*max};
  let best=null, bd=Infinity; const gx=Math.round(target.x/GRID), gy=Math.round(target.y/GRID);
  for (let i=-2;i<=2;i++) for (let j=-2;j<=2;j++){
    const q = {x:(gx+i)*GRID, y:(gy+j)*GRID}, ld = dist(start,q);
    if (ld > max+0.01 || ld < 1) continue;
    if (!validPoint(q.x,q.y) && !nodeAt(q,1)) continue;
    if (segBlocked(start,q)) continue;
    const dd = dist(q,target); if (dd<bd){bd=dd;best=q;}
  }
  return best;
}
// Auto-Segmentierung (wie bridge-builder-3d): zu lange Stäbe werden automatisch in mehrere Segmente mit Zwischenknoten auf dem Raster geteilt
function planChain(start, p, mat){
  const max = MATS[mat].maxLen, d = dist(start,p);
  if (d <= max + GRID*0.6){ const q = snapEnd(start,p,mat); return q ? [q] : null; }
  let end = null, bd = Infinity; const gx = Math.round(p.x/GRID), gy = Math.round(p.y/GRID);
  for (let i=-1;i<=1;i++) for (let j=-1;j<=1;j++){ const q = {x:(gx+i)*GRID, y:(gy+j)*GRID}; if (!validPoint(q.x,q.y) && !nodeAt(q,1)) continue; const dd = dist(q,p); if (dd<bd){bd=dd; end=q;} }
  if (!end || (end.x===start.x && end.y===start.y)) return null;
  const D = dist(start,end);
  const ok = q => validPoint(q.x,q.y) || nodeAt(q,1);
  const n0 = Math.max(2, Math.ceil(D/(max+0.01))); let bestRes = null, bestScore = Infinity;
  for (let n=n0; n<=Math.min(12, n0+3); n++){
    // Zwischenknoten: Rasterpunkte nahe der gleichmäßigen Teilung – per DP die Kette mit möglichst gleich langen Segmenten wählen
    const ideal = D/n, layers = [[start]];
    for (let k=1;k<n;k++){
      const ix = start.x+(end.x-start.x)*k/n, iy = start.y+(end.y-start.y)*k/n, c = [];
      for (let i=-1;i<=1;i++) for (let j=-1;j<=1;j++){ const q = {x:(Math.round(ix/GRID)+i)*GRID, y:(Math.round(iy/GRID)+j)*GRID}; if (ok(q) && !(q.x===start.x&&q.y===start.y) && !(q.x===end.x&&q.y===end.y) && Math.hypot(q.x-ix,q.y-iy) < GRID*1.2) c.push(q); }
      if (!c.length) break; layers.push(c);
    }
    if (layers.length < n) continue;
    layers.push([end]);
    const devL = q => Math.abs((q.x-start.x)*(end.y-start.y) - (q.y-start.y)*(end.x-start.x))/D;
    const segCost = (a,b) => { const l = dist(a,b); if (l < 1 || l > max+0.01 || segBlocked(a,b)) return Infinity; return (l-ideal)*(l-ideal); };
    let prev = layers[0].map(q=>({q, c:0, path:[]}));
    for (let k=1;k<layers.length;k++){
      prev = layers[k].map(q=>{ let best = {c:Infinity}; for (const p of prev){ const lineDev = devL(q)*devL(q)*0.6; const c = p.c + segCost(p.q,q) + lineDev; if (c < best.c) best = {q, c, path:[...p.path, q]}; } return best.c<Infinity ? best : {q, c:Infinity, path:[]}; });
    }
    const res = prev[0];
    if (res.c < Infinity && new Set(res.path.map(q=>q.x+','+q.y)).size === res.path.length){
      // Bewertung: Längenspreizung (relativ) + kleiner Aufschlag je zusätzlichem Segment + Ausreizen der Maximallänge vermeiden
      let pp = start, mn = Infinity, mx = 0; for (const q of res.path){ const l = dist(pp,q); mn = Math.min(mn,l); mx = Math.max(mx,l); pp = q; }
      const score = (mx-mn)/ideal + 0.12*(n-n0) + (mx > max*0.97 ? 0.15 : 0);
      if (score < bestScore - 1e-9){ bestScore = score; bestRes = res.path; }
      if (mx-mn < 0.5) break;
    }
  }
  return bestRes;
}
function addChain(start, pts, mat){
  if (pts.length===1) return addBeam(start, pts[0], mat);
  snapshot(); let cur = start;
  for (const q of pts){ const e = addBeam(cur, q, mat, true); if (!e) break; cur = e; }
  A.sfx('place', {mat}); changed(); toast(`Automatisch in ${pts.length} Segmente geteilt (max. ${(MATS[mat].maxLen/20).toFixed(1).replace('.',',')} m je Stab)`);
  return cur;
}
function snapshot(){ history.push(JSON.stringify({nodes,beams,nextId,ex:usedExample})); if (history.length>200) history.shift(); }
function undo(){ if (!history.length){ toast('Nichts rückgängig zu machen'); A.sfx('error'); return; } const s = JSON.parse(history.pop()); nodes=s.nodes; beams=s.beams; nextId=s.nextId; usedExample=!!s.ex; pending=null; A.sfx('delete'); changed(); }
function initLevelDesign(){ usedExample = false; nodes = L.anchors.map((a,i)=>({id:'A'+i, x:a[0], y:a[1], anchor:true})); beams=[]; nextId=1; pending=null; }
function getOrCreateNode(q){ let n = nodeAt(q,1); if (!n){ n = {id:'N'+(nextId++), x:q.x, y:q.y, anchor:false}; nodes.push(n); } return n; }
function addBeam(start, q, mat, batch){
  const end = nodeAt(q,1); if (end && end.id===start.id) return null;
  const ex = end && beams.find(b=>(b.a===start.id&&b.b===end.id)||(b.b===start.id&&b.a===end.id));
  if (ex && ex.mat===mat) return end;
  if (!batch) snapshot(); const e = getOrCreateNode(q);
  if (ex) ex.mat = mat; else beams.push({id:'B'+(nextId++), a:start.id, b:e.id, mat});
  if (!batch){ A.sfx('place', {mat}); changed(); } return e;
}
function pointSegDist(p,a,b){ const vx=b.x-a.x, vy=b.y-a.y; const t=Math.max(0,Math.min(1,((p.x-a.x)*vx+(p.y-a.y)*vy)/(vx*vx+vy*vy||1))); return Math.hypot(p.x-a.x-vx*t, p.y-a.y-vy*t); }
function pruneNodes(){ nodes = nodes.filter(n=>n.anchor || beams.some(b=>b.a===n.id||b.b===n.id)); }
function beamAt(p, tol){ let best=null, bd=tol; for (const b of beams){ const d = pointSegDist(p,nodeById(b.a),nodeById(b.b)); if (d<bd){bd=d;best=b;} } return best; }
function deleteAt(p){
  const tol = Math.max(10, 22/pxPerWorld());
  const best = beamAt(p, tol), n = nodeAt(p, tol);
  if (n && !n.anchor && (!best || dist(n,p) < pointSegDist(p,nodeById(best.a),nodeById(best.b)))){ snapshot(); beams = beams.filter(b=>b.a!==n.id&&b.b!==n.id); pruneNodes(); A.sfx('delete'); changed(); return; }
  if (best){ snapshot(); beams = beams.filter(b=>b!==best); pruneNodes(); A.sfx('delete'); changed(); }
}
function resetAll(){ if (!beams.length) return; snapshot(); initLevelDesign(); A.sfx('delete'); changed(); toast('Alles gelöscht – „Zurück“ stellt es wieder her'); }
function save(){ try{ localStorage.setItem('captain2.lvl'+levelIdx, JSON.stringify({nodes,beams,nextId,ex:usedExample})); }catch(e){} }
function load(){ try{ const s = JSON.parse(localStorage.getItem('captain2.lvl'+levelIdx)||'null'); if (s && s.nodes){ nodes=s.nodes; beams=s.beams; nextId=s.nextId; usedExample=!!s.ex; return true; } }catch(e){} return false; }
function changed(){ save(); rebuildDesignViews(); updateHud(); }

// ================= HUD / UI =================
let toastT = 0;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(()=>t.classList.remove('show'), 2400); }
let tipIdx = 0;
function updateHud(){
  const c = totalCost(), over = c > L.budget;
  $('costTxt').textContent = fmt(c); $('budgetTxt').textContent = fmt(L.budget);
  $('budgetFill').style.width = Math.min(100, c/L.budget*100)+'%';
  $('budget').classList.toggle('over', over); $('budget').classList.toggle('warnb', !over && c > L.budget*0.9);
  $('lvlName').textContent = `${levelIdx+1}. ${L.name}`; $('lvlDesc').textContent = L.desc;
  $('bGo').disabled = mode==='build' && over;
  $('modeTag').textContent = mode==='build' ? 'BAUEN' : 'TEST'; $('modeTag').classList.toggle('test', mode!=='build');
  $('goTxt').textContent = mode==='build' ? 'Testen' : 'Bauen'; $('bGo').querySelector('.ic').textContent = mode==='build' ? '▶' : '■';
  $('bGo').classList.toggle('stop', mode!=='build');
  document.querySelectorAll('[data-tool]').forEach(b=>{ b.classList.toggle('sel', b.dataset.tool===tool); b.disabled = mode!=='build'; });
  for (const id of ['bUndo','bReset','bVeh']) $(id).disabled = mode!=='build';
  $('vehIc').textContent = VEH[vehType].icon; $('vehTxt').textContent = `${VEH[vehType].name} ${String(vehMass(vehType)).replace('.',',')} t`;
  for (const id of ['bExample']) $(id).disabled = mode!=='build';
  $('modeTag').textContent = (mode==='build' ? 'BAUEN' : 'TEST') + (usedExample ? ' · BEISPIEL' : ''); $('modeTag').classList.toggle('ex', usedExample && mode==='build');
  $('windBox').classList.toggle('show', !!L.wind);
  document.body.classList.toggle('testing', mode==='test'); if (mode!=='test') $('pctLayer').style.display = 'none';
  $('bSound').textContent = A.isMuted() ? '🔇' : '🔊';
  updateHint(); updateLegend();
}
function updateHint(){
  const h = $('hintBar');
  if (mode!=='build'){ h.style.opacity = 0; return; }
  h.style.opacity = 1;
  if (tool==='delete') h.innerHTML = '✂️ <b>Löschmodus</b>: Balken oder Knoten antippen';
  else if (pending) h.innerHTML = `<b>${MATS[tool].name}</b>: Endpunkt antippen · Startknoten erneut antippen = Abbrechen`;
  else if (!beams.length) h.innerHTML = `💡 ${L.tips[0]}`;
  else h.innerHTML = `💡 ${L.tips[tipIdx % L.tips.length]}`;
}
function updateLegend(){
  const lg = $('legend');
  lg.classList.toggle('build', mode==='build');
  if (mode==='build'){
    const sw = {road:'background:#2b2f36;box-shadow:inset 0 0 0 2px #facc15', wood:'background:#c08a4f', alu:'background:#dfe4ea', cast:'background:#3d4249', steel:'background:#b8c4d0', concrete:'background:#a8acae;height:9px', cable:'background:#e8b931;height:3px', rope:'background:repeating-linear-gradient(60deg,#eef3f8 0 3px,#7d8a98 3px 6px);height:4px'};
    lg.innerHTML = `<b>Bauteile</b><div class="lgrid">${MAT_ORDER.map(k=>`<div class="row${k===tool?' cur':''}"><span class="sw" style="${sw[k]}"></span>${MATS[k].name}${k==='road'?' 🚗':isRope(k)?' ↔':''}</div>`).join('')}</div><div style="opacity:.7;margin-top:3px">↔ nur Zug · lange Druckstäbe knicken</div>`;
  } else {
    const mx = sim ? Math.round(Math.min(1.5,sim.curMax||0)*100) : 0;
    const wtxt = sim && L.wind ? `<div style="opacity:.85;margin-top:2px">💨 Böe ${Math.round((sim.gust||0)*KN)} kN</div>` : '';
    lg.innerHTML = `<b>Belastung</b><div class="g"></div><div class="r"><span>0%</span><span>50%</span><span>100% = Grenze</span></div>
      <div class="max" style="color:${'#'+stressColor((sim&&sim.curMax)||0).getHexString()}">max. ${mx}%</div><div style="opacity:.75;margin-top:2px">Balken antippen = Kraft · ⏱ Zeitlupe · % Werte</div>${wtxt}`;
  }
}
function showMatTip(mat){
  const m = MATS[mat]; if (!m) return;
    const meter = (v,max)=>`<span class="meter"><i style="width:${Math.min(100,v/max*100)}%"></i></span>`;
  const kn = v => Math.round(v*KN);
  const comp = m.comp ? `${kn(m.comp)} kN <small style="opacity:.7">→ ${kn(compLimit(mat, m.maxLen))} bei ${(m.maxLen/20).toFixed(1).replace('.',',')} m (Knicken)</small>` : '– (nur Zug)';
  $('matTip').innerHTML = `<h4>${m.full||m.name}${m.drive?' 🚗':''}</h4><div style="opacity:.85;margin-bottom:4px">${m.tip}</div>
    <div class="stat"><span>Kosten</span>${meter(m.cost,8)}<span>${Math.round(m.cost*20)} €/m</span></div>
    <div class="stat"><span>Zug</span>${meter(m.str,75)}<span>${kn(m.str)} kN</span></div>
    <div class="stat"><span>Druck</span>${meter(m.comp,75)}<span>${comp}</span></div>
    <div class="stat"><span>Gewicht</span>${meter(m.kgm,550)}<span>${m.kgm} kg/m</span></div>
    <div class="stat"><span>Max. Länge</span>${meter(m.maxLen,480)}<span>${(m.maxLen/20).toFixed(1).replace('.',',')} m</span></div>`;
  $('matTip').classList.add('show'); clearTimeout(showMatTip.t); showMatTip.t = setTimeout(()=>$('matTip').classList.remove('show'), 3800);
}
function showIntro(){
  $('introTitle').textContent = `Level ${levelIdx+1}: ${L.name}`; $('introDesc').innerHTML = `${L.desc}<br><b>Budget:</b> ${fmt(L.budget)} · <b>Pflicht-Fahrzeug:</b> ${VEH[L.veh].icon} ${VEH[L.veh].full} (${String(vehMass(L.veh)).replace('.',',')} t)${L.vehicles.length>1?` · Probefahrt auch mit: ${L.vehicles.filter(v=>v!==L.veh).map(v=>VEH[v].icon+' '+VEH[v].name).join(', ')}`:''}${L.wind?`<br>💨 <b>Seitenwind</b> mit Böen bis ${Math.round(L.wind*KN*1.12)} kN`:''}`;
  $('introTips').innerHTML = L.tips.map(t=>`<li>${t}</li>`).join(''); $('ovIntro').classList.add('show');
}
function showLevels(){
  const g = $('lvlGrid'); g.innerHTML = '';
  LEVELS.forEach((lv,i)=>{
    const c = document.createElement('button'); c.className = 'lvlcard'+(i===levelIdx?' cur':'');
    const pr = progress[i];
    c.innerHTML = `<b>${i+1}. ${lv.name}</b><div>${lv.desc}</div><div>Budget ${fmt(lv.budget)} · ${VEH[lv.veh].icon} ${String(vehMass(lv.veh)).replace('.',',')} t${lv.wind?' · 💨':''}</div>` + (pr?`<div class="done">${'★'.repeat(pr.stars)}${'☆'.repeat(3-pr.stars)} ${fmt(pr.cost)}</div>`:'');
    c.onclick = ()=>{ $('ovLevels').classList.remove('show'); A.sfx('click'); selectLevel(i, true); };
    g.appendChild(c);
  });
  $('ovLevels').classList.add('show');
}
function selectLevel(i, intro){
  if (mode!=='build') stopTest();
  levelIdx = i; L = LEVELS[i]; history = []; tipIdx = 0; usedExample = false;
  if (!load()) initLevelDesign();
  vehType = L.veh; tool = 'road'; pending = null;
  buildTerrain(); buildGrid(); rebuildDesignViews(); setVehicleView(vehType);
  resize(); fitView(); updateHud();
  localStorage.setItem('captain2.level', i);
  if (intro) showIntro();
}

// ---------- Eingabe ----------
const pointers = new Map(); let pinch = null;
canvas.addEventListener('pointerdown', e=>{
  e.preventDefault(); A.unlock();
  canvas.setPointerCapture(e.pointerId);
  if (e.isPrimary){ pointers.clear(); pinch = null; }   // neue Geste: evtl. hängende Zeiger verwerfen
  pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pointers.size === 2){ ptr = null; const [a,b] = [...pointers.values()]; pinch = {d:Math.hypot(a.x-b.x,a.y-b.y), mx:(a.x+b.x)/2, my:(a.y+b.y)/2}; return; }
  if (e.button===1 || e.button===2 || mode!=='build'){ ptr = {pan:true, id:e.pointerId, lx:e.clientX, ly:e.clientY, sx:e.clientX, sy:e.clientY}; return; }
  const p = toWorld(e.clientX, e.clientY);
  if (tool==='delete'){ deleteAt(p); return; }
  const rad = Math.max(16, 30/pxPerWorld());
  ptr = {id:e.pointerId, down:p, cur:p, start:nodeAt(p, rad), drag:false, sx:e.clientX, sy:e.clientY};
});
canvas.addEventListener('pointermove', e=>{
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pinch && pointers.size>=2){
    const [a,b] = [...pointers.values()]; const d = Math.hypot(a.x-b.x,a.y-b.y), mx=(a.x+b.x)/2, my=(a.y+b.y)/2;
    panBy(mx-pinch.mx, my-pinch.my); const r = canvas.getBoundingClientRect(); zoomAt(mx, my, pinch.d/Math.max(10,d));
    pinch = {d, mx, my}; return;
  }
  hover = toWorld(e.clientX, e.clientY);
  if (!ptr || ptr.id!==e.pointerId) return;
  if (ptr.pan){ panBy(e.clientX-ptr.lx, e.clientY-ptr.ly); ptr.lx=e.clientX; ptr.ly=e.clientY; return; }
  ptr.cur = hover;
  if (!ptr.drag && Math.hypot(e.clientX-ptr.sx, e.clientY-ptr.sy) > 12){
    if (ptr.start){ ptr.drag = true; pending = null; }
    else { ptr = {pan:true, id:e.pointerId, lx:e.clientX, ly:e.clientY, sx:ptr.sx, sy:ptr.sy}; }   // ziehen im Leeren = Ansicht verschieben
  }
});
function endPointer(e){
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!ptr || ptr.id!==e.pointerId) return;
  const P = ptr; ptr = null;
  if (P.pan){
    if (mode==='test' && Math.hypot(e.clientX-P.sx, e.clientY-P.sy) < 8) inspectAt(toWorld(e.clientX,e.clientY));
    return;
  }
  const p = toWorld(e.clientX, e.clientY);
  if (P.drag && P.start){ const pts = planChain(P.start, p, tool); if (pts) addChain(P.start, pts, tool); else A.sfx('error'); }
  else if (pending){
    const pn = nodeById(pending);
    const gx = Math.round(p.x/GRID)*GRID, gy = Math.round(p.y/GRID)*GRID;
    if (gx===pn.x && gy===pn.y){ pending = null; A.sfx('click'); }
    else { const pts = planChain(pn, p, tool); if (pts){ const e2 = addChain(pn, pts, tool); pending = e2 ? e2.id : null; } else { toast('Hier kann kein Balken enden'); A.sfx('error'); } }
  } else if (P.start){ pending = P.start.id; A.sfx('click'); }
  else toast('Beginne an einem Knoten – rote Punkte sind feste Anker');
  updateHint();
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e=>{ pointers.delete(e.pointerId); pinch=null; ptr=null; });
canvas.addEventListener('pointerleave', e=>{ if (e.pointerType==='mouse') hover = null; });
canvas.addEventListener('wheel', e=>{ e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(e.deltaY*0.0012)); }, {passive:false});
canvas.addEventListener('contextmenu', e=>{ e.preventDefault(); });
document.addEventListener('keydown', e=>{
  if (e.key==='Escape'){ pending=null; updateHint(); }
  if ((e.ctrlKey||e.metaKey) && e.key==='z'){ e.preventDefault(); if (mode==='build') undo(); }
  if (e.key===' ' && !e.repeat){ e.preventDefault(); $('bGo').click(); }
});
for (const ev of ['gesturestart','gesturechange','dblclick']) document.addEventListener(ev, e=>e.preventDefault());
document.addEventListener('touchmove', e=>{ if (!e.target.closest('.card,#toolbar,#camPanel')) e.preventDefault(); }, {passive:false});

document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click', ()=>{ A.unlock(); if (mode!=='build') return; tool = b.dataset.tool; pending = null; A.sfx('click'); if (MATS[tool]) showMatTip(tool); updateHud(); }));
$('bUndo').onclick = ()=>{ A.unlock(); if (mode==='build') undo(); };
$('bReset').onclick = ()=>{ A.unlock(); if (mode==='build') resetAll(); };
$('bVeh').onclick = ()=>{ A.unlock(); if (mode!=='build') return; const vs = L.vehicles; vehType = vs[(vs.indexOf(vehType)+1)%vs.length]; if (vs.length===1) toast(`In diesem Level fährt nur: ${VEH[vehType].full}`); else toast(`Fahrzeug: ${VEH[vehType].full} (${String(vehMass(vehType)).replace('.',',')} t)${vehType!==L.veh?' – nur Probefahrt, Sterne gibt es mit '+VEH[L.veh].full:''}`); A.sfx('click'); setVehicleView(vehType); updateHud(); };
$('bGo').onclick = ()=>{ A.unlock(); mode==='build' ? startTest() : stopTest(); };
$('bLevels').onclick = ()=>{ A.unlock(); A.sfx('click'); showLevels(); };
$('bHelp').onclick = ()=>{ A.unlock(); A.sfx('click'); showIntro(); tipIdx++; updateHint(); };
$('bView').onclick = ()=>{ A.sfx('click'); fitView(); };
function loadExample(){
  if (mode!=='build') return;
  const d = segmentsToDesign(L, REFS[levelIdx]); snapshot(); nodes=d.nodes; beams=d.beams; nextId=d.nextId; usedExample = true; pending = null; changed();
  toast('📐 Beispielbrücke geladen – testen erlaubt, aber ohne Sterne. „Zurück“ macht es rückgängig.'); A.sfx('place', {mat:'steel'});
}
$('bExample').onclick = ()=>{ A.unlock(); loadExample(); };
const camDefault = {yaw:-0.16, pitch:0.1};
function syncCamSliders(){ $('camYaw').value = Math.round(THREE.MathUtils.radToDeg(cam.yaw)); $('camPitch').value = Math.round(THREE.MathUtils.radToDeg(cam.pitch)); }
$('bCam').onclick = ()=>{ A.unlock(); A.sfx('click'); syncCamSliders(); $('camPanel').classList.toggle('show'); };
$('camYaw').addEventListener('input', e=>{ cam.yaw = THREE.MathUtils.degToRad(+e.target.value); applyCamera(); });
$('camPitch').addEventListener('input', e=>{ cam.pitch = THREE.MathUtils.degToRad(+e.target.value); applyCamera(); });
$('camReset').onclick = ()=>{ A.sfx('click'); cam.yaw = camDefault.yaw; cam.pitch = camDefault.pitch; syncCamSliders(); applyCamera(); };
$('bSound').onclick = ()=>{ A.unlock(); A.setMuted(!A.isMuted()); updateHud(); A.sfx('click'); };
document.querySelectorAll('[data-close]').forEach(b=>b.onclick = ()=>{ A.unlock(); b.closest('.overlay').classList.remove('show'); });

// ================= Test-Modus =================
function startTest(){
  if (totalCost() > L.budget){ toast('Über Budget – so kann nicht getestet werden!'); A.sfx('error'); return; }
  pending = null; ptr = null; clearFx();
  sim = createSim(L, {nodes, beams}, vehType); simAcc = 0; sim.shown = false; sim.lastCreak = 0;
  mode = 'test'; setVehicleView(vehType); updateHud();
  A.engine(true, 0, vehType==='truck'||vehType==='hauler');
}
function stopTest(){
  bridgeGroup.position.z = 0; swayZ = 0;
  A.engine(false); clearFx(); sim = null; mode = 'build';
  $('ovResult').classList.remove('show'); $('label3d').style.display='none';
  layoutDesign(); placeVehicleStatic(); updateHud();
}
function inspectAt(p){
  if (!sim) return;
  let best=null, bd=Math.max(10, 22/pxPerWorld());
  for (const b of sim.beams){ if (b.broken) continue; const d = pointSegDist(p, b.A.position, b.B.position); if (d<bd){bd=d;best=b;} }
  if (!best){ return; }
  const F = best.Fs*KN, kind = isRope(best.mat) && best.Fs<0 ? 'schlaff' : (F>=0?'Zug':'Druck');
  const lim = isRope(best.mat) || F>=0 ? `Grenze ${Math.round(MATS[best.mat].str*KN)} kN` : `Knickgrenze ${Math.round(best.compLim*KN)} kN bei ${(best.rest/20).toFixed(1).replace('.',',')} m`;
  toast(`${MATS[best.mat].full||MATS[best.mat].name}: ${Math.abs(F).toFixed(1).replace('.',',')} kN ${kind} · ${Math.round(best.ratio*100)}% belastet · ${lim}`);
}
let lastVib = 0;
function vibrate(mat){
  if (!navigator.vibrate) return; const now = performance.now(); if (now - lastVib < 140) return; lastVib = now;
  try { navigator.vibrate({wood:[25,15,35], steel:[60,30,40], alu:[40,20,30], cast:[70], concrete:[80,20,40], cable:[20,10,20], rope:[30,10,30], road:[50,20,50]}[mat] || 40); } catch(e){}
}
function handleEvents(){
  for (const ev of sim.events){
    if (ev.type==='break'){
      const v = beamViews.get(ev.id);
      if (v && ev.mat!=='road') setBeamVisible(v, false);
      spawnPieces(ev);
      A.sfx({steel:'breaksteel', alu:'breaksteel', cast:'breaksteel', cable:'snap', rope:'snap'}[ev.mat] || 'breakwood');
      vibrate(ev.mat);
      if (ev.reason==='knick' && sim.t - (sim.lastKnick||-9) > 1.2){ sim.lastKnick = sim.t; toast(`💥 ${MATS[ev.mat].full||MATS[ev.mat].name} ist geknickt – zu lang für diese Druckkraft (Knickgrenze ${Math.round(ev.beam.compLim*KN)} kN)`); }
    }
  }
  sim.events.length = 0;
}
// ===== Visuelles Schwingungs-/Biegemodell (läuft in Simulationszeit, daher auch in Zeitlupe korrekt) =====
function gshape(t, s){ // Biegelinie Einfeldträger, Einzellast bei s, normiert (Maximum 1 bei s=t=0,5)
  return 48*(t <= s ? (1-s)*t*(1-(1-s)*(1-s)-t*t)/6 : s*(1-t)*(1-s*s-(1-t)*(1-t))/6);
}
function snapPrev(S){
  for (const id in S.nodes){ const n = S.nodes[id]; n.px = n.position.x; n.py = n.position.y; }
  for (const bd of [S.veh.body, ...S.veh.wheels]){ bd.px = bd.position.x; bd.py = bd.position.y; bd.pa = bd.angle; }
  for (const b of S.beams) if (b.deck){ const d = b.deck; d.px = d.position.x; d.py = d.position.y; d.pa = d.angle; }
  for (const p of pieces) if (p.body){ const d = p.body; d.px = d.position.x; d.py = d.position.y; d.pa = d.angle; }
}
const _ip = {x:0,y:0,a:0};
function ip(bd){ // interpolierte Lage zwischen zwei Physikschritten (flüssige Zeitlupe)
  if (bd.px === undefined || ipK >= 1){ _ip.x = bd.position.x; _ip.y = bd.position.y; _ip.a = bd.angle||0; return _ip; }
  const k = ipK; _ip.x = bd.px + (bd.position.x-bd.px)*k; _ip.y = bd.py + (bd.position.y-bd.py)*k; _ip.a = (bd.pa||0) + ((bd.angle||0)-(bd.pa||0))*k; return _ip;
}
function visStep(S){
  const dt = 1/60, vt = VEH[S.vehType], wP = vehMass(S.vehType)/vt.wheels.length*Math.min(1, S.t/0.5);
  if (!S.adj){ S.adj = {}; for (const b of S.beams) if (b.mat!=='road'){ S.adj[b.aId] = (S.adj[b.aId]||0)+1; S.adj[b.bId] = (S.adj[b.bId]||0)+1; } }
  for (const b of S.beams) if (b.vo) b.vo.loads = null;
  for (const w of S.veh.wheels){
    w.deckOn = null;
    for (const b of S.beams){
      if (b.broken || !b.deck) continue;
      const A = b.A.position, B = b.B.position, x0 = Math.min(A.x,B.x), x1 = Math.max(A.x,B.x);
      if (w.position.x < x0 || w.position.x > x1 || x1-x0 < 1) continue;
      const s = (w.position.x-A.x)/(B.x-A.x), ly = A.y + (B.y-A.y)*s;
      if (Math.abs((ly - w.position.y) - vt.r - 4) > 12) continue;
      const o = b.vo || (b.vo = mkVo(b)); (o.loads ||= []).push({s, P:wP}); w.deckOn = {b, s}; break;
    }
  }
  for (const b of S.beams){
    if (b.broken) continue;
    const o = b.vo || (b.vo = mkVo(b)), L = b.rest;
    let tgt = 0, f, z;
    if (b.mat==='road'){
      const supA = b.A.isStatic || S.adj[b.aId], supB = b.B.isStatic || S.adj[b.bId];
      const sup = 1 + (supA?0:0.8) + (supB?0:0.8);
      let mid = 0; o.ld = [];
      if (o.loads) for (const q of o.loads){ const k = Math.min(L*0.13, 0.42*q.P*(L/80)*(L/80)*sup); o.ld.push({s:q.s, k}); mid += k*gshape(0.5, q.s); }
      // Eigengewicht: leichte Grunddurchbiegung, ohne Stützung stärker
      const self = 0.6*(L/80)*(L/80)*sup; o.self = self;
      tgt = mid; f = Math.max(2.2, Math.min(9, 4.8*80/L)); z = 0.055;
    } else if (!isRope(b.mat)){
      const rc = b.tension ? 0 : Math.min(1.1, b.ratio);
      const el = ({wood:0.007, alu:0.014, steel:0.008, cast:0.004, concrete:0.0025}[b.mat]||0.006)*L*rc*rc;
      const plk = {alu:0.1, steel:0.08, cast:0.02}[b.mat] || 0;
      if (plk && rc > 0.72) o.pl = Math.max(o.pl, plk*L*Math.pow((rc-0.72)/0.28, 1.5));          // Metall: bleibende Knickbiegung (Druck)
      if (plk && b.tension && b.ratio > 0.8) o.pl = Math.max(o.pl, plk*0.25*L*Math.pow((b.ratio-0.8)/0.2, 2)); // leichte Verwerfung unter starkem Zug
      tgt = (el + o.pl)*o.sgn; f = Math.max(3, Math.min(14, 7.5*80/L)); z = 0.09;
    } else { f = Math.max(1.5, Math.min(6, 3*120/L)); z = 0.05; }
    const dr = b.ratio - o.pr; o.pr = b.ratio;
    if (S.t > 0.3 && Math.abs(dr) > 0.003) o.v += Math.max(-1, Math.min(1, dr))*L*(b.mat==='road'?1.6:isRope(b.mat)?6:3.2)*o.sgn;
    const w = 2*Math.PI*f;
    for (let i=0;i<3;i++){ const h = dt/3; o.v += (-w*w*(o.a - tgt) - 2*z*w*o.v)*h; o.a += o.v*h; }
    const lim = L*0.22; if (Math.abs(o.a) > lim){ o.a = Math.sign(o.a)*lim; o.v *= 0.4; }
    o.tgt = tgt;
    // Holz: erst feine Splitter, dann (s. updateCracks) glühende Risse; Beton: Staub
    if (b.mat==='wood' || b.mat==='concrete'){
      o.crack = Math.max(o.crack, b.ratio);
      const r = b.ratio, start = b.mat==='wood' ? 0.55 : 0.75;
      if (r > start && Math.random() < (r-start)*(isCoarse?0.35:0.6)){
        const t = Math.random(), x = X(b.A.position.x + (b.B.position.x-b.A.position.x)*t), y = Y(b.A.position.y + (b.B.position.y-b.A.position.y)*t);
        const z0 = (Math.random()<0.5?-ZT:ZT) + (Math.random()-0.5)*0.1;
        if (b.mat==='wood') emit(splinters, {x, y, z:z0, vx:(Math.random()-0.5)*1.6, vy:0.4+Math.random()*1.4, vz:(Math.random()-0.5)*1.5, rx:Math.random()*3, rz:Math.random()*3, wa:(Math.random()-0.5)*16, wb:(Math.random()-0.5)*16, l:0.025+Math.random()*0.06*r, t:0.006+Math.random()*0.008, life:1.0+Math.random()*0.8, max:1.8});
        else emit(dust, {x, y, z:z0, vx:(Math.random()-0.5)*0.4, vy:Math.random()*0.2, vz:(Math.random()-0.5)*0.3, rx:0, rz:0, wa:0, wb:0, s:0.03+Math.random()*0.05, life:0.8+Math.random()*0.6, max:1.4});
      }
    }
  }
}
function mkVo(b){ return {a:0, v:0, pl:0, crack:0, pr:0, tgt:0, loads:null, ld:null, self:0, sgn: hash(String(b.id).split('').reduce((s,c)=>s+c.charCodeAt(0)*7, 3)) > 0.5 ? 1 : -1}; }
// Durchbiegung (Welt-px, nach unten positiv) einer Fahrbahn an Stelle t
function deckDown(b, t){
  const o = b.vo; if (!o) return 0;
  let d = (o.a - o.tgt + (o.self||0))*Math.sin(Math.PI*t);
  if (o.ld) for (const q of o.ld) d += q.k*gshape(t, q.s);
  return d;
}
function beamOffsets(v, b, ang){
  const o = b.vo; if (!o) return null;
  const off = v.off || (v.off = new Float32Array(NSEG+1));
  if (b.mat==='road'){ const c = -Math.cos(ang)*U; for (let k=0;k<=NSEG;k++) off[k] = deckDown(b, k/NSEG)*c; }
  else { const a = o.a*U; for (let k=0;k<=NSEG;k++) off[k] = a*Math.sin(Math.PI*k/NSEG); }
  return off;
}
function syncTestViews(){
  const S = sim;
  for (const b of S.beams){
    const v = beamViews.get(b.id); if (!v) continue;
    if (b.broken){
      if (b.deck){ // Fahrbahnstück fällt als Körper
        const d = ip(b.deck), hl = b.rest/2*U, c = Math.cos(d.a), s = Math.sin(d.a);
        const cx = X(d.x), cy = Y(d.y);
        updateBeamView(v, {x:cx - c*hl, y:cy + s*hl}, {x:cx + c*hl, y:cy - s*hl}, null);
      }
      continue;
    }
    const pa = ip(b.A), a = {x:pa.x, y:pa.y}, pc = ip(b.B), c = {x:pc.x, y:pc.y};
    let slack = 0;
    if (isRope(b.mat)){ const cur = Math.hypot(c.x-a.x, c.y-a.y); if (cur < b.rest-0.3) slack = Math.sqrt(Math.max(0, b.rest*b.rest-cur*cur))*0.5*U; }
    const A3 = {x:X(a.x), y:Y(a.y)}, B3 = {x:X(c.x), y:Y(c.y)};
    const off = isRope(b.mat) ? null : beamOffsets(v, b, Math.atan2(B3.y-A3.y, B3.x-A3.x));
    updateBeamView(v, A3, B3, {test:true, ratio:b.ratio, tension:b.tension, slack, warn:b.warn>0, off, crack: b.vo ? b.vo.crack : 0, ropeOsc: isRope(b.mat) && b.vo && !slack ? b.vo.a*U : 0});
  }
  for (const n of nodes){ const g = nodeViews.get(n.id), bd = S.nodes[n.id]; if (g && bd){ const p = ip(bd); g.position.set(X(p.x), Y(p.y), 0); } }
  for (const [id,c] of crossViews){ const p = ip(S.nodes[id]); c.position.set(X(p.x), Y(p.y)-0.12, 0); }
  // Fahrzeug folgt der sichtbar durchgebogenen Fahrbahn
  let downSum = 0, downN = 0;
  S.veh.wheels.forEach((w,i)=>{ const p = ip(w); let dn = 0; if (w.deckOn && !w.deckOn.b.broken){ dn = deckDown(w.deckOn.b, w.deckOn.s); downSum += dn; downN++; }
    w.visDown = (w.visDown||0) + (dn - (w.visDown||0))*0.5;
    vehView.wheels[i].position.set(X(p.x), Y(p.y) - w.visDown*U, swayZ); vehView.wheels[i].rotation.set(0,0,-p.a); });
  const vb = S.veh.body, pv = ip(vb), bodyDown = S.veh.wheels.reduce((s,w)=>s+(w.visDown||0),0)/S.veh.wheels.length;
  vehView.grp.position.set(X(pv.x), Y(pv.y) - bodyDown*U, swayZ); vehView.grp.rotation.set(0,0,-pv.a);
  // Knarzen kurz vor dem Bruch
  const warnB = S.beams.find(b=>!b.broken && b.warn>0 && b.warn<0.05);
  if (warnB && S.t - S.lastCreak > 0.35){ S.lastCreak = S.t; A.sfx('creak'); }
  A.engine(!S.result, Math.abs(S.veh.wheels[0].angularVelocity)/VEH[vehType].speed, vehType==='truck'||vehType==='hauler');
  if (!userMovedCam){ const tx = X(Math.max(L.gapL-120, Math.min(L.gapR+120, vb.position.x))); cam.tx += (tx - cam.tx)*0.02; applyCamera(); }
}
function showResult(){
  const r = sim.result, card = $('resCard'), btns = $('resBtns'); card.className = 'card '+(r.win?'win':'fail'); btns.innerHTML = '';
  const mk = (txt, fn, cls)=>{ const b = document.createElement('button'); b.className = 'btn '+(cls||''); b.innerHTML = txt; b.onclick = ()=>{ A.sfx('click'); fn(); }; btns.appendChild(b); };
  const cost = totalCost();
  if (r.win){
    const trial = vehType !== L.veh, counted = !trial && !usedExample;
    const stars = !counted ? 0 : cost <= L.budget*0.85 ? 3 : cost <= L.budget*0.95 ? 2 : 1;
    $('resTitle').textContent = trial ? 'Probefahrt geschafft! 👍' : usedExample ? 'Beispiel geschafft! 📐' : 'Geschafft! 🎉';
    $('resStars').innerHTML = [0,1,2].map(i=>`<span class="${i<stars?'':'off'}">★</span>`).join('');
    const note = trial ? `<br><b>Für Sterne muss der ${VEH[L.veh].full} (${String(vehMass(L.veh)).replace('.',',')} t) rüber.</b>` : usedExample ? '<br><b>Mit der Beispielbrücke gibt es keine Sterne</b> – „Alles“ löschen und selbst bauen!' : '';
    $('resText').innerHTML = `${VEH[vehType].full} (${String(vehMass(vehType)).replace('.',',')} t) ist sicher drüben.${note}<br>Kosten <b>${fmt(cost)}</b> von ${fmt(L.budget)} · max. Belastung <b>${Math.round(sim.maxRatio*100)}%</b> · gebrochen: ${sim.broken}${counted?'<br><small>★★ ≤ 95% Budget · ★★★ ≤ 85% Budget</small>':''}`;
    const pr = progress[levelIdx]; if (counted) if (!pr || pr.stars < stars || (pr.stars===stars && pr.cost > cost)){ progress[levelIdx] = {cost:Math.round(cost), stars}; localStorage.setItem('captain2.progress', JSON.stringify(progress)); }
    mk('🔧 Weiter bauen', stopTest);
    if (trial && L.vehicles.includes(L.veh)) mk(`${VEH[L.veh].icon} Mit ${VEH[L.veh].name} testen`, ()=>{ $('ovResult').classList.remove('show'); stopTest(); vehType = L.veh; setVehicleView(vehType); startTest(); });
    if (levelIdx < LEVELS.length-1) mk('Nächstes Level ▶', ()=>{ stopTest(); selectLevel(levelIdx+1, true); }, 'go');
    A.sfx('win');
  } else {
    $('resTitle').textContent = 'Gescheitert 💥'; $('resStars').innerHTML = '';
    $('resText').innerHTML = `${r.reason}<br>Gebrochene Teile: ${sim.broken} · max. Belastung ${Math.round(Math.min(1,sim.maxRatio)*100)}%<br><small>Tipp: Wo es im Test rot wurde, braucht die Brücke mehr Dreiecke oder stärkeres Material. Lange Druckstäbe knicken – kürzer bauen!</small>`;
    mk('🔧 Zurück zum Bauen', stopTest, 'go'); mk('↻ Nochmal', ()=>{ $('ovResult').classList.remove('show'); stopTest(); startTest(); });
    A.sfx('fail');
  }
  $('ovResult').classList.add('show');
}

// ================= Vorschau beim Bauen =================
const GHOST_COL = {road:0x60a5fa, wood:0xf0b27a, alu:0xf1f5f9, cast:0x8b929b, steel:0xdbe4ee, concrete:0xc4c7c9, cable:0xfacc15, rope:0xa5d8ff};
const ghostMats = {}; for (const k of MAT_ORDER) ghostMats[k] = new THREE.MeshBasicMaterial({color: GHOST_COL[k], transparent:true, opacity:0.55, depthTest:false});
const ghosts = Array.from({length:10}, ()=>{ const g = new THREE.Mesh(unitBox, ghostMats.road); g.renderOrder = 10; g.visible = false; scene.add(g); return g; });
const ghostMesh = ghosts[0];
const chainDots = Array.from({length:9}, ()=>{ const d = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 6), new THREE.MeshBasicMaterial({color:0xffffff, depthTest:false})); d.renderOrder = 11; d.visible = false; scene.add(d); return d; });
const startRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 8, 32), new THREE.MeshBasicMaterial({color:0xffd43b, depthTest:false})); startRing.renderOrder = 11; startRing.visible = false; scene.add(startRing);
const endDot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8), new THREE.MeshBasicMaterial({color:0xffd43b, depthTest:false})); endDot.renderOrder = 11; endDot.visible = false; scene.add(endDot);
const rangeRing = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.35, depthTest:false})); rangeRing.renderOrder = 9; rangeRing.visible = false; scene.add(rangeRing);
const delMark = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({color:0xff3b30, transparent:true, opacity:0.6, depthTest:false})); delMark.renderOrder = 10; delMark.visible = false; scene.add(delMark);
// Gitterpunkte
let gridPts = null;
function buildGrid(){
  if (gridPts){ scene.remove(gridPts); gridPts.geometry.dispose(); }
  const pos = [];
  for (let x=0;x<=1440;x+=GRID) for (let y=0;y<=(L.floorY||640)-30;y+=GRID) if (!inTerrain(x,y)) pos.push(X(x), Y(y), 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  gridPts = new THREE.Points(g, new THREE.PointsMaterial({size:0.3, map:T.dotTexture(), transparent:true, opacity:0.75, depthWrite:false, color:0xffffff}));
  scene.add(gridPts);
}
function updatePreview(){
  const lab = $('label3d');
  ghostMesh.visible = startRing.visible = endDot.visible = rangeRing.visible = delMark.visible = false; lab.style.display = 'none';
  for (const g of ghosts) g.visible = false; for (const d of chainDots) d.visible = false;
  if (gridPts) gridPts.visible = mode==='build';
  if (mode!=='build') return;
  // Anker pulsieren
  if (tool==='delete' && hover){ const b = beamAt(hover, Math.max(10, 22/pxPerWorld())); if (b){ const a=nodeById(b.a), c=nodeById(b.b); placeBox(delMark, X(a.x),Y(a.y),X(c.x),Y(c.y), ZT+0.15, 0.28, 0.05); delMark.visible = true; } return; }
  let start=null, cur=null;
  if (ptr && ptr.drag && ptr.start){ start = ptr.start; cur = ptr.cur; }
  else if (pending){ start = nodeById(pending); cur = ptr && !ptr.pan ? ptr.cur : hover; }
  else if (hover && !ptr){ const n = nodeAt(hover, Math.max(16, 30/pxPerWorld())); if (n){ startRing.visible = true; startRing.position.set(X(n.x),Y(n.y),ZT+0.3); startRing.scale.setScalar(0.8); } }
  if (!start) return;
  startRing.visible = true; startRing.position.set(X(start.x), Y(start.y), ZT+0.3); startRing.scale.setScalar(1+0.12*Math.sin(performance.now()/150));
  rangeRing.visible = true; rangeRing.position.set(X(start.x), Y(start.y), 0.02); rangeRing.scale.setScalar(MATS[tool].maxLen*U);
  if (!cur) return;
  const pts = planChain(start, cur, tool); if (!pts) return;
  const th = tool==='road'?0.22: isRope(tool)?0.07: tool==='concrete'?0.24: 0.18;
  let prev = start, len = 0, longest = 0;
  pts.forEach((q,i)=>{ const g = ghosts[i]; g.material = ghostMats[tool]; g.visible = true; placeBox(g, X(prev.x), Y(prev.y), X(q.x), Y(q.y), ZT+0.2, th, tool==='road'?0.3:0.1);
    const l = dist(prev,q); len += l; longest = Math.max(longest, l);
    if (i < pts.length-1){ chainDots[i].visible = true; chainDots[i].position.set(X(q.x), Y(q.y), ZT+0.3); } prev = q; });
  const q = pts[pts.length-1];
  endDot.visible = true; endDot.position.set(X(q.x), Y(q.y), ZT+0.3);
  const cost = len*MATS[tool].cost, rest = L.budget - totalCost() - cost;
  const s = toScreen((start.x+q.x)/2, Math.min(start.y,q.y), ZT);
  lab.style.display = 'block'; lab.style.left = s.x+'px'; lab.style.top = s.y+'px';
  lab.className = rest < 0 ? 'bad' : '';
  const knick = MATS[tool].comp ? ` · Druck ≤ ${Math.round(compLimit(tool, longest)*KN)} kN` : '';
  lab.textContent = `${MATS[tool].name}${pts.length>1?` · ${pts.length} Segmente`:''} · ${(len/20).toFixed(1).replace('.',',')} m · ${fmt(cost)}${knick} · Rest ${fmt(rest)}`;
}

// ================= Wind: Schlieren-Partikel + Anzeige =================
let swayZ = 0;
const WN = isCoarse ? 70 : 120;
const windIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshBasicMaterial({color:0xeaf6ff, transparent:true, opacity:0.6, depthWrite:false}), WN);
windIM.frustumCulled = false; windIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(windIM);
const windP = Array.from({length:WN}, (_,i)=>({x:(Math.random()-0.5)*60, y:Math.random(), z:-1+Math.random()*8, l:1.6+Math.random()*3.2, ph:Math.random()*6}));
function currentGust(){ if (!L.wind) return 0; if (mode==='test' && sim) return sim.gust||0; const t = performance.now()/1000; return L.wind*(0.72 + 0.28*Math.sin(t*2.6) + 0.12*Math.sin(t*7.3+1.3)); }
function updateWind(dt, now){
  const g = currentGust(); windIM.visible = !!L.wind;
  if (!L.wind) return;
  const yTop = Y(Math.min(...L.anchors.map(a=>a[1])) - 80), yBot = Y((L.floorY||640) - 20);
  const sp = 5 + g*5;
  windP.forEach((p,i)=>{
    p.x -= sp*dt*(0.7+p.l*0.3); if (p.x < cam.tx-34){ p.x = cam.tx+34+Math.random()*6; p.y = Math.random(); p.z = -1+Math.random()*8; }
    const y = yBot + (yTop-yBot)*p.y + Math.sin(now/300 + p.ph + p.x*0.4)*0.35*(0.5+g*0.3);
    tmpM.compose(tmpV.set(p.x, y, p.z), tmpQ.setFromEuler(tmpE.set(0,0,Math.cos(now/300 + p.ph + p.x*0.4)*0.12)), tmpS.set(p.l*(0.7+g*0.35), 0.075+g*0.012, 0.075)); windIM.setMatrixAt(i, tmpM);
  });
  windIM.instanceMatrix.needsUpdate = true;
  windIM.material.opacity = 0.5 + Math.min(0.4, g*0.15);
  // rein visuelles Schwanken der Brücke quer zur Fahrbahn (Physik bleibt 2D)
  swayZ = mode==='test' && sim ? Math.sin(now/520)*g*0.035 + Math.sin(now/170)*g*0.008 : 0;
  bridgeGroup.position.z = swayZ;
  if (Math.floor(now/120) !== Math.floor((now-dt*1000)/120)){
    $('windTxt').textContent = `Seitenwind ${Math.round(g*KN)} kN`;
    $('windFill').style.width = Math.min(100, g/(L.wind*1.15)*100) + '%';
    $('windArrow').style.transform = `scaleX(${0.8+g/L.wind*0.4})`;
  }
}

// ================= Hauptschleife =================
let last = performance.now();
function frame(now){
  const dt = Math.min(0.05, (now-last)/1000); last = now;
  if (mode==='test' && sim){
    if (!window.__manualStep){
      simAcc += dt*timeScale; let n = 0;
      while (simAcc >= 1/60 && n < 3){ snapPrev(sim); stepFrame(sim); handleEvents(); visStep(sim); simAcc -= 1/60; n++; }
      if (n===3) simAcc = 0;
      ipK = Math.max(0, Math.min(1, simAcc*60));
    } else ipK = 1;
    syncTestViews();
    if (sim.result && !sim.shown){ sim.shown = true; setTimeout(()=>{ if (sim && sim.result) showResult(); }, Math.min(5000, (sim.result.win ? 900 : 1400)/timeScale)); A.engine(false); }
    if (Math.floor(now/250) !== Math.floor((now-dt*1000)/250)) updateLegend();
  }
  const fxDt = mode==='test' && sim && !window.__manualStep ? dt*timeScale : dt;
  updatePieces(fxDt); updatePools(fxDt); updatePreview(); updateWind(dt, now);
  if (mode==='test' && sim && showPct && now - (frame.pctT||0) > 110){ frame.pctT = now; updatePct(); }
  // Szene animieren
  texWater.offset.x += dt*0.01; texWater.offset.y += dt*0.006;
  levelGroup.children.forEach(o=>{ if (o.userData.cloud){ o.position.x += o.userData.speed*dt; if (o.position.x > 110) o.position.x = -110; }
    if (o.userData.flag){ const p = o.geometry.attributes.position; for (let i=0;i<p.count;i++){ const x = p.getX(i)+0.7; p.setZ(i, Math.sin(now/(L.wind?110:220) + x*4)*(L.wind?0.16:0.08)*x); } p.needsUpdate = true; } });
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ================= Debug-/Test-API =================
// ===== Android-App-Hooks (WebView): Zurück-Taste und Pausieren =====
window.__appBack = ()=>{
  const ovs = [...document.querySelectorAll('.overlay.show')];
  if (ovs.length){ const o = ovs[ovs.length-1]; if (o.id==='ovResult'){ stopTest(); } else o.classList.remove('show'); return true; }
  if ($('camPanel').classList.contains('show')){ $('camPanel').classList.remove('show'); return true; }
  if ($('matTip').classList.contains('show')){ $('matTip').classList.remove('show'); return true; }
  if (mode==='test'){ stopTest(); return true; }
  if (pending){ pending = null; updateHint(); return true; }
  return false;
};
window.__appPause = p=>{ if (p) A.engine(false); A.pause(p); };
document.addEventListener('visibilitychange', ()=>{ if (document.hidden){ A.engine(false); A.pause(true); } else A.pause(false); });
// ===== Zeitlupe & Prozentanzeige =====
function setTimeScale(ts){ timeScale = ts; localStorage.setItem('captain2.ts', String(ts)); document.querySelectorAll('#speedBox [data-ts]').forEach(b=>b.classList.toggle('sel', +b.dataset.ts===ts)); }
document.querySelectorAll('#speedBox [data-ts]').forEach(b=>b.addEventListener('click', e=>{ e.stopPropagation(); A.unlock(); A.sfx('click'); setTimeScale(+b.dataset.ts); if (+b.dataset.ts < 1) toast(`⏱ Zeitlupe ${b.textContent} – genau beobachten`); }));
$('bPct').addEventListener('click', e=>{ e.stopPropagation(); A.sfx('click'); showPct = !showPct; localStorage.setItem('captain2.pct', showPct?'1':'0'); $('bPct').classList.toggle('sel', showPct); if (!showPct) $('pctLayer').innerHTML = ''; else updatePct(); });
setTimeScale(timeScale); $('bPct').classList.toggle('sel', showPct);
const pctPool = [];
function updatePct(){
  const layer = $('pctLayer'); if (!sim || mode!=='test' || !showPct){ layer.style.display = 'none'; return; } layer.style.display = '';
  const list = sim.beams.filter(b=>!b.broken && b.ratio >= 0.05).sort((a,b)=>b.ratio-a.ratio).slice(0, isCoarse ? 28 : 48);
  const r = canvas.getBoundingClientRect();
  list.forEach((b,i)=>{
    let d = pctPool[i]; if (!d){ d = document.createElement('div'); d.className = 'pct'; layer.appendChild(d); pctPool.push(d); }
    const pa = ip(b.A), pb = ip(b.B), s = toScreen((pa.x+pb.x)/2, (pa.y+pb.y)/2, b.mat==='road' ? DECK_W/2 : ZT);
    d.style.display = ''; d.style.transform = `translate(${Math.round(s.x)}px,${Math.round(s.y)}px) translate(-50%,-50%)`;
    const pc = Math.round(b.ratio*100); d.textContent = pc + '%'; const c = stressColor(b.ratio); d.style.background = '#'+c.getHexString(); d.style.color = b.ratio > 0.3 && b.ratio < 0.8 ? '#111' : '#fff';
  });
  for (let i=list.length;i<pctPool.length;i++) pctPool[i].style.display = 'none';
}
window.__captain = {
  LEVELS, MATS, VEH,
  loadExample(){ loadExample(); return {cost:Math.round(totalCost()), budget:L.budget, beams:beams.length, usedExample}; },
  chain(x1,y1,x2,y2,mat){ const a = nodeAt({x:x1,y:y1},1); if (!a) return null; const pts = planChain(a, {x:x2,y:y2}, mat||tool); if (pts) addChain(a, pts, mat||tool); return pts; },
  wind(){ return {wind:L.wind||0, gust: currentGust(), particles: windIM.visible}; },
  windDbg(){ const m = new THREE.Matrix4(); const out=[]; for (let i=0;i<4;i++){ windIM.getMatrixAt(i,m); out.push(m.elements.map(v=>+v.toFixed(2))); } return {out, vis:windIM.visible, op:windIM.material.opacity, cnt:windIM.count, inScene: windIM.parent===scene, cam:{...cam}}; },
  setTool(t){ tool = t; updateHud(); },
  buildSegs(segs){ if (mode!=='build') stopTest(); const d = segmentsToDesign(L, segs); snapshot(); nodes=d.nodes; beams=d.beams; nextId=d.nextId; usedExample=false; changed(); return {cost:Math.round(totalCost())}; },
  lastToast(){ return $('toast').textContent; },
  selectLevel: (i)=>selectLevel(i,false),
  buildRef(level, kind='ref'){ if (level!==undefined && level!==levelIdx) selectLevel(level,false); if (mode!=='build') stopTest();
    const segs = kind==='ref' ? REFS[levelIdx] : SOLUTIONS[levelIdx][kind]();
    const d = segmentsToDesign(L, segs); snapshot(); nodes=d.nodes; beams=d.beams; nextId=d.nextId; usedExample = false; changed();
    return {cost:Math.round(totalCost()), budget:L.budget, beams:beams.length}; },
  setVehicle(v){ vehType = v; setVehicleView(v); updateHud(); },
  startTest, stopTest,
  simulate(maxSec=40){ if (mode!=='test') startTest(); const S = sim; if (!S) return {error:'kein Test (Budget?)'};
    while (!S.result && S.t < maxSec){ stepFrame(S); S.events.length = 0; }
    return {result: S.result ? (S.result.win?'win':'fail') : 'none', reason: S.result && S.result.reason, t:+S.t.toFixed(2), broken:S.broken, maxRatio:+S.maxRatio.toFixed(3)}; },
  state(){ return {mode, level:levelIdx, tool, pending, nodes:nodes.length, beams:beams.length, mats:beams.map(b=>b.mat+':'+Math.round(beamLen(b))).join(','), cost:Math.round(totalCost()), cam:{...cam}}; },
  w2s(x,y,z=0){ const s = toScreen(x,y,z); const r = canvas.getBoundingClientRect(); return {x:s.x+r.left, y:s.y+r.top}; },
  camTo(tx,ty,d){ cam.tx = tx; cam.ty = ty; cam.d = d; userMovedCam = true; applyCamera(); },
  get sim(){ return sim; }, setTimeScale, get timeScale(){ return timeScale; }, setPct(on){ if (on!==showPct) $('bPct').click(); },
  deck(){ return sim ? sim.beams.filter(b=>b.deck && !b.broken && b.vo).map(b=>({id:b.id, mid:+deckDown(b,0.5).toFixed(2), loads:(b.vo.ld||[]).length})) : []; },
  bends(){ return sim ? sim.beams.filter(b=>b.vo && !b.deck && !b.broken).map(b=>({mat:b.mat, a:+b.vo.a.toFixed(2), pl:+b.vo.pl.toFixed(2), crack:+b.vo.crack.toFixed(2), r:+b.ratio.toFixed(2)})) : []; },
  cracks(){ let n=0; bridgeGroup.traverse(o=>{ if (o.parent && o.parent.userData && o.parent.userData.cracks && o.visible && o.parent.userData.cracks.includes(o)) n++; }); return n; },
  plastic(){ return sim ? sim.bends.filter(k=>k.plast>0.001).map(k=>+k.plast.toFixed(3)) : []; }, get pieces(){ return pieces.length; },
  step(n=1){ for (let i=0;i<n && sim;i++){ snapPrev(sim); stepFrame(sim); handleEvents(); visStep(sim); updatePieces(1/60); updatePools(1/60); } ipK = 1; if (sim){ syncTestViews(); updateLegend(); } },
  forceBreak(mat){ if (!sim) return false; const b = sim.beams.find(x=>!x.broken && x.mat===mat); if (!b) return false; breakBeam(sim, b); handleEvents(); return true; },
  manual(on){ window.__manualStep = on; },
  fx(){ return {chunks: chunks.items.filter(i=>i.life>0).length, splinters: splinters.items.filter(i=>i.life>0).length, sparks: sparks.items.filter(i=>i.life>0).length, dust: dust.items.filter(i=>i.life>0).length, pieces: pieces.length}; },
  renderInfo(){ return renderer.info.render; }
};

// ================= Start =================
resize();
const startLvl = Math.min(LEVELS.length-1, +(localStorage.getItem('captain2.level')||0));
selectLevel(startLvl, !localStorage.getItem('captain2.seenIntro'));
localStorage.setItem('captain2.seenIntro','1');
requestAnimationFrame(frame);
