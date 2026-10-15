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
  └── Variable
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
- Syntax: 未評価の式を保持した Expression クラスを process に渡せる。
- Scope: 名前から Variable 束縛を引き、変数の値クラスを解決する。

ブートストラップ実装はあくまで出発点。今後 AST/Parser を言語側クラスへ公開していく。
