import { Button } from "@/components/ui/button";
import { GameState } from "@shared/types";

interface WinnerModalProps {
  game: GameState;
  currentUserId: number;
  onPlayAgain: () => void;
  onReturnToLobby: () => void;
}

export default function WinnerModal({ game, currentUserId, onPlayAgain, onReturnToLobby }: WinnerModalProps) {
  // Sort players by score, highest first
  const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);
  
  // Get the winner (highest score)
  const winner = sortedPlayers[0];
  
  // Check if current user is the host
  const isHost = game.hostId === currentUserId;
  
  // Check if current user is the winner
  const isCurrentUserWinner = winner.userId === currentUserId;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-800 rounded-xl max-w-md w-full p-6 border border-primary/30 shadow-lg">
        <div className="text-center">
          <div className="mb-4">
            <div className="w-20 h-20 mx-auto bg-primary rounded-full flex items-center justify-center mb-2">
              <i className="fas fa-trophy text-4xl text-white"></i>
            </div>
            <h2 className="text-2xl font-bold font-heading mb-1">
              {isCurrentUserWinner ? 'You Win!' : `${winner.username} Wins!`}
            </h2>
            <p className="text-neutral-400">Final Score: {winner.score} points</p>
          </div>
          
          <div className="bg-neutral-900 rounded-lg p-4 mb-6">
            <h3 className="font-semibold mb-2">Final Scores</h3>
            <div className="space-y-2">
              {sortedPlayers.map(player => (
                <div key={player.id} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 ${
                      player.userId === currentUserId ? 'bg-primary' : 'bg-[#F59E0B]'
                    } rounded-full flex items-center justify-center`}>
                      <i className="fas fa-user text-xs"></i>
                    </div>
                    <span>
                      {player.userId === currentUserId ? 'You' : player.username}
                      {player.userId === winner.userId && 
                        <span className="ml-1 text-yellow-500">👑</span>
                      }
                    </span>
                  </div>
                  <span className="font-['Montserrat'] font-bold">{player.score}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button 
              variant="outline"
              className="flex-1 py-2 px-4 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-all"
              onClick={onReturnToLobby}
            >
              Back to Lobby
            </Button>
            <Button 
              className="flex-1 py-2 px-4 bg-[#10B981] hover:bg-[#10B981]/80 rounded-lg font-medium transition-all"
              onClick={onPlayAgain}
              disabled={!isHost}
            >
              {isHost ? 'Play Again' : 'Waiting for Host...'}
            </Button>
          </div>
          
          {!isHost && (
            <p className="text-xs text-neutral-400 mt-3">
              Only the host can start a new game
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
