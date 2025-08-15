import { ROUND_COMMAND } from './utilities/round.js';
import { TEST_COMMAND } from './utilities/test.js';
import { TOURNAMENT_COMMAND } from "./utilities/tournament.js";

console.log([TEST_COMMAND, ROUND_COMMAND, TOURNAMENT_COMMAND]);

export default [TEST_COMMAND, ROUND_COMMAND, TOURNAMENT_COMMAND] as const;
