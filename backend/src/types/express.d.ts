import type { AccessTokenPayload } from "../utils/jwt.js"

declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload
      /** Set by requireApiKey middleware when request authenticates via API key */
      apiKeyId?: string
    }
  }
}

export {}
