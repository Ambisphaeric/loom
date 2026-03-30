import type {
	CredentialProvider,
	CredentialEntry,
	CredentialMetadata,
	CredentialType,
} from "@loomai/types";
import type { Database } from "@loomai/deferred-queue";

export class MockCredentialProvider implements CredentialProvider {
	private credentials: Map<string, string> = new Map();

	async get(service: string, account = "default"): Promise<string | null> {
		return this.credentials.get(`${service}/${account}`) || null;
	}

	async set(
		service: string,
		account: string,
		value: string,
		_metadata?: CredentialMetadata
	): Promise<void> {
		this.credentials.set(`${service}/${account}`, value);
	}

	async delete(service: string, account?: string): Promise<void> {
		this.credentials.delete(`${service}/${account || "default"}`);
	}

	async list(service?: string): Promise<CredentialEntry[]> {
		const entries: CredentialEntry[] = [];
		for (const [key, _value] of this.credentials) {
			const [svc, acct] = key.split("/");
			if (!service || svc === service) {
				entries.push({
					id: `cred-${key}`,
					service: svc!,
					account: acct!,
					credentialType: "api_key" as CredentialType,
					isEnabled: true,
					workspaceAccess: "*",
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});
			}
		}
		return entries;
	}

	async exists(service: string, account?: string): Promise<boolean> {
		return this.credentials.has(`${service}/${account || "default"}`);
	}
}

// Simple mock database interface for testing
export interface MockDatabaseRow {
	id: string;
	[key: string]: unknown;
}

// Database interface compatible with deferred-queue
export class MockDatabase implements Database {
	private tables: Map<string, Map<string, MockDatabaseRow>> = new Map();
	private defaultTable = "default";

	clear(table?: string): void {
		if (table) {
			this.tables.delete(table);
		} else {
			this.tables.clear();
		}
	}

	select() {
		const self = this;
		return {
			from(table: unknown) {
				const tableName = typeof table === "string" ? table : self.defaultTable;
				return {
					where(condition: unknown) {
						// Handle both function predicates and simple condition objects
						const predicate = typeof condition === "function" 
							? condition as (row: MockDatabaseRow) => boolean
							: () => true;
						return {
							all: async () => {
								const tableMap = self.tables.get(tableName) ?? new Map();
								return Array.from(tableMap.values()).filter(predicate);
							},
							orderBy(..._columns: unknown[]) {
								return {
									all: async () => {
										const tableMap = self.tables.get(tableName) ?? new Map();
										return Array.from(tableMap.values()).filter(predicate);
									},
								};
							},
						};
					},
					all: async () => {
						const tableMap = self.tables.get(tableName) ?? new Map();
						return Array.from(tableMap.values());
					},
				};
			},
		};
	}

	insert(table: unknown) {
		const self = this;
		const tableName = typeof table === "string" ? table : this.defaultTable;
		return {
			values: async (data: unknown) => {
				if (!self.tables.has(tableName)) {
					self.tables.set(tableName, new Map());
				}
				const tableMap = self.tables.get(tableName)!;
				const rows = Array.isArray(data) ? data : [data];
				for (const row of rows as MockDatabaseRow[]) {
					if (row.id) {
						tableMap.set(row.id, row);
					}
				}
			},
		};
	}

	update(table: unknown) {
		const self = this;
		const tableName = typeof table === "string" ? table : this.defaultTable;
		return {
			set(data: unknown) {
				return {
					where: async (condition: unknown) => {
						const predicate = typeof condition === "function"
							? condition as (row: MockDatabaseRow) => boolean
							: (row: MockDatabaseRow) => {
								// Simple object comparison for { id: "xxx" } style conditions
								if (typeof condition === "object" && condition !== null) {
									const cond = condition as Record<string, unknown>;
									return Object.entries(cond).every(([key, val]) => row[key] === val);
								}
								return true;
							};
						const tableMap = self.tables.get(tableName);
						if (!tableMap) return;
						for (const [id, row] of tableMap) {
							if (predicate(row)) {
								tableMap.set(id, { ...row, ...(data as MockDatabaseRow) });
							}
						}
					},
				};
			},
		};
	}

	delete(table: unknown) {
		const self = this;
		const tableName = typeof table === "string" ? table : this.defaultTable;
		return {
			where: async (condition: unknown) => {
				const predicate = typeof condition === "function"
					? condition as (row: MockDatabaseRow) => boolean
					: (row: MockDatabaseRow) => {
						if (typeof condition === "object" && condition !== null) {
							const cond = condition as Record<string, unknown>;
							return Object.entries(cond).every(([key, val]) => row[key] === val);
						}
						return true;
					};
				const tableMap = self.tables.get(tableName);
				if (!tableMap) return;
				for (const [id, row] of tableMap) {
					if (predicate(row)) {
						tableMap.delete(id);
					}
				}
			},
		};
	}

	// Legacy string-based API for backward compatibility
	selectFrom(tableName: string) {
		return this.select().from(tableName);
	}

	insertInto(tableName: string) {
		return this.insert(tableName);
	}

	updateIn(tableName: string) {
		return this.update(tableName);
	}

	deleteFrom(tableName: string) {
		return this.delete(tableName);
	}
}
