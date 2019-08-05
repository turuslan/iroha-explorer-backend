
BEGIN;



CREATE TABLE block (
  protobuf BYTEA NOT NULL,
  height BIGINT NOT NULL,
  created_time TIMESTAMP WITH TIME ZONE NOT NULL,
  transaction_count INT NOT NULL
);

CREATE UNIQUE INDEX ON block(height);



CREATE TABLE transaction (
  protobuf BYTEA NOT NULL,
  index BIGINT NOT NULL,
  hash CHAR(64) NOT NULL,
  creator_domain VARCHAR(255) NOT NULL,
  block_height BIGINT NOT NULL
);

CREATE UNIQUE INDEX ON transaction(index);



CREATE TABLE account (
  index INT NOT NULL,
  id VARCHAR(288) NOT NULL,
  quorum INT NOT NULL
);

CREATE UNIQUE INDEX ON account(id);
CREATE UNIQUE INDEX ON account(index);



CREATE TABLE peer (
  index INT NOT NULL,
  address VARCHAR(261) NOT NULL,
  public_key VARCHAR NOT NULL
);

CREATE UNIQUE INDEX ON peer(index);
CREATE UNIQUE INDEX ON peer(address);
CREATE UNIQUE INDEX ON peer(public_key);



COMMIT;
