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

export default function LobbyScreen({
	user,
	gameCode,
	onLogout,
}: LobbyScreenProps) {
	const [, navigate] = useLocation();
	const { toast } = useToast();
	const [loading, setLoading] = useState(true);
	const [game, setGame] = useState<GameState | null>(null);
	const [playerId, setPlayerId] = useState<number | null>(null);
	const [copied, setCopied] = useState(false);
	const [cleanupData, setCleanupData] = useState<{
		timeoutId: number;
		listener: (event: MessageEvent) => void;
	} | null>(null);

	const socket = useWebSocket();

	// Effect to join the game
	useEffect(() => {
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
				navigate("/");
			} finally {
				setLoading(false);
			}
		};

		joinGame();
	}, [gameCode, user.id, navigate, toast]);

	// Setup WebSocket connection with more robust error handling
	useEffect(() => {
		// Don't try to use WebSocket until all required data is available
		if (!game || !playerId || !socket) {
			console.log(
				"WebSocket setup: Missing game, playerId, or socket - waiting...",
			);
			return;
		}

		// Track if we've already registered to prevent duplicate registrations
		let hasRegistered = false;

		console.log(
			`WebSocket setup: Ready to connect for player ${playerId} (socket state: ${socket.readyState})`,
		);

		// Safe function to register the player with appropriate error handling
		const registerPlayer = () => {
			try {
				// Double-check the socket is actually in the OPEN state before attempting to send
				if (!socket || socket.readyState !== WebSocket.OPEN || hasRegistered) {
					if (hasRegistered) {
						console.log("Player already registered, skipping registration");
					} else {
						console.warn(
							`Cannot register player - WebSocket not OPEN (current state: ${socket?.readyState})`,
						);
					}
					return;
				}

				console.log(`Registering player ${playerId} for game ${game.id}`);

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
					console.log("Successfully sent player registration message");
					hasRegistered = true;
				} catch (error) {
					console.error("Failed to send player registration:", error);
				}
			} catch (error) {
				console.error("Error during player registration process:", error);
			}
		};

		// Handle socket messages with error handling
		const handleSocketMessage = (event: MessageEvent) => {
			try {
				// Parse the message data with error handling
				let data;
				try {
					data = JSON.parse(event.data);
					console.log("WebSocket message received:", data);
				} catch (parseError) {
					console.error("Failed to parse WebSocket message:", parseError);
					return;
				}

				// Process GAME_UPDATE messages
				if (data && data.type === "GAME_UPDATE" && data.payload) {
					console.log("Game update received:", data.payload);
					setGame(data.payload);

					// Navigate to game screen if game has started
					if (data.payload.status === "in_progress") {
						console.log(
							"Game status is in_progress, navigating to game screen",
						);
						navigate(`/game/${gameCode}`);
					} else {
						console.log("Game status is:", data.payload.status);
					}
				}
			} catch (error) {
				console.error("Error handling WebSocket message:", error);
			}
		};

		// Define event cleanup handlers
		let removeListeners = () => {
			try {
				if (socket) {
					// Use a direct reference to the function for removal
					socket.removeEventListener("message", handleSocketMessage);
				}
			} catch (error) {
				console.error("Error cleaning up WebSocket event listeners:", error);
			}
		};

		// Start fresh by clearing any existing listeners
		removeListeners();

		// Set up the message listener
		try {
			socket.addEventListener("message", handleSocketMessage);
		} catch (error) {
			console.error("Error adding WebSocket message listener:", error);
		}

		// Register the player based on socket state
		if (socket.readyState === WebSocket.OPEN) {
			// Socket is already open, so register immediately
			console.log("Socket is OPEN, registering player immediately");
			registerPlayer();
		} else if (socket.readyState === WebSocket.CONNECTING) {
			// Socket is connecting, so we need to wait for it to open
			console.log("Socket is CONNECTING, waiting for open event");

			// Define the open handler function
			const handleOpen = () => {
				console.log("WebSocket opened, now registering player");
				// Small delay to ensure full connection establishment
				setTimeout(registerPlayer, 100);
			};

			// Add the open event listener
			try {
				socket.addEventListener("open", handleOpen);

				// Create a new cleanup function that also removes the open listener
				const originalRemoveListeners = removeListeners;
				removeListeners = () => {
					originalRemoveListeners();
					socket.removeEventListener("open", handleOpen);
				};
			} catch (error) {
				console.error("Error adding WebSocket open listener:", error);
			}
		} else {
			// Socket is in CLOSING or CLOSED state, this is not expected
			console.warn(`Socket is in unexpected state: ${socket.readyState}`);
		}

		// Return a cleanup function to remove event listeners when component unmounts
		return removeListeners;
	}, [socket, game?.id, playerId, gameCode, navigate]);

	// Function to safely send WebSocket messages with retry
	const safeSendMessage = (message: any) => {
		if (!socket) {
			console.warn("LobbyScreen: No WebSocket connection available");
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
				console.log(
					`LobbyScreen: Successfully sent message: ${message.action}`,
				);
				return true;
			} catch (error) {
				console.error("LobbyScreen: Error sending WebSocket message:", error);
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
				`LobbyScreen: Socket not ready, current state: ${socket.readyState}`,
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

	// Function to toggle ready status
	const toggleReady = () => {
		if (!socket || !playerId || !game?.id) return;

		safeSendMessage({
			action: "TOGGLE_READY",
			gameId: game.id,
			playerId: playerId,
		});
	};

	// Function to start the game
	const startGame = () => {
		if (!socket || !game) return;

		// Set loading state to provide user feedback
		setLoading(true);

		// Track if we've navigated to prevent double navigation
		let hasNavigated = false;

		// Create a dedicated one-time listener for game start updates
		const gameStartListener = (event: MessageEvent) => {
			try {
				const data = JSON.parse(event.data);
				console.log("Game start listener received:", data);

				if (
					data?.type === "GAME_UPDATE" &&
					data?.payload?.status === "in_progress"
				) {
					if (!hasNavigated) {
						console.log("Game started successfully, navigating to game screen");
						hasNavigated = true;
						setLoading(false);
						// Clean up the listener before navigation
						socket.removeEventListener("message", gameStartListener);
						navigate(`/game/${gameCode}`);
					}
				}
			} catch (error) {
				console.error("Error in game start listener:", error);
				setLoading(false);
				// Remove listener on error to prevent memory leaks
				socket.removeEventListener("message", gameStartListener);
			}
		};

		// Add the temporary listener
		socket.addEventListener("message", gameStartListener);

		// Send the start game message
		const success = safeSendMessage({
			action: "START_GAME",
			gameId: game.id,
			data: { hostId: user.id },
		});

		if (!success) {
			console.error("Failed to send START_GAME message");
			setLoading(false);
			toast({
				title: "Connection Error",
				description: "Failed to start game. Please try again.",
				variant: "destructive",
			});
			// Remove the listener if sending failed
			socket.removeEventListener("message", gameStartListener);
			return;
		}

		// Fallback: If no response after 3 seconds, try direct navigation
		const timeoutId = window.setTimeout(() => {
			if (!hasNavigated) {
				console.log(
					"No game start confirmation received, using fallback navigation",
				);
				hasNavigated = true;
				setLoading(false);
				// Clean up the listener before navigation
				socket.removeEventListener("message", gameStartListener);
				navigate(`/game/${gameCode}`);
			}
		}, 3000);

		// Store the timeout ID and listener reference in a ref so they can be cleaned up
		// if the component unmounts
		const cleanupRef = { timeoutId, listener: gameStartListener };
		setCleanupData(cleanupRef);
	};

	useEffect(() => {
		if (cleanupData) {
			const { timeoutId, listener } = cleanupData;
			return () => {
				clearTimeout(timeoutId);
				socket?.removeEventListener("message", listener);
			};
		}
	}, [cleanupData, socket]);

	// Effect to auto-ready the host in single-player mode
	useEffect(() => {
		// Only proceed if we have game data and player ID
		if (!game || !playerId || !socket) return;
		
		// Check if this is single-player mode (host is the only player)
		const isSinglePlayerMode = game.players.length === 1 && game.hostId === user.id;
		
		// If single-player mode and host is not ready, mark as ready automatically
		if (isSinglePlayerMode && !game.players[0].isReady) {
			console.log("Auto-marking host as ready in single-player mode");
			safeSendMessage({
				action: "TOGGLE_READY",
				gameId: game.id,
				playerId: playerId,
			});
		}
	}, [game, playerId, socket, user.id]);

	// Function to leave the lobby
	const leaveLobby = () => {
		navigate("/");
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

	// Check if game can be started (allowing single-player mode)
	const canStartGame =
		isHost &&
		// Either multiple players where everyone is ready
		(((game?.players.length || 0) >= 2 &&
			game?.players.every(
				(player) => player.isReady || player.userId === user.id,
			)) ||
			// OR single-player mode (just the host)
			((game?.players.length || 0) === 1 &&
				game?.players[0]?.userId === user.id));

	// Check this player's ready status
	const isReady =
		game?.players.find((p) => p.userId === user.id)?.isReady || false;

	if (loading) {
		return (
			<div className="to-neutral-dark flex h-screen items-center justify-center bg-gradient-to-b from-primary/20">
				<div className="text-center">
					<div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
					<p className="text-neutral-300">Joining game...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="to-neutral-dark flex h-screen flex-col bg-gradient-to-b from-primary/20 p-4">
			<div className="mx-auto flex w-full max-w-4xl flex-1 flex-col">
				<header className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
					<h1 className="font-heading text-2xl font-bold">Game Lobby</h1>
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-1.5 text-sm">
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
							className="h-9 w-9 text-neutral-400 transition-colors hover:text-red-500"
							title="Leave game"
							onClick={leaveLobby}
						>
							<i className="fas fa-sign-out-alt"></i>
						</Button>
						<Button
							variant="ghost"
							size="icon"
							className="h-9 w-9 text-neutral-400 transition-colors hover:text-red-500"
							title="Logout"
							onClick={handleLogout}
						>
							<i className="fas fa-power-off"></i>
						</Button>
					</div>
				</header>

				<Card className="flex flex-1 flex-col rounded-xl border border-neutral-700 bg-neutral-800/60 p-6">
					<div className="mb-4 flex items-center justify-between">
						<h2 className="text-xl font-semibold">
							Players{" "}
							<span className="text-sm text-neutral-400">
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
								className={`flex items-center justify-between rounded-lg border bg-neutral-900/60 p-3 ${
									player.userId === user.id
										? "border-primary/50"
										: "border-neutral-700"
								}`}
							>
								<div className="flex items-center gap-3">
									<div
										className={`h-10 w-10 ${
											player.userId === user.id ? "bg-primary" : "bg-[#F59E0B]"
										} flex items-center justify-center rounded-full text-white`}
									>
										<i className="fas fa-user"></i>
									</div>
									<div>
										<div className="flex items-center gap-2 font-semibold">
											{player.username}
											{player.isHost && (
												<span className="rounded-sm bg-primary/80 px-1.5 py-0.5 text-xs">
													Host
												</span>
											)}
										</div>
										<div className="text-xs text-neutral-400">
											{player.isReady ? "Ready to play" : "Not ready"}
										</div>
									</div>
								</div>
								<div
									className={
										player.isReady ? "text-green-500" : "text-neutral-500"
									}
								>
									<i
										className={`fas ${player.isReady ? "fa-check-circle" : "fa-circle"}`}
									></i>
								</div>
							</div>
						))}

						{/* Empty slots */}
						{Array.from({ length: 4 - (game?.players.length || 0) }).map(
							(_, index) => (
								<div
									key={`empty-${index}`}
									className="flex items-center justify-between rounded-lg border border-dashed border-neutral-800/50 bg-neutral-900/60 p-3"
								>
									<div className="flex items-center gap-3 text-neutral-500">
										<div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-800">
											<i className="fas fa-user"></i>
										</div>
										<div>
											<div className="font-semibold">Waiting for player...</div>
										</div>
									</div>
								</div>
							),
						)}
					</div>

					<div className="mt-4 border-t border-neutral-700 pt-4">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<div className="mb-1 text-sm text-neutral-300">
									<i className="fas fa-info-circle mr-1"></i>
									{game?.players.length === 1
										? "You can start playing alone (single-player mode) or wait for more players to join..."
										: isHost && !canStartGame
											? "Waiting for all players to be ready..."
											: "Ready to start when the host is ready!"}
								</div>
								<div className="text-xs text-neutral-400">
									{isHost && game?.players.length === 1
										? "You can start the game in single-player mode for practice, or invite others to join."
										: "Game will start when the host is ready and at least one player is present."}
								</div>
							</div>

							<div className="flex gap-2 self-end sm:self-auto">
								{!isHost && (
									<Button
										className={`px-5 py-2 ${
											isReady
												? "bg-green-600 hover:bg-green-700"
												: "bg-neutral-700 hover:bg-neutral-600"
										} flex items-center gap-2 rounded-lg font-medium transition-all`}
										onClick={toggleReady}
									>
										<i
											className={`fas ${isReady ? "fa-check" : "fa-thumbs-up"}`}
										></i>
										{isReady ? "Ready!" : "Ready Up"}
									</Button>
								)}

								{isHost && (
									<Button
										className="flex items-center gap-2 rounded-lg bg-[#10B981] px-5 py-2 font-medium transition-all hover:bg-[#10B981]/80"
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
