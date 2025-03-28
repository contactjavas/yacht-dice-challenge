import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  username: text('username').unique().notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true
});

export const games = sqliteTable('games', {
  id: integer('id').primaryKey(),
  code: text('code').unique().notNull(),
  hostId: integer('host_id').notNull(),
  status: text('status', { enum: ['waiting', 'in_progress', 'completed'] }).default('waiting'),
  currentPlayerId: integer('current_player_id'),
  currentRound: integer('current_round').default(1),
  maxRounds: integer('max_rounds').default(12),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

export const insertGameSchema = createInsertSchema(games).omit({
  id: true,
  createdAt: true,
  currentRound: true,
  maxRounds: true,
  currentPlayerId: true
});

export const players = sqliteTable('players', {
  id: integer('id').primaryKey(),
  gameId: integer('game_id').notNull(),
  userId: integer('user_id').notNull(),
  score: integer('score').default(0),
  turnOrder: integer('turn_order').notNull(),
  isReady: integer('is_ready', { mode: 'boolean' }).default(false),
  disconnected: integer('disconnected', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

export const insertPlayerSchema = createInsertSchema(players).omit({
  id: true,
  score: true,
  isReady: true,
  disconnected: true,
  createdAt: true
});

export const rounds = sqliteTable('rounds', {
  id: integer('id').primaryKey(),
  gameId: integer('game_id').notNull(),
  playerId: integer('player_id').notNull(),
  roundNumber: integer('round_number').notNull(),
  diceValues: text('dice_values').notNull(),
  category: text('category'),
  score: integer('score').default(0),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

export const insertRoundSchema = createInsertSchema(rounds).omit({
  id: true,
  score: true,
  createdAt: true
});

export const scoreCards = sqliteTable('score_cards', {
  id: integer('id').primaryKey(),
  playerId: integer('player_id').notNull(),
  gameId: integer('game_id').notNull(),
  ones: integer('ones'),
  twos: integer('twos'),
  threes: integer('threes'),
  fours: integer('fours'),
  fives: integer('fives'),
  sixes: integer('sixes'),
  threeOfAKind: integer('three_of_a_kind'),
  fourOfAKind: integer('four_of_a_kind'),
  fullHouse: integer('full_house'),
  smallStraight: integer('small_straight'),
  largeStraight: integer('large_straight'),
  yacht: integer('yacht'),
  chance: integer('chance'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

export const insertScoreCardSchema = createInsertSchema(scoreCards).omit({
  id: true,
  createdAt: true
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Game = typeof games.$inferSelect;
export type InsertGame = z.infer<typeof insertGameSchema>;

export type Player = typeof players.$inferSelect;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;

export type Round = typeof rounds.$inferSelect;
export type InsertRound = z.infer<typeof insertRoundSchema>;

export type ScoreCard = typeof scoreCards.$inferSelect;
export type InsertScoreCard = z.infer<typeof insertScoreCardSchema>;
