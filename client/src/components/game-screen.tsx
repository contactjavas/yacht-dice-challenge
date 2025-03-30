import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User } from "@shared/schema";
import {
	GameState,
	ScoreCategory,
	DiceRoll,
	ScoreCardDisplay,
} from "@shared/types";
import { useWebSocket } from "@/hooks/use-websocket";
import DiceBox from "@/components/dice-box";
import Scorecard from "@/components/scorecard";
import WinnerModal from "@/components/winner-modal";

interface GameScreenProps {
	user: User;
	gameCode: string;
	onLogout: () => void;
}

export default function GameScreen({
	user,
	gameCode,
	onLogout,
}: GameScreenProps) {
	const [, navigate] = useLocation();
	const { toast } = useToast();
	const [loading, setLoading] = useState(true);
	const [game, setGame] = useState<GameState | null>(null);
	const [playerId, setPlayerId] = useState<number | null>(user.id);
	const [selectedDice, setSelectedDice] = useState<boolean[]>([
		false,
		false,
		false,
		false,
		false,
	]);
	const [rollingDice, setRollingDice] = useState(false);
	const [showWinnerModal, setShowWinnerModal] = useState(false);

	const socket = useWebSocket();

	let playerRegistered = false;

	// Effect to join the game
	useEffect(() => {
		console.log("Effect to join the game is running");

		const joinGame = async () => {
			try {
				setLoading(true);

				const res = await fetch(`/api/games/${gameCode}/join`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
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
					navigate("/");
					return;
				}

				const gameData = await res.json();
				console.log("GameScreen: Joined game:", gameData);
				setGame(gameData);

				// Find this player's ID in the game
				const player = gameData.players.find((p: any) => p.userId === user.id);

				console.log("GameScreen: Player:", player);

				if (player) {
					setPlayerId(player.id);
				}

				// If game is not in progress, redirect to lobby
				if (gameData.status !== "in_progress") {
					navigate(`/lobby/${gameCode}`);
				}

				// If game is completed, show winner modal
				if (gameData.status === "completed") {
					setShowWinnerModal(true);
				}
			} catch (error) {
				toast({
					title: "Error",
					description: "Failed to connect to server",
					variant: "destructive",
				});
				navigate("/");
			} finally {
				setLoading(false);
			}
		};

		console.log("GameScreen: Joining game...");

		joinGame();
	}, [gameCode, user.id, navigate, toast]);

	// Setup WebSocket connection with robust error handling
	useEffect(() => {
		console.log("Effect to setup WebSocket is running");

		// Don't try to use WebSocket until all required data is available
		if (!game || !playerId) {
			console.log("GameScreen: Missing game or playerId - waiting...");
			console.table({ game, playerId });
			return;
		}

		// Handle the case where the socket isn't available yet
		if (!socket) {
			console.log(
				"GameScreen: Socket not yet available - waiting for connection",
			);
			return;
		}

		console.log(
			`GameScreen: Ready to connect for player ${playerId} (socket state: ${socket.readyState})`,
		);

		// Safe function to register the player with appropriate error handling
		const registerPlayer = () => {
			try {
				// Double-check the socket is actually in the OPEN state before attempting to send
				if (!socket || socket.readyState !== WebSocket.OPEN) {
					console.warn(
						`GameScreen: Cannot register player - WebSocket not OPEN (current state: ${socket?.readyState})`,
					);
					return;
				}

				console.log(
					`GameScreen: Registering player ${playerId} for game ${game.id}`,
				);

				// Send player registration with error handling
				try {
					// Prepare message with only the required information
					const message = JSON.stringify({
						action: "REGISTER_PLAYER",
						gameId: game.id,
						playerId: playerId,
					});

					// Send the message
					socket.send(message);

					playerRegistered = true;

					console.log(
						"GameScreen: Successfully sent player registration message",
					);
				} catch (error) {
					console.error(
						"GameScreen: Failed to send player registration:",
						error,
					);
				}
			} catch (error) {
				console.error(
					"GameScreen: Error during player registration process:",
					error,
				);
			}
		};

		// Handle socket messages with robust error handling
		const handleSocketMessage = (event: MessageEvent) => {
			try {
				// Parse the message data with error handling
				let data;
				try {
					data = JSON.parse(event.data);
				} catch (parseError) {
					console.error(
						"GameScreen: Failed to parse WebSocket message:",
						parseError,
					);
					return;
				}

				// Process GAME_UPDATE messages with safety checks
				if (data && data.type === "GAME_UPDATE" && data.payload) {
					// Update game state
					setGame(data.payload);

					// Check game status with explicit safety check
					if (data.payload.status === "completed") {
						setShowWinnerModal(true);
					}

					// Update dice selection with safety check
					if (Array.isArray(data.payload.selectedDice)) {
						setSelectedDice(data.payload.selectedDice);
					}
				}
			} catch (error) {
				console.error("GameScreen: Error handling WebSocket message:", error);
			}
		};

		// Define event cleanup handlers
		let removeListeners = () => {
			try {
				if (socket) {
					socket.removeEventListener("message", handleSocketMessage);
				}
			} catch (error) {
				console.error(
					"GameScreen: Error cleaning up WebSocket event listeners:",
					error,
				);
			}
		};

		// Start fresh by clearing any existing listeners
		removeListeners();

		// Set up the message listener
		try {
			socket.addEventListener("message", handleSocketMessage);
		} catch (error) {
			console.error(
				"GameScreen: Error adding WebSocket message listener:",
				error,
			);
		}

		// Register the player based on socket state with proper error handling
		if (socket.readyState === WebSocket.OPEN) {
			if (playerRegistered) {
				console.log(
					"GameScreen: Player already registered, skipping registration",
				);
			} else {
				// Socket is already open, so register immediately
				console.log(
					"GameScreen: Socket is OPEN, registering player immediately",
				);
				registerPlayer();
			}
		} else if (socket.readyState === WebSocket.CONNECTING) {
			// Socket is connecting, so we need to wait for it to open
			console.log("GameScreen: Socket is CONNECTING, waiting for open event");

			// Define the open handler function
			const handleOpen = () => {
				console.log("GameScreen: WebSocket opened, now registering player");
				// Small delay to ensure full connection establishment
				// setTimeout(registerPlayer, 100);
			};

			// Add the open event listener
			try {
				// socket.addEventListener("open", handleOpen);

				// Create a new cleanup function that also removes the open listener
				// const originalRemoveListeners = removeListeners;

				removeListeners = () => {
					// originalRemoveListeners();
					// socket.removeEventListener("open", handleOpen);
				};
			} catch (error) {
				console.error(
					"GameScreen: Error adding WebSocket open listener:",
					error,
				);
			}
		} else {
			// Socket is in CLOSING or CLOSED state, this is not expected
			console.warn(
				`GameScreen: Socket is in unexpected state: ${socket.readyState}`,
			);
		}

		// Return a cleanup function to remove event listeners when component unmounts
		return removeListeners;
	}, [socket, game, playerId]);

	// Function to safely send WebSocket messages with retry and enhanced error handling
	const safeSendMessage = (message: any) => {
		if (!socket) {
			console.warn("GameScreen: No WebSocket connection available");
			toast({
				title: "Connection Issue",
				description: "No connection to game server. Please refresh the page.",
				variant: "destructive",
			});
			return false;
		}

		if (socket.readyState === 1) {
			// WebSocket.OPEN
			try {
				const messageStr = JSON.stringify(message);
				socket.send(messageStr);
				console.log(`GameScreen: Successfully sent message: ${message.action}`);
				return true;
			} catch (error) {
				console.error("GameScreen: Error sending WebSocket message:", error);
				toast({
					title: "Message Error",
					description:
						"Failed to send your action to the server. Please try again.",
					variant: "destructive",
				});
				return false;
			}
		} else {
			console.warn(
				`GameScreen: Socket not ready, current state: ${socket.readyState}`,
			);

			// Show different messages based on the state
			const stateMessages = {
				0: "Connecting to server...", // CONNECTING
				2: "Disconnecting from server...", // CLOSING
				3: "Connection closed. Please refresh the page.", // CLOSED
			};

			toast({
				title: "Connection Issue",
				description:
					stateMessages[socket.readyState as 0 | 2 | 3] ||
					"Please wait while we reconnect to the server",
				variant: "destructive",
			});
			return false;
		}
	};

	// Function to toggle dice selection
	const toggleDiceSelection = (index: number) => {
		if (!isMyTurn || rollingDice) return;

		const newSelected = [...selectedDice];
		newSelected[index] = !newSelected[index];
		setSelectedDice(newSelected);

		// Send selection to server
		if (socket && game && playerId) {
			const selectedIndices = newSelected
				.map((selected, i) => (selected ? i : -1))
				.filter((i) => i >= 0);

			safeSendMessage({
				action: "SELECT_DICE",
				gameId: game.id,
				playerId: playerId,
				data: { diceIndices: selectedIndices },
			});
		}
	};

	// Function to roll dice
	const rollDice = () => {
		if (
			!socket ||
			!game ||
			!playerId ||
			!isMyTurn ||
			game.rollsLeft <= 0 ||
			rollingDice
		)
			return;

		setRollingDice(true);

		// Send roll request to server
		safeSendMessage({
			action: "ROLL_DICE",
			gameId: game.id,
			playerId: playerId,
			data: { selectedDice },
		});

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

		safeSendMessage({
			action: "PASS_TURN",
			gameId: game.id,
			playerId: playerId,
		});
	};

	// Function to score a category
	const scoreCategory = (category: ScoreCategory) => {
		if (!socket || !game || !playerId || !isMyTurn) return;

		safeSendMessage({
			action: "SCORE_CATEGORY",
			gameId: game.id,
			playerId: playerId,
			data: { category },
		});
	};

	// Function to play again
	const playAgain = () => {
		if (!socket || !game || !user) return;

		// Only host can restart the game
		if (game.hostId === user.id) {
			safeSendMessage({
				action: "RESTART_GAME",
				gameId: game.id,
				data: { hostId: user.id },
			});
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
	const currentPlayer = game?.players.find(
		(p) => p.id === game.currentPlayerId,
	);

	// Check if it's current user's turn
	const isMyTurn = game?.currentPlayerId === playerId;

	// Get current player scorecard
	const myPlayer = game?.players.find((p) => p.userId === user.id);

	if (loading) {
		return (
			<div className="to-neutral-dark flex h-screen items-center justify-center bg-gradient-to-b from-primary/20">
				<div className="text-center">
					<div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
					<p className="text-neutral-300">Loading game...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen flex-col">
			<header className="border-b border-neutral-800 bg-neutral-900 px-4 py-2">
				<div className="mx-auto flex max-w-6xl items-center justify-between">
					<div className="flex items-center gap-2">
						<h1 className="font-heading text-xl font-bold">
							<span className="text-[#F59E0B]">YACHT</span>
						</h1>
						<span className="rounded bg-primary/50 px-2 py-0.5 text-xs">
							Round {game?.currentRound}/{game?.maxRounds}
						</span>
					</div>

					<div className="flex items-center gap-4">
						<div className="hidden items-center gap-3 md:flex">
							<div className="text-xs text-neutral-400">Game Code:</div>
							<div className="rounded bg-neutral-800 px-2 py-1 text-sm">
								{gameCode}
							</div>
						</div>

						<Button
							variant="ghost"
							size="icon"
							className="text-neutral-400 hover:text-neutral-200"
							onClick={onLogout}
						>
							<i className="fas fa-sign-out-alt"></i>
						</Button>
					</div>
				</div>
			</header>

			<main className="flex flex-1 flex-col md:flex-row">
				{/* Left sidebar - Players (desktop) */}
				<div className="hidden w-64 border-r border-neutral-800 bg-neutral-900 p-4 md:block">
					<h2 className="mb-3 text-lg font-semibold">Players</h2>

					<div className="space-y-3">
						{game?.players.map((player) => (
							<div
								key={player.id}
								className={`${
									player.id === game.currentPlayerId
										? "border-l-4 border-primary bg-primary/20"
										: "bg-neutral-800"
								} rounded p-3`}
							>
								<div className="flex items-center justify-between">
									<div className="flex items-center gap-2">
										<div
											className={`h-8 w-8 ${
												player.userId === user.id
													? "bg-primary"
													: "bg-[#F59E0B]"
											} flex items-center justify-center rounded-full`}
										>
											<i className="fas fa-user text-sm"></i>
										</div>
										<div>
											<div className="font-medium">{player.username}</div>
											<div
												className={`text-xs ${
													player.id === game.currentPlayerId
														? "text-primary"
														: "text-neutral-400"
												}`}
											>
												{player.id === game.currentPlayerId
													? "Current Turn"
													: "Waiting"}
											</div>
										</div>
									</div>
									<div className="font-['Montserrat'] text-lg font-bold">
										{player.score}
									</div>
								</div>
							</div>
						))}
					</div>

					<div className="mt-8">
						<h2 className="mb-3 text-lg font-semibold">Game Info</h2>
						<div className="space-y-2 rounded bg-neutral-800 p-3 text-sm">
							<div className="flex justify-between">
								<span className="text-neutral-400">Round:</span>
								<span className="font-medium">
									{game?.currentRound}/{game?.maxRounds}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-neutral-400">Time left:</span>
								<span className="font-medium text-[#F59E0B]">
									{game?.turnTimer || 0}s
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-neutral-400">Rolls left:</span>
								<span className="font-medium">{game?.rollsLeft}</span>
							</div>
						</div>
					</div>
				</div>

				{/* Main game area */}
				<div className="flex flex-1 flex-col overflow-y-auto bg-gradient-to-b from-neutral-900 to-neutral-800 p-4 md:p-6">
					{/* Mobile game info bar */}
					<div className="mb-4 flex items-center justify-between rounded-lg bg-neutral-800/80 p-2 text-sm md:hidden">
						<div className="flex items-center gap-2">
							<span className="text-neutral-400">
								Round:{" "}
								<span className="text-white">
									{game?.currentRound}/{game?.maxRounds}
								</span>
							</span>
							<span className="h-1 w-1 rounded-full bg-neutral-600"></span>
							<span className="text-neutral-400">
								Rolls: <span className="text-white">{game?.rollsLeft}</span>
							</span>
						</div>
						<div className="font-medium text-[#F59E0B]">
							<i className="fas fa-clock mr-1"></i> {game?.turnTimer || 0}s
						</div>
					</div>

					{/* Dice area */}
					<div className="mb-6 rounded-xl bg-neutral-800/60 p-4 md:p-6">
						{/* Turn information */}
						<div className="mb-4 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<div
									className={`h-8 w-8 ${
										currentPlayer?.userId === user.id
											? "bg-primary"
											: "bg-[#F59E0B]"
									} flex items-center justify-center rounded-full`}
								>
									<i className="fas fa-user text-sm"></i>
								</div>
								<div>
									<div className="text-lg font-medium">
										{currentPlayer?.username === user.username
											? "Your Turn"
											: `${currentPlayer?.username}'s Turn`}
									</div>
								</div>
							</div>
							<div className="hidden md:block">
								<span className="mr-2 text-sm text-neutral-400">
									Rolls left:
								</span>
								<span className="font-medium">{game?.rollsLeft}</span>
							</div>
						</div>

						{/* 3D Dice Visualization Area */}
						<div className="relative mb-6 h-56 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900/80 md:h-72">
							<DiceBox
								diceValues={game?.currentDice || [1, 1, 1, 1, 1]}
								rolling={rollingDice}
							/>
						</div>

						{/* Dice selection UI */}
						<div className="mb-5 flex justify-center gap-3">
							{(game?.currentDice || [1, 1, 1, 1, 1]).map((die, index) => (
								<button
									key={index}
									className={`flex h-10 w-10 items-center justify-center rounded-lg border-2 md:h-12 md:w-12 ${
										selectedDice[index]
											? "border-primary bg-white text-neutral-900"
											: "border-transparent bg-white text-neutral-900"
									} text-xl font-bold transition-all ${
										isMyTurn && !rollingDice ? "hover:bg-primary/10" : ""
									} ${
										!isMyTurn || rollingDice
											? "cursor-not-allowed opacity-70"
											: "hover:opacity-90"
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
								className={`flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium transition-all md:px-6 ${
									!isMyTurn || game?.rollsLeft === 0 || rollingDice
										? "cursor-not-allowed opacity-70"
										: "hover:bg-primary/80"
								}`}
								onClick={rollDice}
								disabled={!isMyTurn || game?.rollsLeft === 0 || rollingDice}
							>
								<i className="fas fa-dice"></i> Roll Dice ({game?.rollsLeft})
							</Button>

							<Button
								className={`flex items-center gap-2 rounded-lg bg-neutral-700 px-4 py-2 font-medium transition-all md:px-6 ${
									!isMyTurn || rollingDice
										? "cursor-not-allowed opacity-70"
										: "hover:bg-neutral-600"
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
				<div className="hidden w-72 flex-col border-l border-neutral-800 bg-neutral-900 lg:block">
					<div className="flex flex-1 flex-col">
						<div className="border-b border-neutral-800 p-4">
							<h2 className="text-lg font-semibold">Game Chat</h2>
						</div>

						<div className="flex-1 space-y-3 overflow-y-auto p-4">
							<div className="flex flex-col">
								<div className="mb-1 text-xs text-neutral-500">System</div>
								<div className="rounded-lg bg-neutral-800/50 p-2 text-xs text-neutral-400">
									Chat functionality coming soon...
								</div>
							</div>
						</div>

						<div className="border-t border-neutral-800 p-4">
							<div className="flex gap-2">
								<input
									type="text"
									className="flex-1 rounded border border-neutral-700 bg-neutral-800 p-2 text-sm outline-none focus:border-primary"
									placeholder="Type a message..."
									disabled
								/>
								<Button
									className="flex w-10 items-center justify-center rounded bg-primary hover:bg-primary/80"
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
			<div className="border-t border-neutral-800 bg-neutral-900 p-3 md:hidden">
				<div className="flex justify-around">
					{game?.players.slice(0, 2).map((player) => (
						<div key={player.id} className="flex flex-col items-center">
							<div
								className={`h-8 w-8 ${
									player.userId === user.id ? "bg-primary" : "bg-[#F59E0B]"
								} mb-1 flex items-center justify-center rounded-full ${
									player.id === game.currentPlayerId ? "ring-2 ring-white" : ""
								}`}
							>
								<i className="fas fa-user text-sm"></i>
							</div>
							<div className="text-sm font-medium">
								{player.userId === user.id ? "You" : player.username}
							</div>
							<div className="font-['Montserrat'] text-xs font-bold">
								{player.score}
							</div>
						</div>
					))}

					{/* More button if more than 2 players */}
					{game?.players && game.players.length > 2 && (
						<div className="flex flex-col items-center text-neutral-400">
							<div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800">
								<i className="fas fa-ellipsis-h text-sm"></i>
							</div>
							<div className="text-sm">More</div>
							<div className="text-xs font-bold">
								{game.players!.length - 2}
							</div>
						</div>
					)}

					<button className="flex flex-col items-center text-neutral-400">
						<div className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-800">
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
