import { makeExecutableSchema } from 'graphql-tools';
import { graphqlGql } from './files';
import { blockHash, blockHeight, BlockProto, rolePermissionName, transactionHash } from './iroha-api';
import { Domain, getBlockTransactions, IrohaDb, Peer, Role, Transaction } from './iroha-db';

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
    Role: {
      permissions: (role: Role) => role.permissions.map(rolePermissionName),
    },
    Domain: {
      defaultRole: (domain: Domain, {}, { roleLoader }) => roleLoader.load(domain.default_role),
    },
    Query: {
      blockCount: (_, {}, db) => db.blockCount(),
      transactionCount: (_, {}, db) => db.transactionCount(),
      accountCount: (_, {}, db) => db.accountCount(),
      peerCount: (_, {}, db) => db.peerCount(),
      roleCount: (_, {}, db) => db.roleCount(),
      domainCount: (_, {}, db) => db.domainCount(),

      blockByHeight: (_, { height }, { blockLoader }) => blockLoader.load(height),
      transactionByHash: (_, { hash }, { transactionLoader }) => transactionLoader.load(hash),
      accountById: (_, { id }, { accountLoader }) => accountLoader.load(id),
      peerByPublicKey: (_, { publicKey }, { peerLoader }) => peerLoader.load(publicKey),
      roleByName: (_, { name }, { roleLoader }) => roleLoader.load(name),
      domainById: (_, { id }, { domainLoader }) => domainLoader.load(id),

      blockList: (_, { after, count, timeAfter, timeBefore, reverse }, db) => db.blockList({ after, count, reverse, timeAfter, timeBefore }),
      transactionList: (_, { after, count, timeAfter, timeBefore }, db) => db.transactionList({ after, count, timeAfter, timeBefore }),
      accountList: (_, { after, count }, db) => db.accountList({ after, count }),
      peerList: (_, { after, count }, db) => db.peerList({ after, count }),
      roleList: (_, { after, count }, db) => db.roleList({ after, count }),
      domainList: (_, { after, count }, db) => db.domainList({ after, count }),

      transactionCountPerMinute: (_, { count }, db) => db.transactionCountPerMinute(count),
      transactionCountPerHour: (_, { count }, db) => db.transactionCountPerHour(count),
      blockCountPerMinute: (_, { count }, db) => db.blockCountPerMinute(count),
      blockCountPerHour: (_, { count }, db) => db.blockCountPerHour(count),

      transactionCountPerDomain: (_, {}, db) => db.transactionCountPerDomain(),
    },
  },
});
