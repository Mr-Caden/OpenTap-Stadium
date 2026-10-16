/* src/GameRegistry.js */

import SumoDiscs from "./games/SumoDiscs.js";
import HopHero from "./games/HopHero.js";
import AvatarMatch from "./games/AvatarMatch.js";
import CrateStackers from "./games/CrateStackers.js";
import CodeBreaker from "./games/CodeBreaker.js";
import RedLightGreenLight from "./games/RedLightGreenLight.js";
import BombTag from "./games/BombTag.js";
import NinjaReflex from "./games/NinjaReflex.js";
import PaintParty from "./games/PaintParty.js";
import OrbitSling from "./games/OrbitSling.js";
import LaserLeap from "./games/LaserLeap.js";
import BombBarrage from "./games/BombBarrage.js";
import HexagonCollapse from "./games/HexagonCollapse.js";

const REGISTERED_GAMES = [
    SumoDiscs,
    HopHero,
    BombTag,
    CrateStackers,
    AvatarMatch,
    CodeBreaker,
    RedLightGreenLight,
    NinjaReflex,
    PaintParty,
    OrbitSling,
    LaserLeap,
    BombBarrage,
    HexagonCollapse,
];

/**
 * Transforms an array of Game classes into standard game manifest descriptors.
 */
function buildGameList(classes) {
    return classes.map((GameClass) => ({
        ...GameClass.manifest,
        class: GameClass,
    }));
}

export let GAME_LIST = buildGameList(REGISTERED_GAMES);

/**
 * Registers a new minigame dynamically into the stadium registry.
 * @param {Class} GameClass Subclass of BaseGame with static get manifest()
 */
export function registerGame(GameClass) {
    if (!GameClass || !GameClass.manifest || !GameClass.manifest.id) {
        console.error("[GameRegistry] Cannot register game: missing manifest.id");
        return;
    }
    const exists = REGISTERED_GAMES.some((g) => g.manifest.id === GameClass.manifest.id);
    if (!exists) {
        REGISTERED_GAMES.push(GameClass);
        GAME_LIST = buildGameList(REGISTERED_GAMES);
    }
}

/**
 * Retrieves a registered game configuration by manifest ID.
 * @param {string} id The unique identifier of the minigame
 */
export function getGameById(id) {
    return GAME_LIST.find((g) => g.id === id) || null;
}
