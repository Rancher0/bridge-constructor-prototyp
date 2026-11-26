// Prozedurale Sounds per WebAudio (keine Dateien)
let ac = null, master = null, muted = localStorage.getItem('captain.mute') === '1', noiseBuf = null, engineNode = null;
export function isMuted(){ return muted; }
export function setMuted(m){ muted = m; localStorage.setItem('captain.mute', m?'1':'0'); if (master) master.gain.value = m?0:0.6; }
export function unlock(){
  if (ac) { if (ac.state==='suspended') ac.resume(); return; }
  try { ac = new (window.AudioContext||window.webkitAudioContext)(); } catch(e){ return; }
  master = ac.createGain(); master.gain.value = muted?0:0.6; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate*1.0, ac.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
}
function env(g, t, a, peak, dec){ g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(peak,t+a); g.gain.exponentialRampToValueAtTime(0.0001,t+a+dec); }
function noise(t, dur, type, freq, q, peak){
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain(); env(g, t, 0.003, peak, dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()*0.5); s.stop(t+dur+0.05);
}
function tone(t, type, f0, f1, dur, peak){
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0,t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t+dur);
  const g = ac.createGain(); env(g, t, 0.005, peak, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t+dur+0.05);
}
export function sfx(name, p={}){
  if (!ac || muted) return;
  const t = ac.currentTime;
  switch(name){
    case 'click': tone(t,'sine',880,660,0.06,0.08); break;
    case 'place': noise(t,0.08,'bandpass',p.mat==='steel'?2400:900,3,0.35); tone(t,'triangle',p.mat==='steel'?520:200,p.mat==='steel'?480:140,0.12,0.18); break;
    case 'delete': tone(t,'square',300,120,0.12,0.06); break;
    case 'error': tone(t,'sawtooth',160,110,0.18,0.08); break;
    case 'creak': { const o=ac.createOscillator(); o.type='sawtooth'; const f=ac.createBiquadFilter(); f.type='bandpass'; f.frequency.value=420; f.Q.value=6;
      const g=ac.createGain(); const base = 70+Math.random()*40; o.frequency.setValueAtTime(base,t);
      for(let i=1;i<6;i++) o.frequency.linearRampToValueAtTime(base*(0.8+Math.random()*0.5), t+i*0.05);
      env(g,t,0.04,0.12,0.3); o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t+0.4); break; }
    case 'breakwood': noise(t,0.25,'bandpass',1400,1.2,0.9); noise(t+0.02,0.4,'lowpass',500,0.7,0.5);
      for(let i=0;i<6;i++) noise(t+0.03+Math.random()*0.25,0.03,'highpass',3000,1,0.35); tone(t,'triangle',140,60,0.25,0.3); break;
    case 'breaksteel': [1180,1730,2610,3420].forEach((f,i)=>tone(t,'sine',f,f*0.98,0.9-i*0.15,0.12)); noise(t,0.15,'highpass',4000,1,0.4); tone(t,'square',90,50,0.2,0.15); break;
    case 'snap': tone(t,'sawtooth',900,90,0.35,0.25); noise(t,0.06,'highpass',2500,1,0.5); break;
    case 'win': [523,659,784,1047].forEach((f,i)=>tone(t+i*0.12,'triangle',f,null,0.35,0.22)); break;
    case 'fail': [392,330,262,196].forEach((f,i)=>tone(t+i*0.14,'triangle',f,null,0.3,0.2)); noise(t+0.5,0.5,'lowpass',300,0.7,0.4); break;
    case 'splash': noise(t,0.7,'lowpass',900,0.8,0.6); break;
  }
}
export function engine(on, speed=0, heavy=false){
  if (!ac) return;
  if (on && !engineNode){
    const o = ac.createOscillator(); o.type='sawtooth'; const f = ac.createBiquadFilter(); f.type='lowpass'; f.frequency.value=380;
    const g = ac.createGain(); g.gain.value = 0; o.connect(f); f.connect(g); g.connect(master); o.start();
    engineNode = {o,g,heavy};
  }
  if (engineNode){
    if (!on){ engineNode.g.gain.setTargetAtTime(0, ac.currentTime, 0.1); const n=engineNode; setTimeout(()=>{try{n.o.stop();}catch(e){}},600); engineNode=null; return; }
    engineNode.o.frequency.setTargetAtTime((heavy?38:55) + speed*(heavy?40:70), ac.currentTime, 0.1);
    engineNode.g.gain.setTargetAtTime(muted?0:0.05, ac.currentTime, 0.1);
  }
}

export function pause(p){ if (!ac) return; try { p ? ac.suspend() : ac.resume(); } catch(e){} }
