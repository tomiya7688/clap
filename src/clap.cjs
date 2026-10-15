"use strict";

// Clap bootstrap interpreter (MVP). Every language-level value is a ClapClass.
// JavaScript objects are implementation details of the host runtime.
class ClapError extends Error {
  constructor(message) {
    super(message);
    this.name = "ClapError";
  }
}

class ReturnSignal {
  constructor(value) { this.value = value; }
}
class BreakSignal {}
class ContinueSignal {}

class ClapClass {
  constructor(name, parent = null) {
    this.name = name;
    this.parent = parent;
    this.members = new Map();
    this.value = undefined;
    this.nativeFunction = null;
    this.nativeSyntax = null;
    this.params = null;
    this.body = null;
    this.closure = null;
    this.ast = null;
    this.lexicalScope = null;
  }

  isA(ancestor) {
    const visited = new Set();
    for (let current = this; current && !visited.has(current); current = current.parent) {
      if (current === ancestor) return true;
      visited.add(current);
    }
    return false;
  }

  getMember(name) {
    const visited = new Set();
    for (let current = this; current && !visited.has(current); current = current.parent) {
      if (current.members.has(name)) return current.members.get(name);
      visited.add(current);
    }
    return undefined;
  }
}

class ClapScope extends ClapClass {
  constructor(scopeType, outer = null) {
    super("<scope>", scopeType);
    this.outer = outer;
    this.bindings = new Map();
  }

  findBinding(name) {
    if (this.bindings.has(name)) return this.bindings.get(name);
    return this.outer ? this.outer.findBinding(name) : null;
  }

  read(name) {
    const binding = this.findBinding(name);
    if (!binding) throw new ClapError("未定義の名前: " + name);
    return binding.value;
  }

  define(name, value, variableType) {
    if (this.bindings.has(name)) throw new ClapError("名前が重複しています: " + name);
    const binding = new ClapClass("<variable " + name + ">", variableType);
    binding.variableName = name;
    binding.value = value;
    this.bindings.set(name, binding);
    return value;
  }

  assign(name, value) {
    const binding = this.findBinding(name);
    if (!binding) throw new ClapError("代入先が見つかりません: " + name);
    binding.value = value;
    return value;
  }
}

function tokenize(source) {
  const tokens = [];
  let offset = 0;
  let line = 1;
  let column = 1;
  function advance() {
    const ch = source[offset++];
    if (ch === "\n") { line++; column = 1; } else { column++; }
    return ch;
  }
  function emit(kind, text, positionLine, positionColumn) {
    tokens.push({ kind, text, line: positionLine, column: positionColumn });
  }
  while (offset < source.length) {
    const ch = source[offset];
    const startLine = line;
    const startColumn = column;
    if (ch === " " || ch === "\t" || ch === "\r") { advance(); continue; }
    if (ch === "\n") { advance(); emit("newline", "\n", startLine, startColumn); continue; }
    if (ch === "#" || (ch === "/" && source[offset + 1] === "/")) {
      while (offset < source.length && source[offset] !== "\n") advance();
      continue;
    }
    if (ch === '"') {
      let literal = advance();
      let closed = false;
      while (offset < source.length) {
        const next = advance();
        literal += next;
        if (next === "\\") {
          if (offset >= source.length) break;
          literal += advance();
          continue;
        }
        if (next === '"') { closed = true; break; }
        if (next === "\n") break;
      }
      if (!closed) throw new ClapError("閉じられていない文字列: " + startLine + ":" + startColumn);
      try { emit("string", JSON.parse(literal), startLine, startColumn); }
      catch (_) { throw new ClapError("不正な文字列: " + startLine + ":" + startColumn); }
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let value = "";
      while (offset < source.length && /[0-9]/.test(source[offset])) value += advance();
      if (source[offset] === "." && /[0-9]/.test(source[offset + 1] || "")) {
        value += advance();
        while (offset < source.length && /[0-9]/.test(source[offset])) value += advance();
      }
      emit("number", value, startLine, startColumn);
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let name = "";
      while (offset < source.length && /[A-Za-z0-9_]/.test(source[offset])) name += advance();
      emit("identifier", name, startLine, startColumn);
      continue;
    }
    if ("(){}.,:=;".includes(ch)) {
      advance();
      emit("symbol", ch, startLine, startColumn);
      continue;
    }
    throw new ClapError("使用できない文字 '" + ch + "': " + line + ":" + column);
  }
  emit("eof", "", line, column);
  return tokens;
}

class Parser {
  constructor(tokens, operatorInfo) {
    this.tokens = tokens;
    this.index = 0;
    this.operatorInfo = operatorInfo;
  }
  current() { return this.tokens[this.index]; }
  peek(delta = 1) { return this.tokens[this.index + delta] || this.tokens[this.tokens.length - 1]; }
  has(kind, text = null) {
    const token = this.current();
    return token.kind === kind && (text === null || token.text === text);
  }
  match(kind, text = null) {
    if (!this.has(kind, text)) return false;
    this.index++;
    return true;
  }
  fail(message) {
    const t = this.current();
    throw new ClapError(message + " (" + t.line + ":" + t.column + ")");
  }
  expect(kind, text = null) {
    if (!this.has(kind, text)) this.fail("期待されたトークン: " + (text || kind));
    return this.tokens[this.index++];
  }
  separators() {
    while (this.has("newline") || this.has("symbol", ";")) this.index++;
  }
  newlines() {
    while (this.has("newline")) this.index++;
  }
  next() {
    this.separators();
    if (this.has("eof")) return null;
    const statement = this.statement(false);
    if (!this.has("eof") && !this.has("symbol", "}") &&
        !this.has("newline") && !this.has("symbol", ";")) {
      this.fail("文の区切りが必要です");
    }
    return statement;
  }
  statements(inClass = false) {
    const body = [];
    this.separators();
    while (!this.has("symbol", "}") && !this.has("eof")) {
      body.push(this.statement(inClass));
      if (!this.has("symbol", "}") && !this.has("newline") && !this.has("symbol", ";")) {
        this.fail("文の区切りが必要です");
      }
      this.separators();
    }
    return body;
  }
  statement(inClass) {
    if (this.has("identifier", "class")) return this.classDeclaration();
    if (inClass && this.has("identifier") && this.peek().text === "=") {
      const name = this.expect("identifier").text;
      this.expect("symbol", "=");
      return { kind: "field", name, expression: this.expression() };
    }
    if (inClass && this.has("identifier") && this.peek().text === "(") {
      return this.method();
    }
    if (inClass) this.fail("クラス内にはフィールド、メソッド、内部クラスを記述してください");
    return { kind: "statement", expression: this.expression() };
  }
  classDeclaration() {
    this.expect("identifier", "class");
    const name = this.expect("identifier").text;
    let base = null;
    if (this.match("symbol", ":")) {
      base = { kind: "name", name: this.expect("identifier").text };
      while (this.match("symbol", ".")) {
        base = { kind: "member", object: base, name: this.expect("identifier").text };
      }
    }
    this.newlines();
    this.expect("symbol", "{");
    const body = this.statements(true);
    this.expect("symbol", "}");
    return { kind: "class", name, base, body };
  }
  method() {
    const name = this.expect("identifier").text;
    this.expect("symbol", "(");
    const params = [];
    this.newlines();
    if (!this.has("symbol", ")")) {
      do {
        this.newlines();
        params.push(this.expect("identifier").text);
        this.newlines();
      } while (this.match("symbol", ","));
    }
    this.expect("symbol", ")");
    this.newlines();
    this.expect("symbol", "{");
    const body = this.statements(false);
    this.expect("symbol", "}");
    if (new Set(params).size !== params.length) this.fail("引数名が重複しています");
    return { kind: "method", name, params, body };
  }
  block() {
    this.expect("symbol", "{");
    const body = this.statements(false);
    this.expect("symbol", "}");
    return { kind: "block", body };
  }
  expression(minPrecedence = 0) {
    this.newlines();
    let left = this.postfix(this.primary());
    while (this.has("identifier")) {
      const name = this.current().text;
      const spec = this.operatorInfo(name);
      if (!spec || spec.precedence < minPrecedence) break;
      this.index++;
      const right = this.expression(spec.precedence + (spec.associativity === "right" ? 0 : 1));
      left = { kind: "operator", name, left, right };
    }
    return left;
  }
  primary() {
    if (this.has("number")) {
      const raw = this.expect("number").text;
      return { kind: "literal", type: raw.includes(".") ? "Float" : "Int", value: Number(raw) };
    }
    if (this.has("string")) return { kind: "literal", type: "String", value: this.expect("string").text };
    if (this.has("identifier")) {
      const name = this.expect("identifier").text;
      if (name === "true" || name === "false") return { kind: "literal", type: "Bool", value: name === "true" };
      return { kind: "name", name };
    }
    if (this.match("symbol", "(")) {
      const inside = this.expression();
      this.newlines();
      this.expect("symbol", ")");
      return inside;
    }
    if (this.has("symbol", "{")) return this.block();
    this.fail("式が必要です");
  }
  postfix(left) {
    while (true) {
      if (this.match("symbol", ".")) {
        left = { kind: "member", object: left, name: this.expect("identifier").text };
        continue;
      }
      if (this.match("symbol", "(")) {
        const args = [];
        this.newlines();
        if (!this.has("symbol", ")")) {
          do {
            this.newlines();
            args.push(this.expression());
            this.newlines();
          } while (this.match("symbol", ","));
        }
        this.expect("symbol", ")");
        left = { kind: "call", target: left, args };
        continue;
      }
      break;
    }
    return left;
  }
}

class Interpreter {
  constructor(options = {}) {
    this.output = options.output || ((line) => console.log(line));
    this.types = {};
    const Class = new ClapClass("Class");
    Class.parent = Class; // Bootstrap fixed point: Class : Class
    this.types.Class = Class;
    for (const name of [
      "Int", "Float", "String", "Bool", "Unit", "Function", "Operator",
      "Syntax", "Expression", "Literal", "Call", "Block", "Reference",
      "Variable", "Scope"
    ]) {
      this.types[name] = new ClapClass(name, Class);
    }
    this.root = new ClapScope(this.types.Scope);
    for (const [name, klass] of Object.entries(this.types)) {
      this.root.define(name, klass, this.types.Variable);
    }
    this.unit = this.value("Unit", null);
    this.installStandardLibrary();
  }

  value(type, raw) {
    if (!this.types[type]) throw new ClapError("未定義の標準型: " + type);
    const object = new ClapClass("<" + type + ">", this.types[type]);
    object.value = raw;
    return object;
  }
  format(object) {
    if (!(object instanceof ClapClass)) throw new ClapError("ホスト値が漏れました");
    if (["Int", "Float", "Bool"].some((name) => object.parent === this.types[name])) return String(object.value);
    if (object.parent === this.types.String) return object.value;
    if (object.parent === this.types.Unit) return "Unit";
    return "<class " + object.name + ">";
  }
  requireType(object, type) {
    if (!(object instanceof ClapClass) || !object.isA(this.types[type])) {
      throw new ClapError(type + " を期待しました: " + (object instanceof ClapClass ? this.format(object) : String(object)));
    }
    return object;
  }
  bool(object) {
    this.requireType(object, "Bool");
    return object.value;
  }
  numeric(left, right, fn, opname) {
    const numericType = (object) =>
      object instanceof ClapClass && (object.parent === this.types.Int || object.parent === this.types.Float);
    if (!numericType(left) || !numericType(right)) throw new ClapError(opname + " には数値が必要です");
    if ((opname === "div" || opname === "mod") && right.value === 0) throw new ClapError("ゼロ除算です");
    const result = fn(left.value, right.value);
    if (!Number.isFinite(result)) throw new ClapError("数値の範囲を超えました");
    const type = opname === "div" || left.parent === this.types.Float ||
      right.parent === this.types.Float || !Number.isInteger(result) ? "Float" : "Int";
    if (type === "Int" && !Number.isSafeInteger(result)) throw new ClapError("整数の精度を超えました");
    return this.value(type, result);
  }
  nativeFunction(name, fn) {
    const klass = new ClapClass(name, this.types.Function);
    klass.nativeFunction = fn;
    return klass;
  }
  nativeMethod(owner, name, fn) {
    owner.members.set(name, this.nativeFunction(owner.name + "." + name, fn));
  }
  register(name, value) {
    this.root.define(name, value, this.types.Variable);
    return value;
  }
  operator(name, precedence, method, associativity = "left") {
    const klass = new ClapClass(name, this.types.Operator);
    klass.members.set("precedence", this.value("Int", precedence));
    klass.members.set("associativity", this.value("String", associativity));
    this.nativeMethod(klass, "process", (args, vm, self, scope) => {
      vm.arity(args, 2, name);
      const impl = args[0].getMember(method);
      if (!impl) throw new ClapError(name + " は左辺の " + method + " を呼び出せません");
      return vm.callFunction(impl, [args[1]], scope, args[0]);
    });
    this.register(name, klass);
  }
  arity(args, expected, name) {
    if (args.length !== expected) {
      throw new ClapError(name + ": 引数は " + expected + " 個必要です (" + args.length + " 個)");
    }
  }
  installStandardLibrary() {
    for (const type of ["Int", "Float"]) {
      const klass = this.types[type];
      for (const [name, implementation] of [
        ["add", (a, b) => a + b], ["sub", (a, b) => a - b],
        ["mul", (a, b) => a * b], ["div", (a, b) => a / b],
        ["mod", (a, b) => a % b], ["pow", (a, b) => a ** b]
      ]) {
        this.nativeMethod(klass, name, (args, vm, self) => {
          vm.arity(args, 1, name);
          return vm.numeric(self, args[0], implementation, name);
        });
      }
      for (const [name, implementation] of [
        ["less", (a, b) => a < b], ["greater", (a, b) => a > b],
        ["lessEqual", (a, b) => a <= b], ["greaterEqual", (a, b) => a >= b]
      ]) {
        this.nativeMethod(klass, name, (args, vm, self) => {
          vm.arity(args, 1, name);
          if (!(args[0].parent === vm.types.Int || args[0].parent === vm.types.Float)) {
            throw new ClapError(name + " には数値が必要です");
          }
          return vm.value("Bool", implementation(self.value, args[0].value));
        });
      }
    }
    this.nativeMethod(this.types.String, "add", (args, vm, self) => {
      vm.arity(args, 1, "String.add");
      vm.requireType(args[0], "String");
      return vm.value("String", self.value + args[0].value);
    });
    this.nativeMethod(this.types.Expression, "eval", (args, vm, self) => {
      vm.arity(args, 0, "Expression.eval");
      if (!self.ast) throw new ClapError("評価する式がありません");
      return vm.evaluate(self.ast, self.lexicalScope);
    });
    this.nativeMethod(this.types.Class, "equal", (args, vm, self) => {
      vm.arity(args, 1, "equal");
      const other = args[0];
      const selfPrimitive = self.parent === vm.types.Int || self.parent === vm.types.Float ||
        self.parent === vm.types.String || self.parent === vm.types.Bool;
      const otherPrimitive = other.parent === vm.types.Int || other.parent === vm.types.Float ||
        other.parent === vm.types.String || other.parent === vm.types.Bool;
      const numbers = (self.parent === vm.types.Int || self.parent === vm.types.Float) &&
        (other.parent === vm.types.Int || other.parent === vm.types.Float);
      const equals = numbers ? self.value === other.value
        : selfPrimitive && otherPrimitive ? self.parent === other.parent && self.value === other.value
        : self === other;
      return vm.value("Bool", equals);
    });

    this.operator("Add", 10, "add");
    this.operator("Sub", 10, "sub");
    this.operator("Mul", 20, "mul");
    this.operator("Div", 20, "div");
    this.operator("Mod", 20, "mod");
    this.operator("Pow", 30, "pow", "right");
    this.operator("Equal", 7, "equal");
    this.operator("Less", 8, "less");
    this.operator("Greater", 8, "greater");
    this.operator("LessEqual", 8, "lessEqual");
    this.operator("GreaterEqual", 8, "greaterEqual");

    const print = this.nativeFunction("Print", (args, vm) => {
      vm.output(args.map((arg) => vm.format(arg)).join(" "));
      return vm.unit;
    });
    this.register("Print", print);
    this.register("Not", this.nativeFunction("Not", (args, vm) => {
      vm.arity(args, 1, "Not");
      return vm.value("Bool", !vm.bool(args[0]));
    }));
    this.register("ClassOf", this.nativeFunction("ClassOf", (args, vm) => {
      vm.arity(args, 1, "ClassOf");
      return args[0] === vm.types.Class ? vm.types.Class : args[0].parent || vm.types.Class;
    }));
    this.register("IsA", this.nativeFunction("IsA", (args, vm) => {
      vm.arity(args, 2, "IsA");
      return vm.value("Bool", args[0].isA(args[1]));
    }));

    this.syntax("Let", (nodes, scope, vm) => {
      vm.arity(nodes, 2, "Let");
      if (nodes[0].kind !== "name") throw new ClapError("Let の第一引数は名前です");
      return scope.define(nodes[0].name, vm.evaluate(nodes[1], scope), vm.types.Variable);
    });
    this.syntax("Set", (nodes, scope, vm) => {
      vm.arity(nodes, 2, "Set");
      if (nodes[0].kind !== "name") throw new ClapError("Set の第一引数は名前です");
      return scope.assign(nodes[0].name, vm.evaluate(nodes[1], scope));
    });
    this.syntax("If", (nodes, scope, vm) => {
      if (nodes.length !== 2 && nodes.length !== 3) throw new ClapError("If: 引数は 2 または 3 個です");
      const condition = vm.bool(vm.evaluateLazy(nodes[0], scope));
      if (condition) return vm.evaluateLazy(nodes[1], scope);
      return nodes.length === 3 ? vm.evaluateLazy(nodes[2], scope) : vm.unit;
    });
    this.syntax("While", (nodes, scope, vm) => {
      vm.arity(nodes, 2, "While");
      while (vm.bool(vm.evaluateLazy(nodes[0], scope))) {
        try { vm.evaluateLazy(nodes[1], scope); }
        catch (signal) {
          if (signal instanceof BreakSignal) break;
          if (signal instanceof ContinueSignal) continue;
          throw signal;
        }
      }
      return vm.unit;
    });
    this.syntax("Return", (nodes, scope, vm) => {
      if (nodes.length > 1) throw new ClapError("Return: 引数は 0 または 1 個です");
      throw new ReturnSignal(nodes.length ? vm.evaluate(nodes[0], scope) : vm.unit);
    });
    this.syntax("Break", (nodes, scope, vm) => {
      vm.arity(nodes, 0, "Break");
      throw new BreakSignal();
    });
    this.syntax("Continue", (nodes, scope, vm) => {
      vm.arity(nodes, 0, "Continue");
      throw new ContinueSignal();
    });
  }
  syntax(name, handler) {
    const klass = new ClapClass(name, this.types.Syntax);
    klass.nativeSyntax = handler;
    this.register(name, klass);
  }
  operatorInfo(name) {
    let klass;
    try { klass = this.root.read(name); } catch (_) { return null; }
    if (!(klass instanceof ClapClass) || !klass.isA(this.types.Operator)) return null;
    const prec = klass.getMember("precedence");
    const assoc = klass.getMember("associativity");
    const precedence = prec && prec.parent === this.types.Int ? prec.value : 10;
    return { precedence, associativity: assoc && assoc.value === "right" ? "right" : "left" };
  }
  wrapExpression(ast, scope) {
    const wrapper = new ClapClass("<expression>", this.types.Expression);
    wrapper.ast = ast;
    wrapper.lexicalScope = scope;
    return wrapper;
  }
  evaluateLazy(ast, scope) {
    const result = this.evaluate(ast, scope);
    return result instanceof ClapClass && result.isA(this.types.Expression) && result.ast
      ? this.evaluate(result.ast, result.lexicalScope) : result;
  }
  callFunction(callable, args, scope, self = null) {
    if (!(callable instanceof ClapClass) ||
      !(callable.isA(this.types.Function) || callable.isA(this.types.Operator) || callable.isA(this.types.Syntax))) {
      throw new ClapError("呼び出せないクラスです: " + this.format(callable));
    }
    if (callable.nativeFunction) return callable.nativeFunction(args, this, self || callable, scope);
    if (callable.params !== null) {
      this.arity(args, callable.params.length, callable.name);
      const frame = new ClapScope(this.types.Scope, callable.closure || this.root);
      frame.define("self", self || callable, this.types.Variable);
      for (let i = 0; i < args.length; i++) frame.define(callable.params[i], args[i], this.types.Variable);
      try { return this.executeBody(callable.body, frame); }
      catch (signal) {
        if (signal instanceof ReturnSignal) return signal.value;
        throw signal;
      }
    }
    const process = callable.getMember("process");
    if (!process) throw new ClapError(callable.name + " に process がありません");
    return this.callFunction(process, args, scope, self || callable);
  }
  invoke(callable, argNodes, scope, self = null) {
    if (!(callable instanceof ClapClass)) throw new ClapError("クラスではありません");
    if (callable.isA(this.types.Syntax)) {
      if (callable.nativeSyntax) return callable.nativeSyntax(argNodes, scope, this, self);
      const lazyArgs = argNodes.map((node) => this.wrapExpression(node, scope));
      return this.callFunction(callable, lazyArgs, scope, self);
    }
    const args = argNodes.map((node) => this.evaluate(node, scope));
    return this.callFunction(callable, args, scope, self);
  }
  evaluate(node, scope) {
    switch (node.kind) {
      case "literal": return this.value(node.type, node.value);
      case "name": return scope.read(node.name);
      case "member": {
        const object = this.evaluate(node.object, scope);
        const member = object.getMember(node.name);
        if (member === undefined) throw new ClapError(object.name + " に " + node.name + " はありません");
        return member;
      }
      case "call": {
        if (node.target.kind === "member") {
          const self = this.evaluate(node.target.object, scope);
          const method = self.getMember(node.target.name);
          if (method === undefined) throw new ClapError(self.name + " に " + node.target.name + " はありません");
          return this.invoke(method, node.args, scope, self);
        }
        return this.invoke(this.evaluate(node.target, scope), node.args, scope);
      }
      case "operator": {
        const klass = scope.read(node.name);
        if (!klass.isA(this.types.Operator)) throw new ClapError("演算子ではありません: " + node.name);
        return this.invoke(klass, [node.left, node.right], scope);
      }
      case "block": return this.executeBody(node.body, new ClapScope(this.types.Scope, scope));
      default: throw new ClapError("未対応のAST: " + node.kind);
    }
  }
  classDeclaration(node, scope, owner = null) {
    const base = node.base ? this.evaluate(node.base, scope) : this.types.Class;
    if (!(base instanceof ClapClass)) throw new ClapError("継承元がクラスではありません");
    const klass = new ClapClass(owner ? owner.name + "." + node.name : node.name, base);
    if (owner) owner.members.set(node.name, klass);
    else scope.define(node.name, klass, this.types.Variable);
    const classScope = new ClapScope(this.types.Scope, scope);
    classScope.define(node.name, klass, this.types.Variable);
    for (const member of node.body) {
      if (member.kind === "class") {
        this.classDeclaration(member, classScope, klass);
      } else if (member.kind === "field") {
        klass.members.set(member.name, this.evaluate(member.expression, classScope));
      } else if (member.kind === "method") {
        const fn = new ClapClass(klass.name + "." + member.name, this.types.Function);
        fn.params = member.params;
        fn.body = member.body;
        fn.closure = classScope;
        klass.members.set(member.name, fn);
      } else {
        throw new ClapError("クラス要素が不正です: " + member.kind);
      }
    }
    return klass;
  }
  executeBody(body, scope) {
    let result = this.unit;
    for (const statement of body) result = this.executeStatement(statement, scope);
    return result;
  }
  executeStatement(statement, scope) {
    if (statement.kind === "class") return this.classDeclaration(statement, scope);
    if (statement.kind === "statement") return this.evaluate(statement.expression, scope);
    throw new ClapError("実行できない文です: " + statement.kind);
  }
  run(source) {
    const parser = new Parser(tokenize(source), (name) => this.operatorInfo(name));
    let result = this.unit;
    while (true) {
      const statement = parser.next();
      if (!statement) break;
      try { result = this.executeStatement(statement, this.root); }
      catch (signal) {
        if (signal instanceof ReturnSignal) throw new ClapError("Return は関数の内部で使ってください");
        if (signal instanceof BreakSignal || signal instanceof ContinueSignal) {
          throw new ClapError("Break / Continue は While の内部で使ってください");
        }
        throw signal;
      }
    }
    return result;
  }
}

module.exports = { Interpreter, ClapClass, ClapScope, ClapError, tokenize, Parser };
