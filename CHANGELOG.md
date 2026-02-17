# Changelog

All notable changes to Semiconductor War will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Live service operations framework (agents, skills, rules)
- Pessimist/Optimist critic agents for game review
- Deploy manager agent for Render deployment
- Patch manager agent for version control and changelogs
- Project doctor agent for health diagnostics
- Game review skill (combined pessimist + optimist analysis)
- Deploy-render skill (Render deployment pipeline)
- Patch-notes skill (auto-generated patch notes from git diff)
- Project-health skill (dependency, code quality, architecture audit)
- Git conventions rule (commit messages, branching strategy, tagging)
- Deployment safety rule (pre-deploy checks, rollback procedures)
- Live service operations rule (patch cycles, feedback loops, hotfix criteria)
