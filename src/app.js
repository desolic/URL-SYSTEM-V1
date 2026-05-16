import net from 'node:net';
import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { makeTokenVerifier } from './auth.js';
import { SlugTakenError } from './db.js';
import { SLUG_PATTERN } from './slug.js';

const RESERVED_SLUGS = new Set(['api', 'healthz']);

const SHORTEN_BODY_SCHEMA = {
  type: 'object',
  required: ['url'],
  additionalProperties: false,
  properties: {
    url: { type: 'string', minLength: 1, maxLength: 2048 },
    slug: { type: 'string', minLength: 1, maxLength: 64 },
  },
};

export async function buildApp(config, store) {
  const verifyToken = makeTokenVerifier(config.authTokenHash);

  const app = Fastify({
    trustProxy: config.trustProxy,
    bodyLimit: 8 * 1024,
    // Privacy: no automatic access logs (which would record IP / user agent).
    disableRequestLogging: true,
    logger: { level: process.env.LOG_LEVEL || 'info' },
  });

  // Strict security headers (HSTS, nosniff, no-referrer, frame denial, ...).
  await app.register(helmet);

  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  app.setErrorHandler((err, request, reply) => {
    const status = Number.isInteger(err.statusCode) ? err.statusCode : 500;
    if (status >= 500) {
      request.log.error({ err }, 'request failed');
      return reply.code(500).send({ error: 'internal server error' });
    }
    return reply.code(status).send({ error: err.message });
  });

  // Unknown paths (including "/") fall back to the default redirect target.
  app.setNotFoundHandler((request, reply) => {
    redirect(reply, config.defaultRedirect);
  });

  app.get('/healthz', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
  }));

  app.post(
    '/api/shorten',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      // Verify the token before body parsing/validation, so unauthenticated
      // requests never reach the schema.
      onRequest: async (request, reply) => {
        if (!verifyToken(request.headers.authorization)) {
          return reply
            .code(401)
            .header('www-authenticate', 'Bearer')
            .send({ error: 'unauthorized' });
        }
      },
      schema: { body: SHORTEN_BODY_SCHEMA },
    },
    async (request, reply) => {
      const target = parseRedirectTarget(request.body.url);
      if (target.error) {
        return reply.code(400).send({ error: target.error });
      }

      const { slug: customSlug } = request.body;
      let slug;
      try {
        if (customSlug !== undefined) {
          if (
            !SLUG_PATTERN.test(customSlug) ||
            RESERVED_SLUGS.has(customSlug.toLowerCase())
          ) {
            return reply.code(400).send({
              error: 'slug must match [A-Za-z0-9]+ and must not be reserved',
            });
          }
          slug = store.createCustom(target.href, customSlug);
        } else {
          slug = store.createGenerated(target.href);
        }
      } catch (err) {
        if (err instanceof SlugTakenError) {
          return reply.code(409).send({ error: 'slug already exists' });
        }
        throw err;
      }

      return reply
        .code(201)
        .send({ slug, shortUrl: `${config.publicBaseUrl}${slug}` });
    },
  );

  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params;
    if (SLUG_PATTERN.test(slug)) {
      const url = store.resolve(slug);
      if (url) return redirect(reply, url);
    }
    return redirect(reply, config.defaultRedirect);
  });

  return app;
}

function redirect(reply, location) {
  return reply
    .code(303)
    .header('location', location)
    .header('cache-control', 'no-store')
    .send();
}

function parseRedirectTarget(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: 'url must be a valid https:// URL' };
  }
  if (url.protocol !== 'https:') {
    return { error: 'url must be a valid https:// URL' };
  }
  if (isNonPublicHost(url.hostname)) {
    return { error: 'url must point to a public host' };
  }
  return { href: url.href };
}

// Rejects loopback / private / link-local targets so the shortener cannot be
// pointed at internal infrastructure.
function isNonPublicHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  ) {
    return true;
  }

  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
  }

  if (net.isIPv6(host)) {
    if (host === '::' || host === '::1') return true;
    if (/^f[cd]/.test(host)) return true; // unique-local fc00::/7
    if (/^fe[89ab]/.test(host)) return true; // link-local fe80::/10
    return false;
  }

  return false;
}
