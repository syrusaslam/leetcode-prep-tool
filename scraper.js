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
      cached_at: new Date().toISOString(),
      company: company
    };

    saveProblemCache(slug, processed, company);
    console.log(`✓ Cached: ${slug}`);

    // Rate limiting - be nice to LeetCode servers
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

// Export functions for use in other modules
module.exports = {
  fetchAndCacheProblem,
  loadProblemCache,
  extractSlug,
  htmlToText,
  getAllCachedProblems,
  getCachedCompanies
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
