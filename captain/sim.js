// Brückenphysik: Matter.js für Fahrzeug, Fahrbahn-Körper und Kollisionen,
// eigener XPBD-Löser (Positionslöser mit Nachgiebigkeit) für das Fachwerk -> echte Kräfte (Lagrange-Multiplikatoren).
import Matter from 'matter-js';
const {Engine, Bodies, Body, Composite, Constraint, Events} = Matter;

export const GRID = 40;
export const SUB = 4;
export const DT = 1000/60/SUB;
const GS = 0.001;                     // Matter gravity.scale
const FW = 1/(GS*DT*DT);              // lambda -> Gewichtseinheiten (1 = Gewicht von 1 t)
export const KN = 9.81;               // Gewichtseinheit -> kN
export const CAT = {T:1, D:2, V:4, N:8, R:16};
const ITER = 20;

// E: Steifigkeit (Gewichtseinheiten pro Dehnung), str: Zug-Bruchkraft, comp: Druck-Grundfestigkeit (Gewichtseinheiten, x9,81 = kN)
// buck: Euler-Knickbeiwert (aus bridge-builder-3d): wirksame Druckgrenze = comp / (1 + buck * L²), L in Knick-Metern (Länge/38 px)
// kgm/cpm: Anzeige-Werte (kg/m, €/m) – Spielmeter: 1 Raster = 2 m
export const MATS = {
  road:  {name:'Straße', cost:6,   maxLen:170, mass:0.35, E:9000,  str:20, comp:20, buck:0.020, drive:true, kgm:175, group:'deck',
          tip:'Fahrbahn – nur darauf kann das Fahrzeug fahren. Etwas biegesteif, trägt kurze Strecken allein.'},
  wood:  {name:'Holz',   cost:3,   maxLen:170, mass:0.35, E:5000,  str:20, comp:18, buck:0.036, kgm:175, group:'beam',
          tip:'Billig und leicht, aber schwach. Lange Holzstäbe knicken unter Druck früh. Splittert bei Überlast.'},
  alu:   {name:'Alu',    full:'Aluminium', cost:5.5, maxLen:210, mass:0.23, E:8000, str:31, comp:25, buck:0.032, kgm:115, group:'beam',
          tip:'Sehr leicht (1/4 von Stahl) und lang baubar, ordentlich fest – aber teurer als Holz und weicher.'},
  cast:  {name:'Guss',   full:'Gusseisen', cost:6.5, maxLen:190, mass:0.68, E:13000, str:26, comp:44, buck:0.022, kgm:340, group:'beam',
          tip:'Gusseisen: sehr drucksteif für Stützen und Bögen, auf Zug aber spröde. Schwer.'},
  steel: {name:'Stahl',  cost:8,   maxLen:170, mass:0.9,  E:16000, str:55, comp:50, buck:0.018, kgm:450, group:'beam',
          tip:'Teuer und schwer, aber auf Zug und Druck sehr stark und steif.'},
  concrete:{name:'Beton', full:'Stahlbeton', cost:6, maxLen:170, mass:1.1, E:15000, str:12, comp:70, buck:0.010, kgm:550, group:'beam',
          tip:'Überragend auf Druck (Pfeiler, Bögen), knickt kaum – reißt aber früh unter Zug. Sehr schwer!'},
  cable: {name:'Kabel',  cost:2.2, maxLen:400, mass:0.12, E:7000,  str:34, comp:0, kgm:60, group:'rope',
          tip:'Trägt nur Zug (bei Stauchung schlaff). Lang, leicht, günstig – ideal zum Abhängen.'},
  rope:  {name:'Stahlseil', cost:5, maxLen:480, mass:0.17, E:15000, str:72, comp:0, kgm:85, group:'rope',
          tip:'Hochfestes Tragseil für Hänge- und Schrägseilbrücken: enorme Zugkraft, sehr lang, steif – aber kein Druck.'}
};
export const MAT_ORDER = ['road','wood','alu','cast','steel','concrete','cable','rope'];
export const isRope = m => MATS[m].comp === 0;
// Euler-Knicken: lange Druckstäbe tragen weniger
export function compLimit(mat, len){
  const m = MATS[mat]; if (!m.comp) return 0;
  const lm = len/38; return m.comp/(1 + (m.buck||0)*lm*lm);
}
export const BEND = {E:40, str:+(globalThis.process?.env?.BSTR||10), rot:+(globalThis.process?.env?.BROT||0.35)}; // Fahrbahn-Biegesteifigkeit / Fließgrenze (Querkraft am Gelenk) / max. plastischer Knickwinkel (rad) bis zum Reißen
const PLIM = BEND.str/FW;

// Fahrzeugpalette wie in bridge-builder-3d (Massen in t = Gewichtseinheiten)
export const VEH = {
  car:    {name:'PKW',        full:'Kompakt-PKW',      icon:'🚗', w:72, h:20, r:12, wheels:[-24,24],            mass:1.4,  wmass:0.2,  speed:0.32},
  van:    {name:'Lieferwagen',full:'Lieferwagen',      icon:'🚐', w:92, h:34, r:14, wheels:[-31,31],            mass:4.4,  wmass:0.4,  speed:0.27},
  truck:  {name:'LKW',        full:'Schwerer LKW',     icon:'🚚', w:140,h:36, r:17, wheels:[-50,-18,48],        mass:12.5, wmass:0.67, speed:0.21},
  hauler: {name:'Schwerlast', full:'Schwerlast-Truck', icon:'🚛', w:184,h:40, r:18, wheels:[-74,-46,-18,50,76], mass:19.5, wmass:0.9,  speed:0.17}
};
export const vehMass = t => Math.round((VEH[t].mass + VEH[t].wheels.length*VEH[t].wmass)*10)/10;

const d2 = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);

export function designCost(design){
  const byId = {}; for (const n of design.nodes) byId[n.id] = n;
  let c = 0; for (const b of design.beams) c += d2(byId[b.a], byId[b.b]) * MATS[b.mat].cost;
  return c;
}

export function createSim(L, design, vehType){
  const engine = Engine.create({enableSleeping:false});
  engine.gravity.y = 0; engine.gravity.scale = GS;
  engine.constraintIterations = 8; engine.positionIterations = 10; engine.velocityIterations = 8;
  const world = engine.world;
  const S = {L, engine, t:0, nodes:{}, beams:[], bends:[], result:null, broken:0, maxRatio:0, events:[], debris:[], tipT:0, vehType};
  const tf = {category:CAT.T, mask:CAT.V|CAT.D|CAT.R};
  for (const c of L.cliffs){
    const x0 = Math.max(c[0],-600), x1 = Math.min(c[1], 2200), top = c[2]-4;
    Composite.add(world, Bodies.rectangle((x0+x1)/2, top+400, x1-x0, 800, {isStatic:true, friction:1, collisionFilter:tf, label:'terrain'}));
  }
  for (const p of (L.pillars||[])) Composite.add(world, Bodies.rectangle((p[0]+p[1])/2, p[2]+500, p[1]-p[0], 1000, {isStatic:true, friction:1, collisionFilter:tf, label:'terrain'}));
  // Wasser/Grund als Boden für Trümmer
  Composite.add(world, Bodies.rectangle(720, (L.floorY||660)+200, 6000, 400, {isStatic:true, friction:0.8, collisionFilter:{category:CAT.T, mask:CAT.R|CAT.D|CAT.V}, label:'floor'}));

  const byId = {}; for (const n of design.nodes) byId[n.id] = n;
  const nm = {}; for (const n of design.nodes) nm[n.id] = 0.15;
  for (const b of design.beams){ const m = d2(byId[b.a],byId[b.b])/GRID*MATS[b.mat].mass; const sh = b.mat==='road'?0.3:0.5; nm[b.a]+=m*sh; nm[b.b]+=m*sh; }
  for (const n of design.nodes){
    const body = Bodies.circle(n.x, n.y, 4, {isStatic:!!n.anchor, frictionAir:0.003, collisionFilter:{category:CAT.N, mask:0}});
    if (!n.anchor){ Body.setMass(body, nm[n.id]); Body.setInertia(body, Infinity); }
    body.w = n.anchor ? 0 : 1/nm[n.id];
    body.expo = 0; body.id = n.id;
    S.nodes[n.id] = body; Composite.add(world, body);
  }
  for (const b of design.beams){ const l = d2(byId[b.a],byId[b.b])/GRID*(b.mat==='road'?1.6:MATS[b.mat].comp?0.6:0.25)*0.5; S.nodes[b.a].expo += l; S.nodes[b.b].expo += l; }
  for (const b of design.beams){
    const A = S.nodes[b.a], B = S.nodes[b.b], rest = d2(A.position, B.position), m = MATS[b.mat];
    const sb = {id:b.id, mat:b.mat, A, B, aId:b.a, bId:b.b, rest, alpha: rest/(GS*m.E*DT*DT), lambda:0, F:0, Fs:0, ratio:0, broken:false, deck:null, pins:[], warn:0, rope:!m.comp, compLim:compLimit(b.mat, rest)};
    if (b.mat==='road'){
      const mx=(A.position.x+B.position.x)/2, my=(A.position.y+B.position.y)/2, ang=Math.atan2(B.position.y-A.position.y, B.position.x-A.position.x);
      const deck = Bodies.rectangle(mx,my,rest,8,{chamfer:{radius:3.5}, friction:1, frictionStatic:2, restitution:0, collisionFilter:{category:CAT.D, mask:CAT.V}, label:'deck'});
      Body.setAngle(deck, ang); Body.setMass(deck, rest/GRID*m.mass*0.4);
      const pA = Constraint.create({bodyA:deck, pointA:{x:A.position.x-mx,y:A.position.y-my}, bodyB:A, length:0, stiffness:1});
      const pB = Constraint.create({bodyA:deck, pointA:{x:B.position.x-mx,y:B.position.y-my}, bodyB:B, length:0, stiffness:1});
      sb.deck = deck; sb.pins = [pA,pB]; Composite.add(world,[deck,pA,pB]);
    }
    S.beams.push(sb);
  }
  // Biege-Bedingungen für durchgehende Fahrbahn (je Knoten mit zwei Straßenbalken) und eingespannte Widerlager
  const roads = S.beams.filter(b=>b.mat==='road');
  const roadAt = {}; for (const r of roads){ (roadAt[r.aId] ||= []).push(r); (roadAt[r.bId] ||= []).push(r); }
  for (const id in roadAt){
    const list = roadAt[id], B = S.nodes[id];
    for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++){
      const r1 = list[i], r2 = list[j];
      const A = r1.A===B ? r1.B : r1.A, C = r2.A===B ? r2.B : r2.A;
      // nur annähernd gestreckte Verbindungen (Winkel > 135°)
      const v1 = {x:A.position.x-B.position.x, y:A.position.y-B.position.y}, v2 = {x:C.position.x-B.position.x, y:C.position.y-B.position.y};
      const cos = (v1.x*v2.x+v1.y*v2.y)/(Math.hypot(v1.x,v1.y)*Math.hypot(v2.x,v2.y));
      if (cos > -0.7) continue;
      S.bends.push(mkBend(A,B,C,[r1,r2]));
    }
    if (B.isStatic && list.length===1 && L.abutments && L.abutments.some(a=>a[0]===B.position.x && a[1]===B.position.y)){
      const r = list[0], O = r.A===B ? r.B : r.A;
      const v = {x:B.position.x-O.position.x, y:B.position.y-O.position.y};
      const ghost = {position:{x:B.position.x+v.x, y:B.position.y+v.y}, positionPrev:{x:B.position.x+v.x, y:B.position.y+v.y}, w:0, isStatic:true};
      S.bends.push(mkBend(O,B,ghost,[r]));
    }
  }
  function mkBend(A,B,C,rs){
    const h0 = hOf(A,B,C), lac = d2(A.position,C.position);
    return {A,B,C,rs,h0, h00:h0, half:lac/2, plast:0, alpha: 1/(GS*BEND.E*DT*DT) * (lac/80), lambda:0, F:0, Fs:0, ratio:0, broken:false};
  }
  // Fahrzeug
  S.veh = makeVehicle(world, vehType, L.startX ?? (L.gapL-170), L.roadY-4);
  S.flagX = L.flagX ?? (L.gapR + 150);
  Events.on(engine, 'beforeSolve', ()=>solveTruss(S));
  return S;
}

function hOf(A,B,C){
  const ux=C.position.x-A.position.x, uy=C.position.y-A.position.y, len=Math.hypot(ux,uy)||1;
  return ((B.position.x-A.position.x)*(-uy) + (B.position.y-A.position.y)*ux)/len;
}

function solveTruss(S){
  const beams = S.beams, bends = S.bends;
  for (const b of beams) b.lambda = 0;
  for (const k of bends) k.lambda = 0;
  for (let it=0; it<ITER; it++){
    for (const b of beams){
      if (b.broken) continue;
      const A=b.A.position, B=b.B.position, wA=b.A.w, wB=b.B.w, w=wA+wB; if (!w) continue;
      const dx=B.x-A.x, dy=B.y-A.y, L=Math.hypot(dx,dy)||1e-6, nx=dx/L, ny=dy/L;
      const C = L - b.rest;
      const at = b.alpha;
      let dl = (-C - at*b.lambda)/(w+at);
      if (b.rope && b.lambda+dl > 0) dl = -b.lambda;   // Seile/Kabel: kein Druck
      b.lambda += dl;
      A.x -= wA*dl*nx; A.y -= wA*dl*ny; B.x += wB*dl*nx; B.y += wB*dl*ny;
    }
    for (const k of bends){
      if (k.broken) continue;
      const A=k.A.position, B=k.B.position, Cc=k.C.position;
      const ux=Cc.x-A.x, uy=Cc.y-A.y, l2=ux*ux+uy*uy, len=Math.sqrt(l2)||1e-6;
      const t = ((B.x-A.x)*ux+(B.y-A.y)*uy)/l2;
      const nx=-uy/len, ny=ux/len;
      const h = (B.x-A.x)*nx + (B.y-A.y)*ny;
      const wA=k.A.w, wB=k.B.w, wC=k.C.w;
      const w = wB + (1-t)*(1-t)*wA + t*t*wC; if (!w) continue;
      let dl = (-(h-k.h0) - k.alpha*k.lambda)/(w+k.alpha);
      // plastisches Gelenk: Biegemoment ist begrenzt – darüber gibt die Fahrbahn nach (biegt sich stark durch) statt sofort zu brechen
      const nl = k.lambda + dl; if (nl > PLIM) dl = PLIM - k.lambda; else if (nl < -PLIM) dl = -PLIM - k.lambda;
      k.lambda += dl;
      B.x += wB*dl*nx; B.y += wB*dl*ny;
      A.x -= wA*dl*(1-t)*nx; A.y -= wA*dl*(1-t)*ny;
      Cc.x -= wC*dl*t*nx; Cc.y -= wC*dl*t*ny;
    }
  }
  // Dämpfung entlang der Stäbe
  for (const b of beams){
    if (b.broken) continue;
    const A=b.A, B=b.B, w=A.w+B.w; if(!w) continue;
    const dx=B.position.x-A.position.x, dy=B.position.y-A.position.y, L=Math.hypot(dx,dy)||1e-6, nx=dx/L, ny=dy/L;
    const rv = ((B.position.x-B.positionPrev.x)-(A.position.x-A.positionPrev.x))*nx + ((B.position.y-B.positionPrev.y)-(A.position.y-A.positionPrev.y))*ny;
    const c = 0.25*rv/w;
    A.position.x += A.w*c*nx; A.position.y += A.w*c*ny; B.position.x -= B.w*c*nx; B.position.y -= B.w*c*ny;
  }
  // Fließen: am Momentenlimit wandert die Ruhelage mit -> bleibende Durchbiegung
  for (const k of bends){
    if (k.broken || Math.abs(k.lambda) < PLIM*0.999) continue;
    const A=k.A.position, B=k.B.position, Cc=k.C.position, ux=Cc.x-A.x, uy=Cc.y-A.y, len=Math.hypot(ux,uy)||1e-6;
    const h = ((B.x-A.x)*(-uy) + (B.y-A.y)*ux)/len;
    k.h0 = h + k.alpha*k.lambda; k.yield = true;
  }
  for (const b of beams) if(!b.broken) b.F += -b.lambda*FW;   // >0 Zug, <0 Druck
  for (const k of bends) if(!k.broken) k.F += Math.abs(k.lambda)*FW;
}

function makeVehicle(world, type, x, groundY){
  const v = VEH[type], group = Body.nextGroup(true);
  const cy = groundY - v.r - v.h/2 - 2;
  const filt = {group, category:CAT.V, mask:CAT.T|CAT.D};
  const body = Bodies.rectangle(x, cy, v.w, v.h, {chamfer:{radius:6}, collisionFilter:filt, friction:0.6});
  Body.setMass(body, v.mass);
  const wheels = [], axles = [];
  for (const wx of v.wheels){
    const wh = Bodies.circle(x+wx, cy+v.h/2+2, v.r, {collisionFilter:filt, friction:1.2, frictionStatic:3, restitution:0});
    Body.setMass(wh, v.wmass);
    const ax = Constraint.create({bodyA:body, pointA:{x:wx, y:v.h/2+2}, bodyB:wh, length:0, stiffness:1});
    wheels.push(wh); axles.push(ax);
  }
  Composite.add(world, [body, ...wheels, ...axles]);
  return {type, body, wheels, spec:v, motor:0};
}

export function breakBeam(S, b, where, reason){
  if (b.broken) return;
  b.broken = true; S.broken++;
  const w = S.engine.world;
  for (const k of S.bends) if (!k.broken && k.rs.includes(b)) k.broken = true;
  const A = {x:b.A.position.x, y:b.A.position.y}, B = {x:b.B.position.x, y:b.B.position.y};
  if (b.deck){
    for (const p of b.pins) Composite.remove(w,p);
    b.deck.collisionFilter.mask = CAT.V|CAT.T;
  }
  S.events.push({type:'break', mat:b.mat, A, B, id:b.id, beam:b, reason: reason||'', where: where ?? (reason==='knick' ? 0.5 : 0.35+Math.random()*0.3)});
}

export function stepFrame(S){
  const e = S.engine, L = S.L;
  e.gravity.y = Math.min(1, S.t/0.5);
  for (const b of S.beams) b.F = 0;
  for (const k of S.bends) k.F = 0;
  const W = L.wind||0;
  S.gust = W ? W*(0.72 + 0.28*Math.sin(S.t*2.6) + 0.12*Math.sin(S.t*7.3+1.3)) : 0;
  for (let s=0; s<SUB; s++){
    if (W && S.t > 0.5){
      // Seitenwind (von rechts): horizontaler Druck + Flattern auf alle freien Knoten, Winddruck und Auftrieb am Fahrzeug
      const g = S.gust*GS;
      for (const id in S.nodes){ const n = S.nodes[id]; if (n.isStatic) continue;
        n.force.x -= g*n.expo*0.35; n.force.y += g*n.expo*0.22*Math.sin(S.t*4.2 + (+n.id||0)*0.7); }
      const vb = S.veh.body, sp = S.veh.spec, area = sp.w*sp.h/3000;
      const top = {x:vb.position.x - Math.sin(vb.angle)*sp.h*0.5, y:vb.position.y - Math.cos(vb.angle)*sp.h*0.5};
      Body.applyForce(vb, top, {x:-g*area*1.0, y:-g*area*0.25});
      // böiges Schaukeln: wechselnder Auftrieb vorne/hinten -> Kippmoment
      const ca = Math.cos(vb.angle), sa = Math.sin(vb.angle), rock = g*area*0.45*Math.sin(S.t*6.3)*(0.6+0.4*Math.sin(S.t*1.7));
      Body.applyForce(vb, {x:vb.position.x + ca*sp.w*0.4, y:vb.position.y + sa*sp.w*0.4}, {x:0, y:-rock});
      Body.applyForce(vb, {x:vb.position.x - ca*sp.w*0.4, y:vb.position.y - sa*sp.w*0.4}, {x:0, y:rock});
    }
    if (S.t > 0.7 && !S.result){
      const v = S.veh; v.motor = Math.min(1, v.motor + 0.008);
      for (const wh of v.wheels) Body.setAngularVelocity(wh, wh.angularVelocity + (v.spec.speed*v.motor - wh.angularVelocity)*0.2);
    }
    Engine.update(e, DT);
  }
  S.t += 1/60;
  let mr = 0;
  for (const b of S.beams){
    if (b.broken) continue;
    const F = b.F/SUB, m = MATS[b.mat];
    b.Fs += (F - b.Fs)*0.35;
    const lim = b.Fs >= 0 ? m.str : b.compLim;
    b.ratio = lim ? Math.abs(b.Fs)/lim : 0;
    if (!m.comp && b.Fs < 0) b.ratio = 0;
    b.tension = b.Fs >= 0;
    if (S.t > 0.1 && b.ratio > 1 && !S.noBreak){ breakBeam(S, b, undefined, b.tension ? 'zug' : (b.compLim < m.comp*0.8 ? 'knick' : 'druck')); continue; }
    b.warn = b.ratio > 0.85 ? b.warn + 1/60 : 0;
    mr = Math.max(mr, b.ratio);
  }
  for (const k of S.bends){
    if (k.broken) continue;
    k.Fs += (k.F/SUB - k.Fs)*0.35;
    k.plast = Math.abs(k.h0 - k.h00)/k.half;   // bleibender Knickwinkel (rad, genähert)
    k.ratio = Math.min(0.99, k.Fs / BEND.str);
    if (k.plast > BEND.rot*0.05) k.ratio = 1 + 0.5*k.plast/BEND.rot;   // 100 % = Fließen, 150 % = Reißen
    if (S.t > 0.1 && k.plast > BEND.rot && !S.noBreak){
      // Fahrbahn knickt am Gelenk -> schwächerer angrenzender Straßenbalken bricht direkt am Knoten
      const r = k.rs.filter(x=>!x.broken).sort((a,b)=>b.ratio-a.ratio)[0];
      k.broken = true;
      if (r) breakBeam(S, r, r.A===k.B ? 0.08 : 0.92);
      continue;
    }
    for (const r of k.rs) if (!r.broken) r.ratio = Math.max(r.ratio, k.ratio);
    mr = Math.max(mr, k.ratio);
  }
  S.maxRatio = Math.max(S.maxRatio, mr);
  S.curMax = mr;
  if (!S.result){
    const vb = S.veh.body;
    const ang = Math.abs(((vb.angle + Math.PI) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI) - Math.PI);
    S.tipT = ang > 1.25 ? S.tipT + 1/60 : 0;
    S.stuckT = (S.t > 3 && Math.abs(vb.velocity.x) < 0.08) ? (S.stuckT||0) + 1/60 : 0;
    if (vb.position.x > S.flagX) S.result = {win:true, t:S.t};
    else if (vb.position.y > Math.min(L.roadY + 260, (L.floorY||660) - 50)) S.result = {win:false, reason:'Das Fahrzeug ist in die Schlucht gestürzt.', t:S.t};
    else if (S.tipT > 0.6) S.result = {win:false, reason:'Das Fahrzeug ist umgekippt.', t:S.t};
    else if (S.stuckT > 5) S.result = {win:false, reason:'Das Fahrzeug steckt in der stark durchgebogenen Fahrbahn fest.', t:S.t};
    else if (S.t > 40) S.result = {win:false, reason:'Zeit abgelaufen – das Fahrzeug kommt nicht ans Ziel.', t:S.t};
  }
}

export function addDebrisBody(S, x, y, len, thick, ang, vx, vy, va){
  const b = Bodies.rectangle(x, y, Math.max(4,len), thick, {collisionFilter:{category:CAT.R, mask:CAT.T}, friction:0.8, restitution:0.2, frictionAir:0.01});
  Body.setAngle(b, ang); Body.setVelocity(b, {x:vx, y:vy}); Body.setAngularVelocity(b, va);
  Composite.add(S.engine.world, b);
  return b;
}
export function removeBody(S, b){ Composite.remove(S.engine.world, b); }
