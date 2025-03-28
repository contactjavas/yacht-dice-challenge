import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User } from "@shared/schema";
import { GameState, ScoreCategory, DiceRoll } from "@shared/types";
import { useWebSocket } from "@/hooks/use-websocket";
import DiceBox from "@/components/dice-box";
import Scorecard from "@/components/scorecard";
import WinnerModal from "@/components/winner-modal";

interface GameScreenProps {
  user: User;
  gameCode: string;
  onLogout: () => void;
}

export default function GameScreen({ user, gameCode, onLogout }: GameScreenProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [game, setGame] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [selectedDice, setSelectedDice] = useState<boolean[]>([false, false, false, false, false]);
  const [rollingDice, setRollingDice] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  
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
        
        // If game is not in progress, redirect to lobby
        if (gameData.status !== 'in_progress') {
          navigate(`/lobby/${gameCode}`);
        }
        
        // If game is completed, show winner modal
        if (gameData.status === 'completed') {
          setShowWinnerModal(true);
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
          
          // If game is completed, show winner modal
          if (data.payload.status === 'completed') {
            setShowWinnerModal(true);
          }
          
          // If dice have been rolled, update selection
          setSelectedDice(data.payload.selectedDice);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };
    
    socket.addEventListener('message', handleSocketMessage);
    
    return () => {
      socket.removeEventListener('message', handleSocketMessage);
    };
  }, [socket, game, playerId]);
  
  // Function to toggle dice selection
  const toggleDiceSelection = (index: number) => {
    if (!isMyTurn || rollingDice) return;
    
    const newSelected = [...selectedDice];
    newSelected[index] = !newSelected[index];
    setSelectedDice(newSelected);
    
    // Send selection to server
    if (socket && game && playerId) {
      const selectedIndices = newSelected
        .map((selected, i) => selected ? i : -1)
        .filter(i => i >= 0);
      
      socket.send(JSON.stringify({
        action: 'SELECT_DICE',
        gameId: game.id,
        playerId: playerId,
        data: { diceIndices: selectedIndices }
      }));
    }
  };
  
  // Function to roll dice
  const rollDice = () => {
    if (!socket || !game || !playerId || !isMyTurn || game.rollsLeft <= 0 || rollingDice) return;
    
    setRollingDice(true);
    
    // Send roll request to server
    socket.send(JSON.stringify({
      action: 'ROLL_DICE',
      gameId: game.id,
      playerId: playerId,
      data: { selectedDice }
    }));
    
    // Reset dice selection after roll
    setSelectedDice([false, false, false, false, false]);
    
    // Animation takes about 2 seconds
    setTimeout(() => {
      setRollingDice(false);
    }, 2000);
  };
  
  // Function to pass turn
  const passTurn = () => {
    if (!socket || !game || !playerId || !isMyTurn) return;
    
    socket.send(JSON.stringify({
      action: 'PASS_TURN',
      gameId: game.id,
      playerId: playerId
    }));
  };
  
  // Function to score a category
  const scoreCategory = (category: ScoreCategory) => {
    if (!socket || !game || !playerId || !isMyTurn) return;
    
    socket.send(JSON.stringify({
      action: 'SCORE_CATEGORY',
      gameId: game.id,
      playerId: playerId,
      data: { category }
    }));
  };
  
  // Function to play again
  const playAgain = () => {
    if (!socket || !game || !user) return;
    
    // Only host can restart the game
    if (game.hostId === user.id) {
      socket.send(JSON.stringify({
        action: 'RESTART_GAME',
        gameId: game.id,
        data: { hostId: user.id }
      }));
    }
    
    setShowWinnerModal(false);
    navigate(`/lobby/${gameCode}`);
  };
  
  // Function to return to lobby
  const returnToLobby = () => {
    setShowWinnerModal(false);
    navigate(`/lobby/${gameCode}`);
  };
  
  // Get current player
  const currentPlayer = game?.players.find(p => p.id === game.currentPlayerId);
  
  // Check if it's current user's turn
  const isMyTurn = game?.currentPlayerId === playerId;
  
  // Get current player scorecard
  const myPlayer = game?.players.find(p => p.userId === user.id);
  
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-b from-primary/20 to-neutral-dark">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-neutral-300">Loading game...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-neutral-900 border-b border-neutral-800 py-2 px-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-heading font-bold">
              <span className="text-[#F59E0B]">YACHT</span>
            </h1>
            <span className="text-xs bg-primary/50 rounded px-2 py-0.5">
              Round {game?.currentRound}/{game?.maxRounds}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3">
              <div className="text-xs text-neutral-400">Game Code:</div>
              <div className="text-sm bg-neutral-800 px-2 py-1 rounded">{gameCode}</div>
            </div>
            
            <Button variant="ghost" size="icon" className="text-neutral-400 hover:text-neutral-200" onClick={onLogout}>
              <i className="fas fa-sign-out-alt"></i>
            </Button>
          </div>
        </div>
      </header>
      
      <main className="flex-1 flex flex-col md:flex-row">
        {/* Left sidebar - Players (desktop) */}
        <div className="hidden md:block w-64 bg-neutral-900 border-r border-neutral-800 p-4">
          <h2 className="text-lg font-semibold mb-3">Players</h2>
          
          <div className="space-y-3">
            {game?.players.map(player => (
              <div 
                key={player.id}
                className={`${
                  player.id === game.currentPlayerId
                    ? 'bg-primary/20 border-l-4 border-primary'
                    : 'bg-neutral-800'
                } rounded p-3`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 ${
                      player.userId === user.id ? 'bg-primary' : 'bg-[#F59E0B]'
                    } rounded-full flex items-center justify-center`}>
                      <i className="fas fa-user text-sm"></i>
                    </div>
                    <div>
                      <div className="font-medium">{player.username}</div>
                      <div className={`text-xs ${
                        player.id === game.currentPlayerId
                          ? 'text-primary'
                          : 'text-neutral-400'
                      }`}>
                        {player.id === game.currentPlayerId ? 'Current Turn' : 'Waiting'}
                      </div>
                    </div>
                  </div>
                  <div className="font-['Montserrat'] font-bold text-lg">{player.score}</div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-8">
            <h2 className="text-lg font-semibold mb-3">Game Info</h2>
            <div className="bg-neutral-800 rounded p-3 text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-neutral-400">Round:</span>
                <span className="font-medium">{game?.currentRound}/{game?.maxRounds}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Time left:</span>
                <span className="font-medium text-[#F59E0B]">{game?.turnTimer || 0}s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Rolls left:</span>
                <span className="font-medium">{game?.rollsLeft}</span>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main game area */}
        <div className="flex-1 flex flex-col bg-gradient-to-b from-neutral-900 to-neutral-800 p-4 md:p-6 overflow-y-auto">
          {/* Mobile game info bar */}
          <div className="flex md:hidden justify-between items-center mb-4 bg-neutral-800/80 rounded-lg p-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-neutral-400">Round: <span className="text-white">{game?.currentRound}/{game?.maxRounds}</span></span>
              <span className="w-1 h-1 bg-neutral-600 rounded-full"></span>
              <span className="text-neutral-400">Rolls: <span className="text-white">{game?.rollsLeft}</span></span>
            </div>
            <div className="text-[#F59E0B] font-medium">
              <i className="fas fa-clock mr-1"></i> {game?.turnTimer || 0}s
            </div>
          </div>
          
          {/* Dice area */}
          <div className="bg-neutral-800/60 rounded-xl p-4 md:p-6 mb-6">
            {/* Turn information */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 ${
                  currentPlayer?.userId === user.id ? 'bg-primary' : 'bg-[#F59E0B]'
                } rounded-full flex items-center justify-center`}>
                  <i className="fas fa-user text-sm"></i>
                </div>
                <div>
                  <div className="font-medium text-lg">
                    {currentPlayer?.username === user.username ? 'Your Turn' : `${currentPlayer?.username}'s Turn`}
                  </div>
                </div>
              </div>
              <div className="hidden md:block">
                <span className="text-neutral-400 text-sm mr-2">Rolls left:</span>
                <span className="font-medium">{game?.rollsLeft}</span>
              </div>
            </div>
            
            {/* 3D Dice Visualization Area */}
            <div className="bg-neutral-900/80 rounded-lg border border-neutral-700 h-56 md:h-72 relative mb-6 overflow-hidden">
              <DiceBox 
                diceValues={game?.currentDice || [1, 1, 1, 1, 1]} 
                rolling={rollingDice}
              />
            </div>
            
            {/* Dice selection UI */}
            <div className="flex justify-center gap-3 mb-5">
              {(game?.currentDice || [1, 1, 1, 1, 1]).map((die, index) => (
                <button
                  key={index}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center border-2 ${
                    selectedDice[index] 
                      ? 'border-primary bg-white text-neutral-900' 
                      : 'border-transparent bg-white text-neutral-900'
                  } text-xl font-bold transition-all ${
                    isMyTurn && !rollingDice ? 'hover:bg-primary/10' : ''
                  } ${
                    !isMyTurn || rollingDice ? 'opacity-70 cursor-not-allowed' : 'hover:opacity-90'
                  }`}
                  onClick={() => toggleDiceSelection(index)}
                  disabled={!isMyTurn || rollingDice}
                >
                  {die}
                </button>
              ))}
            </div>
            
            {/* Action buttons */}
            <div className="flex justify-center gap-3">
              <Button 
                className={`py-2 px-4 md:px-6 bg-primary rounded-lg font-medium transition-all flex items-center gap-2 ${
                  !isMyTurn || game?.rollsLeft === 0 || rollingDice ? 'opacity-70 cursor-not-allowed' : 'hover:bg-primary/80'
                }`}
                onClick={rollDice}
                disabled={!isMyTurn || game?.rollsLeft === 0 || rollingDice}
              >
                <i className="fas fa-dice"></i> Roll Dice ({game?.rollsLeft})
              </Button>
              
              <Button 
                className={`py-2 px-4 md:px-6 bg-neutral-700 rounded-lg font-medium transition-all flex items-center gap-2 ${
                  !isMyTurn || rollingDice ? 'opacity-70 cursor-not-allowed' : 'hover:bg-neutral-600'
                }`}
                onClick={passTurn}
                disabled={!isMyTurn || rollingDice}
              >
                Pass Turn
              </Button>
            </div>
          </div>
          
          {/* Scorecard */}
          <Scorecard
            currentDice={game?.currentDice || [1, 1, 1, 1, 1]}
            scoreCard={myPlayer?.scoreCard || {}}
            isMyTurn={isMyTurn}
            onSelectCategory={scoreCategory}
          />
        </div>
        
        {/* Right sidebar - Chat & game history (desktop) */}
        <div className="hidden lg:block w-72 bg-neutral-900 border-l border-neutral-800 flex flex-col">
          <div className="flex-1 flex flex-col">
            <div className="p-4 border-b border-neutral-800">
              <h2 className="text-lg font-semibold">Game Chat</h2>
            </div>
            
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              <div className="flex flex-col">
                <div className="text-xs text-neutral-500 mb-1">System</div>
                <div className="bg-neutral-800/50 p-2 rounded-lg text-xs text-neutral-400">
                  Chat functionality coming soon...
                </div>
              </div>
            </div>
            
            <div className="p-4 border-t border-neutral-800">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  className="flex-1 bg-neutral-800 border border-neutral-700 rounded p-2 text-sm outline-none focus:border-primary" 
                  placeholder="Type a message..."
                  disabled
                />
                <Button 
                  className="bg-primary hover:bg-primary/80 rounded w-10 flex items-center justify-center"
                  disabled
                >
                  <i className="fas fa-paper-plane"></i>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
      
      {/* Mobile player bar (visible on small screens) */}
      <div className="md:hidden bg-neutral-900 border-t border-neutral-800 p-3">
        <div className="flex justify-around">
          {game?.players.slice(0, 2).map(player => (
            <div key={player.id} className="flex flex-col items-center">
              <div className={`w-8 h-8 ${
                player.userId === user.id ? 'bg-primary' : 'bg-[#F59E0B]'
              } rounded-full flex items-center justify-center mb-1 ${
                player.id === game.currentPlayerId ? 'ring-2 ring-white' : ''
              }`}>
                <i className="fas fa-user text-sm"></i>
              </div>
              <div className="text-sm font-medium">
                {player.userId === user.id ? 'You' : player.username}
              </div>
              <div className="text-xs font-['Montserrat'] font-bold">{player.score}</div>
            </div>
          ))}
          
          {/* More button if more than 2 players */}
          {(game?.players.length || 0) > 2 && (
            <div className="flex flex-col items-center text-neutral-400">
              <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center mb-1">
                <i className="fas fa-ellipsis-h text-sm"></i>
              </div>
              <div className="text-sm">More</div>
              <div className="text-xs font-bold">{game?.players.length - 2}</div>
            </div>
          )}
          
          <button className="flex flex-col items-center text-neutral-400">
            <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center mb-1">
              <i className="fas fa-cog text-sm"></i>
            </div>
            <div className="text-sm">Menu</div>
          </button>
        </div>
      </div>
      
      {/* Winner Modal */}
      {showWinnerModal && game && (
        <WinnerModal
          game={game}
          currentUserId={user.id}
          onPlayAgain={playAgain}
          onReturnToLobby={returnToLobby}
        />
      )}
    </div>
  );
}
