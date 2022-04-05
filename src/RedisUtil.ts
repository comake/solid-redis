export const INITIALIZATION_CHECK_PERIOD = 10;
export const MAX_INITIALIZATION_TIMEOUT_DURATION = 1500;

export interface RedisConfiguration {
  host: string;
  port: string;
  username?: string;
  password?: string;
  dbNumber?: string;
}

export async function wait(duration: number): Promise<void> {
  return new Promise((resolve): void => {
    setTimeout(resolve, duration);
  });
}
