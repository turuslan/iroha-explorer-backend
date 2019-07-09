import { GraphQLServer } from 'graphql-yoga';
import { createPool } from 'slonik';
import config from './config';
import { graphiqlHtml } from './files';
import { schema } from './graphql';
import { IrohaDb } from './iroha-db';

const db = new IrohaDb(createPool(config.postgres));

const server = new GraphQLServer({ schema, context: db });
server.get('/', (_, res) => res.end(graphiqlHtml));

// tslint:disable-next-line:no-floating-promises
server.start(() => console.log(`Server is running on localhost:${server.options.port}`));
