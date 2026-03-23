/**
 * Safe arithmetic expression evaluator.
 * Only allows +, -, *, /, parentheses, numbers, and variable references.
 * No access to global scope, window, document, etc.
 */

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: string };

function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < expr.length && /[0-9.]/.test(expr[i])) { num += expr[i]; i++; }
      const parsed = parseFloat(num);
      if (isNaN(parsed)) throw new Error(`Invalid number: ${num}`);
      tokens.push({ type: 'number', value: parsed });
      continue;
    }
    if ('+-*/'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    if ('()'.includes(ch)) { tokens.push({ type: 'paren', value: ch }); i++; continue; }
    throw new Error(`Unexpected character: ${ch}`);
  }
  return tokens;
}

// Recursive descent parser: expr -> term ((+|-) term)*
function parseExpr(tokens: Token[], pos: { i: number }): number {
  let result = parseTerm(tokens, pos);
  while (pos.i < tokens.length) {
    const t = tokens[pos.i];
    if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
      pos.i++;
      const right = parseTerm(tokens, pos);
      result = t.value === '+' ? result + right : result - right;
    } else break;
  }
  return result;
}

// term -> factor ((*|/) factor)*
function parseTerm(tokens: Token[], pos: { i: number }): number {
  let result = parseFactor(tokens, pos);
  while (pos.i < tokens.length) {
    const t = tokens[pos.i];
    if (t.type === 'op' && (t.value === '*' || t.value === '/')) {
      pos.i++;
      const right = parseFactor(tokens, pos);
      if (t.value === '/') {
        if (right === 0) throw new Error('Division by zero');
        result /= right;
      } else {
        result *= right;
      }
    } else break;
  }
  return result;
}

// factor -> number | '(' expr ')' | unary(+/-)
function parseFactor(tokens: Token[], pos: { i: number }): number {
  if (pos.i >= tokens.length) throw new Error('Unexpected end of expression');
  const t = tokens[pos.i];

  // Unary + or -
  if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
    pos.i++;
    const val = parseFactor(tokens, pos);
    return t.value === '-' ? -val : val;
  }

  if (t.type === 'number') {
    pos.i++;
    return t.value;
  }

  if (t.type === 'paren' && t.value === '(') {
    pos.i++;
    const val = parseExpr(tokens, pos);
    if (pos.i >= tokens.length || tokens[pos.i].value !== ')') {
      throw new Error('Missing closing parenthesis');
    }
    pos.i++;
    return val;
  }

  throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
}

/**
 * Safely evaluate an arithmetic expression string.
 * Supports: +, -, *, /, parentheses, decimal numbers.
 * Rejects: variables, function calls, property access, etc.
 *
 * @param expression - The raw expression with {field} references already replaced by numeric values.
 * @returns The evaluated result as a string, or 'Error' with a description.
 */
export function safeEvaluate(expression: string): { value: string; error?: string } {
  if (!expression || !expression.trim()) {
    return { value: '0' };
  }

  // Reject anything that looks like code injection
  if (/[a-zA-Z_$]/.test(expression)) {
    return { value: 'Error', error: 'Expression contains invalid characters. Only numbers and operators (+, -, *, /) are allowed.' };
  }

  try {
    const tokens = tokenize(expression);
    if (tokens.length === 0) return { value: '0' };
    const pos = { i: 0 };
    const result = parseExpr(tokens, pos);
    if (pos.i < tokens.length) {
      return { value: 'Error', error: 'Unexpected tokens at end of expression' };
    }
    if (!isFinite(result)) {
      return { value: 'Error', error: 'Result is not a finite number' };
    }
    // Round to avoid floating point artifacts
    return { value: String(Math.round(result * 1e10) / 1e10) };
  } catch (err: any) {
    return { value: 'Error', error: err.message || 'Invalid expression' };
  }
}

/**
 * Substitute {fieldName} placeholders with values from form data,
 * then safely evaluate the resulting arithmetic expression.
 */
export function evaluateFormula(
  expression: string,
  formData: Record<string, any>,
): string {
  const substituted = expression.replace(/\{(\w+)\}/g, (_, key) => {
    const val = Number(formData[key] || 0);
    return isNaN(val) ? '0' : String(val);
  });
  const { value } = safeEvaluate(substituted);
  return value;
}
