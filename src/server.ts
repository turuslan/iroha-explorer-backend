import { GraphQLServer } from 'graphql-yoga';
import serveStatic from 'serve-static';
import { createPool } from 'slonik';
import config from './config';
import { docPath, frontendPath, graphiqlHtml } from './files';
import { schema } from './graphql';
import { IrohaDb } from './iroha-db';

const db = new IrohaDb(createPool(config.postgres));

const server = new GraphQLServer({ schema, context: db.fork });
server.get('/graphql', (_, res) => res.end(graphiqlHtml));
server.use('/doc', serveStatic(docPath));
server.use('/', serveStatic(frontendPath));

export async function main() {
  await server.start(
    { endpoint: '/graphql', playground: false },
    () => console.log(`Server is running on localhost:${server.options.port}`),
  );
}

if (module === require.main) {
  // tslint:disable-next-line:no-floating-promises
  main();
}
