// Level-Definitionen. Koordinaten in Welteinheiten (40 = 1 Gitterfeld = 2 m), y nach unten.
export const LEVELS = [
  { name:'Erste Brücke', desc:'Ein kleiner Bach. Die Straße allein hält den Lieferwagen nicht – stütze sie ab!',
    tips:['Ziehe von einem roten Anker aus eine Straße über den Bach.','Eine Straße allein biegt sich unter dem Fahrzeug durch und bricht.','Baue darunter Dreiecke aus Holz – von den unteren Ankern aus.'],
    budget:9400, vehicles:['van','car'], veh:'van', roadY:360, gapL:440, gapR:1000,
    cliffs:[[-3000,440,360],[1000,4440,360]], pillars:[], towers:[], floorY:600,
    anchors:[[440,360],[440,440],[1000,360],[1000,440]], abutments:[[440,360],[1000,360]] },
  { name:'Fachwerk', desc:'Breitere Schlucht, und jetzt kommt der LKW (14,5 t). Dreiecke machen Brücken stark.',
    tips:['Baue unter der Straße ein Fachwerk aus Dreiecken (Zickzack).','Ein Untergurt zwischen den unteren Ankern nimmt den Zug auf – Alu ist dafür leicht und stark.','Behalte die Belastungsfarben im Test im Blick: Rot = kurz vor dem Bruch.'],
    budget:13800, vehicles:['truck','van','car'], veh:'truck', roadY:360, gapL:400, gapR:1040,
    cliffs:[[-3000,400,360],[1040,4440,360]], pillars:[], towers:[], floorY:640,
    anchors:[[400,360],[400,440],[1040,360],[1040,440]], abutments:[[400,360],[1040,360]] },
  { name:'Strompfeiler', desc:'Ein breiter Fluss mit einem Betonfundament in der Mitte. Druckstäbe aus Beton oder Guss sind hier stark.',
    tips:['Stütze die Brücke vom Mittelpfeiler aus ab – das halbiert die Spannweite.','Beton und Gusseisen sind billig-stark auf Druck, reißen aber unter Zug.','Lange Druckstäbe knicken! Kurze Stäbe tragen auf Druck mehr.'],
    budget:13300, vehicles:['truck','van','car'], veh:'truck', roadY:360, gapL:360, gapR:1080,
    cliffs:[[-3000,360,360],[1080,4440,360]], pillars:[[680,760,480]], towers:[], floorY:660,
    anchors:[[360,360],[360,440],[1080,360],[1080,440],[720,480]], abutments:[[360,360],[1080,360]] },
  { name:'Hängepartie', desc:'Keine Anker unten – aber zwei hohe Pylone. Zeit für Kabel und Stahlseile!',
    tips:['Das Budget ist knapp: Schon zwei gut gesetzte Kabel können reichen!','Hänge Straßenknoten an die Pylon-Spitzen – Kabel tragen nur Zug, dürfen aber lang sein.','Ein Stahlseil trägt doppelt so viel wie ein Kabel, kostet aber mehr.'],
    budget:6300, vehicles:['truck','van','car'], veh:'truck', roadY:360, gapL:360, gapR:1080,
    cliffs:[[-3000,360,360],[1080,4440,360]], pillars:[], towers:[[320,120],[1120,120]], floorY:660,
    anchors:[[360,360],[1080,360],[320,120],[1120,120]], abutments:[[360,360],[1080,360]] },
  { name:'Windige Klamm', desc:'Kräftiger Seitenwind mit Böen rüttelt an Brücke und Fahrzeug. Baue steif und stabil!',
    tips:['💨 Achtung Seitenwind: Böen drücken das Fahrzeug zurück, lassen es schaukeln und die Brücke flattern.','Seile von den Pylonen dämpfen das Schwingen der Fahrbahn.','Leichte Fahrzeuge spüren den Wind am stärksten – der PKW kann bei Böen sogar umkippen!'],
    budget:19100, vehicles:['truck','van','car'], veh:'truck', wind:2.4, roadY:360, gapL:320, gapR:1120,
    cliffs:[[-3000,320,360],[1120,4440,360]], pillars:[], towers:[[280,120],[1160,120]], floorY:680,
    anchors:[[320,360],[320,440],[1120,360],[1120,440],[280,120],[1160,120]], abutments:[[320,360],[1120,360]] },
  { name:'Schwerlast', desc:'Der Schwerlast-Truck wiegt 24 t! Nutze den Felspfeiler.',
    tips:['Stahl ist stark, aber teuer – setze ihn nur dort ein, wo es rot wird.','Der Felspfeiler in der Mitte halbiert die Spannweite.','Teste, schau wo es rot wird, und verstärke gezielt.'],
    budget:16200, vehicles:['hauler','truck'], veh:'hauler', roadY:360, gapL:320, gapR:1120,
    cliffs:[[-3000,320,360],[1120,4440,360]], pillars:[[680,760,520]], towers:[], floorY:660,
    anchors:[[320,360],[320,440],[1120,360],[1120,440],[720,520]], abutments:[[320,360],[1120,360]] },
  { name:'Großer Canyon', desc:'48 m Spannweite, Sturmböen und der 24-t-Truck. Kombiniere alles!',
    tips:['💨 Sturmböen! Kombiniere ein steifes Fachwerk mit Stahlseilen von den Pylonen.','Seile entlasten die Mitte, das Fachwerk verteilt die Last.','Spare an Stellen, die im Test grün bleiben.'],
    budget:33000, vehicles:['hauler','truck','van','car'], veh:'hauler', wind:1.6, roadY:360, gapL:240, gapR:1200,
    cliffs:[[-3000,240,360],[1200,4440,360]], pillars:[], towers:[[200,80],[1240,80]], floorY:700,
    anchors:[[240,360],[240,480],[1200,360],[1200,480],[200,80],[1240,80]], abutments:[[240,360],[1200,360]] }
];

// Referenzlösungen (für Tests / Debug): Liste von Segmenten [x1,y1,x2,y2,mat]
function road(x0,x1,y,step=80){ const s=[]; for(let x=x0;x<x1;x+=step) s.push([x,y,x+step,y,'road']); return s; }
export function warren(x0,x1,y,depth,chord,diag,step=80,lowAnchors=true, mats){
  const segs = road(x0,x1,y,step), by=y+depth, half=step/2, bots=[];
  for (let x=x0+half; x<x1; x+=step) bots.push(x);
  bots.forEach((bx,i)=>{
    const dm = mats ? mats(bx) : diag;
    segs.push([bx-half,y,bx,by,dm],[bx,by,bx+half,y,dm]);
    if (i>0) segs.push([bots[i-1],by,bx,by, mats? (mats(bx,'chord')||chord) : chord]);
  });
  if (lowAnchors){ segs.push([x0,by,bots[0],by,chord],[bots[bots.length-1],by,x1,by,chord]); }
  return segs;
}
const cablesFrom = (tx,ty,xs,y=360,mat='cable')=>xs.map(x=>[tx,ty,x,y,mat]);
export const SOLUTIONS = [
  { ref: ()=> warren(440,1000,360,80,'wood','wood'),                     roadonly: ()=> road(440,1000,360) },
  { ref: ()=> warren(400,1040,360,80,'wood','wood'),                     roadonly: ()=> road(400,1040,360) },
  { ref: ()=> warren(360,1080,360,80,'wood','wood').concat([[720,440,720,480,'wood'],[640,440,720,480,'wood'],[800,440,720,480,'wood']]), roadonly: ()=> road(360,1080,360) },
  { ref: ()=> road(360,1080,360).concat(cablesFrom(320,120,[600]), cablesFrom(1120,120,[840])), roadonly: ()=> road(360,1080,360) },
  { ref: ()=> warren(320,1120,360,80,'wood','wood').concat(cablesFrom(280,120,[400,480,560]), cablesFrom(1160,120,[880,960,1040])), roadonly: ()=> road(320,1120,360) },
  { ref: ()=> warren(320,1120,360,80,'wood','wood').concat([[680,440,720,520,'wood'],[760,440,720,520,'wood']]), roadonly: ()=> road(320,1120,360) },
  { ref: ()=> warren(240,1200,360,120,'wood','wood').concat(cablesFrom(200,80,[320,400,480]), cablesFrom(1240,80,[960,1040,1120])), roadonly: ()=> road(240,1200,360) }
];
export function segmentsToDesign(L, segs){
  const nodes = L.anchors.map((a,i)=>({id:'A'+i, x:a[0], y:a[1], anchor:true}));
  const beams = []; let nid = 1;
  const get = (x,y)=>{ let n = nodes.find(n=>n.x===x&&n.y===y); if(!n){ n={id:'N'+(nid++), x, y, anchor:false}; nodes.push(n);} return n; };
  for (const [x1,y1,x2,y2,mat] of segs){ const a=get(x1,y1), b=get(x2,y2); beams.push({id:'B'+(nid++), a:a.id, b:b.id, mat}); }
  return {nodes, beams, nextId:nid};
}

// Optimierte Referenzlösungen / Beispielbrücken (Material automatisch gewählt, nahe am Limit) – erzeugt von opt.mjs
export const REFS = {"0":[[440,360,520,360,"road"],[520,360,600,360,"road"],[600,360,680,360,"road"],[680,360,760,360,"road"],[760,360,840,360,"road"],[840,360,920,360,"road"],[920,360,1000,360,"road"],[440,360,480,440,"wood"],[480,440,520,360,"wood"],[520,360,560,440,"wood"],[560,440,600,360,"wood"],[480,440,560,440,"wood"],[600,360,640,440,"wood"],[640,440,680,360,"wood"],[560,440,640,440,"wood"],[680,360,720,440,"wood"],[720,440,760,360,"wood"],[640,440,720,440,"wood"],[760,360,800,440,"wood"],[800,440,840,360,"wood"],[720,440,800,440,"wood"],[840,360,880,440,"wood"],[880,440,920,360,"wood"],[800,440,880,440,"wood"],[920,360,960,440,"wood"],[960,440,1000,360,"wood"],[880,440,960,440,"wood"],[440,440,480,440,"alu"],[960,440,1000,440,"wood"]],"1":[[400,360,480,360,"road"],[480,360,560,360,"road"],[560,360,640,360,"road"],[640,360,720,360,"road"],[720,360,800,360,"road"],[800,360,880,360,"road"],[880,360,960,360,"road"],[960,360,1040,360,"road"],[400,360,440,440,"steel"],[440,440,480,360,"concrete"],[480,360,520,440,"alu"],[520,440,560,360,"concrete"],[440,440,520,440,"alu"],[560,360,600,440,"wood"],[600,440,640,360,"wood"],[520,440,600,440,"wood"],[640,360,680,440,"wood"],[680,440,720,360,"wood"],[600,440,680,440,"wood"],[720,360,760,440,"wood"],[760,440,800,360,"wood"],[680,440,760,440,"wood"],[800,360,840,440,"wood"],[840,440,880,360,"wood"],[760,440,840,440,"wood"],[880,360,920,440,"concrete"],[920,440,960,360,"alu"],[840,440,920,440,"wood"],[960,360,1000,440,"concrete"],[1000,440,1040,360,"steel"],[920,440,1000,440,"alu"],[400,440,440,440,"concrete"],[1000,440,1040,440,"concrete"]],"2":[[360,360,440,360,"road"],[440,360,520,360,"road"],[520,360,600,360,"road"],[600,360,680,360,"road"],[680,360,760,360,"road"],[760,360,840,360,"road"],[840,360,920,360,"road"],[920,360,1000,360,"road"],[1000,360,1080,360,"road"],[360,360,400,440,"wood"],[400,440,440,360,"wood"],[440,360,480,440,"wood"],[480,440,520,360,"wood"],[400,440,480,440,"wood"],[520,360,560,440,"wood"],[560,440,600,360,"wood"],[480,440,560,440,"wood"],[600,360,640,440,"wood"],[640,440,680,360,"wood"],[560,440,640,440,"wood"],[680,360,720,440,"alu"],[720,440,760,360,"concrete"],[640,440,720,440,"wood"],[760,360,800,440,"wood"],[800,440,840,360,"wood"],[720,440,800,440,"wood"],[840,360,880,440,"wood"],[880,440,920,360,"wood"],[800,440,880,440,"wood"],[920,360,960,440,"wood"],[960,440,1000,360,"wood"],[880,440,960,440,"wood"],[1000,360,1040,440,"wood"],[1040,440,1080,360,"wood"],[960,440,1040,440,"wood"],[360,440,400,440,"wood"],[1040,440,1080,440,"wood"],[720,440,720,480,"concrete"],[640,440,720,480,"wood"],[800,440,720,480,"wood"]],"3":[[360,360,440,360,"road"],[440,360,520,360,"road"],[520,360,600,360,"road"],[600,360,680,360,"road"],[680,360,760,360,"road"],[760,360,840,360,"road"],[840,360,920,360,"road"],[920,360,1000,360,"road"],[1000,360,1080,360,"road"],[320,120,600,360,"cable"],[1120,120,840,360,"cable"]],"4":[[320,360,400,360,"road"],[400,360,480,360,"road"],[480,360,560,360,"road"],[560,360,640,360,"road"],[640,360,720,360,"road"],[720,360,800,360,"road"],[800,360,880,360,"road"],[880,360,960,360,"road"],[960,360,1040,360,"road"],[1040,360,1120,360,"road"],[320,360,360,440,"wood"],[360,440,400,360,"wood"],[400,360,440,440,"wood"],[440,440,480,360,"alu"],[360,440,440,440,"concrete"],[480,360,520,440,"wood"],[520,440,560,360,"wood"],[440,440,520,440,"alu"],[560,360,600,440,"wood"],[600,440,640,360,"alu"],[520,440,600,440,"wood"],[640,360,680,440,"wood"],[680,440,720,360,"wood"],[600,440,680,440,"wood"],[720,360,760,440,"wood"],[760,440,800,360,"wood"],[680,440,760,440,"alu"],[800,360,840,440,"alu"],[840,440,880,360,"wood"],[760,440,840,440,"wood"],[880,360,920,440,"wood"],[920,440,960,360,"wood"],[840,440,920,440,"wood"],[960,360,1000,440,"wood"],[1000,440,1040,360,"wood"],[920,440,1000,440,"wood"],[1040,360,1080,440,"wood"],[1080,440,1120,360,"wood"],[1000,440,1080,440,"wood"],[320,440,360,440,"concrete"],[1080,440,1120,440,"wood"],[280,120,400,360,"cable"],[280,120,480,360,"cable"],[280,120,560,360,"cable"],[1160,120,880,360,"cable"],[1160,120,960,360,"cable"],[1160,120,1040,360,"cable"]],"5":[[320,360,400,360,"road"],[400,360,480,360,"road"],[480,360,560,360,"road"],[560,360,640,360,"road"],[640,360,720,360,"road"],[720,360,800,360,"road"],[800,360,880,360,"road"],[880,360,960,360,"road"],[960,360,1040,360,"road"],[1040,360,1120,360,"road"],[320,360,360,440,"alu"],[360,440,400,360,"concrete"],[400,360,440,440,"wood"],[440,440,480,360,"wood"],[360,440,440,440,"wood"],[480,360,520,440,"wood"],[520,440,560,360,"wood"],[440,440,520,440,"wood"],[560,360,600,440,"wood"],[600,440,640,360,"wood"],[520,440,600,440,"wood"],[640,360,680,440,"concrete"],[680,440,720,360,"wood"],[600,440,680,440,"wood"],[720,360,760,440,"wood"],[760,440,800,360,"concrete"],[680,440,760,440,"wood"],[800,360,840,440,"wood"],[840,440,880,360,"wood"],[760,440,840,440,"wood"],[880,360,920,440,"wood"],[920,440,960,360,"wood"],[840,440,920,440,"wood"],[960,360,1000,440,"wood"],[1000,440,1040,360,"wood"],[920,440,1000,440,"wood"],[1040,360,1080,440,"concrete"],[1080,440,1120,360,"alu"],[1000,440,1080,440,"wood"],[320,440,360,440,"concrete"],[1080,440,1120,440,"concrete"],[680,440,720,520,"concrete"],[760,440,720,520,"concrete"]],"6":[[240,360,320,360,"road"],[320,360,400,360,"road"],[400,360,480,360,"road"],[480,360,560,360,"road"],[560,360,640,360,"road"],[640,360,720,360,"road"],[720,360,800,360,"road"],[800,360,880,360,"road"],[880,360,960,360,"road"],[960,360,1040,360,"road"],[1040,360,1120,360,"road"],[1120,360,1200,360,"road"],[240,360,280,480,"alu"],[280,480,320,360,"concrete"],[320,360,360,480,"wood"],[360,480,400,360,"alu"],[280,480,360,480,"concrete"],[400,360,440,480,"alu"],[440,480,480,360,"concrete"],[360,480,440,480,"concrete"],[480,360,520,480,"steel"],[520,480,560,360,"concrete"],[440,480,520,480,"alu"],[560,360,600,480,"alu"],[600,480,640,360,"concrete"],[520,480,600,480,"wood"],[640,360,680,480,"wood"],[680,480,720,360,"wood"],[600,480,680,480,"alu"],[720,360,760,480,"wood"],[760,480,800,360,"wood"],[680,480,760,480,"alu"],[800,360,840,480,"concrete"],[840,480,880,360,"alu"],[760,480,840,480,"alu"],[880,360,920,480,"concrete"],[920,480,960,360,"steel"],[840,480,920,480,"wood"],[960,360,1000,480,"wood"],[1000,480,1040,360,"wood"],[920,480,1000,480,"wood"],[1040,360,1080,480,"wood"],[1080,480,1120,360,"wood"],[1000,480,1080,480,"wood"],[1120,360,1160,480,"wood"],[1160,480,1200,360,"wood"],[1080,480,1160,480,"alu"],[240,480,280,480,"concrete"],[1160,480,1200,480,"alu"],[200,80,320,360,"cable"],[200,80,400,360,"cable"],[200,80,480,360,"rope"],[1240,80,960,360,"rope"],[1240,80,1040,360,"cable"],[1240,80,1120,360,"cable"]]};
