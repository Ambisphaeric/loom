// WebSocket Hub for Session Updates
// Manages /ws/sessions/:id connections

import type { ServerConfig, SessionUpdateMessage } from "../types.js";

interface SessionClient {
  id: string;
  socket: WebSocket;
  sessionId: string;
  isAlive: boolean;
}

export class SessionHub {
  private clients = new Map<string, SessionClient>();
  private config: ServerConfig;
  private pingInterval?: ReturnType<typeof setInterval>;

  constructor(config: ServerConfig) {
    this.config = config;
    this.startHeartbeat();
  }

  // Handle new session WebSocket connection
  handleConnection(socket: WebSocket, sessionId: string, workspace: string): void {
    const clientId = `session-client-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    
    const client: SessionClient = {
      id: clientId,
      socket,
      sessionId,
      isAlive: true,
    };

    this.clients.set(clientId, client);
    console.log(`[SessionHub] Client ${clientId} connected to session ${sessionId}`);

    // Handle close
    socket.addEventListener("close", () => {
      this.removeClient(clientId);
    });

    // Handle pong
    socket.addEventListener("pong", () => {
      client.isAlive = true;
    });

    // Send initial status (session just created, no status yet)
    this.send(client, {
      type: "status",
      sessionId,
      timestamp: Date.now(),
    });
  }

  // Broadcast update to all clients watching a session
  broadcastUpdate(sessionId: string, update: Omit<SessionUpdateMessage, "sessionId" | "timestamp">): void {
    const timestamp = Date.now();
    
    for (const client of this.clients.values()) {
      if (client.sessionId === sessionId) {
        this.send(client, {
          ...update,
          sessionId,
          timestamp,
        });
      }
    }
  }

  // Send message to client
  private send(client: SessionClient, message: SessionUpdateMessage): void {
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(JSON.stringify(message));
    }
  }

  // Remove client
  private removeClient(clientId: string): void {
    this.clients.delete(clientId);
    console.log(`[SessionHub] Client ${clientId} disconnected`);
  }

  // Heartbeat
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
    }, 30000);
  }

  // Get connection count for a session
  getConnectionCount(sessionId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.sessionId === sessionId) count++;
    }
    return count;
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
