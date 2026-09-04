#!/usr/bin/env python3
"""Execute METH-READ-01..22 gate-by-gate and print a result table.

The verifier itself raises on failure, which would abort the surrounding
transaction in psql. This runner executes each gate inside its own exception
handler so every gate reports individually, keeps the whole run inside one
transaction, and always ROLLBACKs.

  python3 scripts/run-meth-read-gates.py | psql -q -f -
"""
import re
import sys

SRC = 'scripts/verify-supervisory-methodology-admin-read-models.sql'
src = open(SRC).read()
parts = re.split(r'-- =+\n-- (METH-READ-\d+) — (.*?)\n-- =+\n', src)
gates = [(parts[i], parts[i + 1], parts[i + 2]) for i in range(1, len(parts), 3)]
if len(gates) != 22:
    sys.exit(f'expected 22 gates, found {len(gates)}')

prelude = '\n'.join(l for l in parts[0].split('\n')
                    if not l.startswith('\\') and l.strip() != 'BEGIN;')
out = ['SET client_min_messages = notice;',
       'DROP TABLE IF EXISTS meth_res, meth_ctx, meth_actor, meth_baseline;',
       'BEGIN;', prelude,
       'CREATE TEMP TABLE meth_res(gate text, title text, status text, detail text);']
for name, title, body in gates:
    body = body.replace('ROLLBACK;', '').strip()
    out.append(f"""DO $wrap$
BEGIN
  BEGIN
    EXECUTE $gate$ {body} $gate$;
    PERFORM set_config('role','none',true);
    INSERT INTO meth_res VALUES ('{name}', $t${title}$t$, 'PASS', NULL);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('role','none',true);
    INSERT INTO meth_res VALUES ('{name}', $t${title}$t$, 'FAIL', SQLERRM);
  END;
END $wrap$;""")
out.append("SELECT gate, status, detail, title FROM meth_res ORDER BY gate;")
out.append('ROLLBACK;')
print('\n\n'.join(out))
