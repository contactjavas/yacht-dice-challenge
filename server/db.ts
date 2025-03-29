import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

let pool;
let db: NeonDatabase<typeof schema>;

// For development purposes, provide a mock database if DATABASE_URL is not set
if (!process.env.DATABASE_URL) {
	console.warn(
		"WARNING: DATABASE_URL not set. Running with mock in-memory database for development.",
	);

	// Create a mock in-memory database with typed data
	const mockData: Record<string, any[]> = {
		users: [],
		games: [],
		players: [],
		rounds: [],
		scoreCards: [],
	};

	// Mock database implementation with type assertion to match NeonDatabase
	db = {
		select: () => ({
			from: (table: any) => ({
				where: () => Promise.resolve([]),
				orderBy: () => Promise.resolve([]),
				limit: () => Promise.resolve([]),
				execute: () => Promise.resolve([]),
			}),
			execute: () => Promise.resolve([]),
		}),
		insert: (table: any) => ({
			values: (data: any) => ({
				returning: () => {
					// Find the table name by comparing the table object
					let tableName = "";
					for (const key in schema) {
						if (schema[key as keyof typeof schema] === table) {
							tableName = key.toLowerCase() + "s"; // Convert to plural form
							break;
						}
					}

					if (!tableName || !mockData[tableName]) {
						console.warn(`Mock DB: Unknown table ${tableName}`);
						return Promise.resolve([]);
					}

					const newItem = { ...data, id: mockData[tableName].length + 1 };
					mockData[tableName].push(newItem);
					return Promise.resolve([newItem]);
				},
			}),
		}),
		update: (table: any) => ({
			set: (updates: any) => ({
				where: () => ({
					returning: () => Promise.resolve([{ ...updates, id: 1 }]),
				}),
			}),
		}),
		delete: (table: any) => ({
			where: () => ({
				returning: () => Promise.resolve([{ id: 1 }]),
				execute: () => Promise.resolve(),
			}),
		}),
	} as unknown as NeonDatabase<typeof schema>;
} else {
	pool = new Pool({ connectionString: process.env.DATABASE_URL });
	db = drizzle({ client: pool, schema });
}

export { pool, db };
