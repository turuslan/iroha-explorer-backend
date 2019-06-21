import * as grpc from 'grpc';
import { commands } from 'iroha-helpers';
import { CommandService_v1Client } from 'iroha-helpers/lib/proto/endpoint_grpc_pb';
import config from '../config';
import { blockHash, blockHeight, BlockProto, IrohaApi } from '../iroha-api';
import { IrohaContainer } from './util/iroha-container';
import { shouldResolve } from './util/resolved';

function addBlock(host: string) {
  const commandService = new CommandService_v1Client(host, grpc.credentials.createInsecure() as any);
  return commands.setAccountQuorum(
    {
      commandService,
      privateKeys: [config.iroha.admin.privateKey],
      creatorAccountId: config.iroha.admin.accountId,
      quorum: 1,
      timeoutLimit: 5000,
    },
    {
      accountId: config.iroha.admin.accountId,
      quorum: 1,
    },
  );
}

async function scanBlocksAsArray(api: IrohaApi, firstHeight: number) {
  const blocks = [] as BlockProto[];
  await api.scanBlocks(firstHeight, async block => blocks.push(block));
  return blocks;
}

describe('iroha api', () => {
  let iroha: IrohaContainer = null;
  let api: IrohaApi = null;
  const allBlocks: BlockProto[] = [];

  beforeAll(
    async () => {
      iroha = await IrohaContainer.create();
      api = new IrohaApi(iroha.host, config.iroha.admin.accountId, config.iroha.admin.privateKey);
    },
    60000,
  );

  afterAll(async () => {
    if (iroha) {
      await iroha.stop();
    }
  });

  test('scanBlocks first', async () => {
    const blocks = await scanBlocksAsArray(api, 1);

    expect(blocks).toHaveLength(1);
    allBlocks.push(blocks[0]);
  });

  test('fetchCommits second', async () => {
    const blocks = [] as BlockProto[];
    const stream = api.fetchCommit(async block => blocks.push(block));

    await shouldResolve(stream.promise, false, 100);
    expect(blocks).toHaveLength(0);

    await addBlock(iroha.host);

    expect(blocks).toHaveLength(1);
    allBlocks.push(blocks[0]);

    stream.end();
    await shouldResolve(stream.promise, true, 100);
  });

  test('scanBlocks first second', async () => {
    const blocks = await scanBlocksAsArray(api, 1);

    expect(blocks).toHaveLength(2);
  });

  test('scanBlocks second', async () => {
    const blocks = await scanBlocksAsArray(api, 2);

    expect(blocks).toHaveLength(1);
  });

  test('blockHeight', async () => {
    expect(allBlocks).toHaveLength(2);
    expect(blockHeight(allBlocks[0])).toBe(1);
    expect(blockHeight(allBlocks[1])).toBe(2);
  });

  test('blockHash', async () => {
    expect(allBlocks).toHaveLength(2);
    expect(blockHash(allBlocks[0])).toBe(allBlocks[1].getBlockV1().getPayload().getPrevBlockHash());
  });
});
