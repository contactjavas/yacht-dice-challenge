import { DiceRoll, ScoreCategory, GameState, PlayerState } from "@shared/types";
import { storage } from "./storage";
import { User, Game, Player, ScoreCard } from "@shared/schema";
import { DiceRoll as DiceRollerRoll } from '@dice-roller/rpg-dice-roller';
import { WebSocket } from 'ws';

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
        score: player.score,
        turnOrder: player.turnOrder,
        isReady: player.isReady,
        isHost: player.userId === game.hostId,
        isCurrentTurn: game.currentPlayerId === player.id,
        disconnected: player.disconnected,
        scoreCard: scoreCard ? this.formatScoreCard(scoreCard) : {}
      });
    }

    const gameState: GameState = {
      id: game.id,
      code: game.code,
      hostId: game.hostId,
      status: game.status,
      currentPlayerId: game.currentPlayerId,
      currentRound: game.currentRound,
      maxRounds: game.maxRounds,
      players: playerStates,
      currentDice: [1, 1, 1, 1, 1],
      rollsLeft: MAX_ROLLS_PER_TURN,
      selectedDice: [false, false, false, false, false],
      turnTimer: TURN_TIMER_DURATION
    };

    this.games.set(game.id, gameState);
    return gameState;
  }

  // Get game state
  getGameState(gameId: number): GameState | undefined {
    return this.games.get(gameId);
  }

  // Format score card for client display
  private formatScoreCard(scoreCard: ScoreCard): Record<ScoreCategory, number | undefined> {
    return {
      [ScoreCategory.ONES]: scoreCard.ones,
      [ScoreCategory.TWOS]: scoreCard.twos,
      [ScoreCategory.THREES]: scoreCard.threes,
      [ScoreCategory.FOURS]: scoreCard.fours,
      [ScoreCategory.FIVES]: scoreCard.fives,
      [ScoreCategory.SIXES]: scoreCard.sixes,
      [ScoreCategory.THREE_OF_A_KIND]: scoreCard.threeOfAKind,
      [ScoreCategory.FOUR_OF_A_KIND]: scoreCard.fourOfAKind,
      [ScoreCategory.FULL_HOUSE]: scoreCard.fullHouse,
      [ScoreCategory.SMALL_STRAIGHT]: scoreCard.smallStraight,
      [ScoreCategory.LARGE_STRAIGHT]: scoreCard.largeStraight,
      [ScoreCategory.YACHT]: scoreCard.yacht,
      [ScoreCategory.CHANCE]: scoreCard.chance
    };
  }

  // Create a new game
  async createGame(hostId: number): Promise<GameState | undefined> {
    try {
      const host = await storage.getUser(hostId);
      if (!host) return undefined;

      const gameCode = this.generateGameCode();
      const game = await storage.createGame({
        code: gameCode,
        hostId: host.id,
        status: 'waiting'
      });

      // Add host as the first player
      const player = await storage.createPlayer({
        gameId: game.id,
        userId: host.id,
        turnOrder: 1
      });

      // Create empty score card for the player
      await storage.createScoreCard({
        playerId: player.id,
        gameId: game.id
      });

      return this.initializeGameState(game);
    } catch (error) {
      console.error('Error creating game:', error);
      return undefined;
    }
  }

  // Join an existing game
  async joinGame(gameCode: string, userId: number): Promise<GameState | undefined> {
    try {
      const game = await storage.getGameByCode(gameCode);
      if (!game) return undefined;
      
      // Check if game is joinable
      if (game.status !== 'waiting') return undefined;
      
      // Check if player already in the game
      const existingPlayer = await storage.getPlayerByGameAndUser(game.id, userId);
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
        turnOrder
      });
      
      // Create empty score card for the player
      await storage.createScoreCard({
        playerId: player.id,
        gameId: game.id
      });
      
      const gameState = await this.initializeGameState(game);
      return gameState;
    } catch (error) {
      console.error('Error joining game:', error);
      return undefined;
    }
  }

  // Start a game
  async startGame(gameId: number, hostId: number): Promise<GameState | undefined> {
    try {
      const game = await storage.getGame(gameId);
      if (!game) return undefined;
      
      // Verify it's the host
      if (game.hostId !== hostId) return undefined;
      
      // Ensure at least 2 players
      const players = await storage.getPlayersByGameId(game.id);
      if (players.length < 2) return undefined;
      
      // Sort players by turn order
      players.sort((a, b) => a.turnOrder - b.turnOrder);
      
      // Set first player as the current player
      const firstPlayer = players[0];
      
      const updatedGame = await storage.updateGame(game.id, {
        status: 'in_progress',
        currentPlayerId: firstPlayer.id
      });
      
      if (!updatedGame) return undefined;
      
      const gameState = await this.initializeGameState(updatedGame);
      
      // Start turn timer
      this.startTurnTimer(gameId);
      
      return gameState;
    } catch (error) {
      console.error('Error starting game:', error);
      return undefined;
    }
  }

  // Roll dice for a player
  async rollDice(gameId: number, playerId: number, selectedIndices: boolean[]): Promise<GameState | undefined> {
    try {
      const gameState = this.games.get(gameId);
      if (!gameState) return undefined;
      
      // Verify it's player's turn and they have rolls left
      if (gameState.currentPlayerId !== playerId || gameState.rollsLeft <= 0) return undefined;
      
      // Generate new dice values using dice-roller
      const diceRoller = new DiceRollerRoll('5d6');
      const newDiceValues: DiceRoll = diceRoller.rolls[0].rolls.map(r => r.value as any);
      
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
      
      // Reset turn timer
      this.resetTurnTimer(gameId);
      
      // Save roll to rounds table
      await storage.createRound({
        gameId,
        playerId,
        roundNumber: gameState.currentRound,
        diceValues: JSON.stringify(currentDice)
      });
      
      this.games.set(gameId, gameState);
      return gameState;
    } catch (error) {
      console.error('Error rolling dice:', error);
      return undefined;
    }
  }
  
  // Select dice to keep
  async selectDice(gameId: number, playerId: number, diceIndices: number[]): Promise<GameState | undefined> {
    const gameState = this.games.get(gameId);
    if (!gameState) return undefined;
    
    // Verify it's player's turn
    if (gameState.currentPlayerId !== playerId) return undefined;
    
    // Update selected dice
    const selectedDice = [false, false, false, false, false];
    diceIndices.forEach(index => {
      if (index >= 0 && index < 5) {
        selectedDice[index] = true;
      }
    });
    
    gameState.selectedDice = selectedDice;
    this.games.set(gameId, gameState);
    return gameState;
  }
  
  // Score current dice in a category
  async scoreCategory(gameId: number, playerId: number, category: ScoreCategory): Promise<GameState | undefined> {
    try {
      const gameState = this.games.get(gameId);
      if (!gameState) return undefined;
      
      // Verify it's player's turn
      if (gameState.currentPlayerId !== playerId) return undefined;
      
      // Get player's score card
      const player = gameState.players.find(p => p.id === playerId);
      if (!player) return undefined;
      
      // Check if category already scored
      if (player.scoreCard[category] !== undefined) return undefined;
      
      // Calculate score
      const score = this.calculateScore(gameState.currentDice, category);
      
      // Update score card
      await storage.updateScoreCard(playerId, category, score);
      
      // Update player's total score
      const updatedPlayer = await storage.updatePlayer(playerId, {
        score: (player.score || 0) + score
      });
      
      if (!updatedPlayer) return undefined;
      
      // Update last round with category and score
      const rounds = await storage.getRoundsByPlayerId(playerId);
      const lastRound = rounds.sort((a, b) => b.id - a.id)[0];
      if (lastRound) {
        await storage.updateRound(lastRound.id, {
          category,
          score
        });
      }
      
      // Check if game is complete
      const isGameComplete = await this.checkGameCompletion(gameId);
      
      if (isGameComplete) {
        // Update game as completed
        await storage.updateGame(gameId, {
          status: 'completed'
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
            currentPlayerId: nextPlayer.id
          });
          
          // Check if we need to advance to next round
          if (nextPlayer.turnOrder === 1) {
            const game = await storage.getGame(gameId);
            if (game) {
              await storage.updateGame(gameId, {
                currentRound: (game.currentRound || 1) + 1
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
      console.error('Error scoring category:', error);
      return undefined;
    }
  }
  
  // Calculate score for dice in a category
  private calculateScore(dice: DiceRoll, category: ScoreCategory): number {
    const counts = [0, 0, 0, 0, 0, 0];
    
    // Count occurrences of each value
    dice.forEach(value => {
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
        return counts.some(count => count >= 3) ? dice.reduce((sum, value) => sum + value, 0) : 0;
      case ScoreCategory.FOUR_OF_A_KIND:
        return counts.some(count => count >= 4) ? dice.reduce((sum, value) => sum + value, 0) : 0;
      case ScoreCategory.FULL_HOUSE:
        return (counts.includes(3) && counts.includes(2)) ? 25 : 0;
      case ScoreCategory.SMALL_STRAIGHT: {
        // Check for 1-2-3-4 or 2-3-4-5 or 3-4-5-6
        if ((counts[0] && counts[1] && counts[2] && counts[3]) ||
            (counts[1] && counts[2] && counts[3] && counts[4]) ||
            (counts[2] && counts[3] && counts[4] && counts[5])) {
          return 30;
        }
        return 0;
      }
      case ScoreCategory.LARGE_STRAIGHT: {
        // Check for 1-2-3-4-5 or 2-3-4-5-6
        if ((counts[0] && counts[1] && counts[2] && counts[3] && counts[4]) ||
            (counts[1] && counts[2] && counts[3] && counts[4] && counts[5])) {
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
  private async getNextPlayer(gameId: number, currentTurnOrder: number): Promise<Player | undefined> {
    const players = await storage.getPlayersByGameId(gameId);
    
    // Sort by turn order
    players.sort((a, b) => a.turnOrder - b.turnOrder);
    
    // Find index of current player
    const currentIndex = players.findIndex(p => p.turnOrder === currentTurnOrder);
    
    if (currentIndex === -1) return undefined;
    
    // Find next player (wrapping around to beginning if needed)
    const nextIndex = (currentIndex + 1) % players.length;
    return players[nextIndex];
  }
  
  // Check if the game is complete
  private async checkGameCompletion(gameId: number): Promise<boolean> {
    const game = await storage.getGame(gameId);
    if (!game) return false;
    
    // If we've reached the max number of rounds
    if (game.currentRound >= game.maxRounds) {
      const players = await storage.getPlayersByGameId(gameId);
      
      // Check if all players have filled their scorecards
      for (const player of players) {
        const scoreCard = await storage.getScoreCardByPlayerId(player.id);
        if (!scoreCard) continue;
        
        // Count filled categories
        const filledCategories = Object.values(ScoreCategory).filter(
          category => scoreCard[category as keyof typeof scoreCard] !== null
        );
        
        // If any player hasn't filled all categories, game isn't complete
        if (filledCategories.length < Object.values(ScoreCategory).length) {
          return false;
        }
      }
      
      return true;
    }
    
    return false;
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
        const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
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
  async passTurn(gameId: number, playerId: number): Promise<GameState | undefined> {
    try {
      const gameState = this.games.get(gameId);
      if (!gameState) return undefined;
      
      // Verify it's player's turn
      if (gameState.currentPlayerId !== playerId) return undefined;
      
      const player = gameState.players.find(p => p.id === playerId);
      if (!player) return undefined;
      
      // Move to next player
      const nextPlayer = await this.getNextPlayer(gameId, player.turnOrder);
      
      if (nextPlayer) {
        await storage.updateGame(gameId, {
          currentPlayerId: nextPlayer.id
        });
        
        // Check if we need to advance to next round
        if (nextPlayer.turnOrder === 1) {
          const game = await storage.getGame(gameId);
          if (game) {
            await storage.updateGame(gameId, {
              currentRound: (game.currentRound || 1) + 1
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
      console.error('Error passing turn:', error);
      return undefined;
    }
  }
  
  // Mark player as ready
  async togglePlayerReady(gameId: number, playerId: number): Promise<GameState | undefined> {
    try {
      const player = await storage.getPlayer(playerId);
      if (!player) return undefined;
      
      const updatedPlayer = await storage.updatePlayer(playerId, {
        isReady: !player.isReady
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
      console.error('Error toggling player ready:', error);
      return undefined;
    }
  }
  
  // Restart game for a rematch
  async restartGame(gameId: number, hostId: number): Promise<GameState | undefined> {
    try {
      const game = await storage.getGame(gameId);
      if (!game) return undefined;
      
      // Verify it's the host
      if (game.hostId !== hostId) return undefined;
      
      // Reset game state
      const updatedGame = await storage.updateGame(gameId, {
        status: 'waiting',
        currentPlayerId: null,
        currentRound: 1
      });
      
      if (!updatedGame) return undefined;
      
      // Reset all players
      const players = await storage.getPlayersByGameId(gameId);
      for (const player of players) {
        await storage.updatePlayer(player.id, {
          score: 0,
          isReady: false
        });
        
        // Create a new score card for the player
        await storage.createScoreCard({
          playerId: player.id,
          gameId: gameId
        });
      }
      
      // Refresh game state
      const gameState = await this.initializeGameState(updatedGame);
      return gameState;
    } catch (error) {
      console.error('Error restarting game:', error);
      return undefined;
    }
  }
  
  // Generate unique game code
  private generateGameCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
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
        disconnected: true
      });
      
      // Get game and update state
      const game = await storage.getGame(player.gameId);
      if (game) {
        // If it was this player's turn, move to next player
        if (game.currentPlayerId === playerId) {
          await this.passTurn(game.id, playerId);
        }
        
        // Refresh and broadcast game state
        await this.initializeGameState(game);
        this.broadcastGameUpdate(game.id);
      }
    } catch (error) {
      console.error('Error handling player disconnect:', error);
    }
  }
  
  // Broadcast game state to all connected players
  broadcastGameUpdate(gameId: number): void {
    const gameState = this.games.get(gameId);
    if (!gameState) return;
    
    // For each player, send the game update
    for (const player of gameState.players) {
      const connections = this.playerConnections.get(player.id);
      if (!connections) continue;
      
      const message = JSON.stringify({
        type: 'GAME_UPDATE',
        payload: gameState
      });
      
      for (const socket of connections) {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message);
        }
      }
    }
  }
}

export const gameManager = new GameManager();
