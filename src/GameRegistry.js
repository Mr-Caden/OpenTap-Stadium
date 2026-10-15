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
];

export const GAME_LIST = REGISTERED_GAMES.map((GameClass) => ({
    ...GameClass.manifest,
    class: GameClass,
}));
