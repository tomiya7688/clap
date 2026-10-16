# Clap 言語仕様（MVP / 実装状況）

Clap = **Class as Processor**。Lisp のリスト中心の統一性に対して、Clap はクラス中心の統一性を目指す。

この文書は現時点の **動作する処理系** に合わせて記述する。長期的な理想と MVP のブートストラップ上の制約を区別する。

## 1. Everything is a Class

- Clap から扱える値はすべてクラスオブジェクトである。
- Class 自身もクラス（Class : Class）。
- Int、Float、String、Bool、Array、Function、Operator、Syntax、Variable、Scope、Node、Expression などは標準クラス。
- たとえば数値 10 は Int クラスを親に持つ値クラスで、ClassOf(10) は Int。
- ClassOf(Class) は Class。
- ClassOf(Double) は Function（Double が Function を継承している場合）。

~~~clap
Print(ClassOf(10))
Print(ClassOf("text"))
Print(ClassOf(Class))
Print(IsA(10, Int))
~~~

Class を含む親クラスチェーンは循環を検知して探索される。

## 2. 構文の形

~~~clap
// クラス宣言。これだけは MVP パーサーに起動用の専用規則を置く。
class Double : Function {
    process(x) {
        Return(x Mul 2)
    }
}

Let(number, 21)
Print(Double(number))
~~~

小文字 class はブートストラップ構文。メソッドは class 本体で定義する。Return は Syntax クラスで、予約語による return 文は不要。

セミコロンまたは改行が文の区切り。コメントは // または #。括弧、波括弧、カンマ、ドット、コロン、フィールド代入用の = は構造的な記号として使う。**+、-、*、/ などの標準演算子記号は持たない。**

## 3. 関数 = Function 派生クラス

~~~clap
class Greet : Function {
    process(name) {
        Return("Hello, " Add name)
    }
}

Print(Greet("Clap"))
~~~

Function の派生クラスを呼ぶと process メソッドが実行される。method の宣言も内部では Function クラスとして表現される。self はメソッドの受け手を参照する。

## 4. 演算子 = Operator 派生クラス

~~~clap
Print(1 Add 2 Mul 3)
Print(2 Pow 3 Pow 2)

class Fuse : Operator {
    precedence = 25
    process(left, right) {
        Return((left Mul 10) Add right)
    }
}
Print(1 Add 2 Fuse 3)
~~~

Add / Sub / Mul / Div / Mod / Pow / Equal / Less / Greater / LessEqual / GreaterEqual が標準クラス。優先順位と結合規則は演算子クラスの属性。未指定の precedence は 10、associativity は left として扱う。right も選べる。

標準演算子は左辺の add / mul などの演算メソッドに処理を委譲する。ユーザー定義演算子は自分の process を定義できる。MVP では宣言を評価した **後の文** で新しい演算子名を認識する。

## 5. 構文 = Syntax 派生クラス

標準構文クラスは Let、Set、If、While、Return、Break、Continue。これらは事前評価されない引数 AST を受け取り、必要なものだけを実行する。

~~~clap
Let(i, 0)
While(i Less 3, {
    Print(i)
    Set(i, i Add 1)
})
~~~

ユーザー定義の Syntax の process には、未評価の式を表す具体的な AST クラス（Literal、Call、OperatorCall 等）が渡される。これらは Expression の派生クラスであり、.eval() を継承する。

~~~clap
class Unless : Syntax {
    process(condition, body) {
        If(Not(condition.eval()), body)
    }
}
Unless(false, { Print("run") })
~~~

Expression をそのまま Return すれば、コードを評価せずに保持できる。

~~~clap
class Hold : Syntax {
    process(code) { Return(code) }
}
Let(later, Hold(Print("later")))
Print("now")
later.eval()
~~~

## 6. AST = Node 派生クラス

構文解析の結果は JavaScript のプレーンな AST オブジェクトではなく、Clap の `Node` を継承したクラス値。

~~~text
Node
├── Expression
│   ├── Literal
│   ├── Reference
│   ├── Call
│   │   └── OperatorCall
│   ├── MemberAccess
│   └── Block
└── Statement
    ├── ClassDefinition
    ├── FieldDefinition
    └── MethodDefinition
~~~

`Quote(expression)` は式を評価せず AST として返す Syntax クラス。`Parse(string)` は文字列の中の **単一の式** を解析して AST を返す Function クラス。

~~~clap
Let(code, Quote(1 Add 2 Mul 3))
Print(ClassOf(code))  // <class OperatorCall>
Print(code.kind)      // operator
Print(code.name)      // Add
Print(ClassOf(code.right)) // <class OperatorCall>
Print(code.right.name) // Mul
Print(code.eval())    // 7

Let(parsed, Parse("10 Mul 4"))
Print(parsed.eval()) // 40
~~~

AST のフィールドも Clap クラスで統一される。例えば `Literal.value` は Int や String、`Reference.name` は String、`Call.args` や `Block.body` は Array クラス。Array には `.length` と `.at(index)` がある。

~~~clap
Let(call, Quote(Print(10 Add 3)))
Print(call.args.length)      // 1
Print(ClassOf(call.args.at(0))) // <class OperatorCall>
Print(call.args.at(0).left.eval()) // 10
~~~

Syntax の引数や Quote / Parse が返す AST は **字句スコープを捕捉**するため、ブロックの外でも `.eval()` で元のスコープの変数を参照できる。現時点では AST は読み取り専用として公開し、構文木の書き換えや任意の新しい字句規則は未実装。

## 7. クラス内クラス・変数・スコープ

~~~clap
class Game {
    class Player {
        class HP {}
    }
}
Print(Game.Player.HP)
~~~

ネストに構文上の深さ制限はない。Let(name, value) は現在の Scope に Variable クラスの束縛を作り、Set(name, value) は見つかった束縛を更新する。波括弧のブロックは子スコープで実行する。

## 8. 現段階の制約

- ホスト側は JavaScript (Node.js)。**AST の各ノードは ClapClass** だが、トークンやパーサー/評価器のブートストラップ処理、ノードの非公開メタデータは JS で実装される。字句解析と `class` 宣言の起動処理には専用規則が残る。
- Syntax 派生クラスによる遅延評価は可能。ただし任意の新しい字句記号や構文規則を登録する機能は未実装。
- 標準 Int は JavaScript の安全な整数範囲、Float は IEEE 754 倍精度を使う。大きな整数・任意精度数値は未対応。
- 継承・メソッド・クラス内クラスは初期実装。インスタンス化、ミュータブルなクラスフィールド、パッケージ/モジュール、例外、非同期処理、最適化、完全な構文メタプログラミングは今後の課題。
- Clap のコード自体はサンドボックスではない。信頼できないプログラムを安全に実行する用途には使わない。

## 9. 次の目標

1. AST の構築・変換 API を追加し、ユーザー定義の構文マクロを強化する。
2. Class 宣言を Class / Syntax に近づけてパーサーの特例を減らす。
3. メソッドの束縛・属性変更・型変換・モジュール機構の仕様を固める。
4. インタプリタ自身を Clap で記述できる範囲を拡大する。
