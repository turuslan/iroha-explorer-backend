import { readFileSync } from 'fs';
import { resolve } from 'path';

const read = (path: string) => readFileSync(resolve(__dirname, '..', path)).toString();

export const graphiqlHtml = read('files/graphiql.html');
export const graphqlGql = read('files/graphql.gql');
export const postgresSql = read('files/postgres.sql');
