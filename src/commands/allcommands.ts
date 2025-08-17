import { ROUND_COMMAND } from './utilities/round.js';
import { TEST_COMMAND } from './utilities/test.js';
import { TOURNAMENT_COMMAND } from "./utilities/tournament.js";
import {IN_COMMAND} from "./utilities/in.js";
import {OUT_COMMAND} from "./utilities/out.js";
import {PLAYER_COMMAND} from "./utilities/player.js";

export default [
    TEST_COMMAND,
    ROUND_COMMAND,
    TOURNAMENT_COMMAND,
    IN_COMMAND,
    OUT_COMMAND,
    PLAYER_COMMAND,
] as const;
