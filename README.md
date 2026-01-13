# Semantic Search API

### Build a Zero-Cost Semantic Search Engine with Cloudflare Workers

This project provides a production-ready semantic search engine built entirely on Cloudflare's free-tier infrastructure.

The API follows OpenAPI specifications with full Swagger documentation available at `/swagger.json`, making it easy to integrate and use in your applications.

## Installation

### Option 1: One-Click Deploy
[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/SemanticSearch-ai/api.semanticsearch.ai.git)

Before deployment, create a Vectorize index as described in step 4 below.

### Option 2: Manual Setup
1. Sign up for [Cloudflare Workers](https://workers.dev). The free tier is more than enough for most use cases.
2. Clone this project and install dependencies with `pnpm install`
3. Run `wrangler login` to login to your Cloudflare account in wrangler
4. Create a Vectorize index for semantic search:
   ```bash
   wrangler vectorize create semantic-search --dimensions=256 --metric=cosine
   ```
5. Run `wrangler deploy` to publish the API to Cloudflare Workers

Once deployed, set your writer API key via the `API_KEY_WRITER` secret (the legacy `API_KEY` binding still works and is treated as a writer key). Optionally create `API_KEY_READER` for search-only clients.

## Usage

### API keys & permissions

- Writer keys (configured via `API_KEY_WRITER` or the legacy `API_KEY`) are required for mutating endpoints such as `POST /v1/documents` and `DELETE /v1/documents/:id`.
- Reader keys (configured via `API_KEY_READER`) may call read/search endpoints (`GET /v1/documents/:id`, `POST /v1/search`). Writer keys are also accepted on those routes.
- To issue multiple keys of a given type, separate them with commas or newlines when setting the secret (e.g. `wrangler secret put API_KEY_READER`).
- Keep writer keys in trusted environments (servers/CI); reader keys are safe to embed in public clients.

If a reader key invokes a write endpoint the API responds with:

```json
{
  "error": "Writer key required for this endpoint"
}
```

The API provides the following endpoints for managing and searching documents:

### Create/Update a document
```bash
curl -X POST "https://your-worker.workers.dev/v1/documents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_WRITER_KEY" \
  -d '{
    "text": "This is a sample document for semantic search",
    "id": "document-id",
    "metadata": {
      "source": "example",
      "category": "documentation"
    }
  }'
```

Response:
```json
{
  "id": "document-id"
}
```

### Retrieve a document
```bash
curl -X GET "https://your-worker.workers.dev/v1/documents/{document-id}" \
  -H "Authorization: Bearer YOUR_ACCESS_KEY"
```

Response:
```json
{
  "id": "document-id",
  "text": "This is a sample document for semantic search",
  "metadata": {
    "source": "example",
    "category": "documentation"
  }
}
```

### Delete a document
```bash
curl -X DELETE "https://your-worker.workers.dev/v1/documents/{document-id}" \
  -H "Authorization: Bearer YOUR_WRITER_KEY"
```

Response:
```json
{
  "success": true
}
```

### Search documents
```bash
curl -X POST "https://your-worker.workers.dev/v1/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_KEY" \
  -d '{
    "query": "sample document",
    "limit": 10
  }'
```

Response:
```json
{
  "results": [
    {
      "id": "document-id",
      "text": "This is a sample document for semantic search",
      "metadata": {
        "source": "example",
        "category": "documentation"
      },
      "score": 0.95
    }
  ]
}
```

All endpoints require a Bearer token in the Authorization header. Replace `YOUR_WRITER_KEY` with a writer key for mutating routes and `YOUR_ACCESS_KEY` with either a reader or writer key for read/search routes.

## Development

1. Run `wrangler dev` to start a local instance of the API.
2. Open `http://localhost:8787/` in your browser to see the Swagger interface where you can try the endpoints.
3. Changes made in the `src/` folder will automatically trigger the server to reload, you only need to refresh the Swagger interface.

## License

This project is licensed under the Apache License 2.0. It is free for commercial use, but you need to include a link to https://semanticsearch.ai/ in your product.
