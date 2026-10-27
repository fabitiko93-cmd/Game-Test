import { Game } from "./game.js";
import { InputController } from "./input.js";
import { Renderer } from "./render.js";
import { GameUI } from "./ui.js";
import { World } from "./world.js";

const canvas = document.getElementById("game");
// A restored page scroll must not displace the fixed game on opening/back.
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
const resetPageScroll = () => window.scrollTo(0, 0);
resetPageScroll();
window.addEventListener('pageshow', resetPageScroll);
document.getElementById('game-shell').addEventListener('dblclick', event => event.preventDefault());
const world = new World();
const renderer = new Renderer(canvas);
const input = new InputController(canvas);
const ui = new GameUI();
const game = new Game(world, renderer, input, ui);

window.__SPERRKREIS__ = game;

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
