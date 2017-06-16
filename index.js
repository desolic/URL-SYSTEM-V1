import boot from './app';

/**
 * Default port, in case none is provided.
 */

const DEFAULT_PORT = 3000;


/**
 * Boot up application.
 */

let app = boot({
  create: process.env.CREATE,
  defaultRedirection: process.env.DEFAULT,
  host: process.env.HOST
});


/**
 * Start to listen for requests.
 */

app.listen(process.env.PORT || DEFAULT_PORT);
