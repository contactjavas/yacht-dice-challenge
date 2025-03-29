import {
	users,
	games,
	players,
	rounds,
	scoreCards,
	type User,
	type Game,
	type Player,
	type Round,
	type ScoreCard,
	type InsertUser,
	type InsertGame,
	type InsertPlayer,
	type InsertRound,
	type InsertScoreCard,
} from "@shared/schema";
import { ScoreCategory } from "@shared/types";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
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
	getPlayerByGameAndUser(
		gameId: number,
		userId: number,
	): Promise<Player | undefined>;
	updatePlayer(
		id: number,
		updates: Partial<Player>,
	): Promise<Player | undefined>;

	// Round operations
	createRound(round: InsertRound): Promise<Round>;
	getRoundsByGameId(gameId: number): Promise<Round[]>;
	getRoundsByPlayerId(playerId: number): Promise<Round[]>;
	updateRound(id: number, updates: Partial<Round>): Promise<Round | undefined>;

	// ScoreCard operations
	createScoreCard(scoreCard: InsertScoreCard): Promise<ScoreCard>;
	getScoreCardByPlayerId(playerId: number): Promise<ScoreCard | undefined>;
	updateScoreCard(
		playerId: number,
		category: ScoreCategory,
		score: number,
	): Promise<ScoreCard | undefined>;
}

// DatabaseStorage implementation
export class DatabaseStorage implements IStorage {
	async getUser(id: number): Promise<User | undefined> {
		const [user] = await db.select().from(users).where(eq(users.id, id));
		return user || undefined;
	}

	async getUserByUsername(username: string): Promise<User | undefined> {
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.username, username));
		return user || undefined;
	}

	async createUser(insertUser: InsertUser): Promise<User> {
		const [user] = await db.insert(users).values(insertUser).returning();
		return user;
	}

	async createGame(game: InsertGame): Promise<Game> {
		// Generate a unique code if not provided
		const code = game.code || nanoid(6).toUpperCase();

		const [newGame] = await db
			.insert(games)
			.values({
				...game,
				code,
				currentRound: 1,
				maxRounds: 12,
				currentPlayerId: null,
			})
			.returning();
		return newGame;
	}

	async getGame(id: number): Promise<Game | undefined> {
		const [game] = await db.select().from(games).where(eq(games.id, id));
		return game || undefined;
	}

	async getGameByCode(code: string): Promise<Game | undefined> {
		const [game] = await db.select().from(games).where(eq(games.code, code));
		return game || undefined;
	}

	async updateGame(
		id: number,
		updates: Partial<Game>,
	): Promise<Game | undefined> {
		const [updatedGame] = await db
			.update(games)
			.set(updates)
			.where(eq(games.id, id))
			.returning();
		return updatedGame || undefined;
	}

	async createPlayer(player: InsertPlayer): Promise<Player> {
		const [newPlayer] = await db
			.insert(players)
			.values({
				...player,
				score: 0,
				isReady: false,
				disconnected: false,
			})
			.returning();
		return newPlayer;
	}

	async getPlayer(id: number): Promise<Player | undefined> {
		const [player] = await db.select().from(players).where(eq(players.id, id));
		return player || undefined;
	}

	async getPlayersByGameId(gameId: number): Promise<Player[]> {
		return await db.select().from(players).where(eq(players.gameId, gameId));
	}

	async getPlayerByGameAndUser(
		gameId: number,
		userId: number,
	): Promise<Player | undefined> {
		const [player] = await db
			.select()
			.from(players)
			.where(and(eq(players.gameId, gameId), eq(players.userId, userId)));
		return player || undefined;
	}

	async updatePlayer(
		id: number,
		updates: Partial<Player>,
	): Promise<Player | undefined> {
		const [updatedPlayer] = await db
			.update(players)
			.set(updates)
			.where(eq(players.id, id))
			.returning();
		return updatedPlayer || undefined;
	}

	async createRound(round: InsertRound): Promise<Round> {
		const [newRound] = await db
			.insert(rounds)
			.values({
				...round,
				score: 0,
			})
			.returning();
		return newRound;
	}

	async getRoundsByGameId(gameId: number): Promise<Round[]> {
		return await db.select().from(rounds).where(eq(rounds.gameId, gameId));
	}

	async getRoundsByPlayerId(playerId: number): Promise<Round[]> {
		return await db.select().from(rounds).where(eq(rounds.playerId, playerId));
	}

	async updateRound(
		id: number,
		updates: Partial<Round>,
	): Promise<Round | undefined> {
		const [updatedRound] = await db
			.update(rounds)
			.set(updates)
			.where(eq(rounds.id, id))
			.returning();
		return updatedRound || undefined;
	}

	async createScoreCard(scoreCard: InsertScoreCard): Promise<ScoreCard> {
		const [newScoreCard] = await db
			.insert(scoreCards)
			.values(scoreCard)
			.returning();
		return newScoreCard;
	}

	async getScoreCardByPlayerId(
		playerId: number,
	): Promise<ScoreCard | undefined> {
		const [scoreCard] = await db
			.select()
			.from(scoreCards)
			.where(eq(scoreCards.playerId, playerId));
		return scoreCard || undefined;
	}

	async updateScoreCard(
		playerId: number,
		category: ScoreCategory,
		score: number,
	): Promise<ScoreCard | undefined> {
		const [scoreCard] = await db
			.select()
			.from(scoreCards)
			.where(eq(scoreCards.playerId, playerId));

		if (!scoreCard) return undefined;

		const [updatedScoreCard] = await db
			.update(scoreCards)
			.set({ [category]: score })
			.where(eq(scoreCards.id, scoreCard.id))
			.returning();

		return updatedScoreCard || undefined;
	}
}

export const storage = new DatabaseStorage();
