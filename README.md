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

## はじめかた（試作インタプリタ）

Node.js 18 以降で、外部依存なしで実行する予定です。

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

## ランタイム方針

インタプリタは最小限の構文を読み取り、評価をクラスへ委譲します。ユーザー定義 `Function`・`Operator`・`Syntax` は共通の `process` メソッドを持ちます。初期版には処理系起動のためのブートストラップ処理が存在します。

## ライセンス

ライセンスは未定です。
