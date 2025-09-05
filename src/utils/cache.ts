import axios from "axios";

export async function warmRoundCache(tournamentSlug: string, roundNumber: number) {
    try {
        await axios.post((process.env.API_CLIENTURL ?? 'https://fullrestore.me') + '/api/rounds', {
            tournamentSlug: tournamentSlug,
            roundNumber: roundNumber,
            action: 'warm',
        });
    } catch (e) {
        throw e;
    }
}