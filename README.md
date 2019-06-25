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

## Drop Postgres and Iroha
You can use this command to drop Postgres database and Iroha blockchain.

    docker rm iroha-explorer-iroha iroha-explorer-backend-postgres
