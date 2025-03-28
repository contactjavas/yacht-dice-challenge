import { 
  users, games, players, rounds, scoreCards,
  type User, type Game, type Player, type Round, type ScoreCard,
  type InsertUser, type InsertGame, type InsertPlayer, type InsertRound, type InsertScoreCard
} from "@shared/schema";
import { ScoreCategory } from "@shared/types";
import { nanoid } from "nanoid";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Game operations
  createGame(game: InsertGame): Promise<Game>;
  getGame(id: number): Promise<Game | undefined>;
  getGameByCode(code: string): Promise<Game | undefined>;
  updateGame(id: number, updates: Partial<Game>): Promise<Game | undefined>;
  
  // Player operations
  createPlayer(player: InsertPlayer): Promise<Player>;
  getPlayer(id: number): Promise<Player | undefined>;
  getPlayersByGameId(gameId: number): Promise<Player[]>;
  getPlayerByGameAndUser(gameId: number, userId: number): Promise<Player | undefined>;
  updatePlayer(id: number, updates: Partial<Player>): Promise<Player | undefined>;
  
  // Round operations
  createRound(round: InsertRound): Promise<Round>;
  getRoundsByGameId(gameId: number): Promise<Round[]>;
  getRoundsByPlayerId(playerId: number): Promise<Round[]>;
  updateRound(id: number, updates: Partial<Round>): Promise<Round | undefined>;
  
  // ScoreCard operations
  createScoreCard(scoreCard: InsertScoreCard): Promise<ScoreCard>;
  getScoreCardByPlayerId(playerId: number): Promise<ScoreCard | undefined>;
  updateScoreCard(playerId: number, category: ScoreCategory, score: number): Promise<ScoreCard | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private games: Map<number, Game>;
  private players: Map<number, Player>;
  private rounds: Map<number, Round>;
  private scoreCards: Map<number, ScoreCard>;
  
  private userId: number;
  private gameId: number;
  private playerId: number;
  private roundId: number;
  private scoreCardId: number;

  constructor() {
    this.users = new Map();
    this.games = new Map();
    this.players = new Map();
    this.rounds = new Map();
    this.scoreCards = new Map();
    
    this.userId = 1;
    this.gameId = 1;
    this.playerId = 1;
    this.roundId = 1;
    this.scoreCardId = 1;
  }

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userId++;
    const createdAt = new Date().toISOString();
    const user: User = { ...insertUser, id, createdAt };
    this.users.set(id, user);
    return user;
  }
  
  // Game operations
  async createGame(game: InsertGame): Promise<Game> {
    const id = this.gameId++;
    const createdAt = new Date().toISOString();
    // Generate a unique code if not provided
    const code = game.code || nanoid(6).toUpperCase();
    
    const newGame: Game = { 
      ...game, 
      id, 
      code, 
      createdAt, 
      currentRound: 1, 
      maxRounds: 12, 
      currentPlayerId: null,
      status: 'waiting'
    };
    
    this.games.set(id, newGame);
    return newGame;
  }
  
  async getGame(id: number): Promise<Game | undefined> {
    return this.games.get(id);
  }
  
  async getGameByCode(code: string): Promise<Game | undefined> {
    return Array.from(this.games.values()).find(
      (game) => game.code === code,
    );
  }
  
  async updateGame(id: number, updates: Partial<Game>): Promise<Game | undefined> {
    const game = this.games.get(id);
    if (!game) return undefined;
    
    const updatedGame = { ...game, ...updates };
    this.games.set(id, updatedGame);
    return updatedGame;
  }
  
  // Player operations
  async createPlayer(player: InsertPlayer): Promise<Player> {
    const id = this.playerId++;
    const createdAt = new Date().toISOString();
    
    const newPlayer: Player = {
      ...player,
      id,
      createdAt,
      score: 0,
      isReady: false,
      disconnected: false
    };
    
    this.players.set(id, newPlayer);
    return newPlayer;
  }
  
  async getPlayer(id: number): Promise<Player | undefined> {
    return this.players.get(id);
  }
  
  async getPlayersByGameId(gameId: number): Promise<Player[]> {
    return Array.from(this.players.values()).filter(
      (player) => player.gameId === gameId,
    );
  }
  
  async getPlayerByGameAndUser(gameId: number, userId: number): Promise<Player | undefined> {
    return Array.from(this.players.values()).find(
      (player) => player.gameId === gameId && player.userId === userId,
    );
  }
  
  async updatePlayer(id: number, updates: Partial<Player>): Promise<Player | undefined> {
    const player = this.players.get(id);
    if (!player) return undefined;
    
    const updatedPlayer = { ...player, ...updates };
    this.players.set(id, updatedPlayer);
    return updatedPlayer;
  }
  
  // Round operations
  async createRound(round: InsertRound): Promise<Round> {
    const id = this.roundId++;
    const createdAt = new Date().toISOString();
    
    const newRound: Round = {
      ...round,
      id,
      createdAt,
      score: 0
    };
    
    this.rounds.set(id, newRound);
    return newRound;
  }
  
  async getRoundsByGameId(gameId: number): Promise<Round[]> {
    return Array.from(this.rounds.values()).filter(
      (round) => round.gameId === gameId,
    );
  }
  
  async getRoundsByPlayerId(playerId: number): Promise<Round[]> {
    return Array.from(this.rounds.values()).filter(
      (round) => round.playerId === playerId,
    );
  }
  
  async updateRound(id: number, updates: Partial<Round>): Promise<Round | undefined> {
    const round = this.rounds.get(id);
    if (!round) return undefined;
    
    const updatedRound = { ...round, ...updates };
    this.rounds.set(id, updatedRound);
    return updatedRound;
  }
  
  // ScoreCard operations
  async createScoreCard(scoreCard: InsertScoreCard): Promise<ScoreCard> {
    const id = this.scoreCardId++;
    const createdAt = new Date().toISOString();
    
    const newScoreCard: ScoreCard = {
      ...scoreCard,
      id,
      createdAt
    };
    
    this.scoreCards.set(id, newScoreCard);
    return newScoreCard;
  }
  
  async getScoreCardByPlayerId(playerId: number): Promise<ScoreCard | undefined> {
    return Array.from(this.scoreCards.values()).find(
      (scoreCard) => scoreCard.playerId === playerId,
    );
  }
  
  async updateScoreCard(playerId: number, category: ScoreCategory, score: number): Promise<ScoreCard | undefined> {
    const scoreCard = Array.from(this.scoreCards.values()).find(
      (sc) => sc.playerId === playerId,
    );
    
    if (!scoreCard) return undefined;
    
    const updatedScoreCard = { ...scoreCard, [category]: score };
    this.scoreCards.set(scoreCard.id, updatedScoreCard);
    return updatedScoreCard;
  }
}

export const storage = new MemStorage();
