import * as THREE from 'three';
function cv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return [c,c.getContext('2d')]; }
function rnd(seed){ let s=seed; return ()=>{ s=(s*16807)%2147483647; return (s-1)/2147483646; }; }
function tex(c, srgb=true, rep=true){ const t=new THREE.CanvasTexture(c); if(srgb) t.colorSpace=THREE.SRGBColorSpace; if(rep){ t.wrapS=t.wrapT=THREE.RepeatWrapping; } t.anisotropy=4; return t; }
export function woodTexture(){
  const [c,g]=cv(512,64), r=rnd(7);
  g.fillStyle='#b07a43'; g.fillRect(0,0,512,64);
  for(let i=0;i<70;i++){ const y=r()*64, a=0.08+r()*0.18; g.strokeStyle=`rgba(${70+r()*40|0},${38+r()*20|0},${14},${a})`; g.lineWidth=0.6+r()*2.2; g.beginPath(); g.moveTo(0,y);
    for(let x=0;x<=512;x+=32) g.lineTo(x, y+Math.sin(x*0.02+i)*2*r()); g.stroke(); }
  for(let i=0;i<4;i++){ const x=r()*512, y=10+r()*44; const gr=g.createRadialGradient(x,y,1,x,y,9); gr.addColorStop(0,'rgba(70,35,10,.8)'); gr.addColorStop(1,'rgba(70,35,10,0)'); g.fillStyle=gr; g.beginPath(); g.ellipse(x,y,12,5,0,0,7); g.fill(); }
  return tex(c);
}
export function asphaltTexture(){
  const [c,g]=cv(256,256), r=rnd(3);
  g.fillStyle='#34383f'; g.fillRect(0,0,256,256);
  for(let i=0;i<5000;i++){ const v=40+r()*50|0; g.fillStyle=`rgba(${v},${v},${v+4},.5)`; g.fillRect(r()*256,r()*256,1.4,1.4); }
  // Randlinien (v-Richtung = Breite der Fahrbahn) und gelbe Mittellinie gestrichelt
  g.fillStyle='#e9edf2'; g.fillRect(0,14,256,7); g.fillRect(0,235,256,7);
  g.fillStyle='#facc15'; g.fillRect(0,124,150,8);
  return tex(c);
}
export function rockTexture(){
  const [c,g]=cv(512,512), r=rnd(11);
  const gr=g.createLinearGradient(0,0,0,512); gr.addColorStop(0,'#9a7a5c'); gr.addColorStop(1,'#6f5641'); g.fillStyle=gr; g.fillRect(0,0,512,512);
  for(let y=0;y<512;y+=18+r()*26){ g.fillStyle=`rgba(${60+r()*40|0},${45+r()*30|0},${30+r()*20|0},${0.18+r()*0.2})`; g.fillRect(0,y,512,6+r()*12); }
  for(let i=0;i<2500;i++){ const v=r(); g.fillStyle=v>0.5?'rgba(255,240,220,.07)':'rgba(30,20,10,.12)'; g.fillRect(r()*512,r()*512,2+r()*5,1+r()*3); }
  for(let i=0;i<40;i++){ g.strokeStyle='rgba(35,25,15,.35)'; g.lineWidth=1+r()*1.5; g.beginPath(); let x=r()*512,y=r()*512; g.moveTo(x,y); for(let k=0;k<5;k++){ x+=(r()-0.5)*50; y+=r()*40; g.lineTo(x,y);} g.stroke(); }
  return tex(c);
}
export function grassTexture(){
  const [c,g]=cv(256,256), r=rnd(5);
  g.fillStyle='#4f9a3a'; g.fillRect(0,0,256,256);
  for(let i=0;i<4000;i++){ const v=r(); g.fillStyle=v>0.5?`rgba(120,190,80,.5)`:`rgba(40,90,30,.5)`; g.fillRect(r()*256,r()*256,1.5,3); }
  return tex(c);
}
export function concreteTexture(){
  const [c,g]=cv(256,256), r=rnd(9);
  g.fillStyle='#a3a7ab'; g.fillRect(0,0,256,256);
  for(let i=0;i<3000;i++){ const v=120+r()*80|0; g.fillStyle=`rgba(${v},${v},${v},.35)`; g.fillRect(r()*256,r()*256,2,2); }
  g.fillStyle='rgba(0,0,0,.12)'; for(let y=0;y<256;y+=64) g.fillRect(0,y,256,2);
  return tex(c);
}
export function waterNormal(){
  const [c,g]=cv(256,256), r=rnd(13);
  g.fillStyle='rgb(128,128,255)'; g.fillRect(0,0,256,256);
  for(let i=0;i<220;i++){ const x=r()*256,y=r()*256,rad=6+r()*22; const gr=g.createRadialGradient(x,y,0,x,y,rad);
    const dx=(r()-0.5)*90|0, dy=(r()-0.5)*90|0; gr.addColorStop(0,`rgba(${128+dx},${128+dy},255,.6)`); gr.addColorStop(1,'rgba(128,128,255,0)'); g.fillStyle=gr; g.fillRect(x-rad,y-rad,rad*2,rad*2); }
  return tex(c,false);
}
export function cargoTexture(){
  const [c,g]=cv(512,128);
  g.fillStyle='#f4f6f8'; g.fillRect(0,0,512,128);
  g.fillStyle='#dfe4ea'; for(let x=0;x<512;x+=32) g.fillRect(x,0,3,128);
  g.fillStyle='#2563eb'; g.fillRect(0,92,512,14);
  g.fillStyle='#0f2235'; g.font='bold 46px system-ui,Arial'; g.textAlign='center'; g.fillText('BRÜCKENTEST', 256, 70);
  return tex(c,true,false);
}
export function dotTexture(){
  const [c,g]=cv(64,64); const gr=g.createRadialGradient(32,32,0,32,32,30); gr.addColorStop(0,'rgba(255,255,255,1)'); gr.addColorStop(0.5,'rgba(255,255,255,.9)'); gr.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle=gr; g.beginPath(); g.arc(32,32,30,0,7); g.fill(); return tex(c,true,false);
}
export function castTexture(){
  const [c,g]=cv(256,256), r=rnd(17);
  g.fillStyle='#4a4f56'; g.fillRect(0,0,256,256);
  for(let i=0;i<6000;i++){ const v=r(); g.fillStyle=v>0.6?'rgba(150,155,165,.22)':'rgba(15,17,20,.35)'; const s=0.8+r()*2.6; g.fillRect(r()*256,r()*256,s,s); }
  for(let i=0;i<60;i++){ g.fillStyle='rgba(20,22,26,.4)'; g.beginPath(); g.arc(r()*256,r()*256,1+r()*2.5,0,7); g.fill(); }
  return tex(c);
}
export function ropeTexture(){
  const [c,g]=cv(64,256);
  g.fillStyle='#c9d3de'; g.fillRect(0,0,64,256);
  // schräge Litzen (Helix auf dem Zylinder)
  for(let k=-8;k<16;k++){ const y0=k*24; const gr=g.createLinearGradient(0,y0,0,y0+24); gr.addColorStop(0,'#eef3f8'); gr.addColorStop(0.45,'#9aa7b5'); gr.addColorStop(1,'#59636e');
    g.fillStyle=gr; g.beginPath(); g.moveTo(0,y0); g.lineTo(64,y0+40); g.lineTo(64,y0+64); g.lineTo(0,y0+24); g.closePath(); g.fill(); }
  return tex(c);
}
export function concreteBeamTexture(){
  const [c,g]=cv(256,128), r=rnd(23);
  g.fillStyle='#b4b7b8'; g.fillRect(0,0,256,128);
  for(let i=0;i<4000;i++){ const v=110+r()*110|0; g.fillStyle=`rgba(${v},${v},${v-4},.35)`; const s=1+r()*2; g.fillRect(r()*256,r()*128,s,s); }
  for(let i=0;i<70;i++){ g.fillStyle='rgba(60,60,60,.35)'; g.beginPath(); g.arc(r()*256,r()*128,0.8+r()*1.8,0,7); g.fill(); }
  g.fillStyle='rgba(0,0,0,.10)'; g.fillRect(0,0,256,4); g.fillRect(0,124,256,4);
  return tex(c);
}
