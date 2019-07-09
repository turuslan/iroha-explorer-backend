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
      createdBy: (transaction: Transaction, {}, db) => db.accountById(transaction.protobuf.getPayload().getReducedPayload().getCreatorAccountId()),
    },
    Query: {
      blockCount: (_, {}, db) => db.blockCount(),
      transactionCount: (_, {}, db) => db.transactionCount(),
      accountCount: (_, {}, db) => db.accountCount(),

      blockByHeight: (_, { height }, db) => db.blockByHeight(height),
      transactionByHash: (_, { hash }, db) => db.transactionByHash(hash),
      accountById: (_, { id }, db) => db.accountById(id),

      blockList: (_, { after, count }, db) => db.blockList({ after, count }),
      transactionList: (_, { after, count }, db) => db.transactionList({ after, count }),
      accountList: (_, { after, count }, db) => db.accountList({ after, count }),
    },
  },
});
