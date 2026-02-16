# Contributing to openclaw-skill-claude-code

Thank you for your interest in contributing! We want to make this skill the gold standard for robust agentic coding.

## Development Workflow

1.  **Fork & Clone**: Fork the repo and clone it locally.
2.  **Install Dependencies**: \`npm install\`
3.  **Branch**: Create a feature branch (\`feat/my-feature\`).
4.  **Code**: Implement your changes.
5.  **Commit**: Use [Conventional Commits](https://www.conventionalcommits.org/).
    *   \`feat: add timeout handling\`
    *   \`fix: correct pid tracking\`
    *   \`docs: update readme\`
6.  **Push & PR**: Push your branch and open a Pull Request.

## Commits

We enforce Conventional Commits via \`commitlint\`. This enables automated semantic versioning and changelog generation.

Types:
- \`feat\`: A new feature
- \`fix\`: A bug fix
- \`docs\`: Documentation only changes
- \`style\`: Changes that do not affect the meaning of the code (white-space, formatting, etc)
- \`refactor\`: A code change that neither fixes a bug nor adds a feature
- \`perf\`: A code change that improves performance
- \`test\`: Adding missing tests or correcting existing tests
- \`chore\`: Changes to the build process or auxiliary tools and libraries such as documentation generation

## Release Process

Releases are automated via GitHub Actions and \`semantic-release\`.
- Merging to \`main\` triggers a release.
- Version number is determined by commit types (fix=patch, feat=minor, BREAKING CHANGE=major).
