# Clap

**Class as Processor** — あらゆる言語要素をクラスとして扱うインタプリタ言語。

> Lisp がリストによって統一性を追求するなら、Clap はクラスによって統一性を追求する。

## 原則

- すべてはクラス。 `Class` 自身もクラス。
- 数値・文字列・真偽値は標準型クラス `Int`、`Float`、`String`、`Bool`。
- 関数は `Function`、演算子は `Operator`、制御構文は `Syntax` を継承するクラス。
- 演算子の標準記号は使わず、`1 Add 2` のようにクラス名で書く。
- クラスはクラスの内部に定義できる。
- 変数の束縛・参照・スコープもクラスモデルに含める。
- AST の各ノードも `Node` の派生クラス。コードを `Quote` / `Parse` でクラスとして取り扱える。

## はじめかた（試作インタプリタ）

Node.js 18 以降で、外部依存なしで実行できます。

```sh
node bin/clap.cjs examples/hello.clap
npm test
```

```clap
class Double : Function {
    process(x) {
        Return(x Mul 2)
    }
}

Let(answer, Double(21))
Print(answer)
```

Clap は設計・実装の初期段階です。現在の仕様と実装済み機能は [docs/language.md](docs/language.md) を参照してください。

## コードもクラス

```clap
Let(ast, Quote(1 Add 2 Mul 3))
Print(ClassOf(ast)) // <class OperatorCall>
Print(ast.name)     // Add
Print(ast.eval())   // 7

Let(parsed, Parse("10 Mul 4"))
Print(parsed.eval()) // 40
```

`ast.left` / `ast.right` / `ast.args` などから構文木を再帰的に調べられます。詳しくは [ASTの例](examples/ast.clap) を参照してください。

## ASTの生成・書き換え

`Quote` と `Parse` に加えて、ASTクラスに `.new(...)` コンストラクタを用意しています。

```clap
Let(code, OperatorCall.new(
    "Add",
    Literal.new(1),
    Literal.new(2)
))
Print(code.eval()) // 3

// 元のコードを変えずに新しいASTを作る
Let(changed, code.with("right", Literal.new(41)))
Print(code.eval())    // 3
Print(changed.eval()) // 42
```

`Array.of(...)`、`Array.with(index, value)`、`Array.append(value)` でASTの引数や文の配列も組み立てられます。動的に関数クラスを生成する例は [metaprogramming.clap](examples/metaprogramming.clap) を参照してください。

## ランタイム方針

インタプリタは最小限の構文を読み取り、評価をクラスへ委譲します。ユーザー定義 `Function`・`Operator`・`Syntax` は共通の `process` メソッドを持ちます。初期版には処理系起動のためのブートストラップ処理が存在します。

## ライセンス

ライセンスは未定です。
