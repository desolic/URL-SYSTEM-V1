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
    reply.code(303).header('location', config.defaultRedirect).send();
  });

  app.get('/healthz', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
  }));

  app.post(
    '/api/shorten',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: { body: SHORTEN_BODY_SCHEMA },
    },
    async (request, reply) => {
      if (!verifyToken(request.headers.authorization)) {
        return reply
          .code(401)
          .header('www-authenticate', 'Bearer')
          .send({ error: 'unauthorized' });
      }

      const target = normalizeHttpsUrl(request.body.url);
      if (!target) {
        return reply
          .code(400)
          .send({ error: 'url must be a valid https:// URL' });
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
          slug = store.createCustom(target, customSlug);
        } else {
          slug = store.createGenerated(target);
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
      if (url) {
        return reply
          .code(303)
          .header('location', url)
          .header('cache-control', 'no-store')
          .send();
      }
    }
    return reply.code(303).header('location', config.defaultRedirect).send();
  });

  return app;
}

function normalizeHttpsUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === 'https:' ? url.href : null;
}
