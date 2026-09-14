import { Game } from "./game.js?v=9";
import { InputController } from "./input.js?v=9";
import { Renderer } from "./render.js?v=9";
import { GameUI } from "./ui.js?v=9";
import { World } from "./world.js?v=9";

const canvas = document.getElementById("game");
const world = new World();
const renderer = new Renderer(canvas);
const input = new InputController(canvas);
const ui = new GameUI();
const game = new Game(world, renderer, input, ui);

window.__SPERRKREIS__ = game;

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
