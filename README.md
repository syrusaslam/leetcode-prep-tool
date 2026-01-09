# Interview Prep - LeetCode Problem Generator

A command-line tool that generates random LeetCode problems filtered by company and difficulty level. Includes offline caching, interactive browsing, and Python templates with real test cases. Perfect for interview preparation.

## Features

- **500+ companies** with hiring patterns
- **Filter by difficulty** (Easy, Medium, Hard)
- **Filter by problem recency** (All, Thirty Days, Three Months, Six Months, More Than Six Months)
- **Mass caching** with frequency-based limiting
- **Interactive browsing** of problems (online or cached)
- **Full problem descriptions** with examples, constraints, and hints
- **Real test cases** from LeetCode (15+ tests per problem)
- **Python templates** ready to code in your IDE
- **Works completely offline** after initial caching
- **All data stored locally** - no cloud dependencies

## Installation

### Option 1: Local Installation (Recommended for Development)

```bash
cd /path/to/interview_prep
npm install
```

Make the CLI globally available:
```bash
npm link
```

Then use it from anywhere:
```bash
interview-prep --company Amazon --difficulty MEDIUM
```

### Option 2: Run Directly with Node

```bash
cd /path/to/interview_prep
node cli.js list
```

## Usage

### List all available companies

```bash
node cli.js list
```

### Cache problems for a company

Download and cache all problems for a company:
```bash
node cli.js cache Amazon
```

**With frequency limit** - only cache top 50 most frequently asked problems:
```bash
node cli.js cache Amazon --limit 50
```

### Browse online problems

Interactively select from company problems:
```bash
node cli.js browse Amazon
```

With difficulty filter:
```bash
node cli.js browse Amazon --difficulty MEDIUM
```

### Browse cached problems (offline)

Browse all cached problems:
```bash
node cli.js browse-cached
```

Browse cached problems from a specific company:
```bash
node cli.js browse-cached Amazon
```

With difficulty filter:
```bash
node cli.js browse-cached Amazon --difficulty EASY
```

### Generate a random problem

```bash
node cli.js --company Amazon --difficulty MEDIUM
```

### Generate a problem for a specific time period

Available periods: `All`, `Thirty Days`, `Three Months`, `Six Months`, `More Than Six Months`

```bash
node cli.js --company Amazon --difficulty EASY --period "Thirty Days"
```

### Save template to a specific directory

```bash
node cli.js --company Amazon -o ~/Desktop
```

## Command Options

### Global Options
```
-c, --company        Company name                                           [string]
-d, --difficulty     Difficulty level (Easy, Medium, Hard)                 [string]
-p, --period         Time period (All, Thirty Days, Three Months,
                     Six Months, More Than Six Months)           [default: "All"]
-o, --output         Output directory for generated problems    [default: "."]
-f, --fetch          Fetch full problem details from LeetCode    [boolean] [default: true]
--offline            Use only cached data                      [boolean] [default: false]
```

### Cache Command Options
```
cache <company>      Download and cache problems for a company
  -l, --limit        Limit to top N most frequently asked problems  [number]
```

### Browse Command Options
```
browse <company>     Browse and select problems interactively
-d, --difficulty     Filter by difficulty                                 [string]
```

### Browse-Cached Command Options
```
browse-cached [company]  Browse cached problems offline
-d, --difficulty         Filter by difficulty                           [string]
```

## Examples

### Cache top problems from a company
```bash
# Cache all Amazon problems
node cli.js cache Amazon

# Cache only top 50 most frequently asked Amazon problems
node cli.js cache Amazon --limit 50
```

### Browse and select a problem interactively
```bash
# Browse all Microsoft problems
node cli.js browse Microsoft

# Browse and select from Medium difficulty Apple problems
node cli.js browse Apple --difficulty MEDIUM
```

### Browse cached problems offline
```bash
# See all cached problems
node cli.js browse-cached

# See cached Google problems only
node cli.js browse-cached Google

# See cached Easy problems from any company
node cli.js browse-cached --difficulty Easy
```

### Generate a random problem
```bash
node cli.js --company Amazon --difficulty MEDIUM
```

**Output:**
```
==================================================
Two Sum
==================================================

Difficulty:    Medium
Company:       Amazon
Topics:        Array, Hash Table
Acceptance:    47.3%

✓ Template created: two_sum
ℹ Full problem description and tests included!
```

### See all available companies
```bash
node cli.js list
```

## Workflow

### First Time Setup

1. **Cache problems from your target companies:**
   ```bash
   node cli.js cache Amazon --limit 100
   node cli.js cache Google --limit 100
   ```

### Daily Practice

1. **Browse and select a problem:**
   ```bash
   node cli.js browse-cached Amazon
   ```
   or generate a random one:
   ```bash
   node cli.js --company Amazon --difficulty MEDIUM
   ```

2. **Open the generated folder in your IDE:**
   ```bash
   code two_sum/
   ```
   The folder contains:
   - `README.md` - Full problem description, constraints, hints
   - `solution.py` - Python skeleton with 15+ real test cases

3. **Implement your solution** in `solution.py`

4. **Run and test locally:**
   ```bash
   cd two_sum/
   python3 solution.py
   ```

5. **Verify test cases pass** and iterate on your solution

6. **Generate another problem** and repeat!

## File Structure

```
interview_prep/
├── cli.js                    # Main CLI tool
├── scraper.js                # LeetCode fetcher & cacher
├── package.json              # Node dependencies
├── README.md                 # This file
├── .gitignore                # Git ignore rules
├── problem-cache/            # Cached problems (auto-generated)
│   ├── Amazon/
│   │   ├── two-sum.json
│   │   ├── group-anagrams.json
│   │   └── ...
│   ├── Google/
│   └── ...
├── two_sum/                  # Generated problem folder
│   ├── README.md             # Full problem description & hints
│   └── solution.py           # Python skeleton + test cases
├── company-wise-leetcode/    # Problem dataset
│   └── leetcode-company-wise-problems/
│       ├── Amazon/
│       │   ├── 1. Thirty Days.csv
│       │   ├── 2. Three Months.csv
│       │   └── ...
│       ├── Apple/
│       ├── Google/
│       └── ... (500+ companies)
└── ... (more generated problem folders)
```

## Data Source

This project uses the **LeetCode Company-Wise Problems** dataset:

📊 **Dataset:** [liquidslr/leetcode-company-wise-problems](https://github.com/liquidslr/leetcode-company-wise-problems)

The dataset contains:
- **500+ companies** with hiring patterns
- **Problem frequency** (how often each problem appears in interviews)
- **Acceptance rates** (percentage of users who solve it correctly)
- **Problem topics** (data structures and algorithms used)
- **Direct links** to LeetCode problems

**Credits:** Thanks to [liquidslr](https://github.com/liquidslr) for compiling and maintaining this comprehensive dataset!

## Tips for Using This Tool

### 1. Cache Problems in Bulk First
When you have internet, cache problems from your target companies:
```bash
# Cache top 100 from each company
node cli.js cache Amazon --limit 100
node cli.js cache Google --limit 100
node cli.js cache Microsoft --limit 100
```

This lets you practice offline for weeks without downloading more data.

### 2. Focus on High-Frequency Problems
The frequency limit uses the dataset's frequency field - problems asked more often appear first:
```bash
# Cache only the 50 most frequently asked problems
node cli.js cache Amazon --limit 50
```

### 3. Practice by Difficulty
Start easy, then progress:
```bash
# Warm up with Easy
node cli.js browse-cached Amazon --difficulty Easy

# Practice Medium
node cli.js browse-cached Amazon --difficulty Medium

# Challenge with Hard
node cli.js browse-cached Amazon --difficulty Hard
```

### 4. Mix Companies and Difficulties
Practice different patterns across companies:
```bash
node cli.js browse-cached --difficulty Medium
```

### 5. Track Your Progress
Organize solved problems:
```bash
mkdir -p ~/solved/{easy,medium,hard}
node cli.js --company Amazon --difficulty Easy -o ~/solved/easy
```

### 6. Perfect for Travel
Since this tool works completely offline with cached data, you can use it:
- On planes (interview prep without WiFi)
- In trains/buses
- Anywhere without internet
- Restricted network environments

## Offline Capability

This tool supports **complete offline operation**:
- **Cached problems** work 100% offline after initial download
- **Local LeetCode dataset** stored in `/company-wise-leetcode` directory
- **Real test cases** included - no need to look them up online
- **Full descriptions** with hints - no external links required
- **No API calls** needed when browsing cached problems
- **Perfect for travel** - works on planes, trains, remote areas

Use the `--offline` flag to prevent accidental API calls:
```bash
node cli.js browse-cached Amazon --offline
```

## Troubleshooting

### Company not found
Make sure to check the exact company name:
```bash
# List all companies
node cli.js list | grep -i amazon
```

Company names are case-insensitive, so these all work:
```bash
node cli.js --company amazon
node cli.js --company AMAZON
node cli.js --company Amazon
```

### No cached problems found
You need to cache problems first:
```bash
node cli.js cache Amazon --limit 50
```

Or use the browse command to fetch and cache on-demand:
```bash
node cli.js browse Amazon
```

### Period not recognized
Available periods must match exactly (case-sensitive):
- `All`
- `Thirty Days`
- `Three Months`
- `Six Months`
- `More Than Six Months`

```bash
# ✓ Correct
node cli.js --company Amazon --period "Thirty Days"

# ✗ Wrong
node cli.js --company Amazon --period "30 Days"
node cli.js --company Amazon --period "30days"
```

### Generating too slow
Use --limit when caching to avoid downloading all problems:
```bash
# Fast - only 50 problems
node cli.js cache Amazon --limit 50

# Slow - all problems
node cli.js cache Amazon
```

### Problem folder already exists
The CLI will overwrite existing problem folders. If you want to preserve your solutions, move or backup the folder first.

## Dependencies

- **Node.js 14+** - JavaScript runtime
- **yargs** - Command-line argument parsing
- **csv-parser** - CSV file parsing for problem datasets
- **prompts** - Interactive CLI prompts for browsing
- **axios** - HTTP client for fetching from LeetCode
- **cheerio** - HTML parsing (optional, for future enhancements)

Install with:
```bash
npm install
```

## Future Enhancements

Potential improvements:
- VSCode extension integration
- Problem tracking and statistics dashboard
- Custom problem filtering (by topics, companies, etc.)
- Solution submission integration with LeetCode
- Spaced repetition scheduling for optimal learning
- Progress tracking and analytics
- Solution comparison and best practices

## License

MIT

## Contributing

Feel free to improve this tool! Some ideas:
- Add more detailed problem descriptions
- Create integrations with code testing frameworks
- Add progress tracking
- Implement VSCode extension

---

