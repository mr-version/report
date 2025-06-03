# Generate Version Report Action

Generate comprehensive version reports for monorepo projects with support for multiple output formats and GitHub PR integration.

## Description

This action generates detailed version reports showing current versions, changes, commit history, and dependencies. It supports multiple output formats and can automatically post reports as PR comments.

## Usage

```yaml
- uses: mr-version/report@v1
  with:
    output-format: 'markdown'
    changed-only: false  # Show all projects, not just changed ones
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `repository-path` | Path to the Git repository root | No | `.` |
| `project-dir` | Directory containing projects to analyze (relative to repository-path) | No | - |
| `output-format` | Report output format (text, json, csv, markdown) | No | `markdown` |
| `output-file` | File path to save the report (if not specified, outputs to console/summary) | No | - |
| `branch` | Branch to analyze (defaults to current branch) | No | - |
| `tag-prefix` | Prefix for version tags | No | `v` |
| `include-commits` | Include commit information in the report | No | `true` |
| `include-dependencies` | Include dependency information in the report | No | `true` |
| `changed-only` | Show only projects with version changes (false = show all projects) | No | `false` |
| `post-to-pr` | Post the report as a PR comment (requires pull_request event) | No | `false` |
| `update-existing-comment` | Update existing PR comment instead of creating new one | No | `true` |
| `comment-header` | Header text for PR comments to identify them | No | `## 📊 Version Report` |
| `token` | GitHub token for posting PR comments | No | `${{ github.token }}` |

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
  
  - uses: mr-version/setup@v1
  
  - uses: mr-version/calculate@v1
  
  - uses: mr-version/report@v1
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
      
      - uses: mr-version/setup@v1
      
      - uses: mr-version/calculate@v1
      
      - uses: mr-version/report@v1
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
  
  - uses: mr-version/setup@v1
  
  - uses: mr-version/calculate@v1
  
  - uses: mr-version/report@v1
    with:
      output-format: 'markdown'
      output-file: 'version-report.md'
      changed-only: false  # Include all projects in report
  
  - uses: actions/upload-artifact@v3
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
  
  - uses: mr-version/setup@v1
  
  - uses: mr-version/calculate@v1
  
  - name: Generate Markdown Report
    uses: mr-version/report@v1
    with:
      output-format: 'markdown'
      output-file: 'report.md'
  
  - name: Generate JSON Report
    uses: mr-version/report@v1
    with:
      output-format: 'json'
      output-file: 'report.json'
  
  - name: Generate CSV Report
    uses: mr-version/report@v1
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
  
  - uses: mr-version/setup@v1
  
  - uses: mr-version/calculate@v1
    with:
      projects: 'src/**/*.csproj'
  
  - uses: mr-version/report@v1
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

```json
{
  "reportDate": "2024-01-15T10:30:00Z",
  "summary": {
    "totalProjects": 5,
    "changedProjects": 3
  },
  "projects": [
    {
      "name": "ServiceA",
      "path": "src/ServiceA/ServiceA.csproj",
      "currentVersion": "1.2.0",
      "previousVersion": "1.1.0",
      "changeType": "minor",
      "hasChanges": true,
      "commits": [...]
    }
  ]
}
```

### CSV Format

```csv
Project,Current Version,Previous Version,Change Type,Has Changes
ServiceA,1.2.0,1.1.0,minor,true
ServiceB,2.0.0,1.5.0,major,true
LibraryC,1.0.3,1.0.3,none,false
```

### Text Format

```
Version Report - 2024-01-15

Summary:
  Total Projects: 5
  Changed Projects: 3

Projects:
  ServiceA: 1.1.0 -> 1.2.0 (minor)
  ServiceB: 1.5.0 -> 2.0.0 (major)
  LibraryC: 1.0.3 (no changes)
```

## Pull Request Integration

### Automatic PR Comments

When `post-to-pr` is enabled, the action will:
1. Find or create a comment with the specified header
2. Update the comment with the latest report
3. Collapse previous versions to reduce clutter

### Custom Comment Headers

Use unique headers to post multiple reports:

```yaml
- uses: mr-version/report@v1
  with:
    post-to-pr: true
    comment-header: '## 🚀 Production Release Report'
    changed-only: true

- uses: mr-version/report@v1
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
  
  - uses: mr-version/setup@v1
  
  - uses: mr-version/calculate@v1
    id: calc
  
  - uses: mr-version/report@v1
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
  
  - uses: mr-version/setup@v1
  
  - uses: mr-version/calculate@v1
  
  - name: Main Branch Report
    uses: mr-version/report@v1
    with:
      branch: 'main'
      output-file: 'main-versions.md'
      changed-only: false
  
  - name: Current Branch Report
    uses: mr-version/report@v1
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
  
  - uses: mr-version/setup@v1
  
  - uses: mr-version/calculate@v1
  
  - uses: mr-version/report@v1
    id: report
    with:
      output-format: 'json'
      changed-only: false  # Get all projects for processing
  
  - name: Process Report
    run: |
      echo '${{ steps.report.outputs.report-content }}' | jq '.projects[] | select(.version.versionChanged == true)'
```

## Configuration

### Report Templates

The action uses internal templates for each format. To customize further, generate a JSON report and transform it:

```yaml
- uses: mr-version/report@v1
  id: report
  with:
    output-format: 'json'
    changed-only: false

- name: Custom Report
  run: |
    echo '${{ steps.report.outputs.report-content }}' | python generate_custom_report.py
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