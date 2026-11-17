// Bootstrap: size the canvas to the window (letterboxed to the 1280x720 logical
// view), start the title-screen demo, and run the animation loop. With ?shot=<scene>
// it instead stages that deterministic scene, draws one frame and sets
// window.__shotReady, which the screenshot harness waits for.
import { VIEW } from './config.js';
import { Game } from './game.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW.width, window.innerHeight / VIEW.height);
  canvas.style.width = `${Math.floor(VIEW.width * scale)}px`;
  canvas.style.height = `${Math.floor(VIEW.height * scale)}px`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const game = new Game(canvas);
window.__game = game;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || 1) || 1;

if (shot) {
  game.shotMode = true;
  stageShot(game, shot, seed);
  game.renderer.draw(game);
  window.__shotReady = true;
} else {
  game.startAttract();
  const loop = (now) => {
    game.frame(now);
    window.requestAnimationFrame(loop);
  };
  window.requestAnimationFrame((now) => {
    game.lastTime = now;
    window.requestAnimationFrame(loop);
  });
}
