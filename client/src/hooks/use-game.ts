import { useState, useEffect } from 'react';
import { useWebSocket } from './use-websocket';
import { GameState, WebSocketMessage, GameAction } from '@shared/types';
import { useToast } from '@/hooks/use-toast';

interface UseGameOptions {
  gameId: number;
  playerId: number;
}

export function useGame({ gameId, playerId }: UseGameOptions) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const socket = useWebSocket();
  const { toast } = useToast();
  
  // Register player with WebSocket server
  useEffect(() => {
    if (!socket || !gameId || !playerId) return;
    
    // Connection is ready, register player
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        action: 'REGISTER_PLAYER',
        gameId,
        playerId
      }));
    } else {
      // Wait for connection to open
      socket.addEventListener('open', () => {
        socket.send(JSON.stringify({
          action: 'REGISTER_PLAYER',
          gameId,
          playerId
        }));
      });
    }
    
    // Handle incoming messages
    const handleMessage = (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage;
        
        if (message.type === 'GAME_UPDATE') {
          setGameState(message.payload);
          setLoading(false);
        } else if (message.type === 'ERROR') {
          setError(message.payload);
          toast({
            title: "Error",
            description: message.payload,
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    socket.addEventListener('message', handleMessage);
    
    return () => {
      socket.removeEventListener('message', handleMessage);
    };
  }, [socket, gameId, playerId, toast]);
  
  // Function to send game actions
  const sendGameAction = (action: GameAction) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      toast({
        title: "Connection Error",
        description: "WebSocket connection not available",
        variant: "destructive",
      });
      return;
    }
    
    socket.send(JSON.stringify({
      ...action,
      gameId,
      playerId
    }));
  };
  
  return {
    gameState,
    loading,
    error,
    sendGameAction
  };
}
