# 🤝 Contributing to TopazBot

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
