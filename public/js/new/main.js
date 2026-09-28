// main.js
import kaboom from "https://unpkg.com/kaboom@3000.0.1/dist/kaboom.mjs";
import { Game } from "./Game.js";

const k = kaboom({ width: 800, height: 600, background: [15, 15, 25] });

// expose kaboom helpers to global scope for convenience
Object.assign(globalThis, k);

new Game(k).start();
