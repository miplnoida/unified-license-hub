/**
 * Generic REST adapter — backs registry entries that have no bespoke
 * provider contract yet (platform API, external registry, AI gateway). Its
 * request shape comes from the connection's data mapping, so an operator can
 * point it at a new endpoint without a code change.
 */
import { apiKeyHeader, bearer, noAuth, standardParseError } from '../auth.ts';
import { ConnectorAdapter, ConnectorContext, ConnectorRequest } from '../types.ts';

export type Op = 'invoke' | 'health';

export function createGenericRestAdapter(key: string): ConnectorAdapter<Op> {
  return {
    key,
    operations: ['invoke', 'health'],

    authenticate(req: ConnectorRequest, ctx: ConnectorContext) {
      switch (ctx.connection.auth_type) {
        case 'api_key':
          return apiKeyHeader(
            (ctx.connection.data_mapping?.api_key_header as string) ?? 'X-Api-Key',
          )(req, ctx);
        case 'oauth2':
        case 'basic':
          return bearer(req, ctx);
        default:
          return noAuth(req);
      }
    },

    buildRequest(operation, input, ctx): ConnectorRequest {
      if (operation === 'health') {
        const path = (ctx.connection.data_mapping?.health_path as string) ?? 'health';
        return { method: 'GET', path };
      }
      return {
        method: (input.method as ConnectorRequest['method']) ?? 'POST',
        path: String(input.path ?? (ctx.connection.data_mapping?.default_path ?? '')),
        query: (input.query as Record<string, string>) ?? undefined,
        body: input.body,
      };
    },

    parseResponse(_operation, _status, body) {
      return body ?? null;
    },

    parseError: standardParseError,
    healthRequest: (ctx) => ({
      method: 'GET',
      path: (ctx.connection.data_mapping?.health_path as string) ?? 'health',
    }),
  };
}
