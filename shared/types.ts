export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;
export type DiceRoll = DiceValue[];

export enum ScoreCategory {
  ONES = 'ones',
  TWOS = 'twos',
  THREES = 'threes',
  FOURS = 'fours',
  FIVES = 'fives',
  SIXES = 'sixes',
  THREE_OF_A_KIND = 'threeOfAKind',
  FOUR_OF_A_KIND = 'fourOfAKind',
  FULL_HOUSE = 'fullHouse',
  SMALL_STRAIGHT = 'smallStraight',
  LARGE_STRAIGHT = 'largeStraight',
  YACHT = 'yacht',
  CHANCE = 'chance'
}

export type ScoreCardDisplay = {
  [key in ScoreCategory]?: number;
};

export interface PlayerState {
  id: number;
  userId: number;
  username: string;
  score: number;
  turnOrder: number;
  isReady: boolean;
  isHost: boolean;
  isCurrentTurn: boolean;
  disconnected: boolean;
  scoreCard: ScoreCardDisplay;
}

export interface GameState {
  id: number;
  code: string;
  hostId: number;
  status: 'waiting' | 'in_progress' | 'completed';
  currentPlayerId: number | null;
  currentRound: number;
  maxRounds: number;
  players: PlayerState[];
  currentDice: DiceRoll;
  rollsLeft: number;
  selectedDice: boolean[];
  turnTimer: number;
}

export type WebSocketMessage = {
  type: string;
  payload?: any;
};

export interface GameAction {
  gameId?: number;
  playerId?: number;
  action: string;
  data?: any;
}
