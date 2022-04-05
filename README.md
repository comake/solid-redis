# Redis database backend extension for the Community Solid Server

Store data in your Solid Pod with a [Redis Database](https://redis.io/).

## How to use Solid Redis

### Install
From the npm package registry:
```shell
mkdir my-server
cd my-server
npm install @solid/community-server@v3.0.0 @comake/solid-redis
```

### Configure as a DataAccessor
In your `my-server` folder (or whatever the name of your project is):

Create a `config.json` file from [this template](https://github.com/comake/solid-redis/blob/main/config-example.json), and fill out your settings. The only important change to make to the [default config from Community Solid Server](https://github.com/CommunitySolidServer/CommunitySolidServer/blob/main/config/default.json) is to change the line which uses `files-scs:config/storage/backend/*.json` to  `files-csd:config/redis-data-accessor.json`.

Optionally, you can change the connection settings for your Redis database by adding parameters to the `RedisDataAccessor` in the `@graph` section such as:
```json
{
  "@id": "urn:solid-redis:default:RedisDataAccessor",
  "comment": "The configuration to connect to the Redis instance.",
  "RedisDataAccessor:_configuration_host": "52.22.22.22",
  "RedisDataAccessor:_configuration_port": "1234",
}
```
You may optionally also include a `username` and `password` if your database requires them and/or a `dbNumber` if you don't use the default 0 database. If you do not include this section, `host` defaults to `localhost` and `port` defaults to `6379`, which are the Redis defaults.


### Configure as internal storage
You can also use this extension to store the internal data CSS stores instead of the LDP pod data.
TODO

### Run
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
- [ ] Integration tests

## License

©2022-present Comake, Inc., [MIT License](https://github.com/comake/solid-redis/blob/main/LICENSE)
