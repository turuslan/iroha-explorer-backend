import { Block, Block_v1 } from 'iroha-helpers/lib/proto/block_pb';
import { Command, CreateAccount, SetAccountQuorum } from 'iroha-helpers/lib/proto/commands_pb';
import { Transaction } from 'iroha-helpers/lib/proto/transaction_pb';

export function makeBlock(height: number, createdTime: string, transactions: Transaction[]) {
  const payload = new Block_v1.Payload();
  payload.setHeight(height);
  payload.setCreatedTime(new Date(createdTime).getTime());
  payload.setTransactionsList(transactions);

  const blockV1 = new Block_v1();
  blockV1.setPayload(payload);

  const block = new Block();
  block.setBlockV1(blockV1);

  return block;
}

function transaction(commands: Command[]) {
  const reducedPayload = new Transaction.Payload.ReducedPayload();
  reducedPayload.setCommandsList(commands);

  const payload = new Transaction.Payload();
  payload.setReducedPayload(reducedPayload);

  const transaction = new Transaction();
  transaction.setPayload(payload);
  return transaction;
}

function createAccount(id: string) {
  const createAccount = new CreateAccount();
  const [name, domain] = id.split('@');
  createAccount.setAccountName(name);
  createAccount.setDomainId(domain);

  const command = new Command();
  command.setCreateAccount(createAccount);
  return command;
}

function setAccountQuorum(accountId: string, quorum: number) {
  const setAccountQuorum = new SetAccountQuorum();
  setAccountQuorum.setQuorum(quorum);
  setAccountQuorum.setAccountId(accountId);

  const command = new Command();
  command.setSetAccountQuorum(setAccountQuorum);
  return command;
}

export class Step {
  blocks: Block[] = [];
  transactions: Transaction[] = [];
  accountQuorum: {[account: string]: number} = {};

  constructor(prev: Step, public block: Block) {
    if (prev) {
      this.blocks = prev.blocks.slice();
      this.transactions = prev.transactions.slice();
      this.accountQuorum = { ...prev.accountQuorum };
    }
    this.blocks.push(block);
    for (const transaction of block.getBlockV1().getPayload().getTransactionsList()) {
      this.transactions.push(transaction);

      for (const command of transaction.getPayload().getReducedPayload().getCommandsList()) {
        if (command.hasCreateAccount()) {
          const createAccount = command.getCreateAccount();
          this.accountQuorum[`${createAccount.getAccountName()}@${createAccount.getDomainId()}`] = 1;
        } else if (command.hasSetAccountQuorum()) {
          const setAccountQuorum = command.getSetAccountQuorum();
          this.accountQuorum[setAccountQuorum.getAccountId()] = setAccountQuorum.getQuorum();
        }
      }
    }
  }
}

export const steps: Step[] = [];

function addStep(createdTime: string, transactions: Transaction[]) {
  steps.push(new Step(steps.length ? steps[steps.length - 1] : null, makeBlock(steps.length + 1, createdTime, transactions)));
}

export const account1 = 'alice@explorer';
export const account2 = 'bob@explorer';
export const account3 = 'eve@explorer';

addStep('2019-01-01T09:00Z', [
  transaction([
    createAccount(account1),
  ]),
]);
addStep('2019-01-01T11:57Z', [
  transaction([
    createAccount(account2),
  ]),
  transaction([
    setAccountQuorum(account1, 3),
  ]),
]);
addStep('2019-01-01T11:59Z', [
  transaction([
    createAccount(account3),
  ]),
]);
