# Clap クラスモデル

**哲学:** クラスは単なる型ではなく、処理・名前空間・束縛・制御の共通単位。

## 実装中の公理

1. Clap の実行時に観測できる値はすべて ClapClass である。
2. Class は自分自身を親に持つブートストラップ上の固定点。
3. Int、String、Bool などの標準型は Class の派生クラス。
4. 数値 123 は Int を親に持つクラス値（別のプリミティブ型を持たない）。
5. Function、Operator、Syntax は Class の派生クラス。新しい振る舞いを継承で表す。
6. Function の呼び出し、Operator の中置演算、Syntax の遅延評価は処理系が各クラスに委譲する。
7. 名前空間としてのクラスは、内部クラスを保持する。継承関係と内包関係は別。
8. Variable と Scope もクラスであり、名前の解決は Variable の値を参照する。
9. AST ノードはすべて Node の派生クラス。Syntax の引数は具体的な AST クラスであり、Expression.eval() で字句スコープに基づいて評価できる。

## 自己参照と継承

~~~text
Class ── parent ──> Class
  ├── Int
  │    └── <Int: 123>
  ├── String
  ├── Function
  │    └── Double
  ├── Operator
  │    └── Add
  ├── Syntax
  │    └── If
  ├── Scope
  ├── Variable
  └── Node
       ├── Expression
       │    ├── Literal
       │    ├── Reference
       │    ├── Call
       │    │    └── OperatorCall
       │    ├── MemberAccess
       │    └── Block
       └── Statement
            ├── ClassDefinition
            ├── FieldDefinition
            └── MethodDefinition
~~~

Class の自己参照を含め、親チェーン探索には循環検知を使う。

## 処理フロー

~~~text
ソース
  -> Tokenizer
  -> Parser（AST）
  -> Interpreter
  -> 評価・呼び出し対象をクラスとして解決
  -> Function.process / Operator.process / Syntax.process
  -> 戻り値はクラス
~~~

- Function: 実引数を評価してから process に渡す。
- Operator: 優先順位などの属性をパーサーに提供し、通常は評価済み左右値を process に渡す。
- Syntax: 未評価の式を保持した具体的な Expression 派生クラスを process に渡せる。
- Quote: 式を AST クラス値に変換してその場では評価しない。
- Parse: 文字列の単一式を AST クラス値へ変換する。
- Array: AST の引数・文のリストなどを Clap クラスとして保持する。
- Scope: 名前から Variable 束縛を引き、変数の値クラスを解決する。

## クラスからクラスを組み立てる

ASTクラス型（Literal、Reference、OperatorCall、Call、Block、Statement、ClassDefinitionなど）の `new` メソッドが新たなAST値クラスを返す。

- `Literal.new(value)` は実行時の Int/Float/String/Bool 値から Literal を作る。
- `OperatorCall.new("Add", left, right)` は演算子のクラス名を使って中置式を作る。
- `Call.new(target, Array.of(...))` は実行可能な呼び出しを組み立てる。
- `Node.with("right", replacement)` は元のノードを変更せず、一部を書き換えた新しいノードクラスを返す。
- `Array.of(...)`、`Array.with(index, item)`、`Array.append(item)` はASTフィールド用のクラス配列を不変更新する。

AST の `.eval()` は評価用スコープを持ったクラス値で使用できる。ノードの型・フィールド構造は各コンストラクタで検証する。

ブートストラップ実装はあくまで出発点。ASTノードの生成・書き換えもクラスを介して実装できたが、トークナイザーとパーサー本体、内部メタデータはまだ JavaScript 実装。次は再帰AST変換・スコープ衛生・Parserの言語側公開を進める。
