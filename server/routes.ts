import type { Express } from "express";
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
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
      console.log('Create game request body:', req.body);
      
      const schema = z.object({
        hostId: z.number()
      });
      
      const result = schema.safeParse(req.body);
      
      if (!result.success) {
        console.log('Invalid game data:', result.error.format());
        return res.status(400).json({ message: 'Invalid game data', errors: result.error.format() });
      }
      
      const { hostId } = result.data;
      console.log('Parsed hostId:', hostId);
      
      // Check if host exists
      const host = await storage.getUser(hostId);
      console.log('Host user lookup result:', host);
      
      if (!host) {
        return res.status(404).json({ message: 'Host user not found' });
      }
      
      const gameState = await gameManager.createGame(hostId);
      if (!gameState) {
        return res.status(500).json({ message: 'Failed to create game' });
      }
      
      console.log('Game created successfully:', gameState.id, gameState.code);
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
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('New WebSocket connection established from', req.socket.remoteAddress);
    console.log('Connection URL:', req.url);
    
    let playerId: number | null = null;
    let gameId: number | null = null;
    let connectionId = Math.random().toString(36).substring(2, 10);
    
    console.log(`WebSocket connection [${connectionId}] established`);
    
    // Handle messages from clients
    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message) as GameAction;
        console.log(`WS [${connectionId}] received message:`, { action: data.action, gameId: data.gameId, playerId: data.playerId });
        
        // Handle authentication/initialization
        if (data.action === 'REGISTER_PLAYER') {
          playerId = data.playerId || null;
          gameId = data.gameId || null;
          
          console.log(`WS [${connectionId}] registering player:`, { playerId, gameId });
          
          if (playerId && gameId) {
            // Register this connection for the player
            gameManager.registerPlayerConnection(playerId, ws);
            console.log(`WS [${connectionId}] player ${playerId} registered for game ${gameId}`);
            
            // Send current game state
            const gameState = gameManager.getGameState(gameId);
            if (gameState) {
              console.log(`WS [${connectionId}] sending initial game state to player ${playerId}`);
              ws.send(JSON.stringify({
                type: 'GAME_UPDATE',
                payload: gameState
              }));
            } else {
              console.warn(`WS [${connectionId}] game state not found for game ${gameId}`);
            }
          } else {
            console.error(`WS [${connectionId}] invalid player registration:`, { playerId, gameId });
          }
          return;
        }
        
        // Ensure player is authenticated
        if (!playerId || !gameId) {
          console.error(`WS [${connectionId}] unauthenticated action:`, data.action);
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
              console.log(`WS [${connectionId}] starting game ${gameId} by host ${data.data.hostId}`);
              const gameState = await gameManager.startGame(gameId, data.data.hostId);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              } else {
                console.error(`WS [${connectionId}] failed to start game ${gameId}`);
              }
            } else {
              console.error(`WS [${connectionId}] missing hostId for START_GAME action`);
            }
            break;
            
          case 'ROLL_DICE':
            if (data.data?.selectedDice) {
              console.log(`WS [${connectionId}] player ${playerId} rolling dice in game ${gameId}`);
              const gameState = await gameManager.rollDice(gameId, playerId, data.data.selectedDice);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              } else {
                console.error(`WS [${connectionId}] dice roll failed for player ${playerId} in game ${gameId}`);
              }
            } else {
              console.error(`WS [${connectionId}] missing selectedDice for ROLL_DICE action`);
            }
            break;
            
          case 'SELECT_DICE':
            if (data.data?.diceIndices) {
              console.log(`WS [${connectionId}] player ${playerId} selecting dice in game ${gameId}`);
              const gameState = await gameManager.selectDice(gameId, playerId, data.data.diceIndices);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              } else {
                console.error(`WS [${connectionId}] dice selection failed for player ${playerId} in game ${gameId}`);
              }
            } else {
              console.error(`WS [${connectionId}] missing diceIndices for SELECT_DICE action`);
            }
            break;
            
          case 'SCORE_CATEGORY':
            if (data.data?.category) {
              console.log(`WS [${connectionId}] player ${playerId} scoring category ${data.data.category} in game ${gameId}`);
              const gameState = await gameManager.scoreCategory(gameId, playerId, data.data.category);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              } else {
                console.error(`WS [${connectionId}] category scoring failed for player ${playerId} in game ${gameId}`);
              }
            } else {
              console.error(`WS [${connectionId}] missing category for SCORE_CATEGORY action`);
            }
            break;
            
          case 'PASS_TURN':
            console.log(`WS [${connectionId}] player ${playerId} passing turn in game ${gameId}`);
            const gameState = await gameManager.passTurn(gameId, playerId);
            if (gameState) {
              gameManager.broadcastGameUpdate(gameId);
            } else {
              console.error(`WS [${connectionId}] pass turn failed for player ${playerId} in game ${gameId}`);
            }
            break;
            
          case 'TOGGLE_READY':
            console.log(`WS [${connectionId}] player ${playerId} toggling ready status in game ${gameId}`);
            const updatedState = await gameManager.togglePlayerReady(gameId, playerId);
            if (updatedState) {
              gameManager.broadcastGameUpdate(gameId);
            } else {
              console.error(`WS [${connectionId}] toggle ready failed for player ${playerId} in game ${gameId}`);
            }
            break;
            
          case 'RESTART_GAME':
            if (data.data?.hostId) {
              console.log(`WS [${connectionId}] restarting game ${gameId} by host ${data.data.hostId}`);
              const gameState = await gameManager.restartGame(gameId, data.data.hostId);
              if (gameState) {
                gameManager.broadcastGameUpdate(gameId);
              } else {
                console.error(`WS [${connectionId}] failed to restart game ${gameId}`);
              }
            } else {
              console.error(`WS [${connectionId}] missing hostId for RESTART_GAME action`);
            }
            break;
            
          default:
            console.error(`WS [${connectionId}] unknown action:`, data.action);
            ws.send(JSON.stringify({
              type: 'ERROR',
              payload: 'Unknown action'
            }));
        }
      } catch (error) {
        console.error(`WS [${connectionId}] error handling message:`, error);
        try {
          ws.send(JSON.stringify({
            type: 'ERROR',
            payload: 'Error processing message'
          }));
        } catch (e) {
          console.error(`WS [${connectionId}] failed to send error response:`, e);
        }
      }
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error(`WS [${connectionId}] connection error:`, error);
    });
    
    // Handle disconnection
    ws.on('close', (code, reason) => {
      console.log(`WS [${connectionId}] connection closed with code ${code}`, reason ? `reason: ${reason}` : '');
      if (playerId) {
        console.log(`WS [${connectionId}] unregistering player ${playerId} connection`);
        // Unregister connection
        gameManager.unregisterPlayerConnection(playerId, ws);
      }
    });
    
    // Send initial confirmation
    try {
      ws.send(JSON.stringify({
        type: 'CONNECTED',
        payload: { connectionId }
      }));
    } catch (e) {
      console.error(`WS [${connectionId}] failed to send initial connection confirmation:`, e);
    }
  });
  
  return httpServer;
}
