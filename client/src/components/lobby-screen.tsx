import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { User } from "@shared/schema";
import { GameState } from "@shared/types";
import { useWebSocket } from "@/hooks/use-websocket";

interface LobbyScreenProps {
  user: User;
  gameCode: string;
  onLogout: () => void;
}

export default function LobbyScreen({ user, gameCode, onLogout }: LobbyScreenProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  
  const socket = useWebSocket();
  
  // Effect to join the game
  useEffect(() => {
    const joinGame = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/games/${gameCode}/join`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: user.id }),
        });
        
        if (!res.ok) {
          const data = await res.json();
          toast({
            title: "Error",
            description: data.message || "Failed to join game",
            variant: "destructive",
          });
          navigate('/');
          return;
        }
        
        const gameData = await res.json();
        setGame(gameData);
        
        // Find this player's ID in the game
        const player = gameData.players.find((p: any) => p.userId === user.id);
        if (player) {
          setPlayerId(player.id);
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to connect to server",
          variant: "destructive",
        });
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    
    joinGame();
  }, [gameCode, user.id, navigate, toast]);
  
  // Setup WebSocket connection
  useEffect(() => {
    if (!socket || !game || !playerId) return;
    
    // Register this player
    socket.send(JSON.stringify({
      action: 'REGISTER_PLAYER',
      gameId: game.id,
      playerId: playerId
    }));
    
    const handleSocketMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'GAME_UPDATE') {
          setGame(data.payload);
          
          // If game status changed to in_progress, navigate to game screen
          if (data.payload.status === 'in_progress') {
            navigate(`/game/${gameCode}`);
          }
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    socket.addEventListener('message', handleSocketMessage);
    
    return () => {
      socket.removeEventListener('message', handleSocketMessage);
    };
  }, [socket, game, playerId, gameCode, navigate]);
  
  // Function to toggle ready status
  const toggleReady = () => {
    if (!socket || !playerId) return;
    
    socket.send(JSON.stringify({
      action: 'TOGGLE_READY',
      gameId: game?.id,
      playerId: playerId
    }));
  };
  
  // Function to start the game
  const startGame = () => {
    if (!socket || !game) return;
    
    socket.send(JSON.stringify({
      action: 'START_GAME',
      gameId: game.id,
      data: { hostId: user.id }
    }));
  };
  
  // Function to leave the lobby
  const leaveLobby = () => {
    navigate('/');
  };
  
  // Function to handle logout
  const handleLogout = () => {
    onLogout();
  };
  
  // Function to copy game code
  const copyGameCode = () => {
    navigator.clipboard.writeText(gameCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // Check if user is the host
  const isHost = game?.hostId === user.id;
  
  // Check if game can be started
  const canStartGame = isHost && (game?.players.length || 0) >= 2 && 
    game?.players.every(player => player.isReady || player.userId === user.id);
  
  // Check this player's ready status
  const isReady = game?.players.find(p => p.userId === user.id)?.isReady || false;
  
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-b from-primary/20 to-neutral-dark">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-neutral-300">Joining game...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="h-screen flex flex-col p-4 bg-gradient-to-b from-primary/20 to-neutral-dark">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h1 className="text-2xl font-heading font-bold">Game Lobby</h1>
          <div className="flex items-center gap-3">
            <div className="px-3 py-1.5 bg-neutral-800 rounded-lg text-sm flex items-center gap-2">
              <span>Game Code:</span>
              <span className="font-bold text-[#F59E0B]">{gameCode}</span>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-primary hover:text-primary/80" 
                title={copied ? "Copied!" : "Copy game code"}
                onClick={copyGameCode}
              >
                <i className={copied ? "fas fa-check" : "fas fa-copy"}></i>
              </Button>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 text-neutral-400 hover:text-red-500 transition-colors" 
              title="Leave game"
              onClick={leaveLobby}
            >
              <i className="fas fa-sign-out-alt"></i>
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 text-neutral-400 hover:text-red-500 transition-colors" 
              title="Logout"
              onClick={handleLogout}
            >
              <i className="fas fa-power-off"></i>
            </Button>
          </div>
        </header>
        
        <Card className="bg-neutral-800/60 rounded-xl p-6 flex-1 flex flex-col border border-neutral-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              Players <span className="text-neutral-400 text-sm">
                ({game?.players.length || 0}/{4})
              </span>
            </h2>
            <div>
              <Button 
                variant="link" 
                className="text-xs text-primary hover:text-primary/80"
                onClick={copyGameCode}
              >
                <i className="fas fa-link mr-1"></i> Share Invite
              </Button>
            </div>
          </div>
          
          <div className="flex-1 space-y-3">
            {/* Players */}
            {game?.players.map((player) => (
              <div 
                key={player.id}
                className={`flex items-center justify-between p-3 bg-neutral-900/60 rounded-lg border ${
                  player.userId === user.id 
                    ? 'border-primary/50' 
                    : 'border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 ${
                    player.userId === user.id ? 'bg-primary' : 'bg-[#F59E0B]'
                  } rounded-full flex items-center justify-center text-white`}>
                    <i className="fas fa-user"></i>
                  </div>
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {player.username} 
                      {player.isHost && (
                        <span className="text-xs bg-primary/80 px-1.5 py-0.5 rounded-sm">Host</span>
                      )}
                    </div>
                    <div className="text-xs text-neutral-400">
                      {player.isReady ? 'Ready to play' : 'Not ready'}
                    </div>
                  </div>
                </div>
                <div className={player.isReady ? 'text-green-500' : 'text-neutral-500'}>
                  <i className={`fas ${player.isReady ? 'fa-check-circle' : 'fa-circle'}`}></i>
                </div>
              </div>
            ))}
            
            {/* Empty slots */}
            {Array.from({ length: 4 - (game?.players.length || 0) }).map((_, index) => (
              <div 
                key={`empty-${index}`}
                className="flex items-center justify-between p-3 bg-neutral-900/60 rounded-lg border border-neutral-800/50 border-dashed"
              >
                <div className="flex items-center gap-3 text-neutral-500">
                  <div className="w-10 h-10 bg-neutral-800 rounded-full flex items-center justify-center">
                    <i className="fas fa-user"></i>
                  </div>
                  <div>
                    <div className="font-semibold">Waiting for player...</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="border-t border-neutral-700 pt-4 mt-4">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div>
                <div className="text-sm text-neutral-300 mb-1">
                  <i className="fas fa-info-circle mr-1"></i> 
                  {game?.players.length === 1 
                    ? "Waiting for more players to join..." 
                    : isHost && !canStartGame 
                      ? "Waiting for all players to be ready..."
                      : "Ready to start when the host is ready!"
                  }
                </div>
                <div className="text-xs text-neutral-400">
                  Game will start when the host is ready and at least 2 players have joined.
                </div>
              </div>
              
              <div className="flex gap-2 self-end sm:self-auto">
                {!isHost && (
                  <Button
                    className={`py-2 px-5 ${
                      isReady 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-neutral-700 hover:bg-neutral-600'
                    } rounded-lg font-medium transition-all flex items-center gap-2`}
                    onClick={toggleReady}
                  >
                    <i className={`fas ${isReady ? 'fa-check' : 'fa-thumbs-up'}`}></i> 
                    {isReady ? 'Ready!' : 'Ready Up'}
                  </Button>
                )}
                
                {isHost && (
                  <Button
                    className="py-2 px-5 bg-[#10B981] hover:bg-[#10B981]/80 rounded-lg font-medium transition-all flex items-center gap-2"
                    disabled={!canStartGame}
                    onClick={startGame}
                  >
                    <i className="fas fa-play"></i> Start Game
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
