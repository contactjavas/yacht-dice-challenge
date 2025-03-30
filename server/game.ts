import {
	DiceRoll,
	ScoreCategory,
	GameState,
	PlayerState,
	DiceValue,
} from "@shared/types";
import { storage } from "./storage";
import { User, Game, Player, ScoreCard } from "@shared/schema";
import { DiceRoll as DiceRollerRoll } from "@dice-roller/rpg-dice-roller";
import { WebSocket } from "ws";

// Number of rolls allowed per turn
const MAX_ROLLS_PER_TURN = 3;
// Timer duration in seconds
const TURN_TIMER_DURATION = 60;

export class GameManager {
	private games: Map<number, GameState> = new Map();
	private playerConnections: Map<number, Set<WebSocket>> = new Map();
	private turnTimers: Map<number, NodeJS.Timeout> = new Map();

	constructor() {}

	// Initialize a game state when created or loaded
	async initializeGameState(game: Game): Promise<GameState> {
		const players = await storage.getPlayersByGameId(game.id);
		const playerStates: PlayerState[] = [];

		for (const player of players) {
			const user = await storage.getUser(player.userId);
			if (!user) continue;

			const scoreCard = await storage.getScoreCardByPlayerId(player.id);

			playerStates.push({
				id: player.id,
				userId: user.id,
				username: user.username,
				score: player.score || 0,
				turnOrder: player.turnOrder || 1,
				isReady: player.isReady || false,
				isHost: player.userId === game.hostId,
				isCurrentTurn: game.currentPlayerId === player.id,
				disconnected: player.disconnected || false,
				scoreCard: scoreCard ? this.formatScoreCard(scoreCard) : {},
			});
		}

		console.log("GameManager.initializeGameState - players:", players);

		const gameState: GameState = {
			id: game.id,
			code: game.code,
			hostId: game.hostId,
			status: game.status || "waiting",
			currentPlayerId: game.currentPlayerId || 0,
			currentRound: game.currentRound || 1,
			maxRounds: game.maxRounds || 12,
			players: playerStates,
			currentDice: [1, 1, 1, 1, 1],
			rollsLeft: MAX_ROLLS_PER_TURN,
			selectedDice: [false, false, false, false, false],
			turnTimer: TURN_TIMER_DURATION,
		};

		this.games.set(game.id, gameState);
		return gameState;
	}

	// Get game state
	getGameState(gameId: number): GameState | undefined {
		return this.games.get(gameId);
	}

	// Format score card for client display
	private formatScoreCard(
		scoreCard: ScoreCard,
	): Record<ScoreCategory, number | undefined> {
		return {
			[ScoreCategory.ONES]: scoreCard.ones || undefined,
			[ScoreCategory.TWOS]: scoreCard.twos || undefined,
			[ScoreCategory.THREES]: scoreCard.threes || undefined,
			[ScoreCategory.FOURS]: scoreCard.fours || undefined,
			[ScoreCategory.FIVES]: scoreCard.fives || undefined,
			[ScoreCategory.SIXES]: scoreCard.sixes || undefined,
			[ScoreCategory.THREE_OF_A_KIND]: scoreCard.threeOfAKind || undefined,
			[ScoreCategory.FOUR_OF_A_KIND]: scoreCard.fourOfAKind || undefined,
			[ScoreCategory.FULL_HOUSE]: scoreCard.fullHouse || undefined,
			[ScoreCategory.SMALL_STRAIGHT]: scoreCard.smallStraight || undefined,
			[ScoreCategory.LARGE_STRAIGHT]: scoreCard.largeStraight || undefined,
			[ScoreCategory.YACHT]: scoreCard.yacht || undefined,
			[ScoreCategory.CHANCE]: scoreCard.chance || undefined,
		};
	}

	// Create a new game
	async createGame(hostId: number): Promise<GameState | undefined> {
		try {
			console.log("GameManager.createGame - hostId:", hostId);

			const host = await storage.getUser(hostId);
			console.log("GameManager.createGame - host lookup result:", host);

			if (!host) {
				console.log("GameManager.createGame - host not found");
				return undefined;
			}

			console.log("GameManager.createGame - generating game code");
			const gameCode = this.generateGameCode();
			console.log("GameManager.createGame - game code generated:", gameCode);

			console.log("GameManager.createGame - creating game record");
			const game = await storage.createGame({
				code: gameCode,
				hostId: host.id,
				status: "waiting",
			});
			console.log("GameManager.createGame - game created:", game);

			// Add host as the first player
			console.log("GameManager.createGame - adding host as player");
			const player = await storage.createPlayer({
				gameId: game.id,
				userId: host.id,
				turnOrder: 1,
			});
			console.log("GameManager.createGame - player created:", player);

			// Create empty score card for the player
			console.log("GameManager.createGame - creating score card");
			await storage.createScoreCard({
				playerId: player.id,
				gameId: game.id,
			});
			console.log("GameManager.createGame - score card created");

			console.log("GameManager.createGame - initializing game state");
			const gameState = await this.initializeGameState(game);
			console.log("GameManager.createGame - game state initialized");

			return gameState;
		} catch (error) {
			console.error("Error creating game:", error);
			return undefined;
		}
	}

	// Join an existing game
	async joinGame(
		gameCode: string,
		userId: number,
	): Promise<GameState | undefined> {
		console.log("GameManager.joinGame - parameters:", { gameCode, userId });

		try {
			const game = await storage.getGameByCode(gameCode);

			if (!game) {
				console.error("GameManager.joinGame - error: game not found");
				return undefined;
			}

			// Check if game is joinable
			if (game.status !== "waiting" && game.status !== "in_progress") {
				console.error(
					`GameManager.joinGame - error: game not joinable because the game is not in "waiting" status. Currently the game status is: "${game.status}"`,
				);
				return undefined;
			}

			// Check if player already in the game
			const existingPlayer = await storage.getPlayerByGameAndUser(
				game.id,
				userId,
			);

			if (existingPlayer) {
				// Update player as connected
				await storage.updatePlayer(existingPlayer.id, { disconnected: false });
				const gameState = await this.initializeGameState(game);
				return gameState;
			}

			// Get current player count to determine turn order
			const players = await storage.getPlayersByGameId(game.id);
			const turnOrder = players.length + 1;

			// Add new player
			const player = await storage.createPlayer({
				gameId: game.id,
				userId,
				turnOrder,
			});

			// Create empty score card for the player
			await storage.createScoreCard({
				playerId: player.id,
				gameId: game.id,
			});

			const gameState = await this.initializeGameState(game);
			return gameState;
		} catch (error) {
			console.error("Error joining game:", error);
			return undefined;
		}
	}

	// Start a game (now supports single-player)
	async startGame(
		gameId: number,
		hostId: number,
	): Promise<GameState | undefined> {
		try {
			console.log(`Starting game ${gameId} requested by host ${hostId}`);
			const game = await storage.getGame(gameId);
			if (!game) {
				console.error("Game not found:", gameId);
				return undefined;
			}

			// Verify it's the host
			if (game.hostId !== hostId) {
				console.error("Only the host can start the game");
				return undefined;
			}

			// Get players for this game
			const players = await storage.getPlayersByGameId(game.id);
			console.log(`Found ${players.length} players for game ${gameId}`);

			// Require at least one player (the host)
			if (players.length === 0) {
				console.error("No players found for game", gameId);
				return undefined;
			}

			// Sort players by turn order
			players.sort((a, b) => a.turnOrder - b.turnOrder);

			// Set first player as the current player
			const firstPlayer = players[0];

			console.log(
				`Setting first player: ${firstPlayer.id} (user ${firstPlayer.userId})`,
			);

			// Log single player mode if detected
			if (players.length === 1) {
				console.log("Starting game in SINGLE PLAYER MODE for testing/practice");
			}

			console.log(`Updating game ${gameId} status to 'in_progress'`);

			const updatedGame = await storage.updateGame(game.id, {
				status: "in_progress",
				currentPlayerId: firstPlayer.id,
			});

			if (!updatedGame) {
				console.error("Failed to update game status");
				return undefined;
			}

			console.log(`Game ${gameId} started successfully`);
			const gameState = await this.initializeGameState(updatedGame);

			// Start turn timer
			this.startTurnTimer(gameId);

			// Broadcast the game update to all connected players
			this.broadcastGameUpdate(gameId);

			return gameState;
		} catch (error) {
			console.error("Error starting game:", error);
			return undefined;
		}
	}

	// Roll dice for a player
	async rollDice(
		gameId: number,
		playerId: number,
		selectedIndices: boolean[],
	): Promise<GameState | undefined> {
		try {
			const gameState = this.games.get(gameId);
			if (!gameState) return undefined;

			// Verify it's player's turn and they have rolls left
			if (gameState.currentPlayerId !== playerId || gameState.rollsLeft <= 0)
				return undefined;

			// Generate new dice values using dice-roller
			try {
				const diceRoller = new DiceRollerRoll("5d6");

				// Type assertion to access the rolls property safely
				const diceRollerAny = diceRoller as any;
				if (
					!diceRollerAny.rolls ||
					!Array.isArray(diceRollerAny.rolls) ||
					diceRollerAny.rolls.length === 0
				) {
					console.error("Invalid dice roller structure:", diceRoller);
					throw new Error("Failed to generate valid dice roll");
				}

				const rollResults = diceRollerAny.rolls[0];
				if (!rollResults || !Array.isArray(rollResults.rolls)) {
					console.error("Invalid dice roll results structure:", rollResults);
					throw new Error("Failed to generate valid dice roll");
				}

				// Extract the dice values with proper type checking
				const newDiceValues: DiceValue[] = [];
				for (let i = 0; i < 5; i++) {
					const roll = rollResults.rolls[i];
					if (roll && typeof roll.value === "number") {
						// Ensure the value is a valid DiceValue (1-6)
						const value = roll.value;
						if (value >= 1 && value <= 6) {
							newDiceValues.push(value as DiceValue);
						} else {
							// Fallback to a random valid DiceValue if out of range
							newDiceValues.push(
								(Math.floor(Math.random() * 6) + 1) as DiceValue,
							);
						}
					} else {
						// Fallback to a random valid DiceValue if the roll is invalid
						newDiceValues.push(
							(Math.floor(Math.random() * 6) + 1) as DiceValue,
						);
					}
				}

				// Apply selected dice (keep the selected ones, roll the others)
				const currentDice = [...gameState.currentDice];
				for (let i = 0; i < 5; i++) {
					if (!selectedIndices[i]) {
						currentDice[i] = newDiceValues[i];
					}
				}

				// Update game state
				gameState.currentDice = currentDice;
				gameState.rollsLeft--;
				gameState.selectedDice = [false, false, false, false, false];

				// Update the game in our map
				this.games.set(gameId, gameState);

				// Reset turn timer
				this.resetTurnTimer(gameId);

				return gameState;
			} catch (error) {
				console.error("Error rolling dice:", error);

				// Fallback to simple random dice if the dice-roller fails
				const currentDice = [...gameState.currentDice];
				for (let i = 0; i < 5; i++) {
					if (!selectedIndices[i]) {
						// Ensure we use a valid DiceValue
						currentDice[i] = (Math.floor(Math.random() * 6) + 1) as DiceValue;
					}
				}

				// Update game state
				gameState.currentDice = currentDice;
				gameState.rollsLeft--;
				gameState.selectedDice = [false, false, false, false, false];

				// Update the game in our map
				this.games.set(gameId, gameState);

				// Reset turn timer
				this.resetTurnTimer(gameId);

				return gameState;
			}
		} catch (error) {
			console.error("Error in rollDice method:", error);
			return undefined;
		}
	}

	// Select dice to keep
	async selectDice(
		gameId: number,
		playerId: number,
		diceIndices: number[],
	): Promise<GameState | undefined> {
		const gameState = this.games.get(gameId);
		if (!gameState) return undefined;

		// Verify it's player's turn
		if (gameState.currentPlayerId !== playerId) return undefined;

		// Update selected dice
		const selectedDice = [false, false, false, false, false];
		diceIndices.forEach((index) => {
			if (index >= 0 && index < 5) {
				selectedDice[index] = true;
			}
		});

		gameState.selectedDice = selectedDice;
		this.games.set(gameId, gameState);
		return gameState;
	}

	// Score current dice in a category
	async scoreCategory(
		gameId: number,
		playerId: number,
		category: ScoreCategory,
	): Promise<GameState | undefined> {
		try {
			const gameState = this.games.get(gameId);
			if (!gameState) return undefined;

			// Verify it's player's turn
			if (gameState.currentPlayerId !== playerId) return undefined;

			// Get player's score card
			const player = gameState.players.find((p) => p.id === playerId);
			if (!player) return undefined;

			// Check if category already scored
			if (player.scoreCard[category] !== undefined) return undefined;

			// Calculate score
			const score = this.calculateScore(gameState.currentDice, category);

			// Update score card
			await storage.updateScoreCard(playerId, category, score);

			// Update player's total score
			const updatedPlayer = await storage.updatePlayer(playerId, {
				score: (player.score || 0) + score,
			});

			if (!updatedPlayer) return undefined;

			// Update last round with category and score
			const rounds = await storage.getRoundsByPlayerId(playerId);
			const lastRound = rounds.sort((a, b) => b.id - a.id)[0];
			if (lastRound) {
				await storage.updateRound(lastRound.id, {
					category,
					score,
				});
			}

			// Check if game is complete
			const isGameComplete = await this.checkGameCompletion(gameId);

			if (isGameComplete) {
				// Update game as completed
				await storage.updateGame(gameId, {
					status: "completed",
				});

				// Clear turn timer
				this.clearTurnTimer(gameId);

				// Refresh game state
				const game = await storage.getGame(gameId);
				if (game) {
					const updatedGameState = await this.initializeGameState(game);
					return updatedGameState;
				}
			} else {
				// Move to next player
				const nextPlayer = await this.getNextPlayer(gameId, player.turnOrder);

				if (nextPlayer) {
					await storage.updateGame(gameId, {
						currentPlayerId: nextPlayer.id,
					});

					// Check if we need to advance to next round
					if (nextPlayer.turnOrder === 1) {
						const game = await storage.getGame(gameId);
						if (game) {
							await storage.updateGame(gameId, {
								currentRound: (game.currentRound || 1) + 1,
							});
						}
					}
				}

				// Reset dice and rolls for next player
				gameState.currentDice = [1, 1, 1, 1, 1];
				gameState.rollsLeft = MAX_ROLLS_PER_TURN;
				gameState.selectedDice = [false, false, false, false, false];

				// Reset turn timer
				this.resetTurnTimer(gameId);
			}

			// Refresh game state
			const game = await storage.getGame(gameId);
			if (game) {
				const updatedGameState = await this.initializeGameState(game);
				return updatedGameState;
			}

			return undefined;
		} catch (error) {
			console.error("Error scoring category:", error);
			return undefined;
		}
	}

	// Calculate score for dice in a category
	private calculateScore(dice: DiceRoll, category: ScoreCategory): number {
		const counts = [0, 0, 0, 0, 0, 0];

		// Count occurrences of each value
		dice.forEach((value) => {
			counts[value - 1]++;
		});

		switch (category) {
			case ScoreCategory.ONES:
				return counts[0] * 1;
			case ScoreCategory.TWOS:
				return counts[1] * 2;
			case ScoreCategory.THREES:
				return counts[2] * 3;
			case ScoreCategory.FOURS:
				return counts[3] * 4;
			case ScoreCategory.FIVES:
				return counts[4] * 5;
			case ScoreCategory.SIXES:
				return counts[5] * 6;
			case ScoreCategory.THREE_OF_A_KIND:
				return counts.some((count) => count >= 3)
					? dice.reduce((sum, value) => sum + value, 0)
					: 0;
			case ScoreCategory.FOUR_OF_A_KIND:
				return counts.some((count) => count >= 4)
					? dice.reduce((sum, value) => sum + value, 0)
					: 0;
			case ScoreCategory.FULL_HOUSE:
				return counts.includes(3) && counts.includes(2) ? 25 : 0;
			case ScoreCategory.SMALL_STRAIGHT: {
				// Check for 1-2-3-4 or 2-3-4-5 or 3-4-5-6
				if (
					(counts[0] && counts[1] && counts[2] && counts[3]) ||
					(counts[1] && counts[2] && counts[3] && counts[4]) ||
					(counts[2] && counts[3] && counts[4] && counts[5])
				) {
					return 30;
				}
				return 0;
			}
			case ScoreCategory.LARGE_STRAIGHT: {
				// Check for 1-2-3-4-5 or 2-3-4-5-6
				if (
					(counts[0] && counts[1] && counts[2] && counts[3] && counts[4]) ||
					(counts[1] && counts[2] && counts[3] && counts[4] && counts[5])
				) {
					return 40;
				}
				return 0;
			}
			case ScoreCategory.YACHT:
				return counts.includes(5) ? 50 : 0;
			case ScoreCategory.CHANCE:
				return dice.reduce((sum, value) => sum + value, 0);
			default:
				return 0;
		}
	}

	// Get next player in turn order
	private async getNextPlayer(
		gameId: number,
		currentTurnOrder: number,
	): Promise<Player | undefined> {
		const players = await storage.getPlayersByGameId(gameId);

		// Sort by turn order
		players.sort((a, b) => a.turnOrder - b.turnOrder);

		// Find index of current player
		const currentIndex = players.findIndex(
			(p) => p.turnOrder === currentTurnOrder,
		);

		if (currentIndex === -1) return undefined;

		// Find next player (wrapping around to beginning if needed)
		const nextIndex = (currentIndex + 1) % players.length;
		return players[nextIndex];
	}

	// Check if the game is complete
	private async checkGameCompletion(gameId: number): Promise<boolean> {
		try {
			const game = await storage.getGame(gameId);
			if (!game) return false;

			// Check if all categories are filled for all players
			const players = await storage.getPlayersByGameId(game.id);
			if (players.length === 0) return false;

			// Check if we've reached the max rounds
			const currentRound = game.currentRound || 1;
			const maxRounds = game.maxRounds || 12;

			if (currentRound > maxRounds) {
				return true;
			}

			// Check if all players have filled all categories
			for (const player of players) {
				const scoreCard = await storage.getScoreCardByPlayerId(player.id);
				if (!scoreCard) continue;

				// Check if all categories are filled
				const categories = [
					scoreCard.ones !== null && scoreCard.ones !== undefined,
					scoreCard.twos !== null && scoreCard.twos !== undefined,
					scoreCard.threes !== null && scoreCard.threes !== undefined,
					scoreCard.fours !== null && scoreCard.fours !== undefined,
					scoreCard.fives !== null && scoreCard.fives !== undefined,
					scoreCard.sixes !== null && scoreCard.sixes !== undefined,
					scoreCard.threeOfAKind !== null &&
						scoreCard.threeOfAKind !== undefined,
					scoreCard.fourOfAKind !== null && scoreCard.fourOfAKind !== undefined,
					scoreCard.fullHouse !== null && scoreCard.fullHouse !== undefined,
					scoreCard.smallStraight !== null &&
						scoreCard.smallStraight !== undefined,
					scoreCard.largeStraight !== null &&
						scoreCard.largeStraight !== undefined,
					scoreCard.yacht !== null && scoreCard.yacht !== undefined,
					scoreCard.chance !== null && scoreCard.chance !== undefined,
				];

				// If any category is not filled, game is not complete
				if (categories.some((c) => !c)) {
					return false;
				}
			}

			// If we got here, all players have filled all categories
			return true;
		} catch (error) {
			console.error("Error checking game completion:", error);
			return false;
		}
	}

	// Start a turn timer
	private startTurnTimer(gameId: number): void {
		// Clear any existing timer
		this.clearTurnTimer(gameId);

		const gameState = this.games.get(gameId);
		if (!gameState) return;

		gameState.turnTimer = TURN_TIMER_DURATION;

		const timer = setInterval(async () => {
			const gameState = this.games.get(gameId);
			if (!gameState) {
				this.clearTurnTimer(gameId);
				return;
			}

			gameState.turnTimer--;

			// Broadcast updated timer
			this.broadcastGameUpdate(gameId);

			// Check if time's up
			if (gameState.turnTimer <= 0) {
				this.clearTurnTimer(gameId);

				// Auto-pass turn
				const currentPlayer = gameState.players.find(
					(p) => p.id === gameState.currentPlayerId,
				);
				if (currentPlayer) {
					await this.passTurn(gameId, currentPlayer.id);
				}
			}
		}, 1000);

		this.turnTimers.set(gameId, timer);
	}

	// Reset the turn timer
	private resetTurnTimer(gameId: number): void {
		const gameState = this.games.get(gameId);
		if (!gameState) return;

		this.clearTurnTimer(gameId);
		this.startTurnTimer(gameId);
	}

	// Clear turn timer
	private clearTurnTimer(gameId: number): void {
		const timer = this.turnTimers.get(gameId);
		if (timer) {
			clearInterval(timer);
			this.turnTimers.delete(gameId);
		}
	}

	// Pass turn without scoring
	async passTurn(
		gameId: number,
		playerId: number,
	): Promise<GameState | undefined> {
		try {
			const gameState = this.games.get(gameId);
			if (!gameState) return undefined;

			// Verify it's player's turn
			if (gameState.currentPlayerId !== playerId) return undefined;

			const player = gameState.players.find((p) => p.id === playerId);
			if (!player) return undefined;

			// Move to next player
			const nextPlayer = await this.getNextPlayer(gameId, player.turnOrder);

			if (nextPlayer) {
				await storage.updateGame(gameId, {
					currentPlayerId: nextPlayer.id,
				});

				// Check if we need to advance to next round
				if (nextPlayer.turnOrder === 1) {
					const game = await storage.getGame(gameId);
					if (game) {
						await storage.updateGame(gameId, {
							currentRound: (game.currentRound || 1) + 1,
						});
					}
				}
			}

			// Reset dice and rolls for next player
			gameState.currentDice = [1, 1, 1, 1, 1];
			gameState.rollsLeft = MAX_ROLLS_PER_TURN;
			gameState.selectedDice = [false, false, false, false, false];

			// Reset turn timer
			this.resetTurnTimer(gameId);

			// Refresh game state
			const game = await storage.getGame(gameId);
			if (game) {
				const updatedGameState = await this.initializeGameState(game);
				return updatedGameState;
			}

			return undefined;
		} catch (error) {
			console.error("Error passing turn:", error);
			return undefined;
		}
	}

	// Mark player as ready
	async togglePlayerReady(
		gameId: number,
		playerId: number,
	): Promise<GameState | undefined> {
		try {
			const player = await storage.getPlayer(playerId);
			if (!player) return undefined;

			const updatedPlayer = await storage.updatePlayer(playerId, {
				isReady: !player.isReady,
			});

			if (!updatedPlayer) return undefined;

			// Refresh game state
			const game = await storage.getGame(gameId);
			if (game) {
				const updatedGameState = await this.initializeGameState(game);
				return updatedGameState;
			}

			return undefined;
		} catch (error) {
			console.error("Error toggling player ready:", error);
			return undefined;
		}
	}

	// Restart game for a rematch
	async restartGame(
		gameId: number,
		hostId: number,
	): Promise<GameState | undefined> {
		try {
			const game = await storage.getGame(gameId);
			if (!game) return undefined;

			// Verify it's the host
			if (game.hostId !== hostId) return undefined;

			// Reset game state
			const updatedGame = await storage.updateGame(gameId, {
				status: "waiting",
				currentPlayerId: null,
				currentRound: 1,
			});

			if (!updatedGame) return undefined;

			// Reset all players
			const players = await storage.getPlayersByGameId(gameId);
			for (const player of players) {
				await storage.updatePlayer(player.id, {
					score: 0,
					isReady: false,
				});

				// Create a new score card for the player
				await storage.createScoreCard({
					playerId: player.id,
					gameId: gameId,
				});
			}

			// Refresh game state
			const gameState = await this.initializeGameState(updatedGame);
			return gameState;
		} catch (error) {
			console.error("Error restarting game:", error);
			return undefined;
		}
	}

	// Generate unique game code
	private generateGameCode(): string {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		let code = "";
		for (let i = 0; i < 6; i++) {
			code += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return code;
	}

	// Register player connection
	registerPlayerConnection(playerId: number, socket: WebSocket): void {
		if (!this.playerConnections.has(playerId)) {
			this.playerConnections.set(playerId, new Set());
		}

		this.playerConnections.get(playerId)?.add(socket);
	}

	// Unregister player connection
	unregisterPlayerConnection(playerId: number, socket: WebSocket): void {
		const connections = this.playerConnections.get(playerId);
		if (connections) {
			connections.delete(socket);

			// If all connections are gone, mark player as disconnected
			if (connections.size === 0) {
				this.handlePlayerDisconnect(playerId);
			}
		}
	}

	// Handle player disconnect
	private async handlePlayerDisconnect(playerId: number): Promise<void> {
		try {
			const player = await storage.getPlayer(playerId);
			if (!player) return;

			// Mark player as disconnected
			await storage.updatePlayer(playerId, {
				disconnected: true,
			});

			// Get game and update state
			const game = await storage.getGame(player.gameId);
			if (game) {
				// If it was this player's turn, move to next player
				if (game.currentPlayerId === playerId) {
					await this.passTurn(game.id, playerId);
				}

				// Refresh game state
				await this.initializeGameState(game);
				this.broadcastGameUpdate(game.id);
			}
		} catch (error) {
			console.error("Error handling player disconnect:", error);
		}
	}

	// Broadcast game state to all connected players
	broadcastGameUpdate(gameId: number): void {
		try {
			const gameState = this.games.get(gameId);
			if (!gameState) return;

			// For each player in the game
			for (const player of gameState.players) {
				const connections = this.playerConnections.get(player.userId);
				if (!connections) continue;

				// Convert Set to Array before iterating to avoid TypeScript error
				Array.from(connections).forEach((socket) => {
					if (socket.readyState === WebSocket.OPEN) {
						try {
							socket.send(
								JSON.stringify({
									type: "GAME_UPDATE",
									payload: gameState,
								}),
							);
						} catch (error) {
							console.error(
								`Error sending game update to player ${player.id}:`,
								error,
							);
						}
					}
				});
			}
		} catch (error) {
			console.error("Error broadcasting game update:", error);
		}
	}
}

export const gameManager = new GameManager();
