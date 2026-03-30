/**
 * Realistic Demo - Practical Perspective Transformations
 *
 * Real-world inputs that would actually be useful
 */

import {
	PerspectiveOrientedTransformer,
	PERSPECTIVES,
	ORIENTATIONS,
} from "./perspective-transformer.js";
import { createFabricTransformer } from "@enhancement/fabric";
import { OpenAICompatibleProvider } from "@enhancement/ai-providers";

// REALISTIC CONTENT - Things you'd actually use this for
const REALISTIC_CONTENT = {
	// Real code that needs review
	prCode: `Add pagination to user list API endpoint

The current /api/users endpoint returns all users at once. For large datasets, 
this causes timeout issues. This PR adds:
- page and limit query parameters
- Response metadata (total count, current page, total pages)
- Default limit of 50 users per page
- Maximum limit of 500 to prevent abuse

Changes:
- Modified UserController.getUsers() to accept pagination params
- Added UserRepository.findPaginated() method
- Updated API documentation
- Added tests for edge cases (page=0, limit > max)

Potential concerns:
- This changes the default behavior (now returns 50 instead of all)
- Existing clients that don't send pagination params will need updates
- The count query adds ~20ms latency on the 100k user dataset`,

	// Real product decision
	productDecision: `Proposal: Migrate from Stripe to Paddle for billing

Context: Our SaaS product currently uses Stripe for subscriptions. We've had 
issues with:
- Complex tax handling for EU customers
- Manual invoice generation for enterprise clients
- No built-in affiliate/referral tracking

Paddle offers:
- Automatic tax calculation and remittance (Merchant of Record)
- Built-in invoicing with customizable templates
- Affiliate management system
- Unified checkout experience

Migration plan:
1. Set up Paddle sandbox, test all current pricing tiers
2. Build migration script for existing subscriptions (preserve billing dates)
3. Update checkout flows in the app
4. Run parallel for 30 days, gradually migrate existing customers
5. Sunset Stripe after 90 days

Risks:
- Paddle charges higher fees (5% + 50¢ vs Stripe's 2.9% + 30¢)
- Migration complexity for annual subscribers
- Customer friction during transition
- Data export/import could lose some payment history metadata`,

	// Real user feedback
	userFeedback: `Customer Interview: Acme Corp (Enterprise client)

Participants: Sarah (CTO), Mike (Engineering Lead)
Date: March 15, 2026

Key findings:
- They love the API stability and rate limiting
- The webhook reliability is "critical" for their operations
- Dashboard load time is "acceptable but not great" (~3-4 seconds for large datasets)
- They need multi-region deployment for EU data residency compliance
- Export to CSV is "broken" for >10k rows (times out)
- The new feature X was rolled out last month but they haven't adopted it yet

Pain points ranked:
1. No SOC2 Type II certification yet (blocking their procurement)
2. Can't invite external contractors with limited permissions
3. No audit log for admin actions
4. The mobile app crashes on iOS 18 when uploading large files

Positive feedback:
- "Support team is incredibly responsive"
- "API docs are the best we've seen"
- "The onboarding experience was smooth"

They mentioned they're evaluating competitors but haven't found a better option yet. 
Contract renewal discussion in 6 months.`,

	// Real architecture decision
	architectureDoc: `Architecture Decision Record: Moving from REST to gRPC for internal services

Context:
Our microservices currently communicate via REST APIs. As we've scaled to 40+
services, we're seeing:
- High latency on inter-service calls (p99 ~500ms)
- JSON serialization overhead becoming noticeable
- No type safety between services (runtime errors caught late)
- Difficult to maintain consistent API contracts

Proposed solution:
Migrate internal service-to-service communication to gRPC
- Protocol Buffers for type-safe contracts
- Binary serialization (smaller payloads, faster)
- HTTP/2 multiplexing for connection reuse
- Streaming support for real-time features

Migration strategy:
1. Define protobuf schemas for top 10 most-used endpoints
2. Build gRPC gateway that translates REST → gRPC for gradual migration
3. Update service mesh to support both protocols
4. Migrate one service at a time over 6 months
5. Deprecate REST for internal use, keep for external APIs

Trade-offs:
+ Better performance (estimated 3-5x faster)
+ Type safety across services
+ Easier contract evolution with protobuf versioning
+ Built-in load balancing and health checks

- More complex local development (need protoc compiler)
- Harder to debug (binary vs readable JSON)
- Learning curve for the team
- Not browser-friendly (need gateway for any web UI needs)

Alternatives considered:
- GraphQL: Good for client flexibility but doesn't solve our internal latency issues
- tRPC: TypeScript-only, not language-agnostic enough
- Keep REST + add better caching: Doesn't solve serialization overhead`,

	// Real bug report
	bugReport: `Bug Report: Intermittent data loss in async job processor

Severity: High (affecting production)
Affected: ~2% of background jobs

Description:
Jobs in our async queue occasionally fail to persist their results to the 
database. The job appears to complete successfully (logs show "Job finished"), 
but the database row shows null for the result column.

Reproduction steps:
- Submit 1000 jobs to the queue rapidly
- ~20 of them will have null results
- No error in job logs
- Database shows successful connection

Current investigation:
- The job processor uses a connection pool (max 10 connections)
- Jobs are idempotent, so retrying works, but we shouldn't need to
- Added logging: the "save to DB" code runs but sometimes returns "0 rows affected"
- Race condition suspected between job completion and connection release

Hypotheses:
1. Connection pool exhaustion - job finishes but can't get connection to save
2. Transaction isolation issue - read committed vs repeatable read
3. The job runner's "complete" callback fires before DB connection is ready
4. There's a 5-second timeout on DB writes, some jobs are right at the edge

Temporary workaround:
Added automatic retry with exponential backoff. Reduces failure rate to 0.1% 
but doesn't fix root cause.

Next steps:
Need to decide if we should:
A) Increase connection pool size (currently 10, thinking 50)
B) Add explicit transaction wrapping around save operations
C) Refactor to use a separate "result writer" service
D) Switch to a different job queue (currently using BullMQ on Redis)`,
};

async function runRealisticDemo() {
	console.log("╔════════════════════════════════════════════════════════════════╗");
	console.log("║   REALISTIC Perspective Transformation Demo                    ║");
	console.log("║   Real inputs you'd actually use in production                 ║");
	console.log("║   Model: qwen3.5-0.8b-optiq (LM Studio)                        ║");
	console.log("╚════════════════════════════════════════════════════════════════╝\n");

	// Connect to LM Studio
	console.log("🌐 Connecting to LM Studio...");
	const lmStudioProvider = new OpenAICompatibleProvider(
		"http://localhost:1234/v1",
		undefined
	);
	const lmStudioEndpoint = {
		name: "lm-studio",
		baseUrl: "http://localhost:1234/v1",
		apiKey: undefined,
	};

	if (!(await lmStudioProvider.testConnection(lmStudioEndpoint))) {
		console.error("❌ LM Studio not running on port 1234");
		process.exit(1);
	}
	console.log("✅ Connected!\n");

	const fabric = createFabricTransformer(
		{ available: true, model: "qwen3.5-0.8b-optiq", temperature: 0.7 },
		lmStudioProvider,
		lmStudioEndpoint
	);
	const transformer = new PerspectiveOrientedTransformer(fabric);

	// ==========================================================================
	// DEMO 1: Code Review - PR Analysis
	// ==========================================================================
	console.log("╔════════════════════════════════════════════════════════════════════╗");
	console.log("║  DEMO 1: Pull Request Review                                       ║");
	console.log("║  Perspective: Developer + Critique                                 ║");
	console.log("╚════════════════════════════════════════════════════════════════════╝");

	const start1 = Date.now();
	const result1 = await transformer.transform({
		perspective: "developer",
		orientation: "critique",
		input: REALISTIC_CONTENT.prCode,
		context: { scenario: "code-review", pr: "pagination-feature" },
	});
	console.log(`\n⏱️  ${Date.now() - start1}ms | 💻 Developer Critique:\n${result1.output}\n`);

	// ==========================================================================
	// DEMO 2: Product Decision - Manager Perspective
	// ==========================================================================
	console.log("╔════════════════════════════════════════════════════════════════════╗");
	console.log("║  DEMO 2: Billing Migration Decision                                ║");
	console.log("║  Perspective: Manager + Summarize                                  ║");
	console.log("╚════════════════════════════════════════════════════════════════════╝");

	const start2 = Date.now();
	const result2 = await transformer.transform({
		perspective: "manager",
		orientation: "summarize",
		input: REALISTIC_CONTENT.productDecision,
		context: { scenario: "vendor-evaluation", topic: "billing-migration" },
	});
	console.log(`\n⏱️  ${Date.now() - start2}ms | 📊 Manager Summary:\n${result2.output}\n`);

	// ==========================================================================
	// DEMO 3: User Research - Customer Perspective
	// ==========================================================================
	console.log("╔════════════════════════════════════════════════════════════════════╗");
	console.log("║  DEMO 3: Customer Interview Analysis                               ║");
	console.log("║  Perspective: Customer + Explain                                   ║");
	console.log("╚════════════════════════════════════════════════════════════════════╝");

	const start3 = Date.now();
	const result3 = await transformer.transform({
		perspective: "customer",
		orientation: "explain",
		input: REALISTIC_CONTENT.userFeedback,
		context: { scenario: "user-research", client: "acme-corp" },
	});
	console.log(`\n⏱️  ${Date.now() - start3}ms | 🎤 Customer Perspective:\n${result3.output}\n`);

	// ==========================================================================
	// DEMO 4: Architecture Decision - Teacher Perspective
	// ==========================================================================
	console.log("╔════════════════════════════════════════════════════════════════════╗");
	console.log("║  DEMO 4: Architecture Decision (REST → gRPC)                       ║");
	console.log("║  Perspective: Teacher + Explain                                    ║");
	console.log("╚════════════════════════════════════════════════════════════════════╝");

	const start4 = Date.now();
	const result4 = await transformer.transform({
		perspective: "teacher",
		orientation: "explain",
		input: REALISTIC_CONTENT.architectureDoc,
		context: { scenario: "architecture-review", adr: "grpc-migration" },
	});
	console.log(`\n⏱️  ${Date.now() - start4}ms | 📚 Teacher Explanation:\n${result4.output}\n`);

	// ==========================================================================
	// DEMO 5: Bug Report - Multi-Perspective Analysis
	// ==========================================================================
	console.log("╔════════════════════════════════════════════════════════════════════╗");
	console.log("║  DEMO 5: Bug Report Analysis (Multi-Perspective)                   ║");
	console.log("║  Perspectives: Developer, Skeptic, Manager                         ║");
	console.log("║  Orientation: Critique                                             ║");
	console.log("╚════════════════════════════════════════════════════════════════════╝");

	console.log("\n🔍 Running 3 perspectives in parallel...\n");
	const start5 = Date.now();
	const results5 = await transformer.transformMultiPerspective(
		["developer", "skeptic", "manager"],
		"critique",
		REALISTIC_CONTENT.bugReport,
		{ scenario: "bug-analysis", issue: "async-job-data-loss" }
	);
	const duration5 = Date.now() - start5;

	console.log(`Total time: ${duration5}ms\n`);

	results5.forEach((r) => {
		const icons: Record<string, string> = {
			developer: "💻",
			skeptic: "🤔",
			manager: "📊",
		};
		console.log(`${icons[r.perspective]} ${r.perspective.toUpperCase()} (${r.durationMs}ms):`);
		console.log(r.output);
		console.log("\n" + "─".repeat(60) + "\n");
	});

	// ==========================================================================
	// DEMO 6: Chain - Bug Report → Developer Improve → Manager Summarize
	// ==========================================================================
	console.log("╔════════════════════════════════════════════════════════════════════╗");
	console.log("║  DEMO 6: Chained Analysis                                          ║");
	console.log("║  Step 1: Developer Improve (fix suggestions)                         ║");
	console.log("║  Step 2: Manager Summarize (executive brief)                         ║");
	console.log("╚════════════════════════════════════════════════════════════════════╝");

	const chainStart = Date.now();

	const step1 = await transformer.transform({
		perspective: "developer",
		orientation: "improve",
		input: REALISTIC_CONTENT.bugReport,
		context: { scenario: "bug-fix-suggestions" },
	});
	console.log(`\n⏱️  Step 1 (Developer Improve): ${step1.durationMs}ms`);

	const step2 = await transformer.transform({
		perspective: "manager",
		orientation: "summarize",
		input: step1.output,
		context: { scenario: "executive-brief" },
	});
	const chainTotal = Date.now() - chainStart;

	console.log(`⏱️  Step 2 (Manager Summarize): ${step2.durationMs}ms`);
	console.log(`⏱️  Total chain time: ${chainTotal}ms`);
	console.log(`\n📋 Executive Brief:\n${step2.output}\n`);

	// ==========================================================================
	// SUMMARY
	// ==========================================================================
	console.log("╔════════════════════════════════════════════════════════════════════╗");
	console.log("║  DEMO COMPLETE                                                     ║");
	console.log("╚════════════════════════════════════════════════════════════════════╝");

	const totalTime =
		result1.durationMs +
		result2.durationMs +
		result3.durationMs +
		result4.durationMs +
		duration5 +
		chainTotal;

	console.log(`
📊 Statistics:
   • Total transformations: 9
   • Total time: ${totalTime}ms (~${(totalTime / 1000).toFixed(1)}s)
   • Avg per transformation: ${(totalTime / 9).toFixed(0)}ms
   • Model: qwen3.5-0.8b-optiq (local LM Studio)

✅ Scenarios demonstrated:
   1. Code review (PR analysis)
   2. Vendor migration decision
   3. Customer interview analysis
   4. Architecture decision explanation
   5. Bug report (multi-perspective)
   6. Chained analysis (improve → summarize)

💡 Real-world use cases:
   • Pre-merge PR review with AI
   • Executive summaries of technical decisions
   • Customer empathy in product decisions
   • Teaching complex architecture to new hires
   • Multi-angle problem analysis
   • Escalation briefings for leadership
`);
}

runRealisticDemo().catch(console.error);
