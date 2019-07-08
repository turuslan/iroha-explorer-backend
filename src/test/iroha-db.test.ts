import { Block, Block_v1 } from 'iroha-helpers/lib/proto/block_pb';
import { Command, CreateAccount, SetAccountQuorum } from 'iroha-helpers/lib/proto/commands_pb';
import { Transaction } from 'iroha-helpers/lib/proto/transaction_pb';
import { createPool, DatabasePoolType, sql } from 'slonik';
import { blockHash, blockHeight, BlockProto, transactionHash, TransactionProto } from '../iroha-api';
import { IrohaDb } from '../iroha-db';
import { PostgresContainer } from './util/postgres-container';

const account1 = 'alice@explorer';
const account2 = 'bob@explorer';
const account3 = 'eve@explorer';

function makeBlock(height: number, createdTime: string, transactions: Transaction[]) {
  const payload = new Block_v1.Payload();
  payload.setHeight(height);
  payload.setCreatedTime(new Date(createdTime).getTime());
  payload.setTransactionsList(transactions);

  const blockV1 = new Block_v1();
  blockV1.setPayload(payload);

  const block = new Block();
  block.setBlockV1(blockV1);

  return block;
}

function transaction(commands: Command[]) {
  const reducedPayload = new Transaction.Payload.ReducedPayload();
  reducedPayload.setCommandsList(commands);

  const payload = new Transaction.Payload();
  payload.setReducedPayload(reducedPayload);

  const transaction = new Transaction();
  transaction.setPayload(payload);
  return transaction;
}

function createAccount(id: string) {
  const createAccount = new CreateAccount();
  const [name, domain] = id.split('@');
  createAccount.setAccountName(name);
  createAccount.setDomainId(domain);

  const command = new Command();
  command.setCreateAccount(createAccount);
  return command;
}

function setAccountQuorum(accountId: string, quorum: number) {
  const setAccountQuorum = new SetAccountQuorum();
  setAccountQuorum.setQuorum(quorum);
  setAccountQuorum.setAccountId(accountId);

  const command = new Command();
  command.setSetAccountQuorum(setAccountQuorum);
  return command;
}

describe('iroha db', () => {
  let postgres: PostgresContainer = null;
  let pool: DatabasePoolType = null;
  let db: IrohaDb = null;

  let blocks: BlockProto[] = null;
  let transactions: TransactionProto[] = null;
  let accounts: {[id: string]: number} = null;
  let pagedListAfterLast: number = null;

  async function addBlock(createdTime: string, blockTransactions: Transaction[]) {
    const block = makeBlock(blocks.length + 1, createdTime, blockTransactions);
    await db.applyBlock(block);
    blocks.push(block);
    transactions = transactions.concat(blockTransactions);
  }

  async function checkAccount(id: string) {
    const account = await db.accountById(id);
    if (id in accounts) {
      expect(account).not.toBeNull();
      expect(account.id).toBe(id);
      expect(account.quorum).toBe(accounts[id]);
    } else {
      expect(account).toBeNull();
    }
  }

  beforeAll(
    async () => {
      postgres = await PostgresContainer.create('postgres');

      pool = createPool(postgres.url.href);
      await IrohaDb.init(pool);
      db = new IrohaDb(pool);

      blocks = [];
      transactions = [];
      accounts = {};
    },
    60000,
  );

  afterAll(async () => {
    if (postgres) {
      await postgres.stop();
    }
  });

  test('no blocks', async () => {
    expect(await db.blockCount()).toBe(0);
    expect(await db.transactionCount()).toBe(0);
    expect(await db.accountCount()).toBe(0);
  });

  test('add first block', async () => {
    await addBlock('2019-01-01T09:00Z', [
      transaction([
        createAccount(account1),
      ]),
    ]);
    accounts[account1] = 1;
  });

  test('one block', async () => {
    expect(await db.blockCount()).toBe(1);
    expect(await db.transactionCount()).toBe(1);
    expect(await db.accountCount()).toBe(1);

    await checkAccount(account1);
  });

  test('paged list after last', async () => {
    const list1 = await db.accountList({ after: null, count: 1 });
    expect(list1.items).toHaveLength(1);
    const list2 = await db.accountList({ after: list1.nextAfter, count: 1 });
    expect(list2.items).toHaveLength(0);
    pagedListAfterLast = list2.nextAfter;
    expect(list2.nextAfter).toBe(list1.nextAfter);
  });

  test('add second block', async () => {
    await addBlock('2019-01-01T11:57Z', [
      transaction([
        createAccount(account2),
      ]),
      transaction([
        setAccountQuorum(account1, 3),
      ]),
    ]);
    accounts[account1] = 3;
    accounts[account2] = 1;
  });

  test('paged list after last inserted', async () => {
    const list2 = await db.accountList({ after: pagedListAfterLast, count: 1 });
    expect(list2.items).toHaveLength(1);
  });

  test('two blocks', async () => {
    expect(await db.blockCount()).toBe(2);
    expect(await db.transactionCount()).toBe(3);
    expect(await db.accountCount()).toBe(2);

    await checkAccount(account1);
    await checkAccount(account2);
  });

  test('block by height', async () => {
    for (const expected of blocks) {
      const actual = await db.blockByHeight(blockHeight(expected));
      expect(actual).not.toBeNull();
      expect(blockHash(actual)).toBe(blockHash(expected));
    }
  });

  test('transaction by hash', async () => {
    for (const hash of transactions.map(transactionHash)) {
      const transaction = await db.transactionByHash(hash);
      expect(transaction).not.toBeNull();
      expect(transactionHash(transaction.protobuf)).toBe(hash);
    }
  });

  test('add third block', async () => {
    await addBlock('2019-01-01T11:59Z', [
      transaction([
        createAccount(account3),
      ]),
    ]);
    accounts[account3] = 1;
  });

  test('block list', async () => {
    const blocks1 = await db.blockList({ after: null, count: 1 });
    expect(blocks1.items).toHaveLength(1);
    expect(blockHeight(blocks1.items[0])).toBe(1);
    expect(blocks1.nextAfter).toBe(1);

    const blocks23 = await db.blockList({ after: blocks1.nextAfter, count: 2 });
    expect(blocks23.items).toHaveLength(2);
    expect(blockHeight(blocks23.items[0])).toBe(2);
    expect(blockHeight(blocks23.items[1])).toBe(3);
    expect(blocks23.nextAfter).toBe(3);
  });

  test('trasaction list', async () => {
    const transactions1 = await db.transactionList({ after: null, count: 1 });
    expect(transactions1.items).toHaveLength(1);
    expect(transactionHash(transactions1.items[0].protobuf)).toBe(transactionHash(transactions[0]));

    const transactions23 = await db.transactionList({ after: transactions1.nextAfter, count: 2 });
    expect(transactions23.items).toHaveLength(2);
    expect(transactionHash(transactions23.items[0].protobuf)).toBe(transactionHash(transactions[1]));
    expect(transactionHash(transactions23.items[1].protobuf)).toBe(transactionHash(transactions[2]));
  });

  test('account list', async () => {
    const accountSet = new Set(Object.keys(accounts));
    const accounts1 = await db.accountList({ after: null, count:1 });
    expect(accounts1.items).toHaveLength(1);
    expect(accountSet.delete(accounts1.items[0].id)).toBe(true);

    const accounts23 = await db.accountList({ after: accounts1.nextAfter, count: 2 });
    expect(accounts23.items).toHaveLength(2);
    expect(accountSet.delete(accounts23.items[0].id)).toBe(true);
    expect(accountSet.delete(accounts23.items[1].id)).toBe(true);
  });

  test('transaction count per minute per hour', async () => {
    await pool.query(sql`BEGIN`);
    try {
      await pool.query(sql`
        CREATE OR REPLACE FUNCTION pg_catalog.NOW()
        RETURNS TIMESTAMP WITH TIME ZONE
        LANGUAGE SQL
        AS $$ SELECT '2019-01-01T12:00'::TIMESTAMP WITH TIME ZONE $$
      `);

      const perMinute = await db.transactionCountPerMinute(5);
      expect(perMinute).toEqual([0, 2, 0, 1, 0]);

      const perHour = await db.transactionCountPerHour(5);
      expect(perHour).toEqual([0, 1, 0, 3, 0]);
    } finally {
      await pool.query(sql`ROLLBACK`);
    }
  });
});
