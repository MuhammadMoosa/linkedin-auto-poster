/**
 * LinkedIn OAuth helper — get LINKEDIN_TOKEN + LINKEDIN_PERSON_ID
 *
 * Prerequisites (one-time, in browser):
 *   1. https://www.linkedin.com/developers/apps → Create app
 *   2. Products → add "Share on LinkedIn" + "Sign In with OpenID Connect"
 *   3. Auth tab → Redirect URL: http://127.0.0.1:3000/callback
 *   4. Copy Client ID + Client Secret to .env.local
 *
 * Run:
 *   npm run linkedin:oauth
 */

const fs = require("fs");
const http = require("http");
const path = require("path");
const { execSync } = require("child_process");
const dotenv = require("dotenv");

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const ENV_LOCAL = path.join(PROJECT_ROOT, ".env.local");
const REDIRECT_URI = "http://127.0.0.1:3000/callback";
const SCOPES = ["openid", "profile", "w_member_social"].join(" ");

dotenv.config({ path: ENV_LOCAL });
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      execSync(`open "${url}"`);
    } else if (platform === "win32") {
      execSync(`start "" "${url}"`);
    } else {
      execSync(`xdg-open "${url}"`);
    }
    return true;
  } catch {
    console.log("\nOpen this URL in your browser:\n");
    console.log(url);
    console.log("");
    return false;
  }
}

function buildAuthUrl(clientId) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

async function exchangeCodeForToken(code, clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.error_description || data.error || `Token exchange failed (${response.status})`
    );
  }

  return data;
}

async function fetchPersonId(accessToken) {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      data.message || data.error_description || `userinfo failed (${response.status})`
    );
  }

  if (!data.sub) {
    throw new Error("userinfo response missing sub (person ID)");
  }

  return data;
}

function upsertEnvLocal(updates) {
  let content = fs.existsSync(ENV_LOCAL) ? fs.readFileSync(ENV_LOCAL, "utf-8") : "";

  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, line);
    } else {
      content = content.trimEnd() + (content.endsWith("\n") || !content ? "" : "\n") + line + "\n";
    }
  }

  fs.writeFileSync(ENV_LOCAL, content, "utf-8");
}

function printSetupInstructions() {
  console.log(`
LinkedIn Developer setup (do this once in your browser)
======================================================

1. Open: https://www.linkedin.com/developers/apps
2. Click "Create app"
3. Fill in app name (e.g. "LinkedIn Auto Poster")
4. Under Products, request:
   - Share on LinkedIn
   - Sign In with LinkedIn using OpenID Connect
5. Open your app → Auth tab
6. Add Redirect URL (exactly):
   ${REDIRECT_URI}
7. Copy Client ID and Client Secret

Add to .env.local:

LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret

Then run again:
  npm run linkedin:oauth
`);
}

function waitForOAuthCode() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:3000`);

      if (url.pathname !== "/callback") {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization failed</h1><p>${errorDescription || error}</p>`);
        server.close();
        reject(new Error(errorDescription || error));
        return;
      }

      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Missing authorization code</h1>");
        server.close();
        reject(new Error("No authorization code in callback URL"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`
        <html><body style="font-family:system-ui;padding:2rem">
          <h1>LinkedIn connected</h1>
          <p>You can close this tab and return to the terminal.</p>
        </body></html>
      `);

      server.close();
      resolve(code);
    });

    server.on("error", reject);
    server.listen(3000, "127.0.0.1", () => {
      console.log(`Listening for OAuth callback on ${REDIRECT_URI}`);
    });
  });
}

async function main() {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printSetupInstructions();
    return;
  }

  if (!clientId || !clientSecret) {
    printSetupInstructions();
    process.exit(1);
  }

  console.log("\nLinkedIn OAuth — get token + person ID\n");

  const authUrl = buildAuthUrl(clientId);
  console.log("Opening LinkedIn authorization in your browser…");
  console.log("(Log in and click Allow)\n");
  openBrowser(authUrl);

  const code = await waitForOAuthCode();
  console.log("\nAuthorization code received. Exchanging for access token…");

  const tokenData = await exchangeCodeForToken(code, clientId, clientSecret);
  const accessToken = tokenData.access_token;

  console.log("Fetching person ID…");
  const userInfo = await fetchPersonId(accessToken);

  const personId = userInfo.sub;
  const expiresIn = tokenData.expires_in
    ? `${Math.round(tokenData.expires_in / 86400)} days`
    : "unknown";

  console.log("\n========================================");
  console.log("SUCCESS — add these to Vercel env vars:");
  console.log("========================================\n");
  console.log(`LINKEDIN_TOKEN=${accessToken}`);
  console.log(`LINKEDIN_PERSON_ID=${personId}`);
  console.log(`\nToken expires in: ~${expiresIn}`);
  if (userInfo.name) console.log(`Account: ${userInfo.name}`);
  console.log("\nAlso saved to .env.local (local testing only).\n");

  upsertEnvLocal({
    LINKEDIN_TOKEN: accessToken,
    LINKEDIN_PERSON_ID: personId,
  });

  console.log("Next steps:");
  console.log("  1. Paste LINKEDIN_TOKEN + LINKEDIN_PERSON_ID into Vercel → Environment Variables");
  console.log("  2. Redeploy linkedin-auto-poster-two");
  console.log("  3. npm run post:schedule:uninstall  (avoid double-post with Mac schedule)");
  console.log("");
}

main().catch((error) => {
  console.error("\n✗", error.message);
  console.error("\nTips:");
  console.error("  • Redirect URL in LinkedIn app must be exactly:", REDIRECT_URI);
  console.error("  • Products must include Share on LinkedIn + OpenID Connect");
  console.error("  • Run: npm run linkedin:oauth -- --help\n");
  process.exit(1);
});
