#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const yargsModule = require('yargs/yargs');
const hideBin = require('yargs/helpers').hideBin;
const prompts = require('prompts');
const { fetchAndCacheProblem, loadProblemCache, extractSlug, getAllCachedProblems, getCachedCompanies, fetchNeetCodeForCached } = require('./scraper');

// Color utilities
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  underline: '\x1b[4m',
};

const log = {
  info: (msg) => console.log(`${c.cyan}ℹ${c.reset} ${msg}`),
  success: (msg) => console.log(`${c.green}✓${c.reset} ${msg}`),
  error: (msg) => console.log(`${c.red}✗${c.reset} ${msg}`),
  warn: (msg) => console.log(`${c.yellow}⚠${c.reset} ${msg}`),
};

const yargs = yargsModule(hideBin(process.argv));
const DATA_DIR = path.join(__dirname, 'company-wise-leetcode', 'leetcode-company-wise-problems');

// Get list of companies
function getCompanies() {
  return fs.readdirSync(DATA_DIR).filter(file => {
    if (file.startsWith('.')) return false;
    return fs.statSync(path.join(DATA_DIR, file)).isDirectory();
  }).sort();
}

// Parse CSV file for a company
function loadProblems(company, timePeriod = 'All') {
  return new Promise((resolve, reject) => {
    const problems = [];
    const companyDir = path.join(DATA_DIR, company);

    const files = fs.readdirSync(companyDir).filter(f => f.endsWith('.csv'));
    const matchingFile = files.find(f => {
      const cleanedName = f.replace(/^[\d.]+\s+/, '').replace('.csv', '');
      return cleanedName === timePeriod;
    });

    if (!matchingFile) {
      reject(new Error(`Time period not found: ${timePeriod}`));
      return;
    }

    const filePath = path.join(companyDir, matchingFile);

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        problems.push(row);
      })
      .on('end', () => {
        resolve(problems);
      })
      .on('error', reject);
  });
}

// Get random problem from list
function getRandomProblem(problems, difficulty = null) {
  let filtered = problems;

  if (difficulty) {
    filtered = problems.filter(p => p.Difficulty === difficulty);
  }

  if (filtered.length === 0) {
    throw new Error(`No problems found with filters`);
  }

  return filtered[Math.floor(Math.random() * filtered.length)];
}

// Get difficulty color
function getDifficultyColor(difficulty) {
  switch(difficulty) {
    case 'EASY': case 'Easy': return c.green;
    case 'MEDIUM': case 'Medium': return c.yellow;
    case 'HARD': case 'Hard': return c.red;
    default: return c.reset;
  }
}

// Handle list command
function handleListCommand() {
  const companies = getCompanies();
  console.log(`\n${c.blue}${c.bold}Available Companies:${c.reset}`);
  companies.forEach((comp, i) => {
    console.log(`  ${c.cyan}${i + 1}${c.reset}. ${comp}`);
  });
  console.log();
  process.exit(0);
}

// Handle cache command - mass download problems for a company
async function handleCacheCommand(company, limit = null) {
  const companies = getCompanies();
  const matchedCompany = companies.find(c => c.toLowerCase() === company.toLowerCase());

  if (!matchedCompany) {
    log.error(`Company not found: ${company}`);
    return;
  }

  console.log(`\n${c.blue}${c.bold}Caching problems for ${matchedCompany}${c.reset}`);
  if (limit) {
    console.log(`${c.yellow}Limiting to top ${limit} most frequently asked problems${c.reset}\n`);
  } else {
    console.log();
  }

  let problems = await loadProblems(matchedCompany, 'All');

  // Sort by frequency (descending) - higher frequency = more commonly asked
  problems.sort((a, b) => {
    const freqA = parseInt(a.Frequency) || 0;
    const freqB = parseInt(b.Frequency) || 0;
    return freqB - freqA;
  });

  // Apply limit if specified
  if (limit && limit > 0) {
    problems = problems.slice(0, limit);
  }

  const total = problems.length;
  let cached = 0;
  let skipped = 0;

  for (let i = 0; i < problems.length; i++) {
    const problem = problems[i];
    const slug = extractSlug(problem.Link);

    if (!slug) continue;

    // Check if already cached
    if (loadProblemCache(slug)) {
      skipped++;
      process.stdout.write(`\r${c.gray}Progress: ${i + 1}/${total} (${cached} cached, ${skipped} skipped)${c.reset}`);
      continue;
    }

    // Fetch and cache - pass company name
    await fetchAndCacheProblem(problem.Link, matchedCompany);
    cached++;
    process.stdout.write(`\r${c.cyan}Progress: ${i + 1}/${total} (${cached} cached, ${skipped} skipped)${c.reset}`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log(`\n\n${c.green}✓${c.reset} Cached ${cached} new problems for ${matchedCompany}`);
  console.log(`${c.gray}${skipped} problems were already cached${c.reset}\n`);
}

// Handle cache-solutions command - fetch NeetCode solutions for cached problems
async function handleCacheSolutionsCommand(company = null) {
  const cachedProblems = getAllCachedProblems(company);

  if (cachedProblems.length === 0) {
    if (company) {
      log.warn(`No cached problems found for ${company}. Run "node cli.js cache ${company}" first.`);
    } else {
      log.warn('No cached problems found. Run "node cli.js cache <company>" first.');
    }
    return;
  }

  console.log(`\n${c.blue}${c.bold}Fetching NeetCode solutions${c.reset}`);
  if (company) {
    console.log(`Company: ${c.cyan}${company}${c.reset}`);
  }
  console.log(`Found ${cachedProblems.length} cached problems\n`);

  let fetched = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < cachedProblems.length; i++) {
    const problem = cachedProblems[i];

    // Skip if already has NeetCode solution
    if (problem.neetcodeSolution) {
      skipped++;
      process.stdout.write(`\r${c.gray}Progress: ${i + 1}/${cachedProblems.length} (${fetched} fetched, ${skipped} skipped, ${failed} not found)${c.reset}`);
      continue;
    }

    // Fetch NeetCode solution
    const solution = await fetchNeetCodeForCached(problem.slug);
    if (solution) {
      fetched++;
    } else {
      failed++;
    }
    process.stdout.write(`\r${c.cyan}Progress: ${i + 1}/${cachedProblems.length} (${fetched} fetched, ${skipped} skipped, ${failed} not found)${c.reset}`);

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n\n${c.green}✓${c.reset} Fetched ${fetched} NeetCode solutions`);
  console.log(`${c.gray}${skipped} already had solutions, ${failed} not available on NeetCode${c.reset}\n`);
}

// Handle browse command - interactive problem selection
async function handleBrowseCommand(company, difficulty = null) {
  const companies = getCompanies();
  const matchedCompany = companies.find(c => c.toLowerCase() === company.toLowerCase());

  if (!matchedCompany) {
    log.error(`Company not found: ${company}`);
    return null;
  }

  const problems = await loadProblems(matchedCompany, 'All');
  let filtered = problems;

  if (difficulty) {
    filtered = problems.filter(p => p.Difficulty === difficulty);
  }

  // Sort by difficulty and title
  filtered.sort((a, b) => {
    const diffOrder = { 'EASY': 1, 'MEDIUM': 2, 'HARD': 3 };
    const diffCompare = diffOrder[a.Difficulty] - diffOrder[b.Difficulty];
    return diffCompare !== 0 ? diffCompare : a.Title.localeCompare(b.Title);
  });

  const choices = filtered.map((p, i) => ({
    title: `[${getDifficultyColor(p.Difficulty)}${p.Difficulty}${c.reset}] ${p.Title} (${p.Topics})`,
    value: i,
    description: `Acceptance: ${p['Acceptance Rate']}`
  }));

  console.log(`\n${c.blue}${c.bold}Browse ${matchedCompany} Problems${c.reset}\n`);
  console.log(`Found ${filtered.length} problems${difficulty ? ` (${difficulty} only)` : ''}\n`);

  const response = await prompts({
    type: 'select',
    name: 'problem',
    message: 'Select a problem:',
    choices: choices,
    initial: 0
  });

  if (response.problem === undefined) {
    return null;
  }

  return filtered[response.problem];
}

// Handle browse-cached command - browse offline cached problems
async function handleBrowseCachedCommand(company = null, difficulty = null) {
  const cachedProblems = getAllCachedProblems(company);

  if (cachedProblems.length === 0) {
    if (company) {
      log.warn(`No cached problems found for ${company}. Run "node cli.js cache ${company}" first.`);
    } else {
      log.warn('No cached problems found. Run "node cli.js cache <company>" first.');
    }
    return null;
  }

  let filtered = cachedProblems;

  if (difficulty) {
    filtered = cachedProblems.filter(p => p.difficulty === difficulty);
  }

  // Sort by company, then difficulty, then title
  filtered.sort((a, b) => {
    // First by company
    const companyA = a.company || 'general';
    const companyB = b.company || 'general';
    const companyCompare = companyA.localeCompare(companyB);
    if (companyCompare !== 0) return companyCompare;

    // Then by difficulty
    const diffOrder = { 'Easy': 1, 'Medium': 2, 'Hard': 3 };
    const diffCompare = diffOrder[a.difficulty] - diffOrder[b.difficulty];
    if (diffCompare !== 0) return diffCompare;

    // Finally by title
    return a.title.localeCompare(b.title);
  });

  const choices = filtered.map((p, i) => ({
    title: `[${getDifficultyColor(p.difficulty)}${p.difficulty}${c.reset}] ${p.title}`,
    value: i,
    description: `${p.company || 'general'} | ${p.topics.slice(0, 3).join(', ')}`
  }));

  console.log(`\n${c.blue}${c.bold}Browse Cached Problems (Offline)${c.reset}\n`);
  if (company) {
    console.log(`Company: ${c.cyan}${company}${c.reset}`);
  }
  console.log(`Found ${filtered.length} cached problems${difficulty ? ` (${difficulty} only)` : ''}\n`);

  const response = await prompts({
    type: 'select',
    name: 'problem',
    message: 'Select a problem:',
    choices: choices,
    initial: 0
  });

  if (response.problem === undefined) {
    return null;
  }

  return filtered[response.problem];
}

// Extract function name from Python code snippet
function extractPythonFunctionName(codeSnippet) {
  if (!codeSnippet) return 'solution';

  // Match Python function name patterns
  const patterns = [
    /def\s+(\w+)\s*\(/,  // def twoSum(
  ];

  for (const pattern of patterns) {
    const match = codeSnippet.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return 'solution';
}

// Parse test cases from LeetCode data
function parseTestCases(problemData) {
  if (!problemData.exampleTestcases) return [];

  const lines = problemData.exampleTestcases.split('\n').filter(l => l.trim());
  const testCases = [];

  // Parse based on code snippet to understand parameter count
  const pythonCode = problemData.codeSnippets.find(s => s.langSlug === 'python3' || s.langSlug === 'python');
  if (!pythonCode) return [];

  // Count parameters in function signature
  const funcMatch = pythonCode.code.match(/def\s+\w+\s*\(self,\s*([^)]+)\)/);
  if (!funcMatch) return [];

  const params = funcMatch[1].split(',').map(p => p.trim().split(':')[0].trim());
  const paramCount = params.length;

  // Group lines into test cases based on parameter count
  for (let i = 0; i < lines.length; i += paramCount) {
    if (i + paramCount <= lines.length) {
      const inputs = lines.slice(i, i + paramCount);
      testCases.push({
        params: params,
        inputs: inputs
      });
    }
  }

  return testCases;
}

// Generate Python test cases with real data
function generatePythonTestCases(problemData, functionName) {
  let testCode = '';

  const testCases = parseTestCases(problemData);

  if (testCases.length > 0) {
    testCode += `# Test Cases from LeetCode\n`;
    testCode += `# Run: python3 solution.py\n\n`;

    testCases.forEach((tc, index) => {
      const args = tc.inputs.join(', ');
      testCode += `# Test ${index + 1}\n`;
      testCode += `print(f"Test ${index + 1}: {${functionName}(${args})}")\n\n`;
    });

    // Add slots for more test cases
    for (let i = testCases.length + 1; i <= 15; i++) {
      if (i <= 10) {
        testCode += `# Test ${i} (Add your edge case)\n`;
        testCode += `# print(f"Test ${i}: {${functionName}(...)}")\n\n`;
      }
    }
  } else {
    // Fallback if we can't parse
    testCode += `# Test Cases - Based on problem examples\n`;
    testCode += `# Copy the test cases from README.md\n\n`;

    for (let i = 1; i <= 15; i++) {
      if (i <= 3) {
        testCode += `print(f"Test ${i} (Example): {${functionName}(# copy from README)}")\n`;
      } else if (i <= 10) {
        testCode += `# print(f"Test ${i} (Edge case): {${functionName}(...)}")\n`;
      } else {
        testCode += `# print(f"Test ${i} (Additional): {${functionName}(...)}")\n`;
      }
    }
  }

  return testCode;
}

// Generate answer.py content from NeetCode solution data
function generateAnswerContent(problemData, slug) {
  const neetcodeUrl = `https://neetcode.io/solutions/${slug}`;
  const leetcodeDiscussUrl = `https://leetcode.com/problems/${slug}/discuss/`;

  let content = `# ============================================================================
# SOLUTION - ${problemData.title}
# ============================================================================
# Source: NeetCode.io
# Video/Explanation: ${neetcodeUrl}
# LeetCode Discussion: ${leetcodeDiscussUrl}
# ============================================================================

`;

  if (problemData.neetcodeSolution && problemData.neetcodeSolution.optimalSolution) {
    content += `# Optimal Solution from NeetCode
${problemData.neetcodeSolution.optimalSolution}
`;

    // If there are multiple solutions, include all of them
    if (problemData.neetcodeSolution.solutions && problemData.neetcodeSolution.solutions.length > 1) {
      content += `

# ============================================================================
# Alternative Solutions
# ============================================================================
`;
      problemData.neetcodeSolution.solutions.forEach((sol, index) => {
        if (sol !== problemData.neetcodeSolution.optimalSolution) {
          content += `
# --- Approach ${index + 1} ---
${sol}
`;
        }
      });
    }
  } else {
    // No NeetCode solution available - provide helpful links
    content += `# No automated solution available for this problem.
#
# Check these resources for solutions:
# 1. NeetCode: ${neetcodeUrl}
# 2. LeetCode Discussion: ${leetcodeDiscussUrl}
#
# Tips:
# - The LeetCode discussion section often has well-explained solutions
# - Search YouTube for "${problemData.title} leetcode" for video explanations
`;
  }

  return content;
}

// Create Python template file with full problem data
async function createPythonTemplateFile(problem, outputDir = '.', fetchOnline = true) {
  const fileName = problem.Title.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, '');

  // Create problem folder
  const problemDir = path.join(outputDir, fileName);
  if (!fs.existsSync(problemDir)) {
    fs.mkdirSync(problemDir, { recursive: true });
  }

  const pythonFilePath = path.join(problemDir, 'solution.py');
  const readmeFilePath = path.join(problemDir, 'README.md');
  const answerFilePath = path.join(problemDir, 'answer.py');

  // Try to get full problem data
  const slug = extractSlug(problem.Link);
  let problemData = null;

  if (slug) {
    // Check cache first
    problemData = loadProblemCache(slug);

    // Fetch online if not cached and online mode
    if (!problemData && fetchOnline) {
      log.info('Fetching full problem details from LeetCode...');
      problemData = await fetchAndCacheProblem(problem.Link);
    }

    // If we have cached data but no NeetCode solution, try to fetch it
    if (problemData && !problemData.neetcodeSolution && fetchOnline) {
      log.info('Fetching NeetCode solution...');
      await fetchNeetCodeForCached(slug);
      // Reload the cache to get the updated data
      problemData = loadProblemCache(slug);
    }
  }

  // Generate separate README.md and solution.py files
  let readmeContent = '';
  let pythonContent = '';

  if (problemData) {
    // Full offline template with complete problem description
    const pythonCode = problemData.codeSnippets.find(s => s.langSlug === 'python3' || s.langSlug === 'python');
    const functionName = pythonCode ? extractPythonFunctionName(pythonCode.code) : 'solution';

    // README.md with problem description
    readmeContent = `# ${problemData.title}

**Difficulty:** ${problemData.difficulty}
**LeetCode Link:** ${problem.Link || `https://leetcode.com/problems/${problemData.slug}`}

## Problem Description

${problemData.description}

## Constraints

See problem description above for constraints.

## Hints

${problemData.hints.map((h, i) => `${i + 1}. ${h}`).join('\n') || 'No hints available'}

## Topics

${problemData.topics.join(', ')}

## Solution

See \`solution.py\` for the implementation.

## Testing

Run the solution:
\`\`\`bash
python3 solution.py
\`\`\`
`;

    // solution.py with code skeleton and REAL test cases
    pythonContent = `${pythonCode ? pythonCode.code : '# TODO: Implement your solution here\ndef solution():\n    pass'}

# ============================================================================
# Test Cases - Run this file with: python3 solution.py
# ============================================================================

${generatePythonTestCases(problemData, functionName)}
`;
  } else {
    // Basic template (fallback)
    log.warn('Using basic template (full problem data not available)');

    readmeContent = `# ${problem.Title}

**Difficulty:** ${problem.Difficulty}
**Topics:** ${problem.Topics}
**Acceptance Rate:** ${problem['Acceptance Rate']}
**LeetCode Link:** ${problem.Link}

## Problem Description

Visit the LeetCode link above to see the full problem description.

Note: Run with --fetch to download full problem description.

## Solution

See \`solution.py\` for the implementation.
`;

    pythonContent = `# TODO: Implement your solution here
def solution():
    pass

# Test Cases (add your own based on the problem)
print(f"Test 1: {solution(# your input)}")
print(f"Test 2: {solution(# your input)}")
print(f"Test 3: {solution(# your input)}")

# Run: python3 solution.py
`;
  }

  fs.writeFileSync(readmeFilePath, readmeContent);
  fs.writeFileSync(pythonFilePath, pythonContent);

  // Generate answer.py with NeetCode solution
  if (problemData && slug) {
    const answerContent = generateAnswerContent(problemData, slug);
    fs.writeFileSync(answerFilePath, answerContent);
  } else if (slug) {
    // Basic answer file with just links
    const basicAnswerContent = `# ============================================================================
# SOLUTION - ${problem.Title}
# ============================================================================
# Source: NeetCode.io
# Video/Explanation: https://neetcode.io/solutions/${slug}
# LeetCode Discussion: https://leetcode.com/problems/${slug}/discuss/
# ============================================================================

# No automated solution available.
#
# Check these resources for solutions:
# 1. NeetCode: https://neetcode.io/solutions/${slug}
# 2. LeetCode Discussion: https://leetcode.com/problems/${slug}/discuss/
#
# Tips:
# - The LeetCode discussion section often has well-explained solutions
# - Search YouTube for "${problem.Title} leetcode" for video explanations
`;
    fs.writeFileSync(answerFilePath, basicAnswerContent);
  }

  return problemDir;
}

// Main CLI
async function main() {
  const argv = await yargs
    .command('list', 'List all available companies', {}, handleListCommand)
    .command('cache <company>', 'Download and cache all problems for a company', (yargs) => {
      yargs.option('limit', {
        alias: 'l',
        description: 'Limit to top N most frequently asked problems',
        type: 'number',
      });
    }, async (argv) => {
      await handleCacheCommand(argv.company, argv.limit);
      process.exit(0);
    })
    .command('browse <company>', 'Browse and select problems interactively', {}, async () => {
      // Handled in main
    })
    .command('browse-cached [company]', 'Browse cached problems (offline)', {}, async () => {
      // Handled in main
    })
    .command('cache-solutions [company]', 'Fetch NeetCode solutions for cached problems', {}, async (argv) => {
      await handleCacheSolutionsCommand(argv.company);
      process.exit(0);
    })
    .option('company', {
      alias: 'c',
      description: 'Company name',
      type: 'string',
    })
    .option('difficulty', {
      alias: 'd',
      description: 'Difficulty level (EASY, MEDIUM, HARD)',
      type: 'string',
      choices: ['EASY', 'MEDIUM', 'HARD'],
    })
    .option('period', {
      alias: 'p',
      description: 'Time period (All, Thirty Days, Three Months, Six Months, More Than Six Months)',
      type: 'string',
      default: 'All',
    })
    .option('output', {
      alias: 'o',
      description: 'Output directory for template file',
      type: 'string',
      default: '.',
    })
    .option('fetch', {
      alias: 'f',
      description: 'Fetch full problem details from LeetCode (requires internet)',
      type: 'boolean',
      default: true,
    })
    .option('offline', {
      description: 'Offline mode - use only cached data',
      type: 'boolean',
      default: false,
    })
    .help()
    .parse();

  try {
    // Handle browse-cached command
    if (argv._[0] === 'browse-cached') {
      const company = argv._[1] || null;
      const problemData = await handleBrowseCachedCommand(company, argv.difficulty);
      if (!problemData) {
        log.warn('No problem selected');
        return;
      }

      // Create a mock problem object from cached data
      const problem = {
        Title: problemData.title,
        Link: `https://leetcode.com/problems/${problemData.slug}`,
        Difficulty: problemData.difficulty,
        Topics: problemData.topics.join(', ')
      };

      const filePath = await createPythonTemplateFile(problem, argv.output, false);

      console.log();
      log.success(`Template created: ${c.bold}${filePath}${c.reset}`);
      log.info('Using cached data (offline mode)');
      console.log();
      return;
    }

    // Handle browse command
    if (argv._[0] === 'browse') {
      const company = argv._[1] || argv.company;
      if (!company) {
        log.error('Please specify a company to browse');
        console.log(`${c.gray}Example: node cli.js browse Amazon${c.reset}\n`);
        return;
      }

      const problem = await handleBrowseCommand(company, argv.difficulty);
      if (!problem) {
        log.warn('No problem selected');
        return;
      }

      // Generate template for selected problem
      const fetchOnline = argv.fetch && !argv.offline;
      const filePath = await createPythonTemplateFile(problem, argv.output, fetchOnline);

      console.log();
      log.success(`Template created: ${c.bold}${filePath}${c.reset}`);
      log.info('Full problem description included!');
      console.log();
      return;
    }

    // Regular random problem generation
    if (!argv.company) {
      console.log(`${c.yellow}Please specify a company with --company or -c${c.reset}\n`);
      console.log(`${c.gray}Example:${c.reset}`);
      console.log(`${c.gray}  node cli.js --company Amazon --difficulty MEDIUM${c.reset}\n`);
      console.log(`${c.gray}Commands:${c.reset}`);
      console.log(`${c.gray}  node cli.js list                - List all companies${c.reset}`);
      console.log(`${c.gray}  node cli.js browse Amazon       - Browse Amazon problems${c.reset}`);
      console.log(`${c.gray}  node cli.js browse-cached       - Browse cached (offline)${c.reset}`);
      console.log(`${c.gray}  node cli.js cache Amazon        - Cache all Amazon problems${c.reset}`);
      console.log(`${c.gray}  node cli.js cache-solutions     - Fetch NeetCode solutions for cached problems${c.reset}\n`);
      return;
    }

    const companies = getCompanies();
    const company = companies.find(c => c.toLowerCase() === argv.company.toLowerCase());

    if (!company) {
      log.error(`Company not found: ${argv.company}`);
      const similar = companies.filter(c => c.toLowerCase().includes(argv.company.toLowerCase())).slice(0, 5);
      if (similar.length > 0) {
        console.log(`${c.yellow}Did you mean one of these?${c.reset}`);
        similar.forEach(comp => console.log(`  - ${comp}`));
      }
      console.log();
      return;
    }

    // Load problems
    const problems = await loadProblems(company, argv.period);
    const problem = getRandomProblem(problems, argv.difficulty);

    // Display problem
    const border = `${'═'.repeat(50)}`;
    console.log(`\n${c.blue}${border}${c.reset}`);
    console.log(`${c.bold}${problem.Title}${c.reset}`);
    console.log(`${c.blue}${border}${c.reset}\n`);

    console.log(`${c.cyan}Difficulty:${c.reset}    ${getDifficultyColor(problem.Difficulty)}${problem.Difficulty}${c.reset}`);
    console.log(`${c.cyan}Company:${c.reset}       ${company}`);
    // console.log(`${c.cyan}Topics:${c.reset}        ${problem.Topics}`);
    console.log(`${c.cyan}Acceptance:${c.reset}    ${problem['Acceptance Rate']}`);

    // Create template file
    const fetchOnline = argv.fetch && !argv.offline;
    const filePath = await createPythonTemplateFile(problem, argv.output, fetchOnline);
    log.success(`Template created: ${c.bold}${filePath}${c.reset}`);

    if (fetchOnline) {
      log.info('Full problem description and tests included!');
    } else {
      log.warn('Offline mode: Using cached data only');
      log.info('Run with --fetch to download full problem details');
    }

    console.log();

  } catch (err) {
    log.error(err.message);
    console.log();
    process.exit(1);
  }
}

main();
