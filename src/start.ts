import config from './config';
import * as server from './server';
import * as sync from './sync';

async function main() {
  // tslint:disable-next-line:no-floating-promises
  server.main();

  if (!config.disableSync) {
    // tslint:disable-next-line:no-floating-promises
    sync.main();
  }
}

// tslint:disable-next-line:no-floating-promises
main();
