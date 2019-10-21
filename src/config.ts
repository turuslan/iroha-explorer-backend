
export default {
  iroha: {
    host: process.env.IROHA_HOST,
    admin: {
      accountId: process.env.IROHA_ACCOUNT,
      privateKey: process.env.IROHA_ACCOUNT_KEY,
    },
  },
  postgres: process.env.POSTGRES_HOST,
};
