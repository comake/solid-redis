import { promises as fs } from 'fs';
import type { App } from '@solid/community-server';
import { joinFilePath } from '@solid/community-server';
import { createClient } from 'redis';
import { putResource } from '../util/FetchUtil';
import { getPort, mockCreateRedisClient } from '../util/Util';
import { instantiateFromConfig, getTestConfigPath, getDefaultVariables } from './Config';

jest.mock('redis');

const port = getPort('AllStorage');
const baseUrl = `http://localhost:${port}/`;

describe('A Solid server with both backend and key value storage in redis', (): void => {
  let app: App;

  beforeAll(async(): Promise<void> => {
    (createClient as jest.Mock).mockImplementation(mockCreateRedisClient);

    const instances = await instantiateFromConfig(
      'urn:solid-server:test:Instances',
      getTestConfigPath('all-storage.json'),
      getDefaultVariables(port, baseUrl),
    ) as Record<string, any>;
    ({ app } = instances);
    await app.start();
  });

  afterAll(async(): Promise<void> => {
    await app.stop();
  });

  it('can add a Turtle file to the store.', async(): Promise<void> => {
    // PUT
    const documentUrl = `${baseUrl}person`;
    const body = (await fs.readFile(joinFilePath(__dirname, '../assets/person.ttl'))).toString('utf-8');
    const response = await putResource(documentUrl, { contentType: 'text/turtle', body });
    expect(response).toBeTruthy();
  });
});
