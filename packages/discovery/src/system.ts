import type { SystemInfo, InstallerResult } from "./types.js";

export async function getSystemInfo(): Promise<SystemInfo> {
	const platform = (await import("process")).platform as "darwin" | "linux" | "windows";
	const os = await import("os");

	return {
		platform,
		arch: os.arch(),
		cpus: os.cpus().length,
		memory: os.totalmem(),
		screenpipeAvailable: await checkScreenpipe(),
		ollamaInstalled: await checkOllama(),
		lmStudioInstalled: await checkLMStudio(),
	};
}

async function checkScreenpipe(): Promise<boolean> {
	try {
		const response = await fetch("http://localhost:3030/health", {
			signal: AbortSignal.timeout(1000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function checkOllama(): Promise<boolean> {
	try {
		const response = await fetch("http://localhost:11434", {
			signal: AbortSignal.timeout(1000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

async function checkLMStudio(): Promise<boolean> {
	try {
		const response = await fetch("http://localhost:1234", {
			signal: AbortSignal.timeout(1000),
		});
		return response.ok;
	} catch {
		return false;
	}
}

export async function installOllama(): Promise<InstallerResult> {
	console.log("[Discovery] Installing Ollama...");
	return {
		success: false,
		message: "Ollama installation requires manual download from https://ollama.ai",
	};
}

export async function installLMStudio(): Promise<InstallerResult> {
	console.log("[Discovery] Installing LM Studio...");
	return {
		success: false,
		message: "LM Studio installation requires manual download from https://lmstudio.ai",
	};
}

export async function installScreenpipe(): Promise<InstallerResult> {
	console.log("[Discovery] Installing Screenpipe...");
	return {
		success: false,
		message: "Screenpipe installation via: npx screenpipe@latest",
	};
}

export async function installService(
	service: "ollama" | "lm-studio" | "screenpipe"
): Promise<InstallerResult> {
	switch (service) {
		case "ollama":
			return installOllama();
		case "lm-studio":
			return installLMStudio();
		case "screenpipe":
			return installScreenpipe();
		default:
			return { success: false, message: `Unknown service: ${service}` };
	}
}
