import { DiceRoll, ScoreCategory } from "@shared/types";

/**
 * Calculate potential score for the current dice in a given category
 * @param dice Current dice values
 * @param category Score category to calculate for
 * @returns The potential score for the category
 */
export function calculatePotentialScore(
	dice: DiceRoll,
	category: ScoreCategory,
): number {
	const counts = Array(6).fill(0);

	// Count occurrences of each value
	dice.forEach((value) => {
		counts[value - 1]++;
	});

	const sum = dice.reduce((total, value) => total + value, 0);

	switch (category) {
		// Upper section (Ones through Sixes)
		case ScoreCategory.ONES:
			return counts[0] * 1;
		case ScoreCategory.TWOS:
			return counts[1] * 2;
		case ScoreCategory.THREES:
			return counts[2] * 3;
		case ScoreCategory.FOURS:
			return counts[3] * 4;
		case ScoreCategory.FIVES:
			return counts[4] * 5;
		case ScoreCategory.SIXES:
			return counts[5] * 6;

		// Lower section
		case ScoreCategory.THREE_OF_A_KIND:
			return counts.some((count) => count >= 3) ? sum : 0;

		case ScoreCategory.FOUR_OF_A_KIND:
			return counts.some((count) => count >= 4) ? sum : 0;

		case ScoreCategory.FULL_HOUSE:
			// Check if there's a 3 of a kind and a 2 of a kind
			const hasThree = counts.some((count) => count === 3);
			const hasTwo = counts.some((count) => count === 2);
			return hasThree && hasTwo ? 25 : 0;

		case ScoreCategory.SMALL_STRAIGHT: {
			// Check for 1-2-3-4 or 2-3-4-5 or 3-4-5-6
			if (
				(counts[0] >= 1 &&
					counts[1] >= 1 &&
					counts[2] >= 1 &&
					counts[3] >= 1) ||
				(counts[1] >= 1 &&
					counts[2] >= 1 &&
					counts[3] >= 1 &&
					counts[4] >= 1) ||
				(counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 && counts[5] >= 1)
			) {
				return 30;
			}
			return 0;
		}

		case ScoreCategory.LARGE_STRAIGHT: {
			// Check for 1-2-3-4-5 or 2-3-4-5-6
			if (
				(counts[0] >= 1 &&
					counts[1] >= 1 &&
					counts[2] >= 1 &&
					counts[3] >= 1 &&
					counts[4] >= 1) ||
				(counts[1] >= 1 &&
					counts[2] >= 1 &&
					counts[3] >= 1 &&
					counts[4] >= 1 &&
					counts[5] >= 1)
			) {
				return 40;
			}
			return 0;
		}

		case ScoreCategory.YACHT:
			return counts.some((count) => count === 5) ? 50 : 0;

		case ScoreCategory.CHANCE:
			return sum;

		default:
			return 0;
	}
}

/**
 * Get best available scoring categories for current dice
 * @param dice Current dice values
 * @param scoreCard Current scorecard with filled categories
 * @returns Array of categories sorted by potential score (highest first)
 */
export function getBestCategories(
	dice: DiceRoll,
	scoreCard: Record<ScoreCategory, number | undefined>,
): ScoreCategory[] {
	const availableCategories = Object.values(ScoreCategory).filter(
		(cat) => scoreCard[cat] === undefined,
	);

	// Calculate potential score for each available category
	const categoriesWithScores = availableCategories.map((category) => ({
		category,
		score: calculatePotentialScore(dice, category),
	}));

	// Sort by score (highest first)
	return categoriesWithScores
		.sort((a, b) => b.score - a.score)
		.map((item) => item.category);
}

/**
 * Check if dice qualify for a category
 * @param dice Current dice values
 * @param category Category to check for
 * @returns True if dice qualify for the category
 */
export function qualifiesForCategory(
	dice: DiceRoll,
	category: ScoreCategory,
): boolean {
	const score = calculatePotentialScore(dice, category);

	// For upper section, any dice qualify
	if (
		[
			ScoreCategory.ONES,
			ScoreCategory.TWOS,
			ScoreCategory.THREES,
			ScoreCategory.FOURS,
			ScoreCategory.FIVES,
			ScoreCategory.SIXES,
			ScoreCategory.CHANCE,
		].includes(category)
	) {
		return true;
	}

	// For special categories, check if there's a non-zero score
	switch (category) {
		case ScoreCategory.THREE_OF_A_KIND:
		case ScoreCategory.FOUR_OF_A_KIND:
		case ScoreCategory.FULL_HOUSE:
		case ScoreCategory.SMALL_STRAIGHT:
		case ScoreCategory.LARGE_STRAIGHT:
		case ScoreCategory.YACHT:
			return score > 0;
		default:
			return true;
	}
}

/**
 * Calculate the total score for a scorecard
 * @param scoreCard Completed or partial scorecard
 * @returns Total score including upper section bonus
 */
export function calculateTotalScore(
	scoreCard: Record<ScoreCategory, number | undefined>,
): number {
	// Calculate upper section score
	const upperSectionScore = [
		scoreCard[ScoreCategory.ONES] || 0,
		scoreCard[ScoreCategory.TWOS] || 0,
		scoreCard[ScoreCategory.THREES] || 0,
		scoreCard[ScoreCategory.FOURS] || 0,
		scoreCard[ScoreCategory.FIVES] || 0,
		scoreCard[ScoreCategory.SIXES] || 0,
	].reduce((sum, score) => sum + score, 0);

	// Apply bonus if upper section score is 63 or more
	const bonus = upperSectionScore >= 63 ? 35 : 0;

	// Calculate total including lower section
	const lowerSectionScore = [
		scoreCard[ScoreCategory.THREE_OF_A_KIND] || 0,
		scoreCard[ScoreCategory.FOUR_OF_A_KIND] || 0,
		scoreCard[ScoreCategory.FULL_HOUSE] || 0,
		scoreCard[ScoreCategory.SMALL_STRAIGHT] || 0,
		scoreCard[ScoreCategory.LARGE_STRAIGHT] || 0,
		scoreCard[ScoreCategory.YACHT] || 0,
		scoreCard[ScoreCategory.CHANCE] || 0,
	].reduce((sum, score) => sum + score, 0);

	return upperSectionScore + bonus + lowerSectionScore;
}

/**
 * Suggest dice to keep for the next roll based on current values
 * @param dice Current dice values
 * @returns Array of booleans indicating which dice to keep (true) or reroll (false)
 */
export function suggestDiceToKeep(dice: DiceRoll): boolean[] {
	const counts = Array(6).fill(0);

	// Count occurrences of each value
	dice.forEach((value) => {
		counts[value - 1]++;
	});

	// Find the most common value
	const maxCount = Math.max(...counts);
	const mostCommonValue = counts.findIndex((count) => count === maxCount) + 1;

	// Check for straights
	const hasValuesForSmallStraight =
		(counts[0] && counts[1] && counts[2] && counts[3]) ||
		(counts[1] && counts[2] && counts[3] && counts[4]) ||
		(counts[2] && counts[3] && counts[4] && counts[5]);

	const hasValuesForLargeStraight =
		(counts[0] && counts[1] && counts[2] && counts[3] && counts[4]) ||
		(counts[1] && counts[2] && counts[3] && counts[4] && counts[5]);

	// Suggest dice to keep
	if (maxCount >= 3) {
		// Keep all dice of the most common value
		return dice.map((value) => value === mostCommonValue);
	} else if (hasValuesForLargeStraight) {
		// Keep all dice that form part of a large straight
		if (counts[0] && counts[1] && counts[2] && counts[3] && counts[4]) {
			return dice.map((value) => value >= 1 && value <= 5);
		} else {
			return dice.map((value) => value >= 2 && value <= 6);
		}
	} else if (hasValuesForSmallStraight) {
		// Keep all dice that form part of a small straight
		if (counts[0] && counts[1] && counts[2] && counts[3]) {
			return dice.map((value) => value >= 1 && value <= 4);
		} else if (counts[1] && counts[2] && counts[3] && counts[4]) {
			return dice.map((value) => value >= 2 && value <= 5);
		} else {
			return dice.map((value) => value >= 3 && value <= 6);
		}
	} else if (maxCount === 2) {
		// Keep the pair
		return dice.map((value) => value === mostCommonValue);
	} else {
		// Keep high values (5s and 6s)
		return dice.map((value) => value >= 5);
	}
}
