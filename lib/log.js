import low from 'lowdb';


/**
 * Enable console logging.
 */

const DEBUG = process.env.DEBUG;


/**
 * Basic setup.
 */

let db = low('./data/log.json');

let channels = {
  get: db('get'),
  unknown: db('unknown'),
  create: db('create'),
  catchall: db('catchall')
};


/**
 * Logging helper factory.
 */

function log({ method, url, headers }, slug) {
  let data = { slug, req: { method, url, headers }, date: Date.now() };
  channels[this].push(data);
  if (DEBUG) console.log(this, data);
}


/**
 * Export logging helpers.
 */

export let get = log.bind('get');
export let unknown = log.bind('unknown');
export let create = log.bind('create');
export let catchall = log.bind('catchall');
