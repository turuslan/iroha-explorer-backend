import { createPool } from 'slonik';
import config from './config';
import { IrohaApi } from './iroha-api';
import { IrohaDb } from './iroha-db';
import * as prometheus from './prometheus';

export function sync(api: IrohaApi, db: IrohaDb) {
  let end = false;
  let stream = null;
  return {
    promise: db.blockCount().then((blockCount) => {
      if (end) {
        return;
      }
      stream = api.streamBlocks(blockCount + 1, async (block) => {
        await db.applyBlock(block);
        await prometheus.readFromDb(db);
      });
      return stream.promise;
    }),
    end() {
      end = true;
      if (stream) {
        stream.end();
      }
    },
  };
}

export async function main() {
  const api = new IrohaApi(config.iroha.host, config.iroha.admin.accountId, config.iroha.admin.privateKey);
  const db = new IrohaDb(createPool(config.postgres));
  await sync(api, db).promise;
}

if (module === require.main) {
  // tslint:disable-next-line:no-floating-promises
  main();
}
