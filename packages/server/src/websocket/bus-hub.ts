// WebSocket Hub for Bus Events
// Manages /ws/bus connections with content-type filtering

import type { ServerConfig, BusEventMessage, BusSubscriptionMessage } from "../types.js";

interface ClientConnection {
  id: string;
  socket: WebSocket;
  workspace: string;
  subscriptions: Set<string>; // Content type patterns
  isAlive: boolean;
}

export class BusHub {
  private clients = new Map<string, ClientConnection>();
  private config: ServerConfig;
  private pingInterval?: ReturnType<typeof setInterval>;

  constructor(config: ServerConfig) {
    this.config = config;
    this.startHeartbeat();
  }

  // Handle new WebSocket connection
  handleConnection(socket: WebSocket, workspace: string): void {
    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    const client: ClientConnection = {
      id: clientId,
      socket,
      workspace,
      subscriptions: new Set(),
      isAlive: true,
    };

    this.clients.set(clientId, client);
    console.log(`[BusHub] Client ${clientId} connected for workspace ${workspace}`);

    // Subscribe to bus events for this workspace
    this.subscribeToBus(client);

    // Handle messages
    socket.addEventListener("message", (event) => {
      this.handleMessage(client, event.data);
    });

    // Handle close
    socket.addEventListener("close", () => {
      this.removeClient(clientId);
    });

    // Handle pong for heartbeat
    socket.addEventListener("pong", () => {
      client.isAlive = true;
    });

    // Send welcome
    this.send(client, { type: "connected", clientId, workspace });
  }

  // Subscribe client to bus events
  private subscribeToBus(client: ClientConnection): void {
    // Subscribe to bus events and filter by workspace
    this.config.bus.subscribe("*/*", async (chunk) => {
      // Check if chunk belongs to client's workspace
      if (chunk.workspace !== client.workspace) {
        return;
      }

      // Check content type against subscriptions (or subscribe to all if empty)
      if (client.subscriptions.size > 0) {
        const matches = Array.from(client.subscriptions).some((pattern) =>
          this.matchPattern(chunk.contentType, pattern)
        );
        if (!matches) return;
      }

      const message: BusEventMessage = {
        type: "chunk",
        payload: chunk,
        workspace: chunk.workspace,
        timestamp: Date.now(),
      };

      this.send(client, message);
    });
  }

  // Handle client message (subscription changes)
  handleClientMessage(socket: WebSocket, data: string | ArrayBuffer): void {
    // Find client by socket
    const client = Array.from(this.clients.values()).find(c => c.socket === socket);
    if (!client) return;
    
    this.processClientMessage(client, data);
  }

  private processClientMessage(client: ClientConnection, data: string | ArrayBuffer): void {
    try {
      const message = JSON.parse(data.toString()) as BusSubscriptionMessage;

      if (message.type === "subscribe") {
        for (const pattern of message.contentTypes || []) {
          client.subscriptions.add(pattern);
        }
        this.send(client, { type: "subscribed", patterns: message.contentTypes });
      } else if (message.type === "unsubscribe") {
        for (const pattern of message.contentTypes || []) {
          client.subscriptions.delete(pattern);
        }
        this.send(client, { type: "unsubscribed", patterns: message.contentTypes });
      }
    } catch (err) {
      this.send(client, { type: "error", message: "Invalid message format" });
    }
  }

  // Match content type against pattern (supports wildcards)
  private matchPattern(contentType: string, pattern: string): boolean {
    if (pattern === "*/*") return true;
    if (pattern === contentType) return true;
    
    // Handle wildcards like "notification/*"
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -1);
      return contentType.startsWith(prefix);
    }
    
    return false;
  }

  // Send message to client
  private send(client: ClientConnection, message: unknown): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  // Remove client on disconnect
  private removeClient(clientId: string): void {
    this.clients.delete(clientId);
    console.log(`[BusHub] Client ${clientId} disconnected`);
  }

  // Heartbeat to detect dead connections
  private startHeartbeat(): void {
    this.pingInterval = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (!client.isAlive) {
          client.socket.close();
          this.removeClient(clientId);
          continue;
        }
        client.isAlive = false;
        client.socket.send(JSON.stringify({ type: "ping" }));
      }
    }, 30000); // 30 second heartbeat
  }

  // Get connection count
  getConnectionCount(): number {
    return this.clients.size;
  }

  // Shutdown
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    for (const client of this.clients.values()) {
      client.socket.close(1000, "Server shutting down");
    }
    this.clients.clear();
  }
}
