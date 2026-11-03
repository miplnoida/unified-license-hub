import test from 'node:test';
import assert from 'node:assert/strict';
import { isAmlAuthorizationDenied } from '../../e2e/cert-v2/support/amlAuthorization.ts';

function response(status, body, ok = status >= 200 && status < 300) {
  return { status, body, ok, bodyText: JSON.stringify(body) };
}

test('SQL permission refusal is authorization evidence', () => {
  assert.equal(isAmlAuthorizationDenied(response(403, { code: '42501', message: 'permission denied for table' })), true);
});
test('governed permission refusal is authorization evidence', () => {
  assert.equal(isAmlAuthorizationDenied(response(400, { code: 'P0001', message: 'not authorised for AML' })), true);
});
test('a row-level security refusal is authorization evidence', () => {
  assert.equal(isAmlAuthorizationDenied(response(403, { code: '42501', message: 'new row violates row-level security policy' })), true);
});
test('a missing or expired login is not permission proof', () => {
  assert.equal(isAmlAuthorizationDenied(response(401, { message: 'permission denied: expired JWT' })), false);
});
test('a missing function is not permission proof', () => {
  assert.equal(isAmlAuthorizationDenied(response(404, { code: 'PGRST202', message: 'function not found' })), false);
});
test('input validation is not permission proof', () => {
  assert.equal(isAmlAuthorizationDenied(response(400, { code: 'P0001', message: 'insufficient evidence' })), false);
});
test('missing fixture and SQL failures are not permission proof', () => {
  for (const code of ['PGRST202', '23503', '23505', '42883', '42703']) {
    assert.equal(isAmlAuthorizationDenied(response(400, { code, message: 'permission denied fixture validation' })), false);
  }
});
test('an outage is not permission proof', () => {
  assert.equal(isAmlAuthorizationDenied(response(503, { message: 'access denied by upstream' })), false);
});
test('successful requests never demonstrate refusal', () => {
  assert.equal(isAmlAuthorizationDenied(response(200, { message: 'permission denied' })), false);
  assert.equal(isAmlAuthorizationDenied(response(403, { code: '42501' }, true)), false);
});
test('empty and malformed failures do not pass', () => {
  for (const body of [null, {}, [], { message: 'bad request' }]) {
    assert.equal(isAmlAuthorizationDenied(response(400, body)), false);
  }
});
