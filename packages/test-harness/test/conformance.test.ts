import { describe, expect, test } from "bun:test";
import { MockCredentialProvider, MockDatabase, makeChunk, makeContextChunk } from "../src/index.js";
import type { RawChunk, ContextChunk } from "../../types/src/index.js";

describe("@enhancement/test-harness conformance", () => {
	test("exports makeChunk helper", () => {
		const chunk = makeChunk();
		expect(chunk.kind).toBe("raw");
		expect(chunk.source).toBe("test-source");
	});

	test("exports makeContextChunk helper", () => {
		const chunk = makeContextChunk();
		expect(chunk.kind).toBe("context");
		expect(chunk.id).toBe("chunk-1");
	});

	test("MockCredentialProvider implements CredentialProvider", async () => {
		const provider = new MockCredentialProvider();

		await provider.set("test", "default", "secret123");
		const value = await provider.get("test", "default");
		expect(value).toBe("secret123");

		const exists = await provider.exists("test", "default");
		expect(exists).toBe(true);

		const list = await provider.list();
		expect(list.length).toBe(1);

		await provider.delete("test", "default");
		const afterDelete = await provider.exists("test", "default");
		expect(afterDelete).toBe(false);
	});

	test("MockCredentialProvider can list by service", async () => {
		const provider = new MockCredentialProvider();

		await provider.set("service1", "account1", "secret1");
		await provider.set("service1", "account2", "secret2");
		await provider.set("service2", "default", "secret3");

		const all = await provider.list();
		expect(all).toHaveLength(3);

		const service1Only = await provider.list("service1");
		expect(service1Only).toHaveLength(2);
	});

	test("MockDatabase provides Drizzle-like interface", async () => {
		const db = new MockDatabase();

		await db.insert("test_table").values({ id: "1", name: "Test" });

		const all = await db.select().from("test_table").all();
		expect(all).toHaveLength(1);

		const filtered = await db
			.select()
			.from("test_table")
			.where((row: { id: string }) => row.id === "1")
			.all();
		expect(filtered).toHaveLength(1);
	});

	test("MockDatabase supports update", async () => {
		const db = new MockDatabase();

		await db.insert("test_table").values({ id: "1", name: "Original" });
		await db.update("test_table").set({ name: "Updated" }).where((row) => row.id === "1");

		const rows = await db.select().from("test_table").all();
		expect(rows[0].name).toBe("Updated");
	});

	test("MockDatabase supports delete", async () => {
		const db = new MockDatabase();

		await db.insert("test_table").values({ id: "1", name: "Test" });
		await db.insert("test_table").values({ id: "2", name: "Test2" });

		await db.delete("test_table").where((row) => row.id === "1");

		const rows = await db.select().from("test_table").all();
		expect(rows).toHaveLength(1);
		expect(rows[0].id).toBe("2");
	});

	test("MockDatabase supports clear", async () => {
		const db = new MockDatabase();

		await db.insert("table1").values({ id: "1" });
		await db.insert("table2").values({ id: "2" });

		db.clear("table1");
		const t1Rows = await db.select().from("table1").all();
		expect(t1Rows).toHaveLength(0);

		const t2Rows = await db.select().from("table2").all();
		expect(t2Rows).toHaveLength(1);

		db.clear();
		const t2RowsAfter = await db.select().from("table2").all();
		expect(t2RowsAfter).toHaveLength(0);
	});

	test("makeChunk allows overrides", () => {
		const chunk = makeChunk({
			contentType: "custom",
			data: "custom data",
			sessionId: "custom-session",
		});

		expect(chunk.contentType).toBe("custom");
		expect(chunk.data).toBe("custom data");
		expect(chunk.sessionId).toBe("custom-session");
	});

	test("makeContextChunk allows overrides", () => {
		const chunk = makeContextChunk({
			content: "custom content",
			id: "custom-id",
			embeddings: [1, 2, 3],
		});

		expect(chunk.content).toBe("custom content");
		expect(chunk.id).toBe("custom-id");
		expect(chunk.embeddings).toEqual([1, 2, 3]);
	});
});
