# Brückenbau Captain – Quellcode

Quellcode der Webversion. `index-captain.html` im Repo-Root ist daraus gebaut (alles inline, läuft offline).

- `main.js`: Darstellung (Three.js), Bauen, Test-Modus, Zeitlupe, Biege- und Schwingungsdarstellung, Effekte
- `sim.js`: Physik (Matter.js plus eigener XPBD-Fachwerklöser mit echten Kräften, Knicken, plastischer Fahrbahn)
- `levels.js`: Level und Beispielbrücken

Bauen: `npm i three matter-js esbuild` im Repo-Root, dann `captain/build.sh` aufrufen.
