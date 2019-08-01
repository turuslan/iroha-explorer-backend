import { makeExecutableSchema } from 'graphql-tools';
import { graphqlGql } from './files';
import { blockHash, blockHeight, BlockProto, transactionHash } from './iroha-api';
import { IrohaDb, Transaction } from './iroha-db';

export const schema = makeExecutableSchema<IrohaDb>({
  typeDefs: graphqlGql,
  resolvers: {
    Block: {
      height: blockHeight,
      hash: blockHash,
      transactionCount: (block: BlockProto) => block.getBlockV1().getPayload().getTransactionsList().length,
    },
    Transaction: {
      hash: (transaction: Transaction) => transactionHash(transaction.protobuf),
      createdBy: (transaction: Transaction, {}, { accountLoader }) => accountLoader.load(transaction.protobuf.getPayload().getReducedPayload().getCreatorAccountId()),
    },
    Query: {
      blockCount: (_, {}, db) => db.blockCount(),
      transactionCount: (_, {}, db) => db.transactionCount(),
      accountCount: (_, {}, db) => db.accountCount(),

      blockByHeight: (_, { height }, { blockLoader }) => blockLoader.load(height),
      transactionByHash: (_, { hash }, { transactionLoader }) => transactionLoader.load(hash),
      accountById: (_, { id }, { accountLoader }) => accountLoader.load(id),

      blockList: (_, { after, count }, db) => db.blockList({ after, count }),
      transactionList: (_, { after, count }, db) => db.transactionList({ after, count }),
      accountList: (_, { after, count }, db) => db.accountList({ after, count }),

      transactionCountPerMinute: (_, { count }, db) => db.transactionCountPerMinute(count),
      transactionCountPerHour: (_, { count }, db) => db.transactionCountPerHour(count),
      blockCountPerMinute: (_, { count }, db) => db.blockCountPerMinute(count),
      blockCountPerHour: (_, { count }, db) => db.blockCountPerHour(count),
    },
  },
});
