import {
	LocalCredentialProvider,
	InMemoryCredentialStore,
	createCredentialProvider,
	generateMasterKey,
} from "../src/index.js";

console.log("=== Credentials Demo ===\n");

async function demoBasicCredentialOperations() {
	console.log("--- Demo 1: Basic Credential Operations ---\n");

	const masterKey = generateMasterKey();
	const provider = new LocalCredentialProvider("demo-workspace", masterKey);

	console.log("Storing OpenAI API key...");
	await provider.set("openai", "default", "sk-openai-demo123", {
		note: "Demo API key",
		isDefault: true,
	});
	console.log("  Stored!\n");

	console.log("Storing Anthropic API key...");
	await provider.set("anthropic", "default", "sk-ant-demo456");
	console.log("  Stored!\n");

	console.log("Retrieving OpenAI API key...");
	const openaiKey = await provider.get("openai", "default");
	console.log(`  Retrieved: ${openaiKey ? "***" + openaiKey.slice(-4) : "not found"}\n`);

	console.log("Checking credential existence...");
	const exists = await provider.exists("openai", "default");
	console.log(`  Exists: ${exists}\n`);

	console.log("Listing all credentials...");
	const allCredentials = await provider.list();
	console.log(`  Found ${allCredentials.length} credentials:`);
	for (const cred of allCredentials) {
		console.log(`    - ${cred.service}/${cred.account}`);
	}
	console.log();

	provider.destroy();
}

async function demoWorkspaceIsolation() {
	console.log("--- Demo 2: Workspace Isolation ---\n");

	const masterKey = generateMasterKey();
	const workspace1Provider = new LocalCredentialProvider("workspace-1", masterKey);
	const workspace2Provider = new LocalCredentialProvider("workspace-2", masterKey);

	console.log("Workspace 1 storing a credential...");
	await workspace1Provider.set("api", "default", "ws1-secret", {}, { workspaceAccess: "workspace-1" });
	console.log("  Stored!\n");

	console.log("Workspace 2 trying to access Workspace 1's credential...");
	try {
		await workspace2Provider.get("api", "default");
		console.log("  ERROR: Should have thrown!\n");
	} catch (err) {
		console.log(`  Correctly blocked: ${(err as Error).message}\n`);
	}

	console.log("Workspace 1 accessing its own credential...");
	const secret = await workspace1Provider.get("api", "default");
	console.log(`  Retrieved: ${secret}\n`);

	workspace1Provider.destroy();
	workspace2Provider.destroy();
}

async function demoCredentialMetadata() {
	console.log("--- Demo 3: Credential Metadata ---\n");

	const masterKey = generateMasterKey();
	const provider = new LocalCredentialProvider("demo-workspace", masterKey);

	console.log("Storing credential with metadata...");
	await provider.set("github", "user@example.com", "ghp-token123", {
		scopes: ["repo", "read:user"],
		expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
		note: "Personal access token",
	});
	console.log("  Stored!\n");

	console.log("Listing credentials with metadata...");
	const credentials = await provider.list("github");
	for (const cred of credentials) {
		console.log(`  Service: ${cred.service}`);
		console.log(`  Account: ${cred.account}`);
		if (cred.metadata) {
			console.log(`  Note: ${cred.metadata.note}`);
			if (cred.metadata.scopes) {
				console.log(`  Scopes: ${cred.metadata.scopes.join(", ")}`);
			}
		}
	}
	console.log();

	provider.destroy();
}

await demoBasicCredentialOperations();
await demoWorkspaceIsolation();
await demoCredentialMetadata();

console.log("=== Credentials Demo Complete ===");
console.log("\nNote: In production, use persistent storage and OS keychain integration.");
