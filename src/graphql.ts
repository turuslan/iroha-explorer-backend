import { makeExecutableSchema } from 'graphql-tools';
import { graphqlGql } from './files';
import { blockHash, blockHeight, BlockProto, transactionHash } from './iroha-api';
import { getBlockTransactions, IrohaDb, Peer, Transaction } from './iroha-db';

export const schema = makeExecutableSchema<IrohaDb>({
  typeDefs: graphqlGql,
  resolvers: {
    Block: {
      height: blockHeight,
      hash: blockHash,
      transactionCount: (block: BlockProto) => block.getBlockV1().getPayload().getTransactionsList().length,
      time: (block: BlockProto) => new Date(block.getBlockV1().getPayload().getCreatedTime()).toISOString(),
      transactions: getBlockTransactions,
      previousBlockHash: (block: BlockProto) => block.getBlockV1().getPayload().getPrevBlockHash(),
    },
    Transaction: {
      hash: (transaction: Transaction) => transactionHash(transaction.protobuf),
      createdBy: (transaction: Transaction, {}, { accountLoader }) => accountLoader.load(transaction.protobuf.getPayload().getReducedPayload().getCreatorAccountId()),
    },
    Peer: {
      publicKey: (peer: Peer) => peer.public_key,
    },
    Query: {
      blockCount: (_, {}, db) => db.blockCount(),
      transactionCount: (_, {}, db) => db.transactionCount(),
      accountCount: (_, {}, db) => db.accountCount(),
      peerCount: (_, {}, db) => db.peerCount(),

      blockByHeight: (_, { height }, { blockLoader }) => blockLoader.load(height),
      transactionByHash: (_, { hash }, { transactionLoader }) => transactionLoader.load(hash),
      accountById: (_, { id }, { accountLoader }) => accountLoader.load(id),
      peerByPublicKey: (_, { publicKey }, { peerLoader }) => peerLoader.load(publicKey),

      blockList: (_, { after, count, reverse }, db) => db.blockList({ after, count }, reverse),
      transactionList: (_, { after, count }, db) => db.transactionList({ after, count }),
      accountList: (_, { after, count }, db) => db.accountList({ after, count }),
      peerList: (_, { after, count }, db) => db.peerList({ after, count }),

      transactionCountPerMinute: (_, { count }, db) => db.transactionCountPerMinute(count),
      transactionCountPerHour: (_, { count }, db) => db.transactionCountPerHour(count),
      blockCountPerMinute: (_, { count }, db) => db.blockCountPerMinute(count),
      blockCountPerHour: (_, { count }, db) => db.blockCountPerHour(count),

      transactionCountPerDomain: (_, {}, db) => db.transactionCountPerDomain(),
    },
  },
});
