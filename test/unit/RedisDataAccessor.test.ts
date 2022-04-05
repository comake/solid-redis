import 'jest-rdf';
import type { Readable } from 'stream';
import type { Guarded } from '@solid/community-server';
import { RepresentationMetadata, SingleRootIdentifierStrategy, NotFoundHttpError,
  NotImplementedHttpError, guardedStreamFrom, readableToString,
  INTERNAL_QUADS, APPLICATION_JSON, CONTENT_TYPE_TERM } from '@solid/community-server';
import arrayifyStream from 'arrayify-stream';
import { DataFactory } from 'n3';
import { RedisClient } from '../../src/RedisClient';
import { RedisDataAccessor, DELIMETER, EMPTY_SET_STRING } from '../../src/RedisDataAccessor';
import * as RedisUtil from '../../src/RedisUtil';

const { literal, namedNode, quad } = DataFactory;

jest.mock('../../src/RedisClient');

const CONFIG = {
  host: 'localhost',
  port: '6379',
};

describe('A RedisDataAccessor', (): void => {
  const identifierBase = 'http://test.com/';
  const identifierStrategy = new SingleRootIdentifierStrategy(identifierBase);
  let accessor: RedisDataAccessor;
  let metadata: RepresentationMetadata;
  let quadData: Guarded<Readable>;
  let jsonString: string;
  let jsonData: Guarded<Readable>;
  let connect: any;
  let getKey: any;
  let getResponse: string | null;
  let getAllSetMembers: any;
  let sMembersResponse: string[];
  let setSetMembers: any;
  let addSetMember: any;
  let setKey: any;
  let deleteKeys: any;
  let removeSetMember: any;

  beforeEach(async(): Promise<void> => {
    metadata = new RepresentationMetadata();
    quadData = guardedStreamFrom(
      [ quad(namedNode('http://name'), namedNode('http://pred'), literal('value')) ],
    );
    jsonString = '{ "some": "stringified JSON" }';
    jsonData = guardedStreamFrom(jsonString);
    connect = jest.fn();
    accessor = new RedisDataAccessor(identifierStrategy, CONFIG);
  });

  describe('getting data', (): void => {
    beforeEach(async(): Promise<void> => {
      getKey = jest.fn((): Promise<string | null> => Promise.resolve(getResponse));
      getAllSetMembers = jest.fn((): Promise<string[] | null> => Promise.resolve(sMembersResponse));
      (RedisClient as jest.Mock).mockReturnValue({ getKey, getAllSetMembers, connect });
    });

    it('errors during a query when the redis client fails to initialize.', async(): Promise<void> => {
      jest.useFakeTimers();
      jest.mock('../../src/RedisUtil');
      const mockRedisUtil = RedisUtil as jest.Mocked<typeof RedisUtil>;
      (mockRedisUtil.MAX_INITIALIZATION_TIMEOUT_DURATION as unknown) = 0;

      // Make the schema alter operation take a long time
      connect.mockImplementation(
        async(): Promise<void> => new Promise((resolve): void => {
          setTimeout(resolve, 1000);
        }),
      );

      // Send a first request which will start initialization of database
      accessor.getData({ path: 'http://identifier' }).catch((): void => {
        // Do nothing
      });
      // Send a second request which should fail after waiting MAX_INITIALIZATION_TIMEOUT_DURATION
      const promise = accessor.getData({ path: 'http://identifier' });
      jest.advanceTimersByTime(RedisUtil.INITIALIZATION_CHECK_PERIOD);
      await expect(promise).rejects.toThrow('Failed to initialize Redis client.');
      jest.runAllTimers();
      jest.useRealTimers();
    });

    it('errors if there is no data at the key.', async(): Promise<void> => {
      getResponse = null;
      await expect(accessor.getData({ path: 'http://identifier' })).rejects.toThrow(NotFoundHttpError);
    });

    it('returns the corresponding json when json data is requested.', async(): Promise<void> => {
      getResponse = '{ "some": "stringified JSON" }';
      const result = await accessor.getData({ path: 'http://identifier' });
      await expect(readableToString(result)).resolves.toBe(getResponse);
    });

    it('returns the corresponding quads when quad data is requested.', async(): Promise<void> => {
      getResponse = INTERNAL_QUADS;
      sMembersResponse = [ `http://identifier${DELIMETER}https://predicate${DELIMETER}"value"` ];
      const result = await accessor.getData({ path: 'http://identifier' });
      await expect(arrayifyStream(result)).resolves.toBeRdfIsomorphic([
        quad(namedNode('http://identifier'), namedNode('https://predicate'), literal('value')),
      ]);
    });

    it('returns an empty array if the set only contained the dummy value.', async(): Promise<void> => {
      getResponse = INTERNAL_QUADS;
      sMembersResponse = [ EMPTY_SET_STRING ];
      const result = await accessor.getData({ path: 'http://identifier' });
      await expect(arrayifyStream(result)).resolves.toBeRdfIsomorphic([]);
    });
  });

  describe('getting metadata', (): void => {
    beforeEach(async(): Promise<void> => {
      getResponse = INTERNAL_QUADS;
      getKey = jest.fn((): Promise<string | null> => Promise.resolve(getResponse));
      sMembersResponse = [
        `http://identifier${DELIMETER}https://predicate${DELIMETER}"value"`,
        `http://identifier2${DELIMETER}https://predicate2${DELIMETER}https://object2`,
      ];
      getAllSetMembers = jest.fn((): Promise<string[] | null> => Promise.resolve(sMembersResponse));
      (RedisClient as jest.Mock).mockReturnValue({ getKey, getAllSetMembers, connect });
    });

    it('returns the corresponding metadata when requested.', async(): Promise<void> => {
      const fetchedMetadata = await accessor.getMetadata({ path: 'http://identifier' });
      expect(fetchedMetadata.quads()).toBeRdfIsomorphic([
        quad(namedNode('http://identifier'), namedNode('https://predicate'), literal('value')),
        quad(namedNode('http://identifier2'), namedNode('https://predicate2'), namedNode('https://object2')),
        quad(namedNode('http://identifier'), CONTENT_TYPE_TERM, literal(INTERNAL_QUADS)),
      ]);
      expect(getAllSetMembers).toHaveBeenCalledWith(`http://identifier${DELIMETER}meta`);
    });

    it('returns only the content type quad if the set only contained the dummy value.', async(): Promise<void> => {
      sMembersResponse = [ EMPTY_SET_STRING ];
      const fetchedMetadata = await accessor.getMetadata({ path: 'http://identifier' });
      expect(fetchedMetadata.quads()).toBeRdfIsomorphic([
        quad(namedNode('http://identifier'), CONTENT_TYPE_TERM, literal(INTERNAL_QUADS)),
      ]);
      expect(getAllSetMembers).toHaveBeenCalledWith(`http://identifier${DELIMETER}meta`);
    });

    it('does not set the content-type for container metadata.', async(): Promise<void> => {
      sMembersResponse = [ `http://containerIdentifier/${DELIMETER}https://predicate${DELIMETER}"value"` ];
      const fetchedMetadata = await accessor.getMetadata({ path: 'http://containerIdentifier/' });
      expect(fetchedMetadata.quads()).toBeRdfIsomorphic([
        quad(namedNode('http://containerIdentifier/'), namedNode('https://predicate'), literal('value')),
      ]);
      expect(getAllSetMembers).toHaveBeenCalledWith(`http://containerIdentifier/${DELIMETER}meta`);
    });

    it('errors if no metadata was found.', async(): Promise<void> => {
      sMembersResponse = [];
      await expect(accessor.getMetadata({ path: 'http://identifier' })).rejects.toThrow(NotFoundHttpError);
      expect(getAllSetMembers).toHaveBeenCalledWith(`http://identifier${DELIMETER}meta`);
    });
  });

  describe('getting children', (): void => {
    beforeEach(async(): Promise<void> => {
      sMembersResponse = [ 'http://container/child' ];
      getAllSetMembers = jest.fn((): Promise<string[] | null> => Promise.resolve(sMembersResponse));
      (RedisClient as jest.Mock).mockReturnValue({ getAllSetMembers, connect });
    });

    it('requests the container data to find its children.', async(): Promise<void> => {
      const children = [];
      for await (const child of accessor.getChildren({ path: 'http://container/' })) {
        children.push(child);
      }
      expect(children).toHaveLength(1);
      expect(children[0].identifier.value).toBe('http://container/child');
      expect(getAllSetMembers).toHaveBeenCalledWith(`http://container/${DELIMETER}children`);
    });
  });

  describe('writing a document', (): void => {
    beforeEach(async(): Promise<void> => {
      setKey = jest.fn();
      addSetMember = jest.fn();
      setSetMembers = jest.fn();
      (RedisClient as jest.Mock).mockReturnValue({ setSetMembers, setKey, addSetMember, connect });
    });

    it('writes the metadata.', async(): Promise<void> => {
      metadata.addQuads([
        quad(namedNode(`${identifierBase}resource`), namedNode('http://is.a'), literal('value')),
      ]);
      await expect(accessor.writeDocument({ path: `${identifierBase}resource` }, jsonData, metadata))
        .resolves.toBeUndefined();
      expect(setSetMembers).toHaveBeenCalledWith(
        `${identifierBase}resource${DELIMETER}meta`,
        [ `${identifierBase}resource${DELIMETER}http://is.a${DELIMETER}"value"` ],
      );
    });

    it('writes the parent.', async(): Promise<void> => {
      await expect(accessor.writeDocument({ path: `${identifierBase}resource` }, jsonData, metadata))
        .resolves.toBeUndefined();
      expect(addSetMember).toHaveBeenCalledWith(`${identifierBase}${DELIMETER}children`, `${identifierBase}resource`);
    });

    it('writes the contentType.', async(): Promise<void> => {
      metadata.contentType = INTERNAL_QUADS;
      await expect(accessor.writeDocument({ path: `${identifierBase}resource` }, quadData, metadata))
        .resolves.toBeUndefined();
      expect(setKey).toHaveBeenCalledWith(`${identifierBase}resource${DELIMETER}contentType`, INTERNAL_QUADS);
    });

    it('writes quad data.', async(): Promise<void> => {
      metadata.contentType = INTERNAL_QUADS;
      await expect(accessor.writeDocument({ path: `${identifierBase}resource` }, quadData, metadata))
        .resolves.toBeUndefined();
      expect(setSetMembers).toHaveBeenCalledWith(
        `${identifierBase}resource`,
        [ `http://name${DELIMETER}http://pred${DELIMETER}"value"` ],
      );
    });

    it('writes a set with a dummy value if there are no quads to write.', async(): Promise<void> => {
      metadata.contentType = INTERNAL_QUADS;
      quadData = guardedStreamFrom([]);
      await expect(accessor.writeDocument({ path: `${identifierBase}resource` }, quadData, metadata))
        .resolves.toBeUndefined();
      expect(setSetMembers).toHaveBeenCalledWith(
        `${identifierBase}resource`,
        [ EMPTY_SET_STRING ],
      );
    });

    it('errors when writing triples in a non-default graph.', async(): Promise<void> => {
      metadata.contentType = INTERNAL_QUADS;
      quadData = guardedStreamFrom(
        [ quad(namedNode('http://name'), namedNode('http://pred'), literal('value'), namedNode('badGraph!')) ],
      );
      const result = accessor.writeDocument({ path: `${identifierBase}resource` }, quadData, metadata);
      await expect(result).rejects.toThrow(NotImplementedHttpError);
      await expect(result).rejects.toThrow('Only triples in the default graph are supported.');
    });

    it('writes binary data.', async(): Promise<void> => {
      metadata.contentType = APPLICATION_JSON;
      await expect(accessor.writeDocument({ path: `${identifierBase}resource` }, jsonData, metadata))
        .resolves.toBeUndefined();
      expect(setKey.mock.calls[1][0]).toBe(`${identifierBase}resource`);
      expect(setKey.mock.calls[1][1]).toBe(jsonString);
    });
  });

  describe('writing a container', (): void => {
    beforeEach(async(): Promise<void> => {
      addSetMember = jest.fn();
      setSetMembers = jest.fn();
      (RedisClient as jest.Mock).mockReturnValue({ setSetMembers, addSetMember, connect });
    });

    it('writes the metadata.', async(): Promise<void> => {
      metadata.addQuads([
        quad(namedNode(`${identifierBase}resource/`), namedNode('http://is.a'), literal('value')),
      ]);
      await expect(accessor.writeContainer({ path: `${identifierBase}resource/` }, metadata))
        .resolves.toBeUndefined();
      expect(setSetMembers).toHaveBeenCalledWith(
        `${identifierBase}resource/${DELIMETER}meta`,
        [ `${identifierBase}resource/${DELIMETER}http://is.a${DELIMETER}"value"` ],
      );
    });

    it('writes a set with a dummy value if there is no metadata.', async(): Promise<void> => {
      await expect(accessor.writeContainer({ path: `${identifierBase}resource/` }, metadata))
        .resolves.toBeUndefined();
      expect(setSetMembers).toHaveBeenCalledWith(
        `${identifierBase}resource/${DELIMETER}meta`,
        [ EMPTY_SET_STRING ],
      );
    });

    it('writes the parent.', async(): Promise<void> => {
      await expect(accessor.writeContainer({ path: `${identifierBase}resource/` }, metadata))
        .resolves.toBeUndefined();
      expect(addSetMember).toHaveBeenCalledWith(`${identifierBase}${DELIMETER}children`, `${identifierBase}resource/`);
    });

    it('does not write the parent when writing to a root container.', async(): Promise<void> => {
      await expect(accessor.writeContainer({ path: identifierBase }, metadata))
        .resolves.toBeUndefined();
      expect(addSetMember).not.toHaveBeenCalled();
    });
  });

  describe('deleting a resource', (): void => {
    beforeEach(async(): Promise<void> => {
      deleteKeys = jest.fn();
      removeSetMember = jest.fn();
      (RedisClient as jest.Mock).mockReturnValue({ deleteKeys, removeSetMember, connect });
    });

    it('deletes the metadata, children and content type keys.', async(): Promise<void> => {
      await expect(accessor.deleteResource({ path: `${identifierBase}resource` }))
        .resolves.toBeUndefined();

      expect(deleteKeys).toHaveBeenCalledWith([
        `${identifierBase}resource${DELIMETER}meta`,
        `${identifierBase}resource${DELIMETER}children`,
        `${identifierBase}resource${DELIMETER}contentType`,
      ]);
    });

    it('removes the resource from its parent.', async(): Promise<void> => {
      await expect(accessor.deleteResource({ path: `${identifierBase}resource` }))
        .resolves.toBeUndefined();
      expect(removeSetMember).toHaveBeenCalledWith(
        `${identifierBase}${DELIMETER}children`,
        `${identifierBase}resource`,
      );
    });
  });
});
