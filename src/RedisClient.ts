import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import type { RedisConfiguration } from './RedisUtil';

/**
 * A wrapper for the Redis client.
 */
export class RedisClient {
  private readonly redisClient: RedisClientType;

  public constructor(configuration: RedisConfiguration) {
    const clientUrl = this.constructRedisUrlFromConfig(configuration);
    this.redisClient = createClient({ url: clientUrl });
  }

  public async connect(): Promise<void> {
    await this.redisClient.connect();
  }

  public async getKey(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  public async setKey(key: string, value: string): Promise<string | null> {
    return this.redisClient.set(key, value);
  }

  public async getAllSetMembers(key: string): Promise<string[]> {
    return this.redisClient.sMembers(key);
  }

  public async setSetMembers(key: string, members: string[]): Promise<number> {
    await this.deleteKeys([ key ]);
    return this.redisClient.sAdd(key, members);
  }

  public async addSetMember(key: string, member: string): Promise<number> {
    return this.redisClient.sAdd(key, member);
  }

  public async removeSetMember(key: string, member: string): Promise<number> {
    return this.redisClient.sRem(key, member);
  }

  public async deleteKeys(keys: string[]): Promise<number> {
    return this.redisClient.del(keys);
  }

  private constructRedisUrlFromConfig(configuration: RedisConfiguration): string {
    let authorizationUrlPart = '';
    let dbNumberUrlPart = '';
    if (configuration.username && configuration.password) {
      authorizationUrlPart = `${configuration.username}:${configuration.password}@`;
    }

    if (configuration.dbNumber) {
      dbNumberUrlPart = `/${configuration.dbNumber}`;
    }

    return `redis://${authorizationUrlPart}${configuration.host}:${configuration.port}${dbNumberUrlPart}`;
  }
}
