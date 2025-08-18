import axios from "axios";
import * as dotenv from "dotenv";
import {
  ApiConfig,
  createConfig,
  PairingRepository,
  PlayerRepository,
  RoundRepository,
  TournamentRepository,
} from "@fullrestore/service";

dotenv.config();
axios.defaults.baseURL = process.env.API_BASEURL || "http://localhost:3000";
axios.defaults.headers.common["Authorization"] = `Bearer ${process.env.API_TOKEN}`;
axios.defaults.headers.common["x-api-key"] = process.env.API_KEY as string;

export const apiConfig: ApiConfig = createConfig({
  baseUrl: axios.defaults.baseURL,
  apiKey: process.env.API_KEY,
  formatsEndpoint: process.env.API_FORMATS_ENDPOINT,
  playersEndpoint: process.env.API_PLAYERS_ENDPOINT,
  playerAliasesEndpoint: process.env.API_PLAYER_ALIASES_ENDPOINT,
  tournamentsEndpoint: process.env.API_TOURNAMENTS_ENDPOINT,
  roundsEndpoint: process.env.API_ROUNDS_ENDPOINT,
  roundByesEndpoint: process.env.API_ROUND_BYES_ENDPOINT,
  entrantPlayersEndpoint: process.env.API_ENTRANT_PLAYERS_ENDPOINT,
  pairingsEndpoint: process.env.API_PAIRINGS_ENDPOINT,
  replaysEndpoint: process.env.API_REPLAYS_ENDPOINT,
  timeout: 10000,
});

export const tournamentRepo: TournamentRepository = new TournamentRepository(apiConfig);
export const roundRepo: RoundRepository = new RoundRepository(apiConfig);
export const playerRepo: PlayerRepository = new PlayerRepository(apiConfig);
export const pairingRepo: PairingRepository = new PairingRepository(apiConfig);
