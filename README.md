# Redis database backend extension for the Community Solid Server

Store data in your Solid Pod with a [Redis Database](https://redis.io/). Redis is an open source, in-memory data store.

*Disclaimer: By default Redis saves snapshots of the dataset on disk, in a binary file called `dump.rdb`. This library does not alter these default persistence settings and does not include any extra calls to save the database to disk. [Read more about persistence in redis.](https://redis.io/docs/manual/persistence/)*

#### Implementation details
For data with content type `internal/quads`, Solid Redis transforms quads into strings by concatenating their subject, predicate, and object values with the | (pipe) character. These strings are stored in [Redis Sets](https://redis.io/docs/manual/data-types/#sets). These Sets serve as the storage of the triples in LDP resources and their keys are the URIs of each resource. Solid Redis uses some special keys to store the metadata, children, and content type of resources.

Because Redis [does not support empty Sets](https://github.com/redis/redis/issues/6048), for resources or metadata which should exist but contain no triples, Solid Redis stores a Set with a single dummy value of "1". These dummy values do not get exposed outside of the `RedisDataAccessor` class.

All other content types other than `internal/quads` are stored as strings. Redis can store any arbitrary binary data as a string up to 512Mb.

## How to use Solid Redis

### Install
From the npm package registry:
```shell
mkdir my-server
cd my-server
npm install @solid/community-server@v4.0.0 @comake/solid-redis
```

### Install Redis
Follow [Getting started with Redis](https://redis.io/docs/getting-started/) to install and run Redis.

### Configure

This extension can be used in 3 ways:
1. As your CSS's backend to store pod data.
2. As your CSS's key-value storage to store internal data (accounts, locks, tokens, etc.).
3. As both!

#### 1. As a backend
In your server's root folder (`my-server` or whatever the name of your project is) create a `config.json` file from [this template (config-backend-example.json)](https://github.com/comake/solid-redis/blob/main/config-backend-example.json), and fill out your settings. The only important changes to make to the [default config](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/main/config/default.json) are to add `solid-redis` into `@context` and to change the backend storage to redis:
```diff
-"files-scs:config/storage/backend/*.json",
+"files-csr:config/storage/backend/redis.json",
```

#### 2. As a key-value store
In your server's root folder create a `config.json` file from [this template (config-key-value-store-example.json)](https://github.com/comake/solid-redis/blob/main/config-key-value-store-example.json), and fill out your settings. The only important changes to make to the [default config](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/main/config/default.json) are to add `solid-redis` into `@context` and change the key-value storage to redis:
```diff
-"files-scs:config/storage/key-value/*.json",
+"files-csr:config/storage/key-value/redis.json",
```


#### 3. As both
In your server's root folder create a `config.json` file from [this template (config-all-storage-example.json)](https://github.com/comake/solid-redis/blob/main/config-all-storage-example.json), and fill out your settings. The only important changes to make to the [default config](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/main/config/default.json) are to add `solid-redis` into `@context` and change the backend and key-value storage to the global redis storage:

```diff
-"files-scs:config/storage/backend/*.json",
-"files-scs:config/storage/key-value/*.json"
+"files-csr:config/storage/backend/redis.json",
+"files-scs:config/storage/key-value/resource-store.json",
```

### Configure the redis connection
Optionally, you can change the connection settings for your Redis database by adding parameters to the `RedisDataAccessor` in the `@graph` section of the `config.json` file you just created such as:
```json
{
  "@id": "urn:solid-redis:default:RedisDataAccessor",
  "comment": "The configuration to connect to the Redis instance.",
  "RedisDataAccessor:_configuration_host": "52.22.22.22",
  "RedisDataAccessor:_configuration_port": "1234",
}
```
If you do not include this section, `host` defaults to `localhost` and `port` defaults to `6379`, which are the Redis defaults.

You may optionally also include a `username` and `password` if your database requires them and a `dbNumber` if you don't use the default 0 database.

### Run CSS
Execute the following command:
```shell
npx community-solid-server -c config.json -m .
```
Or add the command to `scripts` inside your package.json like so:
```json
{
  "scripts": {
    "start": "npx community-solid-server -c config.json -m ."
  }
}
```

## How to contribute to Solid Redis

Execute the following commands:
```shell
git clone https://github.com/comake/solid-redis.git
cd solid-redis
npm ci
```

## TODO
- [ ] Add support for different Redis modules such as:
  - [RedisJSON](https://github.com/RedisJSON/RedisJSON) so the json data can be updated & queried as JSON instead of strings
  - [RediSearch](https://github.com/RediSearch/RediSearch) to do full text search over the data in redis
- [ ] Remove the Redis client mock in integration tests and have them run on CI in docker with a read redis instance

## License

©2022-present Comake, Inc., [MIT License](https://github.com/comake/solid-redis/blob/main/LICENSE)
