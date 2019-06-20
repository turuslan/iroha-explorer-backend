import * as grpc from 'grpc';
import { sha3_256 } from 'js-sha3';

import { queryHelper } from 'iroha-helpers';
import { Block } from 'iroha-helpers/lib/proto/block_pb';
import { QueryService_v1Client } from 'iroha-helpers/lib/proto/endpoint_grpc_pb';
import { ErrorResponse } from 'iroha-helpers/lib/proto/qry_responses_pb';
import { Transaction } from 'iroha-helpers/lib/proto/transaction_pb';

export { Block as BlockProto } from 'iroha-helpers/lib/proto/block_pb';
export { Transaction as TransactionProto } from 'iroha-helpers/lib/proto/transaction_pb';

interface WithErrorResponse extends Error {
  errorResponse?: ErrorResponse;
}

export class IrohaApi {
  private queryService: QueryService_v1Client;

  public constructor(
    private host: string,
    private accountId: string,
    private privateKey: string,
  ) {
    this.queryService = new QueryService_v1Client(this.host, grpc.credentials.createInsecure() as any);
  }

  public async scanBlocks(firstHeight: number, onBlock: (block: Block) => Promise<any>) {
    let height = firstHeight;
    let block: Block;
    while (true) {
      try {
        block = await this.getBlock(height);
      } catch (e) {
        const { errorResponse } = e as WithErrorResponse;
        /** GetBlock returns same error code for invalid signatures and invalid height errors */
        if (errorResponse && errorResponse.getReason() === ErrorResponse.Reason.STATEFUL_INVALID && errorResponse.getErrorCode() === 3 && errorResponse.getMessage() !== 'query signatories did not pass validation') {
          break;
        }
        throw e;
      }
      await onBlock(block);
      height += 1;
    }
  }

  public fetchCommit(onBlock: (block: Block) => void) {
    const query = this.prepareQuery(queryHelper.emptyBlocksQuery());
    const stream = this.queryService.fetchCommits(query);
    const promise = new Promise<void>((resolve, reject) => {
      (stream as any).on('error', (error) => {
        if (error.details === 'Cancelled') {
          resolve();
        } else {
          reject(error);
        }
      });
      stream.on('data', (response) => {
        if (response.hasBlockErrorResponse()) {
          /** currently BlockErrorResponse contains only message */
          reject(new Error(response.getBlockErrorResponse().getMessage()));
        } else {
          onBlock(response.getBlockResponse().getBlock());
        }
      });
    });
    return {
      promise,
      end () {
        stream.cancel();
      },
    };
  }

  private getBlock(height: number) {
    return new Promise<Block>((resolve, reject) => {
      const query = this.prepareQuery(queryHelper.addQuery(
        queryHelper.emptyQuery(),
        'getBlock',
        { height },
      ));
      this.queryService.find(query, (err, response) => {
        if (err) {
          reject(err);
        } else {
          if (response.hasErrorResponse()) {
            const error = new Error() as WithErrorResponse;
            error.errorResponse = response.getErrorResponse();
            error.message = error.errorResponse.getMessage();
            reject(error);
          } else {
            resolve(response.getBlockResponse().getBlock());
          }
        }
      });
    });
  }

  private prepareQuery(query) {
    return queryHelper.sign(
      queryHelper.addMeta(query, { creatorAccountId: this.accountId }),
      this.privateKey,
    );
  }
}

export const blockHash = (block: Block) => sha3_256(block.getBlockV1().getPayload().serializeBinary());

export const blockHeight = (block: Block) => block.getBlockV1().getPayload().getHeight();

export const transactionHash = (transaction: Transaction) => sha3_256(transaction.getPayload().serializeBinary());
