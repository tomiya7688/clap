"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Interpreter, ClapClass, ClapError } = require("../src/clap.cjs");

function run(source) {
  const lines = [];
  const vm = new Interpreter({ output: (line) => lines.push(line) });
  vm.run(source);
  return { vm, lines };
}

test("every AST node produced by Parser is a Clap class", () => {
  const vm = new Interpreter({ output: () => {} });
  const parser = vm.createParser([
    "class Outer : Function {",
    "  class Inner {}",
    "  process(x) { Return(x Add 1) }",
    "}",
    "Print(Outer.Inner)"
  ].join("\n"));
  function visit(node) {
    assert.ok(node instanceof ClapClass);
    assert.ok(node.isA(vm.types.Node));
    assert.ok(node.getMember("kind") instanceof ClapClass);
    for (const field of Object.values(node.data)) {
      if (field instanceof ClapClass) visit(field);
      if (Array.isArray(field)) {
        for (const child of field) if (child instanceof ClapClass) visit(child);
      }
    }
  }
  let count = 0;
  for (let statement = parser.next(); statement; statement = parser.next()) {
    visit(statement);
    count++;
  }
  assert.equal(count, 2);
});

test("AST classes are arranged in an inheritance hierarchy", () => {
  const vm = new Interpreter({ output: () => {} });
  const ast = vm.parseExpression("1 Add 2 Mul 3");
  assert.equal(ast.parent, vm.types.OperatorCall);
  assert.ok(ast.isA(vm.types.Call));
  assert.ok(ast.isA(vm.types.Expression));
  assert.ok(ast.isA(vm.types.Node));
  assert.equal(ast.getMember("left").parent, vm.types.Literal);
  assert.equal(ast.getMember("right").parent, vm.types.OperatorCall);
});

test("Quote exposes operator children as class values", () => {
  const { lines } = run([
    "Let(code, Quote(1 Add 2 Mul 3))",
    "Print(ClassOf(code))",
    "Print(code.kind)",
    "Print(code.name)",
    "Print(code.left.value)",
    "Print(ClassOf(code.right))",
    "Print(code.right.name)",
    "Print(code.eval())"
  ].join("\n"));
  assert.deepEqual(lines, [
    "<class OperatorCall>", "operator", "Add", "1",
    "<class OperatorCall>", "Mul", "7"
  ]);
});

test("Literal.value retains its exact literal class", () => {
  const { lines } = run([
    "Print(ClassOf(Quote(3.0).value))",
    "Print(Quote(3.0).type)",
    "Print(ClassOf(Quote(true).value))",
    "Print(ClassOf(Quote(\"text\").value))"
  ].join("\n"));
  assert.deepEqual(lines, ["<class Float>", "<class Float>", "<class Bool>", "<class String>"]);
});

test("AST list fields are Array class values", () => {
  const { lines } = run([
    "Let(code, Quote(Print(10 Add 3, 4)))",
    "Print(ClassOf(code.args))",
    "Print(code.args.length)",
    "Print(ClassOf(code.args.at(0)))",
    "Print(code.args.at(0).left.eval())",
    "Print(ClassOf(code.args.at(1)))"
  ].join("\n"));
  assert.deepEqual(lines, ["<class Array>", "2", "<class OperatorCall>", "10", "<class Literal>"]);
});

test("Syntax process receives the concrete AST class", () => {
  const { lines } = run([
    "class Inspect : Syntax {",
    "  process(expression) {",
    "    Print(ClassOf(expression))",
    "    Print(expression.name)",
    "    Return(expression.eval())",
    "  }",
    "}",
    "Print(Inspect(3 Add 4))"
  ].join("\n"));
  assert.deepEqual(lines, ["<class OperatorCall>", "Add", "7"]);
});

test("Quote retains its lexical environment across a block", () => {
  const { lines } = run([
    "Let(saved, Quote(0))",
    "If(true, {",
    "  Let(local, 40)",
    "  Set(saved, Quote(local Add 2))",
    "})",
    "Print(saved.eval())"
  ].join("\n"));
  assert.deepEqual(lines, ["42"]);
});

test("Parse returns a class AST and evaluates in the captured scope", () => {
  const { lines } = run([
    "Let(x, 10)",
    'Let(code, Parse("x Mul 4"))',
    "Print(ClassOf(code))",
    "Print(code.kind)",
    "Print(code.eval())"
  ].join("\n"));
  assert.deepEqual(lines, ["<class OperatorCall>", "operator", "40"]);
});

test("Quote/Parse reject missing input, non-strings, multiple expressions and out-of-range indices", () => {
  assert.throws(() => run("Quote()"), /引数は 1 個/);
  assert.throws(() => run("Parse(123)"), /String/);
  assert.throws(() => run('Parse("class Foo {}")'), /式が必要/);
  assert.throws(() => run('Parse("")'), /式が必要/);
  assert.throws(() => new Interpreter().parseExpression("1\n2"), /単一の式/);
  assert.throws(() => run("Quote(Print(1)).args.at(2)"), /範囲外/);
  assert.throws(() => run('Quote(Print(1)).args.at("0")'), /Int/);
});
