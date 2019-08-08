import autobind from 'autobind-decorator';
import DataLoader = require('dataloader');
import * as lodash from 'lodash';
import { DatabasePoolType, sql } from 'slonik';
import { postgresSql as initSql } from './files';
import { accountDomain, blockHeight, BlockProto, transactionHash, TransactionProto } from './iroha-api';

type First<T> = { value: T };

type PagedQuery<A> = { after: A, count: number };
type TimeRangeQuery = { timeAfter?: string, timeBefore?: string };
type PagedList<T, A> = { items: T[], nextAfter: A };

const array = (items: any[], type: string) => sql.raw(`$1::${type}[]`, [items as any]);
const anyOrOne = (items: any[], type: string) => items.length === 1 ? sql`(${items[0]})` : sql`ANY(${array(items, type)})`;

const map = <A, B>(f: (x: A) => B) => (xs: A[]) => xs.map(f);

const byKeys = <T, K extends number | string>(keyOf: (x: T) => K, keys: K[]) => (items: T[]) => {
  const lookup = lodash.keyBy(items, keyOf);
  return keys.map<T>(key => lodash.get(lookup, key, null));
};

const sqlAnd = (parts: any[]) => parts.length ? parts.reduce((a, x) => sql`${a} AND ${x}`) : sql`1 = 1`;

export interface Account {
  id: string;
  quorum: number;
}

export interface Transaction {
  protobuf: TransactionProto;
  time: string;
}

export interface Peer {
  address: string;
  public_key: string;
}

export function getBlockTransactions(block: BlockProto) {
  const blockPayload = block.getBlockV1().getPayload();
  const time = dateValue(blockPayload.getCreatedTime());
  return blockPayload.getTransactionsList().map<Transaction>(protobuf => ({ protobuf, time }));
}

const parseBlock = protobuf => BlockProto.deserializeBinary(new Uint8Array(protobuf));

const parseTransaction = ({ protobuf, time }) => ({
  protobuf: TransactionProto.deserializeBinary(new Uint8Array(protobuf)),
  time: dateValue(time),
}) as Transaction;

const bytesValue = (value: Uint8Array) => sql.raw('$1', [Buffer.from(value) as any]);
const dateValue = (value: number) => new Date(value).toISOString();

export class IrohaDb {
  public blockLoader: DataLoader<number, BlockProto>;
  public transactionLoader: DataLoader<string, Transaction>;
  public accountLoader: DataLoader<string, Account>;
  public peerLoader: DataLoader<string, Peer>;

  public static init(pool: DatabasePoolType) {
    return pool.query(sql`${sql.raw(initSql)}`);
  }

  public constructor(
    private pool: DatabasePoolType,
  ) {
    this.blockLoader = new DataLoader(this.blocksByHeight);
    this.transactionLoader = new DataLoader(this.transactionsByHash);
    this.accountLoader = new DataLoader(this.accountsById);
    this.peerLoader = new DataLoader(this.peersByPublicKey);
  }

  @autobind
  public fork() {
    return new IrohaDb(this.pool);
  }

  public applyBlock(block: BlockProto) {
    return this.pool.transaction(async () => {
      const blockPayload = block.getBlockV1().getPayload();
      const blockTransactions = blockPayload.getTransactionsList();
      const blockTime = dateValue(blockPayload.getCreatedTime());
      await this.pool.query(sql`
        INSERT INTO block (protobuf, height, created_time, transaction_count) VALUES (
          ${bytesValue(Buffer.from(block.serializeBinary()))},
          ${blockPayload.getHeight()},
          ${blockTime},
          ${blockTransactions.length}
        )
      `);

      let transactionIndex = await this.transactionCount();
      let accountIndex = await this.accountCount();
      let peerIndex = await this.peerCount();

      for (const transaction of blockTransactions) {
        transactionIndex += 1;
        await this.pool.query(sql`
          INSERT INTO transaction (protobuf, index, hash, creator_domain, block_height, time) VALUES (
            ${bytesValue(transaction.serializeBinary())},
            ${transactionIndex},
            ${transactionHash(transaction)},
            ${accountDomain(transaction.getPayload().getReducedPayload().getCreatorAccountId())},
            ${blockHeight(block)},
            ${blockTime}
          )
        `);

        for (const command of transaction.getPayload().getReducedPayload().getCommandsList()) {
          if (command.hasCreateAccount()) {
            const createAccount = command.getCreateAccount();
            accountIndex += 1;
            await this.pool.query(sql`
              INSERT INTO account (index, id, quorum) VALUES (
                ${accountIndex},
                ${`${createAccount.getAccountName()}@${createAccount.getDomainId()}`},
                1
              )
            `);
          } else if (command.hasSetAccountQuorum()) {
            const setAccountQuorum = command.getSetAccountQuorum();
            await this.pool.query(sql`
              UPDATE account SET quorum = ${setAccountQuorum.getQuorum()}
              WHERE id = ${setAccountQuorum.getAccountId()}
            `);
          } else if (command.hasAddPeer()) {
            const addPeer = command.getAddPeer();
            peerIndex += 1;
            await this.pool.query(sql`
              INSERT INTO peer (index, address, public_key) VALUES (
                ${peerIndex},
                ${addPeer.getPeer().getAddress()},
                ${addPeer.getPeer().getPeerKey()}
              )
            `);
          }
        }
      }
    });
  }

  public blockCount() {
    return this.pool.oneFirst<First<number>>(sql`
      SELECT COUNT(1) FROM block
    `);
  }

  public transactionCount() {
    return this.pool.oneFirst<First<number>>(sql`
      SELECT COUNT(1) FROM transaction
    `);
  }

  public accountCount() {
    return this.pool.oneFirst<First<number>>(sql`
      SELECT COUNT(1) FROM account
    `);
  }

  public peerCount() {
    return this.pool.oneFirst<First<number>>(sql`
      SELECT COUNT(1) FROM peer
    `);
  }

  @autobind
  public blocksByHeight(heights: number[]) {
    return this.pool.anyFirst(sql`
      SELECT protobuf FROM block
      WHERE height = ${anyOrOne(heights, 'BIGINT')}
    `).then(map(parseBlock)).then(byKeys(blockHeight, heights));
  }

  @autobind
  public transactionsByHash(hashes: string[]) {
    return this.pool.any<any>(sql`
      SELECT protobuf, time FROM transaction
      WHERE hash = ${anyOrOne(hashes, 'TEXT')}
    `).then(map(parseTransaction)).then(byKeys(x => transactionHash(x.protobuf), hashes));
  }

  @autobind
  public accountsById(ids: string[]) {
    return this.pool.any<Account>(sql`
      SELECT id, quorum FROM account
      WHERE id = ${anyOrOne(ids, 'TEXT')}
    `).then(byKeys(x => x.id, ids));
  }

  @autobind
  public peersByPublicKey(publicKeys: string[]) {
    return this.pool.any<Peer>(sql`
      SELECT address, public_key FROM peer
      WHERE public_key = ${anyOrOne(publicKeys, 'TEXT')}
    `).then(byKeys(x => x.public_key, publicKeys));
  }

  public async blockList(query: PagedQuery<number> & TimeRangeQuery & { reverse?: boolean }) {
    const after = (query.after === undefined || query.after === null) ? (query.reverse ? 0x7FFFFFFF : 0) : query.after;
    const where = [];
    where.push(sql`height ${sql.raw(query.reverse ? '<' : '>')} ${after}`);
    if (query.timeAfter) {
      where.push(sql`created_time >= ${query.timeAfter}`);
    }
    if (query.timeBefore) {
      where.push(sql`created_time < ${query.timeBefore}`);
    }
    const items = await this.pool.anyFirst(sql`
      SELECT protobuf FROM block
      WHERE ${sqlAnd(where)}
      ORDER BY height ${sql.raw(query.reverse ? 'DESC' : 'ASC')}
      LIMIT ${query.count}
    `).then(map(parseBlock));
    return {
      items,
      nextAfter: after + items.length,
    } as PagedList<BlockProto, number>;
  }

  public async transactionList(query: PagedQuery<number> & TimeRangeQuery) {
    const after = (query.after === undefined || query.after === null) ? 0 : query.after;
    const where = [];
    where.push(sql`index > ${after}`);
    if (query.timeAfter) {
      where.push(sql`time >= ${query.timeAfter}`);
    }
    if (query.timeBefore) {
      where.push(sql`time < ${query.timeBefore}`);
    }
    const items = await this.pool.any<any>(sql`
      SELECT protobuf, time FROM transaction
      WHERE ${sqlAnd(where)}
      ORDER BY index
      LIMIT ${query.count}
    `).then(map(parseTransaction));
    return {
      items,
      nextAfter: after + items.length,
    } as PagedList<Transaction, number>;
  }

  public async accountList(query: PagedQuery<number>) {
    const after = query.after || 0;
    const items = await this.pool.any<Account>(sql`
      SELECT id, quorum FROM account
      WHERE index > ${after}
      ORDER BY index
      LIMIT ${query.count}
    `);
    return {
      items,
      nextAfter: after + items.length,
    } as PagedList<Account, number>;
  }

  public async peerList(query: PagedQuery<number>) {
    const after = query.after || 0;
    const items = await this.pool.any<Peer>(sql`
      SELECT address, public_key FROM peer
      WHERE index > ${after}
      ORDER BY index
      LIMIT ${query.count}
    `);
    return {
      items,
      nextAfter: after + items.length,
    } as PagedList<Peer, number>;
  }

  public transactionCountPerMinute(count: number) {
    return this.countPerBucket('transaction', 'minute', count);
  }

  public transactionCountPerHour(count: number) {
    return this.countPerBucket('transaction', 'hour', count);
  }

  public blockCountPerMinute(count: number) {
    return this.countPerBucket('block', 'minute', count);
  }

  public blockCountPerHour(count: number) {
    return this.countPerBucket('block', 'hour', count);
  }

  public transactionCountPerDomain() {
    return this.pool.any<{ domain: string, count: number }>(sql`
      SELECT creator_domain AS domain, COUNT(1) AS count FROM transaction
      GROUP BY creator_domain
    `);
  }

  private countPerBucket(what: 'block' | 'transaction', unit: 'minute' | 'hour', count: number) {
    const after = sql`DATE_TRUNC(${unit}, NOW()) - ${`${count - 1} ${unit}`}::INTERVAL`;
    return this.pool.anyFirst<First<number>>(sql`
      WITH buckets AS (
        SELECT generate_series(
          ${after},
          DATE_TRUNC(${unit}, NOW()),
          ${`1 ${unit}`}::INTERVAL
        ) AS bucket
      )
      SELECT ${what === 'block' ? sql`COUNT(block.*)` : sql`COALESCE(SUM(transaction_count), 0)`}
      FROM buckets LEFT JOIN block ON DATE_TRUNC(${unit}, created_time) = bucket
        AND created_time > ${after}
      GROUP BY bucket
      ORDER BY bucket
    `);
  }
}
