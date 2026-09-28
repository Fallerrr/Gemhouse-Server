// config.js
import { ClientPlayer } from "./ClientPlayer.js";
import { ClientBullet } from "./ClientBullet.js";

export const ENTITY_TYPES = {
  player: ClientPlayer,
  bullet: ClientBullet,
};

export const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.hostname + ":3000/";
export const PLAYER_SPEED = 180; // px/s
export const SIZE = 28;
export const MAX_HP = 3;


export const SMOOTH_POS = 12;   // higher = snappier
export const SMOOTH_ANGLE = 14; // higher = snappier
