const portNames = [
  // Integration
  'AllStorage',
  'Backend',
  'KeyValue',
] as const;

export function getPort(name: typeof portNames[number]): number {
  const idx = portNames.indexOf(name);
  // Just in case something doesn't listen to the typings
  if (idx < 0) {
    throw new Error(`Unknown port name ${name}`);
  }
  return 6000 + idx;
}

export function mockCreateRedisClient(): any {
  const redisStore = new Map();

  return {
    connect(): void {
      // Do nothing
    },
    async get(key: string): Promise<string | string[] | undefined> {
      return redisStore.get(key);
    },
    async set(key: string, value: string): Promise<void> {
      redisStore.set(key, value);
    },
    async sMembers(key: string): Promise<string[]> {
      return redisStore.get(key) as string[] || [];
    },
    async sAdd(key: string, members: string[]): Promise<void> {
      redisStore.set(key, members);
    },
    async sRem(key: string, member: string): Promise<void> {
      const value = redisStore.get(key);
      if (value && Array.isArray(value)) {
        const setWithoutMember = (value as string[]).filter((otherMember: string): boolean => member !== otherMember);
        redisStore.set(key, setWithoutMember);
      }
    },
    async del(key: string): Promise<void> {
      redisStore.delete(key);
    },
  };
}
