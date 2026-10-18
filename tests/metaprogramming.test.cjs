"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Interpreter, ClapError, ClapClass } = require("../src/clap.cjs");

function run(source) {
  const output = [];
  const vm = new Interpreter({ output: (line) => output.push(line) });
  vm.run(source);
  return { vm, output };
}

test("new AST constructors are methods on AST class objects", () => {
  const { vm, output } = run([
    'Print(ClassOf(Literal.new(5)))',
    'Print(ClassOf(Reference.new("name")))',
    'Print(ClassOf(OperatorCall.new("Add", Literal.new(1), Literal.new(2))))',
    'Print(ClassOf(Call.new(Reference.new("Print"), Array.of(Literal.new(1)))))',
    'Print(ClassOf(Statement.new(Literal.new(1))))'
  ].join("\n"));
  assert.deepEqual(output, [
    "<class Literal>", "<class Reference>", "<class OperatorCall>",
    "<class Call>", "<class Statement>"
  ]);
  assert.ok(vm.types.Node.getMember("with").isA(vm.types.Function));
});

test("constructor-built code executes and can reference class-bound values", () => {
  const { output } = run([
    "Let(x, 14)",
    'Let(ast, OperatorCall.new("Mul", Reference.new("x"), Literal.new(3)))',
    "Print(ast.eval())"
  ].join("\n"));
  assert.deepEqual(output, ["42"]);
});

test("Node.with preserves the original AST and lexical scope", () => {
  const { output } = run([
    "Let(x, 1)",
    "Let(original, Quote(x Add 2))",
    'Let(changed, original.with("right", Literal.new(41)))',
    "Set(x, 3)",
    "Print(original.eval())",
    "Print(changed.eval())",
    "Print(ClassOf(changed.right))",
    "Print(original.right.value)"
  ].join("\n"));
  assert.deepEqual(output, ["5", "44", "<class Literal>", "2"]);
});

test("Array.of/append/with create new Array classes", () => {
  const { output } = run([
    "Let(items, Array.of(10, 20))",
    "Let(appended, items.append(30))",
    "Let(changed, items.with(0, 40))",
    "Print(items.length)",
    "Print(appended.length)",
    "Print(changed.at(0))",
    "Print(items.at(0))"
  ].join("\n"));
  assert.deepEqual(output, ["2", "3", "40", "10"]);
});

test("AST call argument arrays can be rewritten", () => {
  const { output } = run([
    "Let(original, Quote(Print(1)))",
    'Let(changed, original.with("args", original.args.with(0, Literal.new(5))))',
    "original.eval()",
    "changed.eval()"
  ].join("\n"));
  assert.deepEqual(output, ["1", "5"]);
});

test("a Syntax subclass can synthesize an OperatorCall class", () => {
  const { output } = run([
    "class TimesTen : Syntax {",
    "  process(code) { Return(OperatorCall.new(\"Mul\", code, Literal.new(10))) }",
    "}",
    "Let(x, 4)",
    "Let(generated, TimesTen(x Add 1))",
    "Print(ClassOf(generated))",
    "Print(generated.eval())"
  ].join("\n"));
  assert.deepEqual(output, ["<class OperatorCall>", "50"]);
});

test("MethodDefinition / ClassDefinition create executable user classes", () => {
  const { output } = run([
    'Let(expr, OperatorCall.new("Mul", Reference.new("n"), Reference.new("n")))',
    'Let(ret, Call.new(Reference.new("Return"), Array.of(expr)))',
    'Let(method, MethodDefinition.new("process", Array.of("n"), Array.of(Statement.new(ret))))',
    'Let(definition, ClassDefinition.new("Square", Reference.new("Function"), Array.of(method)))',
    "Print(ClassOf(definition))",
    "definition.eval()",
    "Print(Square(7))"
  ].join("\n"));
  assert.deepEqual(output, ["<class ClassDefinition>", "49"]);
});

test("FieldDefinition, nested ClassDefinition and MemberAccess constructors", () => {
  const { output } = run([
    'Let(field, FieldDefinition.new("count", Literal.new(41)))',
    'Let(inner, ClassDefinition.new("Inner", Array.of()))',
    'Let(outer, ClassDefinition.new("Outer", Array.of(field, inner)))',
    "outer.eval()",
    'Print(MemberAccess.new(Reference.new("Outer"), "count").eval() Add 1)',
    'Print(Outer.Inner)'
  ].join("\n"));
  assert.deepEqual(output, ["42", "<class Outer.Inner>"]);
});

test("Block and Statement constructors run in the block scope", () => {
  const { output } = run([
    'Let(line, Call.new(Reference.new("Print"), Array.of(Literal.new("inside"))))',
    "Let(code, Block.new(Array.of(Statement.new(line))))",
    "code.eval()"
  ].join("\n"));
  assert.deepEqual(output, ["inside"]);
});

test("Node.with validates AST schema", () => {
  const cases = [
    ['Quote(1 Add 2).with("right", 3)', /Expression/],
    ['Quote(1).with("value", "oops")', /Literal.value/],
    ['Quote(1).with("kind", "other")', /はありません/],
    ['Quote(1).with("type", String)', /型と値/],
    ['Quote(1).with("left", Literal.new(3))', /はありません/]
  ];
  for (const [program, expected] of cases) {
    assert.throws(() => run(program), expected, program);
  }
});

test("AST constructors reject invalid inputs", () => {
  const cases = [
    ['Literal.new(Function)', /Literal.new/],
    ['Reference.new("bad name")', /不正/],
    ['Reference.new("true")', /不正/],
    ['OperatorCall.new("Add", 2, Literal.new(3))', /Expression/],
    ['Call.new(Reference.new("Print"), 1)', /Array/],
    ['MethodDefinition.new("foo", Array.of(1), Array.of())', /String/],
    ['ClassDefinition.new("Bad", Array.of(Statement.new(Literal.new(1))))', /定義要素/],
    ['Array.of(1).at(2)', /範囲外/],
    ['Array.of(1).with(2, 4)', /範囲外/]
  ];
  for (const [program, expected] of cases) {
    assert.throws(() => run(program), expected, program);
  }
});

test("Node.eval supports Statement but not isolated class field or method nodes", () => {
  const { output } = run([
    'Statement.new(Call.new(Reference.new("Print"), Array.of(Literal.new(5)))).eval()'
  ].join("\n"));
  assert.deepEqual(output, ["5"]);
  assert.throws(
    () => run('FieldDefinition.new("field", Literal.new(3)).eval()'),
    /単独では実行できません/
  );
});

test("constructed AST nodes remain class objects without mutable source editing", () => {
  const vm = new Interpreter({ output: () => {} });
  const generated = vm.parseExpression("1 Add 2");
  assert.ok(generated instanceof ClapClass);
  assert.ok(generated.isA(vm.types.Node));
  assert.ok(generated.getMember("right") instanceof ClapClass);
});
