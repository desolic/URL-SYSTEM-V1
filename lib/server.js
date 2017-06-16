import http from 'http';


/**
 * Basic server settings.
 */

let server = http.createServer();

server.maxHeadersCount = 20;
server.timeout = 3 * 1000;

export default server;


/**
 * Route handling.
 */

let routes = [];

export function route(regexp, cb) {
  routes.push([regexp, cb]);
}

server.on('request', (req, res) => {
  let handler = routes.find(([regexp, cb]) => {
    let match = req.url.match(regexp);
    if (!match) return false;

    try {
      cb(match, req, res);
    } catch (err) {
      res.writeHead(500);
      res.end(`500 - Internal Server Error\n\n${err.message||err}`);
    }
  });

  if (!handler) {
    res.writeHead(500);
    res.end('500 - No route handler found');
  }
});
