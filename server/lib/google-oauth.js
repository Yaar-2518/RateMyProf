import { OAuth2Client } from "google-auth-library";

let client = null;

/**
 * Verify a Google ID token and return the payload.
 * Only tokens issued for our configured client ID are accepted.
 */
export async function verifyGoogleToken(idToken, clientId) {
  if (!clientId) throw new Error("Google OAuth is not configured.");
  if (!client) client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({
    idToken,
    audience: clientId,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.email || !payload.email_verified)
    throw new Error("Google account email is not verified.");
  return {
    email: payload.email.toLowerCase(),
    name: payload.name || "",
    picture: payload.picture || "",
    googleId: payload.sub,
  };
}
