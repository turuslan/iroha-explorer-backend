import config from './config';
import './server';
import * as sync from './sync';

if (!config.disableSync) {
  // tslint:disable-next-line:no-floating-promises
  sync.main();
}
