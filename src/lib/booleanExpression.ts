/**
 * Boolean expression composition for validation rules.
 *
 * Supports:
 *  - AND / OR (case-insensitive) and && / ||
 *  - Parenthesised grouping at boolean level
 *  - Precedence: AND binds tighter than OR (standard)
 *
 * A single predicate is anything that isn't a boolean operator — it is
 * handed off to the caller-supplied `evalPredicate` function (typically a
 * comparison like `a.x >= b.y` or an arithmetic-truthy check).
 *
 * Predicates may themselves contain arithmetic parentheses; the splitter
 * only looks at parens at depth 0 as potential boolean groupings.
 */

const OR_RE = /\s+OR\s+|\|\|/gi;
const AND_RE = /\s+AND\s+|&&/gi;

/** Strip a single balanced outer set of parentheses if they wrap the whole expression. */
export function stripOuterParens(expr: string): string {
  let s = expr.trim();
  // Loop in case of ((expr))
  while (s.length >= 2 && s.startsWith('(') && s.endsWith(')')) {
    let depth = 0;
    let matched = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') {
        depth--;
        if (depth === 0 && i < s.length - 1) {
          matched = false;
          break;
        }
      }
    }
    if (!matched) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

/** Split `expr` on top-level (paren depth 0) matches of the given regex. */
export function splitTopLevel(expr: string, sep: RegExp): string[] {
  const re = new RegExp(sep.source, sep.flags.includes('g') ? sep.flags : sep.flags + 'g');
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '(') { depth++; i++; continue; }
    if (ch === ')') { depth--; i++; continue; }
    if (depth === 0) {
      re.lastIndex = i;
      const m = re.exec(expr);
      if (m && m.index === i) {
        parts.push(expr.slice(last, i));
        i = last = i + m[0].length;
        continue;
      }
    }
    i++;
  }
  parts.push(expr.slice(last));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** Returns true when the expression contains a top-level AND/OR/&&/|| operator. */
export function hasBooleanOperator(expr: string): boolean {
  const stripped = stripOuterParens(expr);
  return splitTopLevel(stripped, OR_RE).length > 1
      || splitTopLevel(stripped, AND_RE).length > 1;
}

/**
 * Evaluate a boolean expression composed of predicates joined by AND/OR.
 * `evalPredicate` is called for each atomic predicate.
 */
export function evaluateBoolean(
  expr: string,
  evalPredicate: (predicate: string) => boolean,
): boolean {
  const stripped = stripOuterParens(expr);

  // OR has lowest precedence — split first
  const orParts = splitTopLevel(stripped, OR_RE);
  if (orParts.length > 1) {
    return orParts.some((p) => evaluateBoolean(p, evalPredicate));
  }
  const andParts = splitTopLevel(stripped, AND_RE);
  if (andParts.length > 1) {
    return andParts.every((p) => evaluateBoolean(p, evalPredicate));
  }
  // Single predicate: strip outer parens once more in case of `(a > b)`
  return evalPredicate(stripOuterParens(stripped));
}
