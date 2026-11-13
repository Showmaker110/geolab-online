/* GeoLab — 数学表达式解析器
 * 支持：四则运算、乘方、隐式乘法（2x、3(x+1)、(x+1)(x-1)）、
 *       常用函数、常量 pi/e、变量 x/y 以及数字对象名称。
 */
(function (global) {
  'use strict';

  const CONSTANTS = {
    pi: Math.PI,
    '\u03c0': Math.PI,
    e: Math.E,
    tau: Math.PI * 2
  };

  // 函数名 -> { arity: [允许的参数个数], build: 参数源码数组 => JS 源码 }
  const FUNCTIONS = {
    sin:   { arity: [1], build: a => `Math.sin(${a[0]})` },
    cos:   { arity: [1], build: a => `Math.cos(${a[0]})` },
    tan:   { arity: [1], build: a => `Math.tan(${a[0]})` },
    cot:   { arity: [1], build: a => `(1/Math.tan(${a[0]}))` },
    sec:   { arity: [1], build: a => `(1/Math.cos(${a[0]}))` },
    csc:   { arity: [1], build: a => `(1/Math.sin(${a[0]}))` },
    asin:  { arity: [1], build: a => `Math.asin(${a[0]})` },
    acos:  { arity: [1], build: a => `Math.acos(${a[0]})` },
    atan:  { arity: [1, 2], build: a => a.length === 2 ? `Math.atan2(${a[0]}, ${a[1]})` : `Math.atan(${a[0]})` },
    sinh:  { arity: [1], build: a => `Math.sinh(${a[0]})` },
    cosh:  { arity: [1], build: a => `Math.cosh(${a[0]})` },
    tanh:  { arity: [1], build: a => `Math.tanh(${a[0]})` },
    sqrt:  { arity: [1], build: a => `Math.sqrt(${a[0]})` },
    cbrt:  { arity: [1], build: a => `Math.cbrt(${a[0]})` },
    abs:   { arity: [1], build: a => `Math.abs(${a[0]})` },
    exp:   { arity: [1], build: a => `Math.exp(${a[0]})` },
    ln:    { arity: [1], build: a => `Math.log(${a[0]})` },
    lg:    { arity: [1], build: a => `Math.log10(${a[0]})` },
    log:   { arity: [1, 2], build: a => a.length === 2 ? `(Math.log(${a[1]})/Math.log(${a[0]}))` : `Math.log10(${a[0]})` },
    floor: { arity: [1], build: a => `Math.floor(${a[0]})` },
    ceil:  { arity: [1], build: a => `Math.ceil(${a[0]})` },
    round: { arity: [1], build: a => `Math.round(${a[0]})` },
    sign:  { arity: [1], build: a => `Math.sign(${a[0]})` },
    min:   { arity: [1, 2, 3, 4], build: a => `Math.min(${a.join(', ')})` },
    max:   { arity: [1, 2, 3, 4], build: a => `Math.max(${a.join(', ')})` },
    mod:   { arity: [2], build: a => `(${a[0]} % ${a[1]})` },
    atan2: { arity: [2], build: a => `Math.atan2(${a[0]}, ${a[1]})` },
    hypot: { arity: [1, 2, 3, 4], build: a => `Math.hypot(${a.join(', ')})` }
  };

  const FUNCTION_NAMES = new Set(Object.keys(FUNCTIONS));
  const CONSTANT_NAMES = new Set(Object.keys(CONSTANTS));

  function isReservedName(name) {
    return FUNCTION_NAMES.has(name) || CONSTANT_NAMES.has(name) || name === 'x' || name === 'y';
  }

  function normalizeText(input) {
    return String(input)
      .replace(/[\u2212\u2013\u2014]/g, '-')   // 各种减号
      .replace(/\u00d7|\u00b7|\u22c5/g, '*')     // × · ⋅
      .replace(/\u00f7/g, '/')
      .replace(/\u00b2/g, '^2')
      .replace(/\u00b3/g, '^3');
  }

  function tokenize(input) {
    const text = normalizeText(input);
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      const c = text[i];
      if (/\s/.test(c)) { i++; continue; }

      const rest = text.slice(i);
      const numMatch = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
      if (numMatch) {
        tokens.push({ type: 'num', value: parseFloat(numMatch[0]) });
        i += numMatch[0].length;
        continue;
      }

      if (/[\p{L}_]/u.test(c)) {
        let j = i + 1;
        while (j < text.length && /[\p{L}\p{N}_]/u.test(text[j])) j++;
        tokens.push({ type: 'ident', value: text.slice(i, j) });
        i = j;
        continue;
      }

      if ('+-*/^(),'.includes(c)) {
        tokens.push({ type: c });
        i++;
        continue;
      }

      throw new Error(`无法识别的字符 “${c}”`);
    }
    return tokens;
  }

  class Parser {
    constructor(tokens, source) {
      this.tokens = tokens;
      this.pos = 0;
      this.source = source;
    }

    peek(offset = 0) { return this.tokens[this.pos + offset]; }
    atEnd() { return this.pos >= this.tokens.length; }

    consume(type) {
      const tok = this.peek();
      if (!tok || tok.type !== type) return null;
      this.pos++;
      return tok;
    }

    expect(type, label) {
      const tok = this.consume(type);
      if (!tok) {
        const got = this.peek();
        const desc = got ? `“${got.value !== undefined ? got.value : got.type}”` : '结尾';
        throw new Error(`需要${label || type}，但读到 ${desc}`);
      }
      return tok;
    }

    parse() {
      if (this.atEnd()) throw new Error('表达式为空');
      const expr = this.parseExpression();
      if (!this.atEnd()) {
        const tok = this.peek();
        throw new Error(`表达式末尾有多余内容 “${tok.value !== undefined ? tok.value : tok.type}”`);
      }
      return expr;
    }

    parseExpression() {
      let node = this.parseTerm();
      for (;;) {
        if (this.consume('+')) {
          node = { type: 'binary', op: '+', left: node, right: this.parseTerm() };
        } else if (this.consume('-')) {
          node = { type: 'binary', op: '-', left: node, right: this.parseTerm() };
        } else {
          break;
        }
      }
      return node;
    }

    parseTerm() {
      let node = this.parseUnary();
      for (;;) {
        if (this.consume('*')) {
          node = { type: 'binary', op: '*', left: node, right: this.parseUnary(), implicit: false };
        } else if (this.consume('/')) {
          node = { type: 'binary', op: '/', left: node, right: this.parseUnary(), implicit: false };
        } else {
          const tok = this.peek();
          const startsAtom = tok && (tok.type === 'num' || tok.type === 'ident' || tok.type === '(');
          if (startsAtom) {
            node = { type: 'binary', op: '*', left: node, right: this.parseUnary(), implicit: true };
          } else {
            break;
          }
        }
      }
      return node;
    }

    parseUnary() {
      if (this.consume('-')) {
        return { type: 'unary', op: '-', arg: this.parseUnary() };
      }
      if (this.consume('+')) {
        return { type: 'unary', op: '+', arg: this.parseUnary() };
      }
      return this.parsePower();
    }

    parsePower() {
      const base = this.parseAtom();
      if (this.consume('^')) {
        return { type: 'binary', op: '^', left: base, right: this.parseUnary() };
      }
      return base;
    }

    parseAtom() {
      const tok = this.peek();
      if (!tok) throw new Error('表达式不完整');

      if (tok.type === 'num') {
        this.pos++;
        return { type: 'num', value: tok.value };
      }

      if (tok.type === 'ident') {
        this.pos++;
        const name = tok.value;
        const lower = name.toLowerCase();
        const functionDef = FUNCTIONS[lower];

        if (functionDef && this.peek() && this.peek().type === '(') {
          const args = this.parseCallArgs();
          if (!functionDef.arity.includes(args.length)) {
            throw new Error(`函数 ${lower} 需要 ${functionDef.arity.join(' 或 ')} 个参数`);
          }
          return { type: 'call', name: lower, args };
        }
        return { type: 'ident', name };
      }

      if (tok.type === '(') {
        this.pos++;
        const expr = this.parseExpression();
        this.expect(')', '右括号');
        return expr;
      }

      const desc = tok.value !== undefined ? tok.value : tok.type;
      throw new Error(`这里不应出现 “${desc}”`);
    }

    parseCallArgs() {
      this.expect('(', '左括号');
      const args = [];
      if (this.consume(')')) return args;
      for (;;) {
        args.push(this.parseExpression());
        if (this.consume(',')) continue;
        this.expect(')', '右括号');
        break;
      }
      return args;
    }
  }

  function parse(input) {
    const tokens = tokenize(input);
    return new Parser(tokens, input).parse();
  }

  function walk(node, visit) {
    visit(node);
    if (node.type === 'binary') {
      walk(node.left, visit);
      walk(node.right, visit);
    } else if (node.type === 'unary') {
      walk(node.arg, visit);
    } else if (node.type === 'call') {
      node.args.forEach(arg => walk(arg, visit));
    }
  }

  function variables(node) {
    const set = new Set();
    walk(node, n => {
      if (n.type === 'ident' && !CONSTANT_NAMES.has(n.name)) {
        set.add(n.name);
      }
    });
    return set;
  }

  /**
   * 编译 AST。
   * options.varMap: { 名称: JS 形参名 }，例如 { x: 'x' } 或 { t: 'x', y: 'y' }
   * options.numbers: 可用的数字对象名称集合（会从作用域对象 S 中读取）
   * options.validateNumbers: 是否校验数字名称（默认 true）
   */
  function compile(node, options = {}) {
    const varMap = options.varMap || { x: 'x' };
    const numbers = options.numbers || null;
    const validateNumbers = options.validateNumbers !== false;
    const unknown = new Set();

    function identifier(name) {
      if (Object.prototype.hasOwnProperty.call(varMap, name)) return varMap[name];
      if (Object.prototype.hasOwnProperty.call(CONSTANTS, name)) {
        return `(${Number(CONSTANTS[name]).toPrecision(17)})`;
      }
      if (!numbers || !numbers.has(name)) {
        if (validateNumbers) unknown.add(name);
      }
      return `S[${JSON.stringify(name)}]`;
    }

    function emit(n) {
      switch (n.type) {
        case 'num':
          return `(${Number(n.value).toPrecision(17)})`;
        case 'ident':
          return identifier(n.name);
        case 'unary':
          return `(${n.op}${emit(n.arg)})`;
        case 'binary':
          if (n.op === '^') return `Math.pow(${emit(n.left)}, ${emit(n.right)})`;
          return `(${emit(n.left)} ${n.op} ${emit(n.right)})`;
        case 'call': {
          const def = FUNCTIONS[n.name];
          if (!def) throw new Error(`未知函数 ${n.name}`);
          if (!def.arity.includes(n.args.length)) {
            throw new Error(`函数 ${n.name} 的参数个数不正确`);
          }
          return def.build(n.args.map(emit));
        }
        default:
          throw new Error('无法编译表达式');
      }
    }

    const code = emit(node);
    if (unknown.size) {
      throw new Error(`未定义的变量：${Array.from(unknown).join('、')}`);
    }
    // eslint-disable-next-line no-new-func
    const fn = new Function('x', 'y', 'S', `"use strict"; return (${code});`);
    return { fn, code };
  }

  function evaluate(node, scope = {}) {
    const numbers = new Set(Object.keys(scope));
    const compiled = compile(node, { varMap: {}, numbers });
    return compiled.fn(0, 0, scope);
  }

  function evaluateText(text, scope = {}) {
    return evaluate(parse(text), scope);
  }

  /** 按顶层分隔符切分（忽略括号内部） */
  function splitTopLevel(text, separator = ',') {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === separator && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  }

  /** 在顶层（括号外）寻找第一个等号 */
  function findTopLevelEquals(text) {
    let depth = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === '=' && depth === 0) {
        if (text[i + 1] === '=') continue;
        return i;
      }
    }
    return -1;
  }

  const IDENT_RE = /^[\p{L}_][\p{L}\p{N}_]*$/u;

  function isIdentifier(text) {
    return IDENT_RE.test(text);
  }

  /** 如果是 (expr, expr) 形式，返回两段坐标文本；否则返回 null */
  function parsePointTuple(text) {
    const t = text.trim();
    if (t.length < 4 || t[0] !== '(' || t[t.length - 1] !== ')') return null;
    let depth = 0;
    for (let i = 0; i < t.length; i++) {
      if (t[i] === '(') depth++;
      else if (t[i] === ')') {
        depth--;
        if (depth === 0 && i !== t.length - 1) return null;
      }
    }
    const inner = t.slice(1, -1);
    const parts = splitTopLevel(inner, ',');
    if (parts.length !== 2) return null;
    if (!parts[0].trim() || !parts[1].trim()) return null;
    return { x: parts[0].trim(), y: parts[1].trim() };
  }

  /** 识别 Command(arg1, arg2, ...) 形式 */
  function parseCommandShape(text) {
    const t = text.trim();
    const m = t.match(/^([A-Za-z][A-Za-z0-9]*)\s*\(/);
    if (!m) return null;
    let depth = 0;
    let end = -1;
    for (let i = m[0].length - 1; i < t.length; i++) {
      if (t[i] === '(') depth++;
      else if (t[i] === ')') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end !== t.length - 1) return null;
    const rawArgs = t.slice(m[0].length, end);
    return {
      name: m[1],
      args: rawArgs.trim() ? splitTopLevel(rawArgs, ',') : [],
      rawArgs
    };
  }

  const api = {
    parse,
    compile,
    evaluate,
    evaluateText,
    variables,
    tokenize,
    splitTopLevel,
    findTopLevelEquals,
    isIdentifier,
    parsePointTuple,
    parseCommandShape,
    isReservedName,
    constants: CONSTANTS,
    functions: FUNCTIONS,
    functionNames: FUNCTION_NAMES,
    constantNames: CONSTANT_NAMES
  };

  global.MathParse = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);

