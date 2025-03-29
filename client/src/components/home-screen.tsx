import { useState, FormEvent } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { User } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

interface HomeScreenProps {
	user: User | null;
	onLogin: (username: string) => Promise<void>;
	onLogout: () => void;
}

export default function HomeScreen({
	user,
	onLogin,
	onLogout,
}: HomeScreenProps) {
	const [, navigate] = useLocation();
	const { toast } = useToast();
	const [gameCode, setGameCode] = useState("");
	const [username, setUsername] = useState("");
	const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
	const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
	const [isAboutOpen, setIsAboutOpen] = useState(false);

	// Handle game creation
	const handleCreateGame = async () => {
		if (!user) {
			setIsLoginDialogOpen(true);
			return;
		}

		// Debug log - check what user data is available
		console.log("User data when creating game:", user);

		try {
			const res = await fetch("/api/games", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ hostId: user.id }),
			});

			// Debug log - check response
			console.log("Create game response status:", res.status);

			if (!res.ok) {
				const errorData = await res.json();
				console.error("Error data:", errorData);

				toast({
					title: "Error",
					description: errorData.message || "Failed to create game",
					variant: "destructive",
				});
				return;
			}

			const game = await res.json();
			console.log("Game created:", game);
			navigate(`/lobby/${game.code}`);
		} catch (error) {
			console.error("Create game error:", error);
			toast({
				title: "Error",
				description: "Failed to connect to server",
				variant: "destructive",
			});
		}
	};

	// Handle game joining
	const handleJoinGame = (e: FormEvent) => {
		e.preventDefault();

		if (!gameCode.trim()) {
			toast({
				title: "Missing Game Code",
				description: "Please enter a valid game code",
				variant: "destructive",
			});
			return;
		}

		if (!user) {
			setIsLoginDialogOpen(true);
			return;
		}

		navigate(`/lobby/${gameCode.trim().toUpperCase()}`);
	};

	// Handle user login
	const handleLoginSubmit = async (e: FormEvent) => {
		e.preventDefault();

		if (!username.trim()) {
			toast({
				title: "Missing Username",
				description: "Please enter a valid username",
				variant: "destructive",
			});
			return;
		}

		await onLogin(username);
		setIsLoginDialogOpen(false);
	};

	return (
		<div className="to-neutral-dark flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-primary/20 p-4 text-center">
			<Card className="bg-neutral-dark w-full max-w-md rounded-xl border border-primary/30 shadow-2xl">
				<CardContent className="p-8">
					<h1 className="font-heading mb-1 text-4xl font-bold text-white">
						<span className="text-[#F59E0B]">YACHT</span>
						<span className="rounded-md bg-primary/80 px-2 py-1 align-top text-xs">
							DICE
						</span>
					</h1>
					<p className="mb-8 text-neutral-700">Multiplayer Dice Game</p>

					<div className="space-y-4">
						<Button
							className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-6 font-medium transition-all hover:bg-primary/80"
							onClick={
								!user ? () => setIsLoginDialogOpen(true) : handleCreateGame
							}
						>
							<i className="fas fa-plus-circle"></i>{" "}
							{!user ? "Create User" : "Create Game"}
						</Button>

						<div className="relative flex w-full items-center justify-center">
							<Separator className="absolute w-full bg-neutral-600" />
							<span className="relative flex h-6 items-center justify-center rounded-full border border-neutral-600 bg-neutral-800 px-4 text-sm text-neutral-400">
								or
							</span>
						</div>

						<form onSubmit={handleJoinGame} className="space-y-4">
							<div className="flex overflow-hidden rounded-lg border border-neutral-600">
								<Input
									type="text"
									placeholder="Enter game code"
									className="flex-1 border-none bg-neutral-800 p-3 outline-none focus-visible:ring-0"
									value={gameCode}
									onChange={(e) => setGameCode(e.target.value)}
								/>
								<Button
									type="submit"
									className="rounded-none bg-[#F59E0B] px-4 font-medium transition-all hover:bg-[#F59E0B]/80"
								>
									Join
								</Button>
							</div>
						</form>
					</div>

					<div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm text-neutral-400">
						<Button
							variant="link"
							className="p-0 text-primary hover:underline"
							onClick={() => setIsHowToPlayOpen(true)}
						>
							How to play
						</Button>{" "}
						•
						<Button
							variant="link"
							className="p-0 text-primary hover:underline"
							onClick={() => setIsAboutOpen(true)}
						>
							About
						</Button>
						{user && (
							<>
								•
								<Button
									variant="link"
									className="p-0 text-red-500 hover:underline"
									onClick={onLogout}
								>
									Logout ({user.username})
								</Button>
							</>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Login Dialog */}
			<Dialog open={isLoginDialogOpen} onOpenChange={setIsLoginDialogOpen}>
				<DialogContent className="border-neutral-700 bg-neutral-800 text-white">
					<DialogHeader>
						<DialogTitle className="font-heading text-xl">
							Enter Your Username
						</DialogTitle>
						<DialogDescription className="text-neutral-400">
							Choose a username to play Yacht Dice
						</DialogDescription>
					</DialogHeader>

					<form onSubmit={handleLoginSubmit} className="mt-4 space-y-4">
						<Input
							type="text"
							placeholder="Username"
							className="border-neutral-700 bg-neutral-900"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							autoFocus
						/>

						<div className="flex justify-end gap-2">
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsLoginDialogOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit">Continue</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>

			{/* How to Play Dialog */}
			<Dialog open={isHowToPlayOpen} onOpenChange={setIsHowToPlayOpen}>
				<DialogContent className="max-w-2xl border-neutral-700 bg-neutral-800 text-white">
					<DialogHeader>
						<DialogTitle className="font-heading text-xl">
							How to Play Yacht Dice
						</DialogTitle>
					</DialogHeader>

					<div className="mt-4 max-h-[60vh] space-y-4 overflow-y-auto">
						<div>
							<h3 className="mb-2 text-lg font-semibold">Game Objective</h3>
							<p className="text-neutral-300">
								Score the most points by rolling dice and filling categories on
								your scorecard.
							</p>
						</div>

						<div>
							<h3 className="mb-2 text-lg font-semibold">Gameplay</h3>
							<ol className="list-decimal space-y-2 pl-5 text-neutral-300">
								<li>On your turn, you can roll the dice up to 3 times</li>
								<li>
									After the first roll, you can select which dice to keep and
									which to reroll
								</li>
								<li>
									After your rolls, you must choose a category to score in
								</li>
								<li>Once a category is used, it cannot be used again</li>
								<li>The game lasts 12 rounds (one for each category)</li>
							</ol>
						</div>

						<div>
							<h3 className="mb-2 text-lg font-semibold">Scoring Categories</h3>
							<ul className="space-y-2 text-neutral-300">
								<li>
									<span className="font-medium">Ones through Sixes</span>: Sum
									of dice showing that number
								</li>
								<li>
									<span className="font-medium">Three of a Kind</span>: Sum of
									all dice if 3+ of one value
								</li>
								<li>
									<span className="font-medium">Four of a Kind</span>: Sum of
									all dice if 4+ of one value
								</li>
								<li>
									<span className="font-medium">Full House</span>: 25 points for
									3 of one value and 2 of another
								</li>
								<li>
									<span className="font-medium">Small Straight</span>: 30 points
									for 4 sequential dice
								</li>
								<li>
									<span className="font-medium">Large Straight</span>: 40 points
									for 5 sequential dice
								</li>
								<li>
									<span className="font-medium">Yacht</span>: 50 points for 5 of
									the same value
								</li>
								<li>
									<span className="font-medium">Chance</span>: Sum of all dice
									(can be used for any roll)
								</li>
							</ul>
						</div>

						<div>
							<h3 className="mb-2 text-lg font-semibold">
								Upper Section Bonus
							</h3>
							<p className="text-neutral-300">
								If your total in the upper section (Ones through Sixes) is 63 or
								more, you get a 35 point bonus.
							</p>
						</div>

						<div>
							<h3 className="mb-2 text-lg font-semibold">Winning</h3>
							<p className="text-neutral-300">
								The player with the highest total score after all rounds wins!
							</p>
						</div>
					</div>

					<div className="mt-4 flex justify-end">
						<Button onClick={() => setIsHowToPlayOpen(false)}>Close</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* About Dialog */}
			<Dialog open={isAboutOpen} onOpenChange={setIsAboutOpen}>
				<DialogContent className="border-neutral-700 bg-neutral-800 text-white">
					<DialogHeader>
						<DialogTitle className="font-heading text-xl">
							About Yacht Dice
						</DialogTitle>
					</DialogHeader>

					<div className="mt-4 space-y-4">
						<p className="text-neutral-300">
							Yacht Dice is a multiplayer dice game similar to Yahtzee. The game
							features real-time gameplay with 3D dice visualization.
						</p>

						<p className="text-neutral-300">
							Built with React, TailwindCSS, and Hono, using WebSockets for
							multiplayer functionality.
						</p>

						<p className="text-neutral-300">
							Dice graphics powered by dice-box for 3D visualization and
							dice-roller for fair, server-side dice generation.
						</p>
					</div>

					<div className="mt-4 flex justify-end">
						<Button onClick={() => setIsAboutOpen(false)}>Close</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
