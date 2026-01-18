#!/usr/bin/env node

/**
 * LeetCode Problem Scraper
 *
 * Fetches full problem descriptions, examples, constraints, and hints from LeetCode
 * Stores them locally for offline use
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CACHE_ROOT = path.join(__dirname, 'problem-cache');
const LEETCODE_GRAPHQL_URL = 'https://leetcode.com/graphql';
const NEETCODE_BASE_URL = 'https://neetcode.io/solutions';

// Ensure cache directory exists
if (!fs.existsSync(CACHE_ROOT)) {
  fs.mkdirSync(CACHE_ROOT, { recursive: true });
}

/**
 * Fetch problem details from LeetCode using GraphQL
 */
async function fetchProblemDetails(titleSlug) {
  const query = `
    query questionData($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        title
        titleSlug
        content
        difficulty
        likes
        dislikes
        categoryTitle
        topicTags {
          name
        }
        codeSnippets {
          lang
          langSlug
          code
        }
        sampleTestCase
        exampleTestcases
        hints
        similarQuestions
      }
    }
  `;

  try {
    const response = await axios.post(
      LEETCODE_GRAPHQL_URL,
      {
        query,
        variables: { titleSlug }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      }
    );

    return response.data.data.question;
  } catch (error) {
    console.error(`Error fetching ${titleSlug}:`, error.message);
    return null;
  }
}

/**
 * Extract problem slug from LeetCode URL
 */
function extractSlug(url) {
  const match = url.match(/leetcode\.com\/problems\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Fetch top-voted Python solution from LeetCode discussion
 * Used as fallback when NeetCode doesn't have the problem
 */
async function fetchLeetCodeDiscussionSolution(questionId, titleSlug) {
  const query = `
    query questionTopicsList($questionId: String!, $orderBy: TopicSortingOption, $skip: Int!, $first: Int!, $tags: [String!]) {
      questionTopicsList(questionId: $questionId, orderBy: $orderBy, skip: $skip, first: $first, tags: $tags) {
        edges {
          node {
            id
            title
            post {
              content
            }
          }
        }
      }
    }
  `;

  try {
    const response = await axios.post(LEETCODE_GRAPHQL_URL, {
      query,
      variables: {
        questionId: String(questionId),
        orderBy: 'most_votes',
        skip: 0,
        first: 3,  // Get top 3 voted Python solutions
        tags: ['python3']
      }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const edges = response.data?.data?.questionTopicsList?.edges;
    if (!edges || edges.length === 0) {
      return null;
    }

    const solutions = [];

    for (const edge of edges) {
      const content = edge.node?.post?.content;
      if (!content) continue;

      // Split by Python3 code blocks
      const parts = content.split('```Python3');

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        const endIdx = part.indexOf('```');
        if (endIdx > 0) {
          let code = part.substring(0, endIdx);
          // Remove the [] marker at the start
          code = code.replace(/^\s*\[\]\s*\\n/, '');
          // Convert literal \n to actual newlines
          code = code.replace(/\\n/g, '\n').trim();

          if ((code.includes('class Solution') || code.includes('def ')) && code.length > 30) {
            solutions.push(code);
          }
        }
      }

      // Also try lowercase python/python3
      const lowerParts = content.split(/```(?:python3?|Python)/i);
      for (let i = 1; i < lowerParts.length; i++) {
        const part = lowerParts[i];
        const endIdx = part.indexOf('```');
        if (endIdx > 0) {
          let code = part.substring(0, endIdx);
          code = code.replace(/^\s*\[\]\s*\\n/, '');
          code = code.replace(/\\n/g, '\n').trim();

          if ((code.includes('class Solution') || code.includes('def ')) && code.length > 30) {
            solutions.push(code);
          }
        }
      }
    }

    // Deduplicate
    const uniqueSolutions = [...new Set(solutions)];

    if (uniqueSolutions.length === 0) {
      return null;
    }

    return {
      url: `https://leetcode.com/problems/${titleSlug}/solutions/?languageTags=python3`,
      solutions: uniqueSolutions,
      optimalSolution: uniqueSolutions[0],  // First one is most voted
      source: 'leetcode_discussion',
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error(`Error fetching LeetCode discussion for ${titleSlug}:`, error.message);
    return null;
  }
}

/**
 * Fetch Python solution(s) from NeetCode.io
 */
async function fetchNeetCodeSolution(titleSlug) {
  const url = `${NEETCODE_BASE_URL}/${titleSlug}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    const solutions = [];

    // NeetCode embeds code in various formats - try multiple patterns
    // Pattern 1: Look for Python class Solution blocks (handles escaped newlines)
    const classPattern = /class Solution:[\s\S]*?(?=class Solution:|```[a-z]|$)/g;
    let classMatches = html.match(classPattern);

    if (classMatches) {
      for (let code of classMatches) {
        // Clean up the code - convert escaped newlines to real ones
        code = code
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '    ')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .trim();

        // Stop at common boundaries (next code block, etc.)
        const endMarkers = ['```', '## ', '### ', '**Time', '**Space'];
        for (const marker of endMarkers) {
          const idx = code.indexOf(marker);
          if (idx > 0) {
            code = code.substring(0, idx).trim();
          }
        }

        // Only keep if it looks like valid Python
        if (code.includes('def ') && code.length > 50 && code.length < 5000) {
          solutions.push(code);
        }
      }
    }

    // Deduplicate solutions
    const uniqueSolutions = [...new Set(solutions)];

    if (uniqueSolutions.length === 0) {
      return null;
    }

    return {
      url: url,
      solutions: uniqueSolutions,
      // The last solution is typically the optimal one on NeetCode
      optimalSolution: uniqueSolutions[uniqueSolutions.length - 1],
      fetchedAt: new Date().toISOString()
    };
  } catch (error) {
    // NeetCode might not have this problem - that's ok
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error(`Error fetching NeetCode solution for ${titleSlug}:`, error.message);
    return null;
  }
}

/**
 * Parse HTML content to plain text
 */
function htmlToText(html) {
  if (!html) return '';

  // Remove HTML tags and clean up
  return html
    .replace(/<pre>/g, '\n```\n')
    .replace(/<\/pre>/g, '\n```\n')
    .replace(/<code>/g, '`')
    .replace(/<\/code>/g, '`')
    .replace(/<strong>/g, '**')
    .replace(/<\/strong>/g, '**')
    .replace(/<em>/g, '*')
    .replace(/<\/em>/g, '*')
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Save problem data to cache (organized by company)
 */
function saveProblemCache(titleSlug, data, company = 'general') {
  const companyDir = path.join(CACHE_ROOT, company);
  if (!fs.existsSync(companyDir)) {
    fs.mkdirSync(companyDir, { recursive: true });
  }
  const filePath = path.join(companyDir, `${titleSlug}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Load problem from cache (check all company folders)
 */
function loadProblemCache(titleSlug) {
  // First check if cache root exists
  if (!fs.existsSync(CACHE_ROOT)) {
    return null;
  }

  // Check all company folders
  const companies = fs.readdirSync(CACHE_ROOT).filter(f =>
    fs.statSync(path.join(CACHE_ROOT, f)).isDirectory()
  );

  for (const company of companies) {
    const filePath = path.join(CACHE_ROOT, company, `${titleSlug}.json`);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  }

  return null;
}

/**
 * Fetch and cache a problem
 */
async function fetchAndCacheProblem(url, company = 'general') {
  const slug = extractSlug(url);
  if (!slug) {
    console.error('Invalid LeetCode URL:', url);
    return null;
  }

  // Check cache first
  const cached = loadProblemCache(slug);
  if (cached) {
    console.log(`✓ Using cached data for: ${slug}`);
    return cached;
  }

  // Fetch from LeetCode
  console.log(`Fetching: ${slug}...`);
  const data = await fetchProblemDetails(slug);

  if (data) {
    // Try to fetch NeetCode solution first
    console.log(`Fetching NeetCode solution for: ${slug}...`);
    let solution = await fetchNeetCodeSolution(slug);

    // If NeetCode doesn't have it, try LeetCode discussion as fallback
    if (!solution && data.questionId) {
      console.log(`NeetCode not found, trying LeetCode discussion for: ${slug}...`);
      solution = await fetchLeetCodeDiscussionSolution(data.questionId, slug);
    }

    // Process the data
    const processed = {
      id: data.questionId,
      title: data.title,
      slug: data.titleSlug,
      difficulty: data.difficulty,
      description: htmlToText(data.content),
      topics: data.topicTags.map(t => t.name),
      hints: data.hints || [],
      codeSnippets: data.codeSnippets,
      sampleTestCase: data.sampleTestCase,
      exampleTestcases: data.exampleTestcases,
      similarQuestions: data.similarQuestions,
      neetcodeSolution: solution,
      cached_at: new Date().toISOString(),
      company: company
    };

    const solutionSource = solution ? (solution.source === 'leetcode_discussion' ? 'LeetCode discussion' : 'NeetCode') : null;
    saveProblemCache(slug, processed, company);
    console.log(`✓ Cached: ${slug}${solutionSource ? ` (with ${solutionSource} solution)` : ''}`);

    // Rate limiting - be nice to servers
    await new Promise(resolve => setTimeout(resolve, 1000));

    return processed;
  }

  return null;
}

/**
 * Get all cached problems (optionally filtered by company)
 */
function getAllCachedProblems(company = null) {
  const problems = [];

  if (!fs.existsSync(CACHE_ROOT)) {
    return problems;
  }

  const companies = company ? [company] : fs.readdirSync(CACHE_ROOT).filter(f =>
    fs.statSync(path.join(CACHE_ROOT, f)).isDirectory()
  );

  for (const comp of companies) {
    const companyDir = path.join(CACHE_ROOT, comp);
    if (!fs.existsSync(companyDir)) continue;

    const files = fs.readdirSync(companyDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(companyDir, file), 'utf-8'));
        problems.push(data);
      } catch (err) {
        console.error(`Error reading ${file}:`, err.message);
      }
    }
  }

  return problems;
}

/**
 * Get list of cached companies
 */
function getCachedCompanies() {
  if (!fs.existsSync(CACHE_ROOT)) {
    return [];
  }

  return fs.readdirSync(CACHE_ROOT).filter(f =>
    fs.statSync(path.join(CACHE_ROOT, f)).isDirectory()
  ).sort();
}

/**
 * Fetch solution for an already-cached problem (on demand)
 * Tries NeetCode first, then falls back to LeetCode discussion
 * Updates the cache with the solution data
 */
async function fetchNeetCodeForCached(titleSlug) {
  const cached = loadProblemCache(titleSlug);
  if (!cached) {
    return null;
  }

  // If already has solution, return it
  if (cached.neetcodeSolution) {
    return cached.neetcodeSolution;
  }

  // Try NeetCode first
  console.log(`Fetching NeetCode solution for cached problem: ${titleSlug}...`);
  let solution = await fetchNeetCodeSolution(titleSlug);

  // If NeetCode doesn't have it, try LeetCode discussion as fallback
  if (!solution && cached.id) {
    console.log(`NeetCode not found, trying LeetCode discussion for: ${titleSlug}...`);
    solution = await fetchLeetCodeDiscussionSolution(cached.id, titleSlug);
  }

  if (solution) {
    // Update the cache with the solution
    cached.neetcodeSolution = solution;
    saveProblemCache(titleSlug, cached, cached.company || 'general');
    const source = solution.source === 'leetcode_discussion' ? 'LeetCode discussion' : 'NeetCode';
    console.log(`✓ Updated cache with ${source} solution: ${titleSlug}`);
  }

  return solution;
}

// Export functions for use in other modules
module.exports = {
  fetchAndCacheProblem,
  loadProblemCache,
  extractSlug,
  htmlToText,
  getAllCachedProblems,
  getCachedCompanies,
  fetchNeetCodeSolution,
  fetchNeetCodeForCached
};

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node scraper.js <leetcode-url>');
    console.log('Example: node scraper.js https://leetcode.com/problems/two-sum');
    process.exit(1);
  }

  const url = args[0];
  fetchAndCacheProblem(url).then(data => {
    if (data) {
      console.log('\n=== Problem Data ===');
      console.log(`Title: ${data.title}`);
      console.log(`Difficulty: ${data.difficulty}`);
      console.log(`Topics: ${data.topics.join(', ')}`);
      console.log(`\nDescription:\n${data.description.substring(0, 200)}...`);
    }
  });
}
