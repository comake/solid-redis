import type { Readable } from 'stream';
import {
  RepresentationMetadata,
  NotFoundHttpError,
  NotImplementedHttpError,
  getLoggerFor,
  isContainerIdentifier,
  guardedStreamFrom,
  INTERNAL_QUADS,
  readableToString,
} from '@solid/community-server';
import type {
  IdentifierStrategy,
  Guarded,
  DataAccessor,
  ResourceIdentifier,
} from '@solid/community-server';
import arrayifyStream from 'arrayify-stream';
import { DataFactory } from 'n3';
import type { Quad_Object } from 'n3';
import type { Quad } from 'rdf-js';
import { stringToTerm, termToString } from 'rdf-string';
import { RedisClient } from './RedisClient';
import { MAX_INITIALIZATION_TIMEOUT_DURATION, INITIALIZATION_CHECK_PERIOD, wait } from './RedisUtil';
import type { RedisConfiguration } from './RedisUtil';

const { defaultGraph, namedNode, quad } = DataFactory;

export const defaultConfiguration = {
  host: 'localhost',
  port: '6379',
};

export const DELIMETER = '|';
export const EMPTY_SET_STRING = '1';

/**
 * Stores all data and metadata of resources in a Redis Database.
 * Serializes quads into strings to be stored in Redis sets which represent
 * documents.
 */
export class RedisDataAccessor implements DataAccessor {
  protected readonly logger = getLoggerFor(this);

  private clientInitialized = false;
  private initializingClient = false;
  private redisClient?: RedisClient;
  private readonly configuration: RedisConfiguration;
  private readonly identifierStrategy: IdentifierStrategy;

  public constructor(identifierStrategy: IdentifierStrategy, configuration: RedisConfiguration) {
    this.configuration = { ...defaultConfiguration, ...configuration };
    this.identifierStrategy = identifierStrategy;
  }

  public async canHandle(): Promise<void> {
    // All data is supported
  }

  /**
   * Returns a data stream stored for the given identifier.
   * It can be assumed that the incoming identifier will always correspond to a document.
   * @param identifier - Identifier for which the data is requested.
   */
  public async getData(identifier: ResourceIdentifier): Promise<Guarded<Readable>> {
    await this.ensureClientIsInitialized();

    const contentTypeKey = this.contentTypeKey(identifier.path);
    const contentType = await this.redisClient!.getKey(contentTypeKey);
    if (contentType === INTERNAL_QUADS) {
      const triplesAsStrings = await this.redisClient!.getAllSetMembers(identifier.path);
      if (triplesAsStrings.length > 0) {
        const quads = this.tripleStringsToQuads(triplesAsStrings);
        return guardedStreamFrom(quads);
      }
    } else {
      const binaryData = await this.redisClient!.getKey(identifier.path);
      if (binaryData) {
        return guardedStreamFrom(binaryData);
      }
    }

    throw new NotFoundHttpError();
  }

  /**
   * Returns the metadata corresponding to the identifier.
   * @param identifier - Identifier for which the metadata is requested.
   */
  public async getMetadata(identifier: ResourceIdentifier): Promise<RepresentationMetadata> {
    await this.ensureClientIsInitialized();

    const metadataKey = this.metadataKey(identifier.path);
    const metadataTriplesAsStrings = await this.redisClient!.getAllSetMembers(metadataKey);
    if (metadataTriplesAsStrings.length === 0) {
      throw new NotFoundHttpError();
    }

    const quads = this.tripleStringsToQuads(metadataTriplesAsStrings);
    const metadata = new RepresentationMetadata(identifier).addQuads(quads);
    if (!isContainerIdentifier(identifier)) {
      const contentTypeKey = this.contentTypeKey(identifier.path);
      const contentType = await this.redisClient!.getKey(contentTypeKey);
      if (contentType) {
        metadata.contentType = contentType;
      }
    }

    return metadata;
  }

  /**
   * Returns metadata for all resources in the requested container.
   * This should not be all metadata of those resources (but it can be),
   * but instead the main metadata you want to show in situations
   * where all these resources are presented simultaneously.
   * Generally this would be metadata that is present for all of these resources,
   * such as resource type or last modified date.
   *
   * It can be safely assumed that the incoming identifier will always correspond to a container.
   *
   * @param identifier - Identifier of the parent container.
   */
  public async* getChildren(identifier: ResourceIdentifier): AsyncIterableIterator<RepresentationMetadata> {
    await this.ensureClientIsInitialized();
    const childrenKey = this.childrenKey(identifier.path);
    const children = await this.redisClient!.getAllSetMembers(childrenKey);
    for (const child of children) {
      yield new RepresentationMetadata(namedNode(child));
    }
  }

  /**
   * Writes data and metadata for a document.
   * If any data and/or metadata exist for the given identifier, it should be overwritten.
   * @param identifier - Identifier of the resource.
   * @param data - Data to store.
   * @param metadata - Metadata to store.
   */
  public async writeDocument(identifier: ResourceIdentifier, data: Guarded<Readable>, metadata: RepresentationMetadata):
  Promise<void> {
    await this.ensureClientIsInitialized();
    const { name, parent } = this.getRelatedNames(identifier);
    await this.setMetadataFor(name, metadata);
    await this.setParent(name, parent);
    await this.setContentTypeFor(name, metadata.contentType);
    await this.setDataFor(name, metadata.contentType, data);
  }

  /**
   * Writes metadata for a container.
   * If the container does not exist yet it should be created,
   * if it does its metadata should be overwritten, except for the containment triples.
   * @param identifier - Identifier of the container.
   * @param metadata - Metadata to store.
   */
  public async writeContainer(identifier: ResourceIdentifier, metadata: RepresentationMetadata): Promise<void> {
    await this.ensureClientIsInitialized();
    const { name, parent } = this.getRelatedNames(identifier);
    await this.setMetadataFor(name, metadata);
    await this.setParent(name, parent);
  }

  /**
   * Deletes the resource and its corresponding metadata.
   *
   * Solid, §5.4: "When a contained resource is deleted, the server MUST also remove the corresponding containment
   * triple, which has the effect of removing the deleted resource from the containing container."
   * https://solid.github.io/specification/protocol#deleting-resources
   *
   * @param identifier - Resource to delete.
   */
  public async deleteResource(identifier: ResourceIdentifier): Promise<void> {
    await this.ensureClientIsInitialized();
    const { name, parent } = this.getRelatedNames(identifier);

    // Remove metadata, data, and contentType
    const metadataKey = this.metadataKey(name);
    const childrenKey = this.childrenKey(name);
    const contentTypeKey = this.contentTypeKey(name);
    await this.redisClient!.deleteKeys([ metadataKey, childrenKey, contentTypeKey ]);

    // Remove from parent
    if (parent) {
      const parentChildrenKey = this.childrenKey(parent);
      await this.redisClient!.removeSetMember(parentChildrenKey, name);
    }
  }

  private async ensureClientIsInitialized(waitTime = 0): Promise<void> {
    if (!this.clientInitialized && !this.initializingClient) {
      await this.initializeClient();
    } else if (!this.clientInitialized && this.initializingClient &&
      waitTime <= MAX_INITIALIZATION_TIMEOUT_DURATION) {
      await wait(INITIALIZATION_CHECK_PERIOD);
      await this.ensureClientIsInitialized(waitTime + INITIALIZATION_CHECK_PERIOD);
    } else if (!this.clientInitialized) {
      throw new Error('Failed to initialize Redis client.');
    }
  }

  private async initializeClient(): Promise<void> {
    this.initializingClient = true;
    this.redisClient = new RedisClient(this.configuration);
    await this.redisClient.connect();
    this.clientInitialized = true;
    this.initializingClient = false;
  }

  private async setMetadataFor(name: string, metadata: RepresentationMetadata): Promise<void> {
    const metadataKey = this.metadataKey(name);
    const metadataQuads = metadata.quads();
    const metadataAsStrings = this.quadsToTripleStrings(metadataQuads);
    await this.redisClient!.setSetMembers(metadataKey, metadataAsStrings);
  }

  private async setParent(name: string, parent: string | undefined): Promise<void> {
    if (parent) {
      const parentChildrenKey = this.childrenKey(parent);
      await this.redisClient!.addSetMember(parentChildrenKey, name);
    }
  }

  private async setContentTypeFor(name: string, contentType: string | undefined): Promise<void> {
    if (contentType) {
      const contentTypeKey = this.contentTypeKey(name);
      await this.redisClient!.setKey(contentTypeKey, contentType);
    }
  }

  private async setDataFor(name: string, contentType: string | undefined, data: Guarded<Readable>): Promise<void> {
    if (contentType === INTERNAL_QUADS) {
      await this.setQuadDataFor(name, data);
    } else {
      await this.setNonQuadDataFor(name, data);
    }
  }

  private async setQuadDataFor(name: string, data: Guarded<Readable>): Promise<void> {
    const quads = await arrayifyStream(data);
    const def = defaultGraph();

    if (quads.some((dataQuad): boolean => !def.equals(dataQuad.graph))) {
      throw new NotImplementedHttpError('Only triples in the default graph are supported.');
    }

    const quadsAsStrings = this.quadsToTripleStrings(quads);
    await this.redisClient!.setSetMembers(name, quadsAsStrings);
  }

  private async setNonQuadDataFor(name: string, data: Guarded<Readable>): Promise<void> {
    const dataAsString = await readableToString(data);
    await this.redisClient!.setKey(name, dataAsString);
  }

  private metadataKey(name: string): string {
    return [ name, 'meta' ].join(DELIMETER);
  }

  private childrenKey(name: string): string {
    return [ name, 'children' ].join(DELIMETER);
  }

  private contentTypeKey(name: string): string {
    return [ name, 'contentType' ].join(DELIMETER);
  }

  /**
  * Helper function to get named nodes corresponding to the identifier and its parent container.
  * In case of a root container only the name will be returned.
  */
  private getRelatedNames(identifier: ResourceIdentifier): { name: string; parent?: string } {
    const name = identifier.path;

    // Root containers don't have a parent
    if (this.identifierStrategy.isRootContainer(identifier)) {
      return { name };
    }

    const parentIdentifier = this.identifierStrategy.getParentContainer(identifier);
    const parent = parentIdentifier.path;
    return { name, parent };
  }

  /**
  * Helper function to turn a redis set back into quads.
  * Note: Redis cannot store empty sets, so have to remove the dummy string we put in there.
  */
  private tripleStringsToQuads(tripleStrings: string[]): Quad[] {
    return tripleStrings
      .filter((tripleString): boolean => tripleString !== EMPTY_SET_STRING)
      .map((tripleString: string): Quad => this.tripleStringToQuad(tripleString));
  }

  /**
  * Helper function to turn an array of Quads into a valid redis set of strings.
  * Note: Redis cannot store empty sets, so we make a set with just a "1".
  */
  private quadsToTripleStrings(quads: Quad[]): string[] {
    if (quads.length > 0) {
      return quads.map((quadToTransform): string => this.quadToTripleString(quadToTransform));
    }
    return [ EMPTY_SET_STRING ];
  }

  /**
  * Helper function to turn a string with the values of subject, predicate,
  * and object delimited by DELIMETER into a Quad.
  * Note: object literal values may include DELIMETER so we re-join those.
  */
  private tripleStringToQuad(str: string): Quad {
    const parts = str.split(DELIMETER);
    return quad(
      namedNode(parts[0]),
      namedNode(parts[1]),
      stringToTerm(parts.slice(2).join(DELIMETER)) as Quad_Object,
    );
  }

  /**
  * Helper function to turn a Quad into a string with the values of subject,
  * predicate, and object delimited by DELIMETER.
  */
  private quadToTripleString(quadTerm: Quad): string {
    return [
      termToString(quadTerm.subject),
      termToString(quadTerm.predicate),
      termToString(quadTerm.object),
    ].join(DELIMETER);
  }
}
