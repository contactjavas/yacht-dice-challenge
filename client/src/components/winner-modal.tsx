import { Button } from "@/components/ui/button";
import { GameState } from "@shared/types";

interface WinnerModalProps {
	game: GameState;
	currentUserId: number;
	onPlayAgain: () => void;
	onReturnToLobby: () => void;
}

export default function WinnerModal({
	game,
	currentUserId,
	onPlayAgain,
	onReturnToLobby,
}: WinnerModalProps) {
	// Sort players by score, highest first
	const sortedPlayers = [...game.players].sort((a, b) => b.score - a.score);

	// Get the winner (highest score)
	const winner = sortedPlayers[0];

	// Check if current user is the host
	const isHost = game.hostId === currentUserId;

	// Check if current user is the winner
	const isCurrentUserWinner = winner.userId === currentUserId;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
			<div className="w-full max-w-md rounded-xl border border-primary/30 bg-neutral-800 p-6 shadow-lg">
				<div className="text-center">
					<div className="mb-4">
						<div className="mx-auto mb-2 flex h-20 w-20 items-center justify-center rounded-full bg-primary">
							<i className="fas fa-trophy text-4xl text-white"></i>
						</div>
						<h2 className="font-heading mb-1 text-2xl font-bold">
							{isCurrentUserWinner ? "You Win!" : `${winner.username} Wins!`}
						</h2>
						<p className="text-neutral-400">
							Final Score: {winner.score} points
						</p>
					</div>

					<div className="mb-6 rounded-lg bg-neutral-900 p-4">
						<h3 className="mb-2 font-semibold">Final Scores</h3>
						<div className="space-y-2">
							{sortedPlayers.map((player) => (
								<div
									key={player.id}
									className="flex items-center justify-between"
								>
									<div className="flex items-center gap-2">
										<div
											className={`h-6 w-6 ${
												player.userId === currentUserId
													? "bg-primary"
													: "bg-[#F59E0B]"
											} flex items-center justify-center rounded-full`}
										>
											<i className="fas fa-user text-xs"></i>
										</div>
										<span>
											{player.userId === currentUserId
												? "You"
												: player.username}
											{player.userId === winner.userId && (
												<span className="ml-1 text-yellow-500">👑</span>
											)}
										</span>
									</div>
									<span className="font-['Montserrat'] font-bold">
										{player.score}
									</span>
								</div>
							))}
						</div>
					</div>

					<div className="flex gap-3">
						<Button
							variant="outline"
							className="flex-1 rounded-lg bg-neutral-700 px-4 py-2 transition-all hover:bg-neutral-600"
							onClick={onReturnToLobby}
						>
							Back to Lobby
						</Button>
						<Button
							className="flex-1 rounded-lg bg-[#10B981] px-4 py-2 font-medium transition-all hover:bg-[#10B981]/80"
							onClick={onPlayAgain}
							disabled={!isHost}
						>
							{isHost ? "Play Again" : "Waiting for Host..."}
						</Button>
					</div>

					{!isHost && (
						<p className="mt-3 text-xs text-neutral-400">
							Only the host can start a new game
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
