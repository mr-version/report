import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as github from '@actions/github'
import * as fs from 'fs'
import * as path from 'path'

interface VersionReport {
  repository: string
  branch: string
  branchType: string
  globalVersion?: string
  projects: ProjectReport[]
  summary: {
    totalProjects: number
    changedProjects: number
    testProjects: number
    packableProjects: number
  }
}

interface ProjectVersion {
  version: string
  semVer?: {
    major: number
    minor: number
    patch: number
    preRelease?: string
    buildMetadata?: string
  }
  versionChanged: boolean
  changeReason?: string
  commitSha?: string
  commitDate?: string
  commitMessage?: string
  branchType?: string
  branchName?: string
  commitHeight?: number
  previousVersion?: string  // Added for tracking previous version
}

interface ProjectReport {
  name: string
  path: string
  fullPath: string
  version: ProjectVersion
  dependencies?: {
    direct: Array<{ name: string; version: string }>
    all: Array<{ name: string; version: string }>
  }
  isTestProject: boolean
  isPackable: boolean
}

async function run(): Promise<void> {
  try {
    const repositoryPath = core.getInput('repository-path') || '.'
    const projectDir = core.getInput('project-dir')
    const outputFormat = core.getInput('output-format') || 'markdown'
    const outputFile = core.getInput('output-file')
    const branch = core.getInput('branch')
    const tagPrefix = core.getInput('tag-prefix') || 'v'
    const includeCommits = core.getBooleanInput('include-commits')
    const includeDependencies = core.getBooleanInput('include-dependencies')
    const showChangedOnly = core.getBooleanInput('changed-only')
    const postToPr = core.getBooleanInput('post-to-pr')
    const updateExistingComment = core.getBooleanInput('update-existing-comment')
    const commentHeader = core.getInput('comment-header') || '## 📊 Version Report'
    const token = core.getInput('token')

    core.info('Generating version report...')

    // Generate the report using mr-version CLI
    const report = await generateReport({
      repositoryPath,
      projectDir,
      outputFormat: 'json', // Always get JSON first, then format it
      branch,
      tagPrefix,
      includeCommits,
      includeDependencies
    })

    // Format the report content
    const formattedContent = formatReport(report, outputFormat, showChangedOnly)

    // Save to file if specified
    let reportFilePath: string | undefined
    if (outputFile) {
      reportFilePath = path.resolve(repositoryPath, outputFile)
      await fs.promises.writeFile(reportFilePath, formattedContent)
      core.info(`Report saved to: ${reportFilePath}`)
    }

    // Post to PR if requested
    if (postToPr && github.context.eventName === 'pull_request') {
      await postReportToPr({
        content: formattedContent,
        header: commentHeader,
        updateExisting: updateExistingComment,
        token
      })
    }

    // Add to job summary
    if (outputFormat === 'markdown') {
      await core.summary.addRaw(formattedContent).write()
    } else if (outputFormat === 'json') {
      // For JSON output, create a better formatted summary
      await core.summary
        .addHeading('📊 Version Report')
        .addDetails('📋 JSON Report Data', `\`\`\`json\n${formattedContent}\n\`\`\``)
        .write()
    } else {
      await core.summary
        .addHeading('📊 Version Report')
        .addCodeBlock(formattedContent, 'text')
        .write()
    }

    // Set outputs
    core.setOutput('report-content', formattedContent)
    core.setOutput('report-file', reportFilePath || '')
    core.setOutput('projects-count', report.summary.totalProjects.toString())
    core.setOutput('changed-projects-count', report.summary.changedProjects.toString())

    core.info(`✅ Report generated: ${report.summary.totalProjects} projects, ${report.summary.changedProjects} with changes`)

  } catch (error) {
    core.setFailed(`Failed to generate version report: ${error instanceof Error ? error.message : String(error)}`)
  }
}

interface GenerateReportOptions {
  repositoryPath: string
  projectDir?: string
  outputFormat: string
  branch?: string
  tagPrefix: string
  includeCommits: boolean
  includeDependencies: boolean
}

async function generateReport(options: GenerateReportOptions): Promise<VersionReport> {
  const args = [
    'report',
    '--repo', options.repositoryPath,
    '--output', 'json'
  ]

  if (options.projectDir) {
    args.push('--project-dir', options.projectDir)
  }

  if (options.branch) {
    args.push('--branch', options.branch)
  }

  if (options.tagPrefix) {
    args.push('--tag-prefix', options.tagPrefix)
  }

  args.push('--include-commits', options.includeCommits.toString())
  args.push('--include-dependencies', options.includeDependencies.toString())
  args.push('--include-test-projects', 'true')
  args.push('--include-non-packable', 'true')

  const output = await exec.getExecOutput('mr-version', args, {
    silent: true,
    ignoreReturnCode: true
  })

  if (output.exitCode !== 0) {
    throw new Error(`mr-version report failed: ${output.stderr}`)
  }

  try {
    const rawOutput = JSON.parse(output.stdout)
    
    // Handle the actual CLI output format
    let report: VersionReport
    if (rawOutput.projects && Array.isArray(rawOutput.projects)) {
      const allProjects = rawOutput.projects.map((p: any) => {
        const versionObj = typeof p.version === 'object' && p.version !== null && 'version' in p.version
          ? p.version
          : {
              version: p.version || 'Unknown',
              versionChanged: p.versionChanged || false,
              changeReason: p.changeReason,
              commitSha: p.commitSha,
              commitDate: p.commitDate,
              commitMessage: p.commitMessage,
              branchType: p.branchType,
              branchName: p.branchName,
              commitHeight: p.commitHeight
            }
        
        return {
          name: p.name || p.project || 'Unknown',
          path: p.path || 'Unknown',
          fullPath: p.fullPath || path.join(options.repositoryPath, p.path || ''),
          version: versionObj,
          isTestProject: p.isTestProject || false,
          isPackable: p.isPackable || false,
          dependencies: p.dependencies || {
            direct: [],
            all: []
          }
        }
      })
      
      report = {
        repository: options.repositoryPath,
        branch: 'main', // Will be updated below
        branchType: 'Main',
        projects: allProjects,
        summary: {
          totalProjects: allProjects.length,
          changedProjects: allProjects.filter((p: ProjectReport) => p.version.versionChanged).length,
          testProjects: allProjects.filter((p: ProjectReport) => p.isTestProject).length,
          packableProjects: allProjects.filter((p: ProjectReport) => p.isPackable).length
        }
      }
    } else {
      // Fallback to expected format
      report = rawOutput as VersionReport
      
      // Keep all projects - no filtering
      if (!report.summary) {
        report.summary = {
          totalProjects: report.projects.length,
          changedProjects: report.projects.filter(p => p.version?.versionChanged).length,
          testProjects: report.projects.filter(p => p.isTestProject).length,
          packableProjects: report.projects.filter(p => p.isPackable).length
        }
      }
    }
    
    // Enhance with previous versions
    await enhanceWithPreviousVersions(report, options.repositoryPath, options.tagPrefix)

    return report
  } catch (error) {
    throw new Error(`Failed to parse report output: ${error}`)
  }
}

function formatReport(report: VersionReport, format: string, showChangedOnly: boolean): string {
  switch (format.toLowerCase()) {
    case 'json':
      return JSON.stringify(report, null, 2)
    case 'csv':
      return formatAsCsv(report, showChangedOnly)
    case 'text':
      return formatAsText(report, showChangedOnly)
    case 'markdown':
    default:
      return formatAsMarkdown(report, showChangedOnly)
  }
}

function formatAsMarkdown(report: VersionReport, showChangedOnly: boolean): string {
  const lines: string[] = []
  
  lines.push('## 📊 MonoRepo Version Report')
  lines.push('')
  lines.push(`**Repository:** \`${report.repository}\``)
  lines.push(`**Branch:** \`${report.branch}\` (${report.branchType})`)
  if (report.globalVersion) {
    lines.push(`**Global Version:** \`${report.globalVersion}\``)
  }
  lines.push('')

  // Summary
  lines.push('### 📈 Summary')
  lines.push('')
  lines.push(`| Metric | Count |`)
  lines.push(`|--------|-------|`)
  lines.push(`| Total Projects | ${report.summary.totalProjects} |`)
  lines.push(`| Changed Projects | ${report.summary.changedProjects} |`)
  lines.push(`| Test Projects | ${report.summary.testProjects} |`)
  lines.push(`| Packable Projects | ${report.summary.packableProjects} |`)
  lines.push('')

  // Changed projects
  const changedProjects = report.projects.filter(p => p.version?.versionChanged)
  if (changedProjects.length > 0) {
    lines.push('### 🔄 Changed Projects')
    lines.push('')
    lines.push('| Project | Previous Version | New Version | Reason |')
    lines.push('|---------|------------------|-------------|--------|')
    for (const project of changedProjects) {
      const previousVersion = project.version.previousVersion || 'N/A'
      const newVersion = project.version.version || 'Unknown'
      const reason = project.version.changeReason || 'N/A'
      lines.push(`| **${project.name}** | \`${previousVersion}\` | \`${newVersion}\` | ${reason} |`)
    }
    lines.push('')
  }

  // Projects table - show changed only or all projects based on option
  const projectsToShow = showChangedOnly 
    ? report.projects.filter(p => p.version?.versionChanged)
    : report.projects
    
  if (projectsToShow.length > 0) {
    const tableTitle = showChangedOnly ? '### 🔄 Changed Projects Only' : '### 📦 All Projects'
    lines.push(tableTitle)
    lines.push('')
    lines.push('| Project | Version | Type | Path |')
    lines.push('|---------|---------|------|------|')
    for (const project of projectsToShow) {
      const type = project.isTestProject ? 'Test' : (project.isPackable ? 'Package' : 'Other')
      const version = project.version?.version || 'Unknown'
      const status = project.version?.versionChanged ? ' 🔄' : ''
      lines.push(`| **${project.name}**${status} | \`${version}\` | ${type} | \`${project.path}\` |`)
    }
    lines.push('')
  }

  // Dependencies (if included and available)
  const projectsWithDeps = report.projects.filter(p => p.dependencies?.direct && p.dependencies.direct.length > 0)
  if (projectsWithDeps.length > 0) {
    lines.push('### 🔗 Dependencies')
    lines.push('')
    for (const project of projectsWithDeps) {
      lines.push(`#### ${project.name}`)
      lines.push('')
      if (project.dependencies?.direct) {
        for (const dep of project.dependencies.direct) {
          lines.push(`- ${dep.name} (${dep.version || 'Unknown'})`)
        }
      }
      lines.push('')
    }
  }

  return lines.join('\n')
}

function formatAsText(report: VersionReport, showChangedOnly: boolean): string {
  const lines: string[] = []
  
  lines.push('=== MonoRepo Version Report ===')
  lines.push(`Repository: ${report.repository}`)
  lines.push(`Branch: ${report.branch} (${report.branchType})`)
  if (report.globalVersion) {
    lines.push(`Global Version: ${report.globalVersion}`)
  }
  lines.push(`Total Projects: ${report.summary.totalProjects}`)
  lines.push(`Changed Projects: ${report.summary.changedProjects}`)
  lines.push('')

  const projectsToShow = showChangedOnly 
    ? report.projects.filter(p => p.version?.versionChanged)
    : report.projects
  
  for (const project of projectsToShow) {
    const status = project.version?.versionChanged ? 'CHANGED' : 'UNCHANGED'
    const version = project.version?.version || 'Unknown'
    lines.push(`[${status}] ${project.name}: ${version}`)
    lines.push(`  Path: ${project.path}`)
    if (project.version?.versionChanged && project.version?.previousVersion) {
      lines.push(`  Previous: ${project.version.previousVersion}`)
    }
    if (project.version?.changeReason) {
      lines.push(`  Reason: ${project.version.changeReason}`)
    }
    if (project.dependencies?.direct && project.dependencies.direct.length > 0) {
      lines.push(`  Dependencies: ${project.dependencies.direct.map(d => d.name).join(', ')}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

function formatAsCsv(report: VersionReport, showChangedOnly: boolean): string {
  const lines: string[] = []
  
  // Header
  lines.push('Project,Version,Previous Version,Changed,Reason,Type,Path,Dependencies')
  
  // Data rows
  const projectsToShow = showChangedOnly 
    ? report.projects.filter(p => p.version?.versionChanged)
    : report.projects
  
  for (const project of projectsToShow) {
    const type = project.isTestProject ? 'Test' : (project.isPackable ? 'Package' : 'Other')
    const version = project.version?.version || 'Unknown'
    const previousVersion = project.version?.previousVersion || ''
    const versionChanged = project.version?.versionChanged || false
    const changeReason = project.version?.changeReason || ''
    const dependencies = project.dependencies?.direct?.map(d => d.name).join(';') || ''
    lines.push(`"${project.name}","${version}","${previousVersion}","${versionChanged}","${changeReason}","${type}","${project.path}","${dependencies}"`)
  }

  return lines.join('\n')
}

interface PostToPrOptions {
  content: string
  header: string
  updateExisting: boolean
  token: string
}

async function postReportToPr(options: PostToPrOptions): Promise<void> {
  const octokit = github.getOctokit(options.token)
  const context = github.context

  if (context.eventName !== 'pull_request') {
    core.warning('Cannot post to PR: not a pull request event')
    return
  }

  const prNumber = context.payload.pull_request?.number
  if (!prNumber) {
    core.warning('Cannot post to PR: no PR number found')
    return
  }

  const commentBody = `${options.header}\n\n${options.content}`

  try {
    if (options.updateExisting) {
      // Try to find existing comment
      const comments = await octokit.rest.issues.listComments({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber
      })

      const existingComment = comments.data.find(comment => 
        comment.body?.includes(options.header)
      )

      if (existingComment) {
        // Update existing comment
        await octokit.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: existingComment.id,
          body: commentBody
        })
        core.info(`Updated existing PR comment #${existingComment.id}`)
        return
      }
    }

    // Create new comment
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body: commentBody
    })
    core.info(`Posted new PR comment to #${prNumber}`)

  } catch (error) {
    core.warning(`Failed to post PR comment: ${error}`)
  }
}

async function enhanceWithPreviousVersions(report: VersionReport, repoPath: string, tagPrefix: string): Promise<void> {
  for (const project of report.projects) {
    if (project.version?.versionChanged) {
      // Try to find the previous version from git tags
      const projectName = project.name
      const currentVersion = project.version.version
      
      try {
        // Get all tags for this project
        const tagsOutput = await exec.getExecOutput('git', 
          ['tag', '-l', `${tagPrefix}${projectName}/*`, '--sort=-version:refname'],
          { cwd: repoPath, silent: true, ignoreReturnCode: true }
        )
        
        if (tagsOutput.exitCode === 0 && tagsOutput.stdout) {
          const tags = tagsOutput.stdout.trim().split('\n').filter(t => t)
          
          // Find the most recent tag that's not the current version
          for (const tag of tags) {
            const tagVersion = tag.replace(`${tagPrefix}${projectName}/`, '')
            if (tagVersion !== currentVersion) {
              project.version.previousVersion = tagVersion
              break
            }
          }
        }
        
        // If no project-specific tag found, try global tags
        if (!project.version.previousVersion) {
          const globalTagsOutput = await exec.getExecOutput('git',
            ['tag', '-l', `${tagPrefix}*`, '--sort=-version:refname'],
            { cwd: repoPath, silent: true, ignoreReturnCode: true }
          )
          
          if (globalTagsOutput.exitCode === 0 && globalTagsOutput.stdout) {
            const tags = globalTagsOutput.stdout.trim().split('\n').filter(t => t)
            for (const tag of tags) {
              // Skip project-specific tags
              if (!tag.includes('/')) {
                const tagVersion = tag.replace(tagPrefix, '')
                if (tagVersion !== currentVersion) {
                  project.version.previousVersion = tagVersion
                  break
                }
              }
            }
          }
        }
      } catch (error) {
        // Ignore errors in finding previous version
      }
    }
  }
}

// Run the action
if (require.main === module) {
  run()
}

export { run }