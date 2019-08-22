import autobind from 'autobind-decorator';
import DataLoader = require('dataloader');
import get from 'lodash/get';
import keyBy from 'lodash/keyBy';
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

const byKeys = <T, K extends number | string>(keyOf: keyof T | ((x: T) => K), keys: K[]) => (items: T[]) => {
  const lookup = keyBy(items, keyOf);
  return keys.map<T>(key => get(lookup, key, null));
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

export interface Role {
  name: string;
  permissions: number[];
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
  public roleLoader: DataLoader<string, Role>;

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
    this.roleLoader = new DataLoader(this.rolesByName);
  }

  @autobind
  public fork() {
    return new IrohaDb(this.pool);
  }

  public applyBlock(block: BlockProto) {
    return this.pool.transaction(async (pool) => {
      const blockPayload = block.getBlockV1().getPayload();
      const blockTransactions = blockPayload.getTransactionsList();
      const blockTime = dateValue(blockPayload.getCreatedTime());
      await pool.query(sql`
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
      let roleIndex = await this.roleCount();

      for (const transaction of blockTransactions) {
        transactionIndex += 1;
        await pool.query(sql`
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
            await pool.query(sql`
              INSERT INTO account (index, id, quorum) VALUES (
                ${accountIndex},
                ${`${createAccount.getAccountName()}@${createAccount.getDomainId()}`},
                1
              )
            `);
          } else if (command.hasSetAccountQuorum()) {
            const setAccountQuorum = command.getSetAccountQuorum();
            await pool.query(sql`
              UPDATE account SET quorum = ${setAccountQuorum.getQuorum()}
              WHERE id = ${setAccountQuorum.getAccountId()}
            `);
          } else if (command.hasAddPeer()) {
            const addPeer = command.getAddPeer();
            peerIndex += 1;
            await pool.query(sql`
              INSERT INTO peer (index, address, public_key) VALUES (
                ${peerIndex},
                ${addPeer.getPeer().getAddress()},
                ${addPeer.getPeer().getPeerKey()}
              )
            `);
          } else if (command.hasCreateRole()) {
            const createRole = command.getCreateRole();
            roleIndex += 1;
            await pool.query(sql`
              INSERT INTO role (index, name, permissions) VALUES (
                ${roleIndex},
                ${createRole.getRoleName()},
                ${array(createRole.getPermissionsList(), 'INT')}
              )
            `);
          }
        }
      }
    });
  }

  private static makeCount(table: 'block' | 'transaction' | 'account' | 'peer' | 'role') {
    return function (this: IrohaDb) {
      return this.pool.oneFirst<First<number>>(sql`
        SELECT COUNT(1) FROM ${sql.raw(table)}
      `);
    };
  }

  public blockCount = IrohaDb.makeCount('block');
  public transactionCount = IrohaDb.makeCount('transaction');
  public accountCount = IrohaDb.makeCount('account');
  public peerCount = IrohaDb.makeCount('peer');
  public roleCount = IrohaDb.makeCount('role');

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
    `).then(byKeys('id', ids));
  }

  @autobind
  public peersByPublicKey(publicKeys: string[]) {
    return this.pool.any<Peer>(sql`
      SELECT address, public_key FROM peer
      WHERE public_key = ${anyOrOne(publicKeys, 'TEXT')}
    `).then(byKeys('public_key', publicKeys));
  }

  @autobind
  public rolesByName(names: string[]) {
    return this.pool.any<Role>(sql`
      SELECT name, permissions FROM role
      WHERE name = ${anyOrOne(names, 'TEXT')}
    `).then(byKeys('name', names));
  }

  private static makePagedList<T>(table: 'account' | 'peer' | 'role', fields: (keyof T)[]) {
    return async function (this: IrohaDb, query: PagedQuery<number>) {
      const after = query.after || 0;
      const items = await this.pool.any<T>(sql`
        SELECT ${sql.raw(fields.join(', '))} FROM ${sql.raw(table)}
        WHERE index > ${after}
        ORDER BY index
        LIMIT ${query.count}
      `);
      return {
        items,
        nextAfter: after + items.length,
      } as PagedList<T, number>;
    };
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

  public accountList = IrohaDb.makePagedList<Account>('account', ['id', 'quorum']);
  public peerList = IrohaDb.makePagedList<Peer>('peer', ['address', 'public_key']);
  public roleList = IrohaDb.makePagedList<Role>('role', ['name', 'permissions']);

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
