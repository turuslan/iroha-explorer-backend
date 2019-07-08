
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
  hash CHAR(64) NOT NULL
);

CREATE UNIQUE INDEX ON transaction(index);



CREATE TABLE account (
  index INT NOT NULL,
  id VARCHAR(288) NOT NULL,
  quorum INT NOT NULL
);

CREATE UNIQUE INDEX ON account(id);
CREATE UNIQUE INDEX ON account(index);



COMMIT;
