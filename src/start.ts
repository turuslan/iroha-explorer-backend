import './logger';

import config from './config';
import * as db from './db';
import * as init from './init';
import * as server from './server';
import * as sync from './sync';

async function main() {
  await db.connect();

  await init.main();

  // tslint:disable-next-line:no-floating-promises
  server.main();

  if (!config.disableSync) {
    // tslint:disable-next-line:no-floating-promises
    sync.main();
  }
}

// tslint:disable-next-line:no-floating-promises
main();
