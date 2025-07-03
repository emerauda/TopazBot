# 🤝 Contributing to TopazBot

[English](#-contributing-to-topazbot) | [日本語](#-TopazBotへのコントリビューション)

---

## 🤝 Contributing to TopazBot

First off, thank you for considering contributing to TopazBot! It's people like you that make this project great. All contributions are welcome, from documentation improvements to new features.

### 📜 Code of Conduct

This project and everyone participating in it is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to [aoi@emerauda.com](mailto:aoi@emerauda.com).

### 🤔 How Can I Contribute?

There are many ways to contribute to TopazBot:

-   🐛 **Reporting Bugs**: If you find a bug, please report it using [GitHub Issues](https://github.com/emerauda/TopazBot/issues).
-   ✨ **Suggesting Enhancements**: If you have an idea for a new feature, please suggest it using [GitHub Issues](https://github.com/emerauda/TopazBot/issues).
-   📝 **Writing Documentation**: Improvements to the documentation are always welcome.
-   💻 **Submitting Pull Requests**: If you want to contribute code, we'd love to have your help.

### 🚀 Pull Request Process

1.  **Fork the repository** and create your branch from `main`.
2.  **Set up your development environment**.
    ```bash
    # Install dependencies
    npm install
    # Set up environment variables
    cp .env.example .env
    # Edit .env with your Discord Bot Token
    ```
3.  **Make your changes**. Make sure to follow the coding style.
    ```bash
    # Run linter and formatter
    npm run lint:fix
    npm run format
    ```
4.  **Add tests** for your changes. This is important so we don't break it in a future version.
    ```bash
    # Run tests
    npm test
    ```
5.  **Ensure the test suite passes** and your code is free of linting errors.
6.  **Write a clear and concise commit message**.
7.  **Push to your fork** and submit a pull request to the `main` branch.
8.  **Wait for a review**. A maintainer will review your pull request and may suggest some changes.

### 🎨 Coding Style

Please follow the coding style enforced by ESLint and Prettier. You can automatically fix many style issues by running:

```bash
npm run lint:fix
npm run format
```

Thank you for your contribution! ❤️

---

## 🤝 TopazBotへのコントリビューション

まずはじめに、TopazBotへの貢献をご検討いただき、誠にありがとうございます！このプロジェクトは、あなたのような方々のおかげで成り立っています。ドキュメントの改善から新機能の実装まで、あらゆるコントリビューションを歓迎します。

### 📜 行動規範

このプロジェクトおよび参加者全員は、[行動規範](CODE_OF_CONDUCT.md)に従うものとします。参加することにより、この規範を遵守することに同意したとみなされます。許容できない行動は [aoi@emerauda.com](mailto:aoi@emerauda.com) までご報告ください。

### 🤔 貢献の方法

TopazBotに貢献するには、さまざまな方法があります。

-   🐛 **バグ報告**: バグを発見した場合は、[GitHub Issues](https://github.com/emerauda/TopazBot/issues) を利用して報告してください。
-   ✨ **機能提案**: 新機能のアイデアがある場合は、[GitHub Issues](https://github.com/emerauda/TopazBot/issues) で提案してください。
-   📝 **ドキュメント作成**: ドキュメントの改善はいつでも大歓迎です。
-   💻 **プルリクエストの送信**: コードで貢献したい場合、あなたの助けを心から歓迎します。

### 🚀 プルリクエストのプロセス

1.  **リポジトリをフォーク**し、`main` ブランチから新しいブランチを作成します。
2.  **開発環境をセットアップ**します。
    ```bash
    # 依存関係をインストール
    npm install
    # 環境変数を設定
    cp .env.example .env
    # .env にあなたのDiscordボットトークンを編集
    ```
3.  **変更を加えます**。コーディングスタイルに従ってください。
    ```bash
    # リンターとフォーマッターを実行
    npm run lint:fix
    npm run format
    ```
4.  変更に対する**テストを追加**します。これは、将来のバージョンでバグを再発させないために重要です。
    ```bash
    # テストを実行
    npm test
    ```
5.  **テストスイートがパスすること**、およびコードにリンティングエラーがないことを確認します。
6.  **明確で簡潔なコミットメッセージ**を記述します。
7.  **あなたのフォークにプッシュ**し、`main` ブランチへのプルリクエストを送信します。
8.  **レビューを待ちます**。メンテナーがあなたのプルリクエストを確認し、変更を提案する場合があります。

### 🎨 コーディングスタイル

ESLintとPrettierによって強制されるコーディングスタイルに従ってください。以下のコマンドを実行することで、多くのスタイル問題を自動的に修正できます。

```bash
npm run lint:fix
npm run format
```

ご協力に感謝します！ ❤️