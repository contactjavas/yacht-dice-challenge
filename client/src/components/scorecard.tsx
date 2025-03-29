import { useState } from "react";
import { ScoreCategory, DiceRoll } from "@shared/types";
import { calculatePotentialScore } from "@/lib/game-utils";

interface ScoreCardProps {
	currentDice: DiceRoll;
	scoreCard:
		| Record<ScoreCategory, number | undefined>
		| {
				[key in ScoreCategory]?: number;
		  };
	isMyTurn: boolean;
	onSelectCategory: (category: ScoreCategory) => void;
}

// Map of categories to display names and descriptions
const categoryInfo: Record<
	ScoreCategory,
	{ name: string; description: string }
> = {
	[ScoreCategory.ONES]: { name: "Ones", description: "Sum of all 1s" },
	[ScoreCategory.TWOS]: { name: "Twos", description: "Sum of all 2s" },
	[ScoreCategory.THREES]: { name: "Threes", description: "Sum of all 3s" },
	[ScoreCategory.FOURS]: { name: "Fours", description: "Sum of all 4s" },
	[ScoreCategory.FIVES]: { name: "Fives", description: "Sum of all 5s" },
	[ScoreCategory.SIXES]: { name: "Sixes", description: "Sum of all 6s" },
	[ScoreCategory.THREE_OF_A_KIND]: {
		name: "Three of a Kind",
		description: "Sum of all dice if 3+ of one value",
	},
	[ScoreCategory.FOUR_OF_A_KIND]: {
		name: "Four of a Kind",
		description: "Sum of all dice if 4+ of one value",
	},
	[ScoreCategory.FULL_HOUSE]: {
		name: "Full House",
		description: "3 of one value and 2 of another",
	},
	[ScoreCategory.SMALL_STRAIGHT]: {
		name: "Small Straight",
		description: "4 sequential dice",
	},
	[ScoreCategory.LARGE_STRAIGHT]: {
		name: "Large Straight",
		description: "5 sequential dice",
	},
	[ScoreCategory.YACHT]: { name: "Yacht", description: "5 of the same value" },
	[ScoreCategory.CHANCE]: { name: "Chance", description: "Sum of all dice" },
};

export default function Scorecard({
	currentDice,
	scoreCard,
	isMyTurn,
	onSelectCategory,
}: ScoreCardProps) {
	const [hoveredCategory, setHoveredCategory] = useState<ScoreCategory | null>(
		null,
	);

	// Calculate the upper section total (Ones through Sixes)
	const upperSectionTotal = [
		scoreCard[ScoreCategory.ONES] || 0,
		scoreCard[ScoreCategory.TWOS] || 0,
		scoreCard[ScoreCategory.THREES] || 0,
		scoreCard[ScoreCategory.FOURS] || 0,
		scoreCard[ScoreCategory.FIVES] || 0,
		scoreCard[ScoreCategory.SIXES] || 0,
	].reduce((sum, score) => sum + score, 0);

	// Check if bonus is applied (63+ points in upper section)
	const upperSectionBonus = upperSectionTotal >= 63 ? 35 : 0;

	// Calculate total score
	const totalScore =
		Object.values(ScoreCategory)
			.map((category) => scoreCard[category] || 0)
			.reduce((sum, score) => sum + score, 0) + upperSectionBonus;

	// Function to render a category row
	const renderCategoryRow = (category: ScoreCategory) => {
		const isScored = scoreCard[category] !== undefined;
		const potentialScore = isScored
			? null
			: calculatePotentialScore(currentDice, category);
		const isHighPotential =
			potentialScore &&
			((category === ScoreCategory.FULL_HOUSE && potentialScore === 25) ||
				(category === ScoreCategory.SMALL_STRAIGHT && potentialScore === 30) ||
				(category === ScoreCategory.LARGE_STRAIGHT && potentialScore === 40) ||
				(category === ScoreCategory.YACHT && potentialScore === 50));

		// Determine if row is interactive
		const isInteractive = isMyTurn && !isScored;
		const isHovered = hoveredCategory === category;

		return (
			<tr
				key={category}
				className={`border-b border-neutral-700/50 ${
					isInteractive
						? "cursor-pointer transition-colors hover:bg-neutral-700/30"
						: ""
				} ${isHovered ? "bg-neutral-700/20" : ""}`}
				onClick={() => isInteractive && onSelectCategory(category)}
				onMouseEnter={() => isInteractive && setHoveredCategory(category)}
				onMouseLeave={() => isInteractive && setHoveredCategory(null)}
			>
				<td className="px-3 py-2.5 font-medium">
					{categoryInfo[category].name}
				</td>
				<td className="px-3 py-2.5 text-center text-neutral-400">
					{categoryInfo[category].description}
				</td>
				<td className="px-3 py-2.5 text-center">
					<div
						className={`inline-block rounded px-3 py-1 ${
							isScored
								? scoreCard[category]! > 0
									? "bg-primary/30"
									: "bg-neutral-700"
								: isInteractive
									? isHighPotential
										? "bg-[#10B981]/30 hover:bg-[#10B981]/40"
										: potentialScore && potentialScore > 0
											? "bg-primary/20 hover:bg-primary/30"
											: "bg-neutral-700 hover:bg-primary/20"
									: "bg-neutral-700"
						}`}
					>
						{isScored
							? scoreCard[category]
							: isInteractive
								? potentialScore
								: 0}
					</div>
				</td>
			</tr>
		);
	};

	return (
		<div className="overflow-x-auto rounded-xl bg-neutral-800/60 p-4 md:p-6">
			<h2 className="mb-4 text-lg font-semibold">Scorecard</h2>

			<div className="min-w-full overflow-x-auto">
				<table className="min-w-full text-sm">
					<thead>
						<tr className="border-b border-neutral-700">
							<th className="px-3 py-2 text-left">Category</th>
							<th className="px-3 py-2 text-center">Description</th>
							<th className="px-3 py-2 text-center">Points</th>
						</tr>
					</thead>
					<tbody>
						{/* Upper section */}
						{renderCategoryRow(ScoreCategory.ONES)}
						{renderCategoryRow(ScoreCategory.TWOS)}
						{renderCategoryRow(ScoreCategory.THREES)}
						{renderCategoryRow(ScoreCategory.FOURS)}
						{renderCategoryRow(ScoreCategory.FIVES)}
						{renderCategoryRow(ScoreCategory.SIXES)}

						{/* Upper section bonus */}
						<tr className="bg-neutral-700/20">
							<td colSpan={2} className="px-3 py-2 font-medium">
								Upper Section Bonus (63+ = 35pts)
							</td>
							<td className="px-3 py-2 text-center font-medium">
								{upperSectionTotal}/63{" "}
								{upperSectionBonus > 0 && `(+${upperSectionBonus})`}
							</td>
						</tr>

						{/* Lower section */}
						{renderCategoryRow(ScoreCategory.THREE_OF_A_KIND)}
						{renderCategoryRow(ScoreCategory.FOUR_OF_A_KIND)}
						{renderCategoryRow(ScoreCategory.FULL_HOUSE)}
						{renderCategoryRow(ScoreCategory.SMALL_STRAIGHT)}
						{renderCategoryRow(ScoreCategory.LARGE_STRAIGHT)}
						{renderCategoryRow(ScoreCategory.YACHT)}
						{renderCategoryRow(ScoreCategory.CHANCE)}

						{/* Total score */}
						<tr className="bg-neutral-700/30">
							<td colSpan={2} className="px-3 py-2.5 text-lg font-medium">
								Total Score
							</td>
							<td className="px-3 py-2.5 text-center font-['Montserrat'] text-lg font-bold">
								{totalScore}
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	);
}
