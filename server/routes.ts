import type { Express } from "express";
import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { gameManager } from "./game";
import { z } from "zod";
import { insertUserSchema, insertGameSchema } from "@shared/schema";
import { GameAction } from "@shared/types";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Initialize WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // GET /api/games/:code - Get game by code
  app.get('/api/games/:code', async (req, res) => {
    try {
      const { code } = req.params;
      const game = await storage.getGameByCode(code);
      
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      
      res.json(game);
    } catch (error) {
      console.error('Error getting game:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  // POST /api/users - Create a new user
  app.post('/api/users', async (req, res) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: 'Invalid user data', errors: result.error.format() });
      }
      
      const { username } = result.data;
      
      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ message: 'Username already taken' });
      }
      
      const user = await storage.createUser({ username });
      res.status(201).json(user);
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  // POST /api/games - Create a new game
  app.post('/api/games', async (req, res) => {
    try {
      const schema = z.object({
        hostId: z.number()
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: 'Invalid game data', errors: result.error.format() });
      }
      
      const { hostId } = result.data;
      
      // Check if host exists
      const host = await storage.getUser(hostId);
      if (!host) {
        return res.status(404).json({ message: 'Host user not found' });
      }
      
      const gameState = await gameManager.createGame(hostId);
      if (!gameState) {
        return res.status(500).json({ message: 'Failed to create game' });
      }
      
      res.status(201).json(gameState);
    } catch (error) {
      console.error('Error creating game:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  // POST /api/games/:code/join - Join a game
  app.post('/api/games/:code/join', async (req, res) => {
    try {
      const { code } = req.params;
      
      const schema = z.object({
        userId: z.number()
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        return res.status(400).json({ message: 'Invalid join data', errors: result.error.format() });
      }
      
      const { userId } = result.data;
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      const gameState = await gameManager.joinGame(code, userId);
      if (!gameState) {
        return res.status(404).json({ message: 'Game not found or cannot be joined' });
      }
      
      // Broadcast game update to all players
      gameManager.broadcastGameUpdate(gameState.id);
      
      res.json(gameState);
    } catch (error) {
      console.error('Error joining game:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  });
  
  // WebSocket handling
  wss.on('connection', (ws: WebSocket) => {
    let playerId: number | null = null;
    let gameId: number | null = null;
    
    // Handle messages from clients
    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message) as GameAction;
        
        // Handle authentication/initialization
        if (data.action === 'REGISTER_PLAYER') {
          playerId = data.playerId || null;
          gameId = data.gameId || null;
          
          if (playerId && gameId) {
            // Register this connection for the player
            gameManager.registerPlayerConnection(playerId, ws);
            
            // Send current game state
            const gameState = gameManager.getGameState(gameId);
            if (gameState) {
              ws.send(JSON.stringify({
                type: 'GAME_UPDATE',
                payload: gameState
              }));
            }
          }
          return;
        }
        
        // Ensure player is authenticated
        if (!playerId || !gameId) {
          ws.send(JSON.stringify({
            type: 'ERROR',
            payload: 'Not authenticated. Send REGISTER_PLAYER first.'
          }));
          return;
        }
        
        // Handle game actions
        switch (data.action) {
          case 'START_GAME':
            if (data.data?.hostId) {
              const gameState = await gameManager.startGame(gameId, data.data.hostId);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              }
            }
            break;
            
          case 'ROLL_DICE':
            if (data.data?.selectedDice) {
              const gameState = await gameManager.rollDice(gameId, playerId, data.data.selectedDice);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              }
            }
            break;
            
          case 'SELECT_DICE':
            if (data.data?.diceIndices) {
              const gameState = await gameManager.selectDice(gameId, playerId, data.data.diceIndices);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              }
            }
            break;
            
          case 'SCORE_CATEGORY':
            if (data.data?.category) {
              const gameState = await gameManager.scoreCategory(gameId, playerId, data.data.category);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              }
            }
            break;
            
          case 'PASS_TURN':
            const gameState = await gameManager.passTurn(gameId, playerId);
            if (gameState) {
              gameManager.broadcastGameUpdate(gameId);
            }
            break;
            
          case 'TOGGLE_READY':
            const updatedState = await gameManager.togglePlayerReady(gameId, playerId);
            if (updatedState) {
              gameManager.broadcastGameUpdate(gameId);
            }
            break;
            
          case 'RESTART_GAME':
            if (data.data?.hostId) {
              const gameState = await gameManager.restartGame(gameId, data.data.hostId);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              }
            }
            break;
            
          default:
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: 'Unknown action'
            }));
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        ws.send(JSON.stringify({
          type: 'ERROR',
          payload: 'Error processing message'
        }));
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      if (playerId) {
        // Unregister connection
        gameManager.unregisterPlayerConnection(playerId, ws);
      }
    });
  });
  
  return httpServer;
}
