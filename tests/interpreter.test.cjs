"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Interpreter, ClapClass, ClapError, tokenize } = require("../src/clap.cjs");

function run(source) {
  const lines = [];
  const vm = new Interpreter({ output: (line) => lines.push(line) });
  const value = vm.run(source);
  return { vm, lines, value };
}

test("bootstrap: Class is itself a Class and every literal is a class value", () => {
  const { vm, lines } = run([
    "Print(ClassOf(Class))",
    "Print(ClassOf(10))",
    "Print(ClassOf(2.5))",
    "Print(ClassOf(\"hello\"))",
    "Print(ClassOf(true))",
    "Print(IsA(10, Int))"
  ].join("\n"));
  assert.equal(vm.types.Class.parent, vm.types.Class);
  assert.ok(vm.value("Int", 1) instanceof ClapClass);
  assert.deepEqual(lines, [
    "<class Class>", "<class Int>", "<class Float>",
    "<class String>", "<class Bool>", "true"
  ]);
});

test("lexer: comments, escaped strings, source positions", () => {
  const tokens = tokenize('Print("A\\nB") // comment\nPrint(1)\n');
  assert.equal(tokens.filter((token) => token.kind === "identifier").length, 2);
  assert.equal(tokens.find((token) => token.kind === "string").text, "A\nB");
  assert.equal(tokens.find((token) => token.kind === "number").line, 2);
});

test("operator classes handle precedence and right associativity", () => {
  const { lines } = run([
    "Print(1 Add 2 Mul 3)",
    "Print((1 Add 2) Mul 3)",
    "Print(2 Pow 3 Pow 2)",
    "Print(5 Div 2)",
    "Print(\"Hello, \" Add \"Clap\")",
    "Print(3 Equal 3.0)"
  ].join("\n"));
  assert.deepEqual(lines, ["7", "9", "512", "2.5", "Hello, Clap", "true"]);
});

test("Function subclasses can be invoked via process and Return", () => {
  const { lines } = run([
    "class Double : Function {",
    "  process(x) { Return(x Mul 2) }",
    "}",
    "Print(Double(21))",
    "Print(Double.process(5))"
  ].join("\n"));
  assert.deepEqual(lines, ["42", "10"]);
});

test("nested classes, properties, and inheritance resolve by name", () => {
  const { lines } = run([
    "class Outer {",
    "  class Inner {",
    "    value = 40",
    "    class Deep {}",
    "  }",
    "}",
    "Print(Outer.Inner.Deep)",
    "Print(Outer.Inner.value Add 2)",
    "Print(IsA(Outer.Inner.Deep, Class))"
  ].join("\n"));
  assert.deepEqual(lines, ["<class Outer.Inner.Deep>", "42", "true"]);
});

test("Let and Set use Variable bindings and lexical Scope classes", () => {
  const { vm, lines } = run([
    "Let(x, 3)",
    "If(true, { Set(x, x Add 4) })",
    "Print(x)"
  ].join("\n"));
  assert.deepEqual(lines, ["7"]);
  assert.ok(vm.root.bindings.get("x").isA(vm.types.Variable));
  assert.ok(vm.root.isA(vm.types.Scope));
  assert.throws(() => run("If(true, {Let(local, 1)})\nPrint(local)"), /未定義/);
});

test("If evaluates only the selected branch", () => {
  const { lines } = run([
    'If(false, { Print("wrong") }, { Print("right") })',
    'If(true, { Print("yes") }, { Print("wrong") })'
  ].join("\n"));
  assert.deepEqual(lines, ["right", "yes"]);
});

test("While, Break, Continue are Syntax classes", () => {
  const { lines } = run([
    "Let(i, 0)",
    "While(i Less 5, {",
    "  Set(i, i Add 1)",
    "  If(i Equal 2, { Continue() })",
    "  If(i Equal 4, { Break() })",
    "  Print(i)",
    "})"
  ].join("\n"));
  assert.deepEqual(lines, ["1", "3"]);
});

test("user-defined Syntax receives unevaluated Expression classes", () => {
  const { lines } = run([
    "class Unless : Syntax {",
    "  process(condition, body) {",
    "    If(Not(condition.eval()), body)",
    "  }",
    "}",
    'Unless(true, { Print("wrong") })',
    'Unless(false, { Print("works") })'
  ].join("\n"));
  assert.deepEqual(lines, ["works"]);
});

test("Syntax may return unevaluated code and evaluate it later", () => {
  const { lines } = run([
    "class Hold : Syntax {",
    "  process(expression) { Return(expression) }",
    "}",
    'Let(code, Hold(Print("later")))',
    "Print(ClassOf(code))",
    'Print("before")',
    "code.eval()"
  ].join("\n"));
  assert.deepEqual(lines, ["<class Call>", "before", "later"]);
});

test("user-defined Operator classes register precedence dynamically", () => {
  const { lines } = run([
    "class Fuse : Operator {",
    "  precedence = 25",
    "  process(left, right) { Return((left Mul 10) Add right) }",
    "}",
    "Print(1 Add 2 Fuse 3)"
  ].join("\n"));
  assert.deepEqual(lines, ["24"]);
});

test("errors: unknown identifiers, symbols, arity, division, boundaries", () => {
  assert.throws(() => run("Print(missing)"), ClapError);
  assert.throws(() => run("Print(1 + 2)"), /使用できない文字/);
  assert.throws(() => run("Print(1 Div 0)"), /ゼロ除算/);
  assert.throws(() => run("Not()"), /引数は 1 個/);
  assert.throws(() => run("Let(x, 1)\nLet(x, 2)"), /重複/);
  assert.throws(() => run("Return(3)"), /関数の内部/);
  assert.throws(() => run("Print(999999999999999999999999)"), /範囲外/);
});
