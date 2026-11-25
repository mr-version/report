# Generate Version Report Action

Generate comprehensive version reports for monorepo projects with support for multiple output formats and GitHub PR integration.

## Description

This action generates detailed version reports showing current versions, changes, commit history, and dependencies. It supports multiple output formats and can automatically post reports as PR comments.

## Which ref to use

The `v1` tag exists but points at the initial check-in (June 2025); it predates graph output, the collapsible job
summary and the fixes below (Node 24 runtime, `changed-only`/`show-versions`/`include-*` handling,
`include-test-projects`/`include-non-packable`). Until a new release tag is published, reference `@main` or pin a
commit SHA. (`mr-version/setup` and `mr-version/calculate` also have only an old `v1` tag; `mr-version/changelog`
has no tags.)

## Usage

The `mr-version` CLI must be on `PATH`; install it with [`mr-version/setup`](https://github.com/mr-version/setup).

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0       # full history and tags are needed for version calculation

- uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '8.0.x'

- uses: mr-version/setup@main

- uses: mr-version/report@main
  with:
    output-format: 'markdown'
    changed-only: false  # Show all projects, not just changed ones
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `repository-path` | Path to the Git repository root | No | `.` |
| `project-dir` | Directory containing projects to analyze (relative to repository-path) | No | - |
| `output-format` | Report output format (`text`, `json`, `csv`, `markdown`, `graph`) | No | `markdown` |
| `output-file` | File path to save the report (if not specified, outputs to console/summary) | No | - |
| `branch` | Branch to analyze (defaults to current branch) | No | - |
| `tag-prefix` | Prefix for version tags | No | `v` |
| `include-commits` | Include commit information in the report | No | `true` |
| `include-dependencies` | Include dependency information in the report | No | `true` |
| `changed-only` | Show only projects with version changes (false = show all projects) | No | `false` |
| `include-test-projects` | Include test projects | No | `false` |
| `include-non-packable` | Include non-packable projects (test projects are usually non-packable, so set both to see them) | No | `false` |
| `graph-format` | Graph format when `output-format` is `graph` (`mermaid`, `dot`, `ascii`) | No | `mermaid` |
| `show-versions` | Show version numbers in graph nodes | No | `true` |
| `post-to-pr` | Post the report as a PR comment (requires pull_request event) | No | `false` |
| `update-existing-comment` | Update existing PR comment instead of creating new one | No | `true` |
| `comment-header` | Header text for PR comments to identify them | No | `## 📊 Version Report` |
| `token` | GitHub token for posting PR comments | No | `${{ github.token }}` |

### Boolean options and the CLI

The action passes a boolean option to `mr-version report` only when it differs from the CLI default:

| Input | CLI default | Passed when |
|-------|-------------|-------------|
| `include-commits` | true | `false` → `--include-commits false` |
| `include-dependencies` | true | `false` → `--include-dependencies false` |
| `show-versions` | true | `false` → `--show-versions false` |
| `changed-only` | false | `true` → `--changed-only` |
| `include-test-projects` | false | `true` → `--include-test-projects` |
| `include-non-packable` | false | `true` → `--include-non-packable` |

Older CLI versions (3.0.0 and earlier) parse these options as plain switches and ignore a following `true`/`false`,
so with them `include-commits`, `include-dependencies` and `show-versions` cannot be turned off; newer CLIs accept the
explicit value. (Earlier versions of this action passed `--changed-only false`, which those CLIs read as
`--changed-only`, so graphs always showed only changed projects.)

`include-test-projects` and `include-non-packable` apply to both the data the action formats and the graph. Before
these inputs existed the action always included test and non-packable projects in the markdown/text/csv/json
output; set both to `true` to keep that behaviour. `mr-version/release` passes its own values for them.

## Outputs

| Output | Description |
|--------|-------------|
| `report-content` | The generated report content |
| `report-file` | Path to the generated report file (if output-file was specified) |
| `projects-count` | Number of projects analyzed |
| `changed-projects-count` | Number of projects with version changes |

## Examples

### Basic Report Generation

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  
  - uses: mr-version/setup@main
  
  - uses: mr-version/calculate@main
  
  - uses: mr-version/report@main
    with:
      output-format: 'markdown'
      changed-only: false  # Show all projects
```

### Pull Request Comment

```yaml
name: PR Version Report
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      
      - uses: mr-version/setup@main
      
      - uses: mr-version/calculate@main
      
      - uses: mr-version/report@main
        with:
          post-to-pr: true
          changed-only: true  # Only show changed projects in PR
          comment-header: '## 📊 Version Impact Analysis'
```

### Save Report to File

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  
  - uses: mr-version/setup@main
  
  - uses: mr-version/calculate@main
  
  - uses: mr-version/report@main
    with:
      output-format: 'markdown'
      output-file: 'version-report.md'
      changed-only: false  # Include all projects in report
  
  - uses: actions/upload-artifact@v4
    with:
      name: version-report
      path: version-report.md
```

### Multiple Format Reports

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  
  - uses: mr-version/setup@main
  
  - uses: mr-version/calculate@main
  
  - name: Generate Markdown Report
    uses: mr-version/report@main
    with:
      output-format: 'markdown'
      output-file: 'report.md'
  
  - name: Generate JSON Report
    uses: mr-version/report@main
    with:
      output-format: 'json'
      output-file: 'report.json'
  
  - name: Generate CSV Report
    uses: mr-version/report@main
    with:
      output-format: 'csv'
      output-file: 'report.csv'
```

### Customized Report

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  
  - uses: mr-version/setup@main
  
  - uses: mr-version/calculate@main
    with:
      projects: 'src/**/*.csproj'
  
  - uses: mr-version/report@main
    with:
      project-dir: 'src'
      include-commits: true
      include-dependencies: true
      changed-only: true  # Only show changed projects
      output-format: 'markdown'
```

## Report Formats

### Markdown Format

```markdown
## 📊 MonoRepo Version Report

**Repository:** `.`
**Branch:** `main` (Main)

### 📈 Summary

| Metric | Count |
|--------|-------|
| Total Projects | 5 |
| Changed Projects | 3 |
| Test Projects | 2 |
| Packable Projects | 3 |

### 🔄 Changed Projects Only (or 📦 All Projects)

| Project | Version | Type | Path |
|---------|---------|------|------|
| **ServiceA** 🔄 | `1.2.0` | Package | `src/ServiceA/ServiceA.csproj` |
| **ServiceB** 🔄 | `2.0.0` | Package | `src/ServiceB/ServiceB.csproj` |
| **LibraryC** | `1.0.3` | Package | `src/LibraryC/LibraryC.csproj` |
```

### JSON Format

The JSON output is the CLI's report data, normalised by the action:

```json
{
  "repository": "/home/runner/work/repo/repo",
  "branch": "main",
  "branchType": "Main",
  "globalVersion": "1.1.0",
  "projects": [
    {
      "name": "App",
      "path": "src/App/App.csproj",
      "version": {
        "version": "1.1.1",
        "previousVersion": "1.1.0",
        "versionChanged": true,
        "changeReason": "Main branch: Incrementing patch version",
        "commitSha": "fdf27c4",
        "branchName": "main"
      },
      "isTestProject": false,
      "isPackable": true,
      "dependencies": { "direct": [{ "name": "Lib1", "version": "1.0.2" }], "all": [] }
    }
  ],
  "summary": { "totalProjects": 5, "changedProjects": 2, "testProjects": 0, "packableProjects": 5 }
}
```

### CSV Format

```csv
Project,Version,Previous Version,Changed,Reason,Type,Path,Dependencies
"App","1.1.1","1.1.0","true","Main branch: Incrementing patch version","Package","src/App/App.csproj","Lib1;Lib2"
"Core","1.1.0","1.1.0","false","No changes detected, using existing global version","Package","src/Core/Core.csproj",""
```

### Text Format

```
=== MonoRepo Version Report ===
Repository: /home/runner/work/repo/repo
Branch: main (Main)
Global Version: 1.1.0
Total Projects: 5
Changed Projects: 2

[CHANGED] App: 1.1.1
  Path: src/App/App.csproj
  Previous: 1.1.0
  Reason: Main branch: Incrementing patch version
  Dependencies: Lib1, Lib2

[UNCHANGED] Core: 1.1.0
  Path: src/Core/Core.csproj
  Reason: No changes detected, using existing global version
```

### Graph Format

`output-format: graph` runs `mr-version report --output graph` and returns a Mermaid (default), DOT or ASCII
dependency graph. With `changed-only: true` only changed projects are drawn; `show-versions: false` drops the
version numbers from the nodes.

```yaml
- uses: mr-version/report@main
  with:
    output-format: graph
    graph-format: mermaid
    changed-only: false
```

## Pull Request Integration

### Automatic PR Comments

When `post-to-pr` is enabled (on `pull_request` events), the action will:
1. Look for an existing comment that contains the specified header (with `update-existing-comment: true`)
2. Update that comment with the latest report, or create a new comment

### Custom Comment Headers

Use unique headers to post multiple reports:

```yaml
- uses: mr-version/report@main
  with:
    post-to-pr: true
    comment-header: '## 🚀 Production Release Report'
    changed-only: true

- uses: mr-version/report@main
  with:
    post-to-pr: true
    comment-header: '## 📦 All Projects Report'
    changed-only: false
```

## Advanced Usage

### Conditional Reporting

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  
  - uses: mr-version/setup@main
  
  - uses: mr-version/calculate@main
    id: calc
  
  - uses: mr-version/report@main
    if: steps.calc.outputs.has-changes == 'true'
    with:
      output-format: 'markdown'
      post-to-pr: true
      changed-only: true
```

### Branch-Specific Reports

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  
  - uses: mr-version/setup@main
  
  - uses: mr-version/calculate@main
  
  - name: Main Branch Report
    uses: mr-version/report@main
    with:
      branch: 'main'
      output-file: 'main-versions.md'
      changed-only: false
  
  - name: Current Branch Report
    uses: mr-version/report@main
    with:
      output-file: 'current-versions.md'
      changed-only: true
```

### Report Processing

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0
  
  - uses: mr-version/setup@main
  
  - uses: mr-version/calculate@main
  
  - uses: mr-version/report@main
    id: report
    with:
      output-format: 'json'
      changed-only: false  # Get all projects for processing
  
  - name: Process Report
    env:
      REPORT: ${{ steps.report.outputs.report-content }}
    run: |
      echo "$REPORT" | jq '.projects[] | select(.version.versionChanged == true)'
```

## Configuration

### Report Templates

The action uses internal templates for each format. To customize further, generate a JSON report and transform it:

```yaml
- uses: mr-version/report@main
  id: report
  with:
    output-format: 'json'
    changed-only: false

- name: Custom Report
  env:
    REPORT: ${{ steps.report.outputs.report-content }}
  run: |
    echo "$REPORT" | python generate_custom_report.py
```

## Troubleshooting

### PR Comment Not Posted

- Ensure the workflow runs on `pull_request` events
- Check that the GitHub token has appropriate permissions
- Verify the PR exists and is accessible

### Empty Reports

- Ensure `fetch-depth: 0` in checkout action
- Check that projects match the expected patterns
- Verify git tags exist for version detection

## License

This action is part of the Mister.Version project and is licensed under the MIT License.