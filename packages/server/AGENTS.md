# @enhancement/server

Status: SPECIFICATION ONLY - Not yet implemented.

The server package provides HTTP/WebSocket API for the Enhancement system.

## Specification Location

See `../../AGENTS-SERVER.md` for the full specification.

## Planned Features

- HTTP REST API for CRUD operations
- WebSocket for real-time event streaming
- Bearer token authentication
- Rate limiting per workspace
- Health endpoints
- Prometheus metrics export

## Dependencies

- `@enhancement/engine`
- `@enhancement/bus`
- `@enhancement/credentials`
