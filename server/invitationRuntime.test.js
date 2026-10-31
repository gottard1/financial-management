import test from 'node:test';
import { execFileSync } from 'node:child_process';

test('invitation API starts without require(ESM) support used by local Node', () => {
  const entry = new URL('../api/group-invite-lookup.js', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    const { default: handler } = await import(${JSON.stringify(entry)});
    for (const [method, expected] of [['GET', 405], ['POST', 401]]) {
      const response = {
        setHeader() {},
        status(code) { this.code = code; return this; },
        json(body) { this.body = body; return this; },
      };
      await handler({ method, headers: {}, body: {} }, response);
      assert.equal(response.code, expected);
      assert.equal(typeof response.body.error, 'string');
    }
  `;
  // This reproduces the production startup failure hidden by modern local Node interop.
  execFileSync(
    process.execPath,
    ['--no-experimental-require-module', '--input-type=module', '--eval', script],
    { encoding: 'utf8', timeout: 15000 },
  );
});
