# Iroha Explorer Backend [![Build Status](https://travis-ci.org/turuslan/iroha-explorer-backend.svg?branch=master)](https://travis-ci.org/turuslan/iroha-explorer-backend)

Integration of Hyperledger Iroha into Hyperledger Explorer tool

## Install

    npm install

## Build

    npm run compile

## Lint

    npm run lint

## Test

    npm run test

## Watch

    npm run watch

## Start docker compose
Run this command to start Postgres and Iroha.
Iroha may exit unexpectedly when started first time because of Postgres initialization, in that case just repeat command.

    docker-compose -f docker/docker-compose up

## Start db init script
Run this command first time you start docker compose or if you dropped database.

    npm run start:init

## Start sync script
Syncs blocks from Iroha to database.

    npm run start:sync

## Start info script
Prints information from database to console.

    npm run start:info

## Start GraphQL server
Go to http://localhost:4000 in browser to access GraphiQL IDE.

    npm run start:server

## Drop Postgres and Iroha
You can use this command to drop Postgres database and Iroha blockchain.

    docker rm iroha-explorer-iroha iroha-explorer-backend-postgres

## Sample transactions
To create prepared sample transactions run this command.
It creates unique resources and will fail if run more than once, so drop database before running it again.

    node out/sample-transactions.js

You can import functions from `sample-transactions.js` to create transactions manually.
