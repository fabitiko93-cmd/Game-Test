// Lazy editor UI only. Never imported by model loaders or the game renderer.
export const template=`
<header class="aw-header aw-compact-header"><select data-aw="workMode" aria-label="Arbeitsmodus"><option value="pose">Haltung</option><option value="animation">Animation</option><option value="test">Prüfen</option></select><select data-aw="quickChannel" aria-label="Körperteil auswählen"></select><button data-aw="fitSelection" aria-label="Auswahl einzoomen">◎</button><button data-aw="close" aria-label="Animationswerkstatt schließen">×</button></header>
<div class="aw-layout">
  <section class="aw-view">
    <div class="aw-stage"><canvas data-aw="canvas" tabindex="0" aria-label="Figur bearbeiten: einen markierten Körperpunkt antippen und ziehen."></canvas><img data-aw="referenceImage" class="aw-reference" alt="Eigene Haltungsreferenz" hidden><canvas data-aw="overlay" aria-hidden="true"></canvas><span class="aw-loading" data-aw="loading">Modelle werden geladen …</span></div>
    <div class="aw-dock"><button data-aw="panel" aria-expanded="false">WERKZEUGE</button><button data-aw-tool="move">SCHIEBEN</button><button data-aw="rotateCycle">NEIGEN</button><button data-aw-tool="view">ANSICHT</button><button data-aw="whole">GANZ</button><button data-aw="undoQuick" aria-label="Rückgängig">↶</button><button data-aw="playQuick" aria-label="Abspielen oder anhalten" hidden>▶</button></div>
    <div data-aw="quickStatus" class="aw-quick-status" role="status" aria-live="polite"></div>
  </section>
  <section class="aw-edit" data-aw="panelBody" hidden><div class="aw-panel-header"><strong>WERKZEUGE &amp; EINSTELLUNGEN</strong><button data-aw="panelClose" aria-label="Werkzeuge schließen">×</button></div>
<nav class="aw-modes" aria-label="Arbeitsmodus"><button data-aw-mode="pose">HALTUNG</button><button data-aw-mode="animation">ANIMATION</button><button data-aw-mode="test">PRÜFEN</button></nav>
<div class="aw-tools" aria-label="Werkzeug"><button data-aw-tool="move">VERSCHIEBEN</button><button data-aw-tool="depth">VOR / ZURÜCK</button><button data-aw-tool="rotate">DREHEN</button><button data-aw-tool="view">ANSICHT DREHEN</button></div>
<div class="aw-viewbar"><div class="aw-views"><button data-aw-view="front">VORNE</button><button data-aw-view="side">SEITE</button><button data-aw-view="three">SCHRÄG</button></div><button data-aw="zoomOut" aria-label="Ansicht verkleinern">−</button><button data-aw="zoomIn" aria-label="Ansicht vergrößern">+</button><button data-aw="camera" aria-label="Ansicht zurücksetzen">↺</button></div>
    <div class="aw-selection"><strong data-aw="selection">Waffe / Waffenhand</strong><span data-aw="gestureHint"></span></div>
    <div class="aw-rotation" data-aw="rotation"><button data-aw-axis="0">NEIGEN</button><button data-aw-axis="1">DREHEN</button><button data-aw-axis="2">KIPPEN</button></div>
    <div class="aw-quick"><button data-aw="undo">RÜCKGÄNGIG</button><button data-aw="redo">WIEDERHOLEN</button><button data-aw="key">STELLUNG SETZEN</button></div>
    <div class="aw-playarea" data-aw="playarea">
      <div class="aw-playback"><button data-aw="start" aria-label="Anfang">|◀</button><button data-aw="back">−1 BILD</button><button data-aw="play">ABSPIELEN</button><button data-aw="next">+1 BILD</button><button data-aw="end" aria-label="Ende">▶|</button></div>
      <label class="aw-timeline"><output data-aw="time">0,00 s</output><input data-aw="timeline" type="range" min="0" max="1" step="0.0001" value="0" aria-label="Animationszeit"></label>
    </div>
    <div data-aw="status" class="aw-status" role="status" aria-live="polite"></div>
    <p data-aw="modeHint" class="aw-hint"></p>
    <div class="aw-config"><label>Körpermodell<select data-aw="sex"><option value="male">Männlich · 1,80 m</option><option value="female">Weiblich · 1,68 m</option></select></label><label>Waffe<select data-aw="weapon"></select></label><label>Haltung / Aktion<select data-aw="track"></select></label><label>Bewegung<select data-aw="movement"></select></label></div>
    <div data-aw="poseCards" class="aw-posecards" aria-label="Grundhaltungen"></div>
    <label data-aw="scenarioLabel">Prüfablauf<select data-aw="scenario"></select></label>
    <label data-aw="durationLabel">Übergangsdauer in Sekunden<input data-aw="duration" type="number" min="0.1" max="2" step="0.05" inputmode="decimal"></label>
    <div class="aw-section-title"><h3>KÖRPERPUNKT</h3><span data-aw="frameLabel"></span></div>
    <label>Auswahl<select data-aw="channel"></select></label>
    <div class="aw-contacts"><label>Linke Hand<select data-aw="contact"><option value="0">Automatischer Griff / Aktionskontakt</option><option value="1">Am Waffengriff halten</option><option value="-1">Hand frei positionieren</option></select></label><label><input data-aw="pinR" type="checkbox" checked> Rechten Fuß fixieren</label><label><input data-aw="pinL" type="checkbox" checked> Linken Fuß fixieren</label></div>
    <p class="aw-hint">Die rechte Hand führt die Waffe. Becken, Knie und Fußkontakte werden im Stillstand bearbeitet. Beim Gehen bleiben die Schritte der Originalanimation erhalten.</p>
    <details><summary>Feineinstellung · cm und Grad</summary><div data-aw="values" class="aw-values"></div><button data-aw="zeroChannel">AUSWAHL ZURÜCKSETZEN</button></details>
    <div class="aw-bar"><button data-aw="zero">HALTUNG / SPUR ZURÜCKSETZEN</button><button data-aw="delete">SCHLÜSSELSTELLUNG LÖSCHEN</button></div>
    <div data-aw="frames" class="aw-frames" aria-label="Schlüsselstellungen"></div><div data-aw="markers" class="aw-frames" aria-label="Aktionsereignisse"></div>
    <details><summary>Ansicht, Vergleich &amp; Referenzbild</summary><div class="aw-config"><label>Fokus<select data-aw="focus"><option value="selection">Auswahl</option><option value="body" selected>Ganze Figur</option><option value="chest">Oberkörper</option><option value="head">Kopf</option><option value="hands">Hände</option></select></label><label>Zoom<input data-aw="zoom" type="range" min="0.7" max="2.8" step="0.05" value="1"></label></div><div class="aw-bar"><label><input type="checkbox" data-aw="original"> Original vergleichen</label><label><input type="checkbox" data-aw="skeleton" checked> Skelett anzeigen</label></div><div class="aw-bar"><button data-aw="reference">REFERENZBILD ÖFFNEN</button><button data-aw="clearReference">BILD ENTFERNEN</button></div><label>Bilddeckkraft<input data-aw="opacity" type="range" min="0.05" max="0.8" step="0.05" value="0.3"></label><input data-aw="imageFile" type="file" accept="image/*" hidden><p class="aw-hint">Das Bild bleibt auf diesem Gerät und wird über der Figur eingeblendet. Kamera und Zoom auf denselben Blickwinkel einstellen.</p></details>
    <details><summary>Waffenaufsätze</summary><div data-aw="mods" class="aw-config"></div></details>
    <details><summary>Wiedergabe &amp; Ereignisse</summary><div class="aw-bar"><label>Tempo<select data-aw="speed"><option value="0.25">¼×</option><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><label><input type="checkbox" data-aw="loop"> Wiederholen</label><label>Prüftakt<select data-aw="fps"><option value="60">60 Bilder/s</option><option value="30">30 Bilder/s</option></select></label></div><p data-aw="trackHint" class="aw-hint"></p></details>
    <details class="aw-diagnostics"><summary>Gelenke und Handkontakt prüfen</summary><div data-aw="diagnostics"></div></details>
    <div class="aw-section-title"><h3>SPEICHERN &amp; VERWENDEN</h3><span data-aw="saved"></span></div>
    <div class="aw-bar"><button data-aw="save">ENTWURF SPEICHERN</button><button class="primary" data-aw="apply">IM SPIEL VERWENDEN</button></div>
    <p class="aw-hint">Grundhaltungen gelten unabhängig von der Zeit. „Im Spiel verwenden“ aktiviert den Entwurf auf diesem Gerät. Export sichert die Daten für die Übernahme ins Projekt.</p>
    <div class="aw-bar"><button data-aw="export">POSEN EXPORTIEREN</button><button data-aw="import">DATEI IMPORTIEREN</button><button data-aw="replay">PRÜFABLAUF EXPORTIEREN</button><button data-aw="originalGame">SPIEL AUF ORIGINAL SETZEN</button><button data-aw="retry" hidden>MODELLE ERNEUT LADEN</button></div>
    <input data-aw="file" type="file" accept="application/json,.json" hidden>
  </section>
</div>`;

export function selectOptions(select,entries){select.replaceChildren();for(const [value,label]of entries){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}}
export const display=n=>n.toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2});
