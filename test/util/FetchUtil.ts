// Copied from https://github.com/CommunitySolidServer/CommunitySolidServer/blob/main/test/util/FetchUtil.ts
import 'jest-rdf';
import { isContainerPath } from '@solid/community-server';
import type { Response } from 'cross-fetch';
import fetch from 'cross-fetch';
import type { Quad } from 'n3';
import { Parser } from 'n3';

/**
 * This is specifically for PUT requests which are expected to succeed.
 */
export async function putResource(url: string, options: { contentType: string; body?: string; exists?: boolean }):
Promise<Response> {
  const init: RequestInit = {
    method: 'PUT',
    headers: { 'content-type': options.contentType },
    body: options.body,
  };
  if (isContainerPath(url)) {
    (init.headers as Record<string, string>).link = '<http://www.w3.org/ns/ldp#Container>; rel="type"';
  }
  const response = await fetch(url, init);
  expect(response.status).toBe(options.exists ? 205 : 201);
  if (!options.exists) {
    expect(response.headers.get('location')).toBe(url);
  }
  await expect(response.text()).resolves.toHaveLength(0);
  return response;
}

export type CreateOptions = {
  contentType: string;
  isContainer?: boolean;
  slug?: string;
  body?: string;
};

/**
 * Verifies if the body of the given Response contains the expected Quads.
 * If `exact` is true, a 1-to-1 match is expected, if not, the expected quads should be a subset of the body.
 */
export async function expectQuads(response: Response, expected: Quad[], exact?: boolean): Promise<void> {
  const parser = new Parser({ baseIRI: response.url });
  const quads = parser.parse(await response.text());
  if (exact) {
    expect(quads).toBeRdfIsomorphic(expected);
  } else {
    for (const expectedQuad of expected) {
      expect(quads.some((entry): boolean => entry.equals(expectedQuad))).toBe(true);
    }
  }
}
