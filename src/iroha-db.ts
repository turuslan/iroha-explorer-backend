import { DatabasePoolType, sql } from 'slonik';
import { postgresSql as initSql } from './files';
import { BlockProto, transactionHash, TransactionProto } from './iroha-api';

type First<T> = { value: T };

type PagedQuery<A> = { after: A, count: number };
type PagedList<T, A> = { items: T[], nextAfter: A };

const nullable = <A, B>(f: (x: A) => B) => (x: A) => x === null ? null : f(x);
const map = <A, B>(f: (x: A) => B) => (xs: A[]) => xs.map(f);

export interface Account {
  id: string;
  quorum: number;
}

export interface Transaction {
  protobuf: TransactionProto;
}

const parseBlock = protobuf => BlockProto.deserializeBinary(new Uint8Array(protobuf));

const parseTransaction = ({ protobuf }) => ({
  protobuf: TransactionProto.deserializeBinary(new Uint8Array(protobuf)),
}) as Transaction;

const bytesValue = (value: Uint8Array) => sql.raw('$1', [Buffer.from(value) as any]);
const dateValue = (value: number) => new Date(value).toISOString();

export class IrohaDb {
  public static init(pool: DatabasePoolType) {
    return pool.query(sql`${sql.raw(initSql)}`);
  }

  public constructor(
    private pool: DatabasePoolType,
  ) {
  }

  public applyBlock(block: BlockProto) {
    return this.pool.transaction(async () => {
      const blockPayload = block.getBlockV1().getPayload();
      const blockTransactions = blockPayload.getTransactionsList();
      await this.pool.query(sql`
        INSERT INTO block (protobuf, height, created_time, transaction_count) VALUES (
          ${bytesValue(Buffer.from(block.serializeBinary()))},
          ${blockPayload.getHeight()},
          ${dateValue(blockPayload.getCreatedTime())},
          ${blockTransactions.length}
        )
      `);

      let transactionIndex = await this.transactionCount();
      let accountIndex = await this.accountCount();

      for (const transaction of blockTransactions) {
        transactionIndex += 1;
        await this.pool.query(sql`
          INSERT INTO transaction (protobuf, index, hash) VALUES (
            ${bytesValue(transaction.serializeBinary())},
            ${transactionIndex},
            ${transactionHash(transaction)}
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

  public blockByHeight(height: number) {
    return this.pool.maybeOneFirst(sql`
      SELECT protobuf FROM block
      WHERE height = ${height}
    `).then(nullable(parseBlock));
  }

  public transactionByHash(hash: string) {
    return this.pool.maybeOne<any>(sql`
      SELECT protobuf FROM transaction
      WHERE hash = ${hash}
    `).then(nullable(parseTransaction));
  }

  public accountById(id: string) {
    return this.pool.maybeOne<Account>(sql`
      SELECT id, quorum FROM account
      WHERE id = ${id}
    `);
  }

  public async blockList(query: PagedQuery<number>) {
    const after = query.after || 0;
    const items = await this.pool.anyFirst(sql`
      SELECT protobuf FROM block
      WHERE height > ${after}
      ORDER BY height
      LIMIT ${query.count}
    `).then(map(parseBlock));
    return {
      items,
      nextAfter: after + items.length,
    } as PagedList<BlockProto, number>;
  }

  public async transactionList(query: PagedQuery<number>) {
    const after = query.after || 0;
    const items = await this.pool.any<any>(sql`
      SELECT protobuf FROM transaction
      WHERE index > ${after}
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

  public transactionCountPerMinute(count: number) {
    return this.pool.anyFirst<First<number>>(this.transactionCountPerBucket('minute', count));
  }

  public transactionCountPerHour(count: number) {
    return this.pool.anyFirst<First<number>>(this.transactionCountPerBucket('hour', count));
  }

  private transactionCountPerBucket(unit: 'minute' | 'hour', count: number) {
    const after = sql`DATE_TRUNC(${unit}, NOW()) - ${`${count - 1} ${unit}`}::INTERVAL`;
    return sql`
      WITH buckets AS (
        SELECT generate_series(
          ${after},
          DATE_TRUNC(${unit}, NOW()),
          ${`1 ${unit}`}::INTERVAL
        ) AS bucket
      )
      SELECT COALESCE(SUM(transaction_count), 0)
      FROM buckets LEFT JOIN block ON DATE_TRUNC(${unit}, created_time) = bucket
        AND created_time > ${after}
      GROUP BY bucket
      ORDER BY bucket
    `;
  }
}
