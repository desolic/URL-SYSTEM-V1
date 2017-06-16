import { saveUrl, hasSlug, getUrl, incrementUrl } from './lib/db';
import * as log from './lib/log';
import server from './lib/server';
import { route } from './lib/server';


/**
 * Config.
 */

const DRY_RUN = false;
const REDIRECT_STATUS = 303;


/**
 * Route RegExps.
 */

const REGEX_GET = /^\/([a-zA-Z0-9]+)$/;
const REGEX_CATCHALL = /.*/;


/**
 * Set at boot time.
 */

let REGEX_CREATE, DEFAULT, PREFIX;


/**
 * Boot the app.
 */

export default function boot({ host, defaultRedirection, create }) {
  PREFIX = host ? `http://${host}/` : '';
  DEFAULT = defaultRedirection;

  REGEX_CREATE = new RegExp(`^/${create}(?::([^\/]+))?/(.+)$`);

  route(REGEX_CREATE,   createUrlHandler);
  route(REGEX_GET,      getUrlHandler);
  route(REGEX_CATCHALL, catchallHandler);

  return server;
}


/**
 * Create a new URL.
 */

function createUrlHandler([ , slug, url], req, res) {
  slug = saveUrl(url, slug);
  res.end(`${PREFIX}${slug}`);

  log.create(req, slug);
}


/**
 * Try to retireve a URL.
 */

function getUrlHandler([ , slug], req, res) {
  if (!hasSlug(slug)) {
    redirect(res, DEFAULT);
    log.unknown(req, slug);
    return;
  }

  let url = getUrl(slug, true);
  redirect(res, url, REDIRECT_STATUS);
  log.get(req, slug);
}


/**
 * Catch-all handler.
 */

function catchallHandler([url], req, res) {
  redirect(res, DEFAULT);

  log.catchall(req);
}


/**
 * Redirection helper.
 */

function redirect(res, target, status = 302) {
  if(!DRY_RUN)
    res.writeHead(status, { Location: target });

  res.end(target);
}
