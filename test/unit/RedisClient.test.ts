import * as redis from 'redis';
import { RedisClient } from '../../src/RedisClient';

jest.mock('redis');
const mockRedis = redis as jest.Mocked<typeof redis>;

const CONFIG = {
  host: 'localhost',
  port: '6379',
};

describe('A Redis Client', (): void => {
  let client: RedisClient;
  let connect: any;
  let get: any;
  let set: any;
  let sMembers: any;
  let sAdd: any;
  let sRem: any;
  let del: any;

  beforeEach(async(): Promise<void> => {
    client = new RedisClient(CONFIG);
    connect = jest.fn();
    get = jest.fn((): Promise<string | null> => Promise.resolve('value'));
    set = jest.fn((): Promise<number> => Promise.resolve(1));
    sMembers = jest.fn((): Promise<string[] | null> => Promise.resolve([ 'value' ]));
    sAdd = jest.fn((_, members: string | string[]): Promise<number> => {
      const addedMembers = Array.isArray(members) ? members.length : 1;
      return Promise.resolve(addedMembers);
    });
    sRem = jest.fn((): Promise<number> => Promise.resolve(1));
    del = jest.fn((keys: string[]): Promise<number> => Promise.resolve(keys.length));

    (mockRedis.createClient as jest.Mock).mockReturnValue({ connect, get, set, sMembers, sAdd, sRem, del });
    client = new RedisClient(CONFIG);
  });

  it('can be configured with a username and password.', async(): Promise<void> => {
    client = new RedisClient({ ...CONFIG, username: 'username', password: 'password' });
    expect(redis.createClient).toHaveBeenCalledWith(
      { url: `redis://username:password@localhost:6379` },
    );
  });

  it('can be configured with a db number.', async(): Promise<void> => {
    client = new RedisClient({ ...CONFIG, dbNumber: '1' });
    expect(redis.createClient).toHaveBeenCalledWith(
      { url: `redis://localhost:6379/1` },
    );
  });

  it('connects.', async(): Promise<void> => {
    await expect(client.connect()).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalled();
  });

  it('gets a key.', async(): Promise<void> => {
    await expect(client.getKey('key')).resolves.toBe('value');
    expect(get).toHaveBeenCalledWith('key');
  });

  it('sets a key.', async(): Promise<void> => {
    await expect(client.setKey('key', 'value')).resolves.toBe(1);
    expect(set).toHaveBeenCalledWith('key', 'value');
  });

  it('sets set members.', async(): Promise<void> => {
    await expect(client.setSetMembers('key', [ 'value' ])).resolves.toBe(1);
    expect(del).toHaveBeenCalledWith([ 'key' ]);
    expect(sAdd).toHaveBeenCalledWith('key', [ 'value' ]);
  });

  it('gets set members.', async(): Promise<void> => {
    const result = await client.getAllSetMembers('key');
    expect(result).toBeInstanceOf(Array);
    expect((result ?? [])[0]).toBe('value');
    expect(sMembers).toHaveBeenCalledWith('key');
  });

  it('adds a set member.', async(): Promise<void> => {
    await expect(client.addSetMember('key', 'value')).resolves.toBe(1);
    expect(sAdd).toHaveBeenCalledWith('key', 'value');
  });

  it('removes a set member.', async(): Promise<void> => {
    await expect(client.removeSetMember('key', 'value')).resolves.toBe(1);
    expect(sRem).toHaveBeenCalledWith('key', 'value');
  });

  it('deletes keys.', async(): Promise<void> => {
    await expect(client.deleteKeys([ 'key' ])).resolves.toBe(1);
    expect(del).toHaveBeenCalledWith([ 'key' ]);
  });
});
