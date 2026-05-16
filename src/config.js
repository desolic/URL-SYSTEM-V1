const HEX_64 = /^[0-9a-f]{64}$/i;

export function loadConfig(env = process.env) {
  const errors = [];

  const bindAddress = env.BIND_ADDRESS || '127.0.0.1';
  const port = Number.parseInt(env.PORT || '3000', 10);
  const shortDomain = (env.SHORT_DOMAIN || '').trim();
  const defaultRedirect = (env.DEFAULT_REDIRECT || '').trim();
  const authTokenHash = (env.AUTH_TOKEN_HASH || '').trim();
  const databasePath = env.DATABASE_PATH || './data/db.sqlite';
  const trustProxy = parseBool(env.TRUST_PROXY, true);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push('PORT must be an integer between 1 and 65535');
  }
  if (!shortDomain) {
    errors.push('SHORT_DOMAIN is required (e.g. link.desolic.com)');
  }
  if (!isHttpsUrl(defaultRedirect)) {
    errors.push('DEFAULT_REDIRECT must be a valid https:// URL');
  }
  if (!HEX_64.test(authTokenHash)) {
    errors.push(
      'AUTH_TOKEN_HASH must be the SHA-256 hex digest (64 hex chars) of the API token — run "npm run gen-token"',
    );
  }

  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${errors.join('\n  - ')}`);
  }

  return {
    bindAddress,
    port,
    shortDomain,
    defaultRedirect,
    authTokenHash: authTokenHash.toLowerCase(),
    databasePath,
    trustProxy,
    publicBaseUrl: `https://${shortDomain}/`,
  };
}

function parseBool(value, fallback) {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function isHttpsUrl(value) {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
