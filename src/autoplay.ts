import * as AI from './ai';
import { Game, type NewGameConfig } from './engine';
import type { Personality } from './types';

/**
 * Headless driver: plays a game with no UI, resolving every modal via ai.ts.
 *
 * The original supported all-computer games, so this is a real mode rather than only a
 * test harness. It is also how the engine gets exercised without a browser.
 */

export interface AutoplayResult {
  turns: number;
  winner: number | null;
  crashed: boolean;
  finalStock: number;
  players: Array<{ name: string; rank: number; bossRating: number; personality: Personality | null }>;
  log: string[];
}

export function autoplay(config: NewGameConfig, maxTurns = 400): AutoplayResult {
  const game = new Game(config);

  let guard = 0;
  const guardLimit = maxTurns * config.seats.filter((s) => s.kind !== 'off').length * 40;

  while (game.state.phase !== 'gameOver' && game.state.turn <= maxTurns) {
    if (++guard > guardLimit) throw new Error('autoplay failed to converge — possible stuck state');

    const m = game.state.modal;
    if (m) {
      resolveHeadless(game, m);
      continue;
    }

    if (game.turnComplete()) {
      game.endTurn();
      continue;
    }

    const p = game.active;
    const offer = AI.decideProposeTrade(game, p.id);
    if (offer) {
      if (AI.decideAcceptTrade(game, offer.toId, p.id, offer.give, offer.want)) {
        game.executeTrade(p.id, offer.toId, offer.give, offer.want);
      } else {
        game.declineTrade(p.id, offer.toId);
      }
    }
    game.roll();
  }

  return {
    turns: game.state.turn,
    winner: game.state.winner,
    crashed: game.state.crashed,
    finalStock: game.state.stock,
    players: game.state.players.map((p) => ({
      name: p.name,
      rank: p.rank,
      bossRating: p.bossRating,
      personality: p.personality,
    })),
    log: game.state.log.map((l) => l.text),
  };
}

function resolveHeadless(game: Game, m: NonNullable<Game['state']['modal']>): void {
  switch (m.kind) {
    case 'takeProject': {
      const accept = AI.decideTakeProject(game, m.playerId, m.projectId);
      game.state.modal = null;
      if (accept) game.takeProject(m.projectId, m.playerId);
      game.finishWork({ landedOnOther: false, ownProject: accept ? m.projectId : null });
      break;
    }
    case 'chance': {
      game.state.modal = null;
      game.applyChance(m.cardId, m.playerId);
      break;
    }
    case 'scruples': {
      const choice = AI.decideScruples(game, m.playerId, m.cardId);
      game.state.modal = null;
      game.applyScruples(m.cardId, m.playerId, choice);
      break;
    }
    case 'meeting': {
      game.state.modal = null;
      game.applyMeeting(m.playerId, m.delta);
      break;
    }
    case 'officeParty': {
      game.state.modal = null;
      game.finishWork({ landedOnOther: false, ownProject: null });
      break;
    }
    case 'powerMonger': {
      let left = m.actionsLeft;
      while (left-- > 0) {
        const action = AI.decidePowerMonger(game, m.playerId);
        if (action.kind === 'cancel' && action.projectId !== undefined) {
          game.cancelProject(action.projectId, m.playerId);
        } else if (action.kind === 'assign' && action.projectId !== undefined) {
          game.assignProject(action.projectId, action.targetId ?? m.playerId, m.playerId);
        }
      }
      game.state.modal = null;
      game.finishWork({ landedOnOther: false, ownProject: null });
      break;
    }
    case 'rankChange': {
      // Informational only; the square that triggered it still resolves.
      game.state.modal = null;
      break;
    }
    case 'trade': {
      game.state.modal = null;
      break;
    }
    case 'gameOver':
      return;
    default:
      game.state.modal = null;
  }
}
