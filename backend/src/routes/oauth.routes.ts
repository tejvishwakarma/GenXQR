import { Router, type IRouter, type NextFunction, type Request, type Response } from "express"
import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js"
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js"
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js"
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js"
import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js"
import type { OAuthMetadata, OAuthProtectedResourceMetadata } from "@modelcontextprotocol/sdk/shared/auth.js"
import { SCOPE, issuerUrl, mcpResourceUrl, oauthProvider } from "../services/oauth.service.js"

/**
 * The OAuth 2.1 authorization server for the MCP endpoint (oauth.service.ts).
 * Mounted at the app root, before /v1's API-key gate:
 *
 *   /.well-known/oauth-protected-resource/v1/mcp   RFC 9728 — "who signs me in"
 *   /.well-known/oauth-authorization-server        RFC 8414 — endpoints, PKCE S256
 *   /v1/oauth/authorize | token | register | revoke
 *
 * The endpoints live under /v1/ because nginx already forwards it; the two
 * /.well-known documents need their own nginx location (deploy/*.conf).
 * The protocol work — validation, PKCE, client auth, CORS, per-IP rate limits —
 * is the MCP SDK's handlers.
 */
const router: IRouter = Router()

const at = (path: string) => new URL(path, issuerUrl()).href

export const authServerMetadata = (): OAuthMetadata => ({
  issuer: issuerUrl().href,
  authorization_endpoint: at("/v1/oauth/authorize"),
  token_endpoint: at("/v1/oauth/token"),
  registration_endpoint: at("/v1/oauth/register"),
  revocation_endpoint: at("/v1/oauth/revoke"),
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
  revocation_endpoint_auth_methods_supported: ["client_secret_post", "none"],
  scopes_supported: [SCOPE],
  service_documentation: at("/api-docs#integrations-mcp"),
})

const protectedResourceMetadata = (): OAuthProtectedResourceMetadata => ({
  resource: mcpResourceUrl().href,
  authorization_servers: [issuerUrl().href],
  scopes_supported: [SCOPE],
  bearer_methods_supported: ["header"],
  resource_name: "GenXQR",
  resource_documentation: at("/api-docs#integrations-mcp"),
})

// Built per request: FRONTEND_URL is read from env, which tests set before importing.
router.use("/.well-known/oauth-protected-resource/v1/mcp", (req, res, next) => metadataHandler(protectedResourceMetadata())(req, res, next))
router.use("/.well-known/oauth-authorization-server", (req, res, next) => metadataHandler(authServerMetadata())(req, res, next))

/**
 * A malformed authorization request is answered here with a 400. The SDK's
 * handler would redirect it to the client's registered address with ?error=…,
 * and since anyone can register a client, that made
 * genxqr.com/v1/oauth/authorize?client_id=… an open redirect needing no click.
 * A well-formed request goes to the consent page; only a signed-in person's
 * answer there sends the browser on to the client.
 */
function refuseMalformedAuthorize(req: Request, res: Response, next: NextFunction): void {
  const p = (req.method === "POST" ? req.body : req.query) as Record<string, unknown> | undefined
  const problem =
    p?.["response_type"] !== "code" ? "response_type must be code"
    : typeof p["code_challenge"] !== "string" || !p["code_challenge"] ? "code_challenge is required (PKCE)"
    : p["code_challenge_method"] !== "S256" ? "code_challenge_method must be S256"
    : null
  if (problem) {
    res.status(400).json({ error: "invalid_request", error_description: problem })
    return
  }
  next()
}

router.use("/v1/oauth/authorize", refuseMalformedAuthorize, authorizationHandler({ provider: oauthProvider }))
router.use("/v1/oauth/token", tokenHandler({ provider: oauthProvider }))
router.use("/v1/oauth/register", clientRegistrationHandler({ clientsStore: oauthProvider.clientsStore }))
router.use("/v1/oauth/revoke", revocationHandler({ provider: oauthProvider }))

export default router
