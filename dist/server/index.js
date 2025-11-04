var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/utils/cache.ts
var GitSeeCache = class {
  constructor(ttl = 300) {
    this.cache = /* @__PURE__ */ new Map();
    this.ttl = ttl * 1e3;
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }
  set(key, data) {
    this.cache.set(key, {
      data,
      expires: Date.now() + this.ttl
    });
  }
  clear() {
    this.cache.clear();
  }
};

// server/resources/base.ts
var BaseResource = class {
  constructor(cache) {
    this.cache = cache;
  }
  getCacheKey(owner, repo, type) {
    return `${type}:${owner}/${repo}`;
  }
  async getCached(owner, repo, type) {
    const cacheKey = this.getCacheKey(owner, repo, type);
    return this.cache.get(cacheKey);
  }
  setCached(owner, repo, type, data) {
    const cacheKey = this.getCacheKey(owner, repo, type);
    this.cache.set(cacheKey, data);
  }
};

// server/github/base.ts
import { Octokit } from "@octokit/rest";
var BaseAnalyzer = class {
  constructor(config = {}) {
    this.config = {
      defaultLimit: 50,
      defaultDays: 30,
      ...config
    };
    this.octokit = new Octokit({
      auth: config.githubToken
    });
  }
  async paginate(request, limit) {
    const actualLimit = limit || this.config.defaultLimit || 50;
    if (actualLimit <= 100) {
      const response = await request({ per_page: actualLimit });
      return response.data;
    }
    const results = [];
    let page = 1;
    const perPage = 100;
    while (results.length < actualLimit) {
      const remaining = actualLimit - results.length;
      const requestSize = Math.min(perPage, remaining);
      const response = await request({
        per_page: requestSize,
        page
      });
      if (response.data.length === 0) break;
      results.push(...response.data);
      page++;
    }
    return results.slice(0, actualLimit);
  }
};

// server/github/repo-analyzer/commits.ts
var CommitAnalyzer = class extends BaseAnalyzer {
  // Internal method that returns raw commit data for other methods to use
  async getRecentCommitsRaw(owner, repo, options = {}) {
    const {
      days = this.config.defaultDays,
      limit = this.config.defaultLimit,
      author,
      since,
      until
    } = options;
    const sinceDate = since || (days ? new Date(Date.now() - days * 24 * 60 * 60 * 1e3).toISOString() : void 0);
    const commits = await this.paginate(
      (params) => this.octokit.rest.repos.listCommits({
        owner,
        repo,
        author,
        since: sinceDate,
        until,
        ...params
      }),
      limit
    );
    return commits;
  }
  // Internal method that returns raw commit data with files for other methods to use
  async getRecentCommitsWithFilesRaw(owner, repo, options = {}) {
    const commits = await this.getRecentCommitsRaw(owner, repo, options);
    const detailedCommits = await Promise.all(
      commits.map(async (commit) => {
        try {
          const detailedCommit = await this.octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: commit.sha
          });
          return {
            ...commit,
            files: detailedCommit.data.files || []
          };
        } catch (error) {
          console.warn(
            `Could not fetch files for commit ${commit.sha}:`,
            error
          );
          return commit;
        }
      })
    );
    return detailedCommits;
  }
  async getRecentCommits(owner, repo, options = {}) {
    const commits = await this.getRecentCommitsRaw(owner, repo, options);
    let output = `
=== Recent Commits for ${owner}/${repo} ===

`;
    for (const commit of commits) {
      output += `\u{1F4DD} ${commit.commit.message.split("\n")[0]}
`;
      output += `   SHA: ${commit.sha.substring(0, 8)}
`;
      output += `   Author: ${commit.commit.author.name} (${commit.commit.author.email})
`;
      output += `   Date: ${new Date(commit.commit.author.date).toLocaleDateString()} ${new Date(commit.commit.author.date).toLocaleTimeString()}

`;
    }
    return output;
  }
  async getRecentCommitsWithFiles(owner, repo, options = {}) {
    const detailedCommits = await this.getRecentCommitsWithFilesRaw(owner, repo, options);
    let output = `
=== Recent Commits with Files for ${owner}/${repo} ===

`;
    for (const commit of detailedCommits) {
      output += `\u{1F4DD} Commit: ${commit.commit.message.split("\n")[0]}
`;
      output += `   SHA: ${commit.sha.substring(0, 8)}
`;
      output += `   Author: ${commit.commit.author.name} (${commit.commit.author.email})
`;
      output += `   Date: ${new Date(commit.commit.author.date).toLocaleDateString()} ${new Date(commit.commit.author.date).toLocaleTimeString()}
`;
      if (commit.files && commit.files.length > 0) {
        output += `
   \u{1F4C1} Files changed (${commit.files.length}):
`;
        commit.files.forEach((file, idx) => {
          const statusEmoji = {
            added: "\u2795",
            modified: "\u{1F4DD}",
            removed: "\u274C",
            renamed: "\u{1F504}",
            copied: "\u{1F4CB}",
            changed: "\u{1F527}",
            unchanged: "\u26AA"
          }[file.status] || "\u{1F4C4}";
          output += `     ${idx + 1}. ${statusEmoji} ${file.filename} (+${file.additions}/-${file.deletions})
`;
        });
      }
      output += "\n" + "=".repeat(80) + "\n\n";
    }
    return output;
  }
  async getContributorCommits(owner, repo, contributor, limit) {
    const commits = await this.getRecentCommitsWithFilesRaw(owner, repo, {
      author: contributor,
      limit: limit || 50
    });
    let output = `
=== Contributor Commits for ${contributor} in ${owner}/${repo} ===

`;
    for (const commit of commits) {
      output += `\u{1F4DD} Commit: ${commit.commit.message.split("\n")[0]}
`;
      output += `   SHA: ${commit.sha.substring(0, 8)}
`;
      output += `   Author: ${commit.commit.author.name} (${commit.commit.author.email})
`;
      output += `   Date: ${new Date(commit.commit.author.date).toLocaleDateString()} ${new Date(commit.commit.author.date).toLocaleTimeString()}
`;
      if (commit.commit.message.includes("\n")) {
        const fullMessage = commit.commit.message.split("\n").slice(1).join("\n").trim();
        if (fullMessage) {
          output += `   Full message: ${fullMessage.substring(0, 200)}${fullMessage.length > 200 ? "..." : ""}
`;
        }
      }
      if (commit.files && commit.files.length > 0) {
        output += `
   \u{1F4C1} Files changed (${commit.files.length}):
`;
        commit.files.forEach((file, idx) => {
          const statusEmoji = {
            added: "\u2795",
            modified: "\u{1F4DD}",
            removed: "\u274C",
            renamed: "\u{1F504}",
            copied: "\u{1F4CB}",
            changed: "\u{1F527}",
            unchanged: "\u26AA"
          }[file.status] || "\u{1F4C4}";
          output += `     ${idx + 1}. ${statusEmoji} ${file.filename} (+${file.additions}/-${file.deletions})
`;
        });
      }
      output += "\n" + "=".repeat(80) + "\n\n";
    }
    return output;
  }
  async getContributorFiles(owner, repo, contributor, limit) {
    const commits = await this.getRecentCommitsWithFilesRaw(owner, repo, {
      author: contributor,
      limit: limit || 100
      // Get more commits to analyze file patterns
    });
    const fileMap = /* @__PURE__ */ new Map();
    commits.forEach((commit) => {
      if (commit.files) {
        commit.files.forEach((file) => {
          const existing = fileMap.get(file.filename);
          if (!existing || commit.commit.author.date > existing.lastModified) {
            fileMap.set(file.filename, {
              count: (existing?.count || 0) + 1,
              lastModified: commit.commit.author.date
            });
          }
        });
      }
    });
    const files = Array.from(fileMap.entries()).map(([filename, data]) => ({
      filename,
      modifications: data.count,
      lastModified: data.lastModified
    })).sort((a, b) => b.modifications - a.modifications);
    return limit ? files.slice(0, limit) : files;
  }
};

// server/github/repo-analyzer/pull-requests.ts
var PullRequestAnalyzer = class extends BaseAnalyzer {
  async getRecentPRs(owner, repo, options = {}) {
    const {
      days = options.days === null ? null : options.days || this.config.defaultDays,
      limit = this.config.defaultLimit,
      state = "all",
      author
    } = options;
    const prs = await this.paginate(
      (params) => this.octokit.rest.pulls.list({
        owner,
        repo,
        state,
        sort: "updated",
        direction: "desc",
        ...author && { creator: author },
        // Use GitHub API's creator parameter
        ...params
      }),
      limit
    );
    let filteredPRs = prs;
    if (days !== null && days !== void 0) {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1e3);
      filteredPRs = filteredPRs.filter(
        (pr) => new Date(pr.updated_at) > cutoffDate
      );
    }
    return filteredPRs;
  }
  async getContributorPRs(owner, repo, contributor, limit) {
    const prs = await this.getRecentPRs(owner, repo, {
      author: contributor,
      limit: limit || 50,
      days: null
      // Get all PRs by this contributor
    });
    const enhancedPRs = await Promise.all(
      prs.map(async (pr) => {
        try {
          const [commentsResponse, reviewsResponse, commitsResponse] = await Promise.all([
            // Get issue comments
            this.octokit.rest.issues.listComments({
              owner,
              repo,
              issue_number: pr.number
            }),
            // Get reviews
            this.octokit.rest.pulls.listReviews({
              owner,
              repo,
              pull_number: pr.number
            }),
            // Get commits
            this.octokit.rest.pulls.listCommits({
              owner,
              repo,
              pull_number: pr.number
            })
          ]);
          return {
            ...pr,
            comments: commentsResponse.data.filter(
              (comment) => !comment.user?.login.includes("[bot]")
            ),
            reviews: reviewsResponse.data.filter(
              (review) => !review.user?.login.includes("[bot]")
            ),
            commits: commitsResponse.data
          };
        } catch (error) {
          console.warn(`Could not fetch details for PR #${pr.number}:`, error);
          return {
            ...pr,
            comments: [],
            reviews: [],
            commits: []
          };
        }
      })
    );
    const finalPRs = limit ? enhancedPRs.slice(0, limit) : enhancedPRs;
    let output = `
=== Contributor PRs for ${contributor} in ${owner}/${repo} ===

`;
    for (const pr of finalPRs) {
      output += `\u{1F4DD} PR #${pr.number}: ${pr.title}
`;
      output += `   Branch: ${pr.head.ref} \u2192 ${pr.base.ref}
`;
      output += `   State: ${pr.state}${pr.merged_at ? " (merged)" : ""}
`;
      output += `   Created: ${new Date(pr.created_at).toLocaleDateString()}
`;
      if (pr.body) {
        output += `   Description: ${pr.body.substring(0, 200)}${pr.body.length > 200 ? "..." : ""}
`;
      }
      if (pr.comments && pr.comments.length > 0) {
        output += `
   \u{1F4AC} Comments (${pr.comments.length}):
`;
        pr.comments.forEach((comment, idx) => {
          output += `     ${idx + 1}. ${comment.user.login}: ${comment.body.substring(0, 150)}${comment.body.length > 150 ? "..." : ""}
`;
        });
      }
      if (pr.reviews && pr.reviews.length > 0) {
        output += `
   \u{1F440} Reviews (${pr.reviews.length}):
`;
        pr.reviews.forEach((review, idx) => {
          output += `     ${idx + 1}. ${review.user.login} (${review.state})
`;
          if (review.body) {
            output += `        ${review.body.substring(0, 150)}${review.body.length > 150 ? "..." : ""}
`;
          }
        });
      }
      if (pr.commits && pr.commits.length > 0) {
        output += `
   \u{1F4E6} Commits (${pr.commits.length}):
`;
        pr.commits.forEach((commit, idx) => {
          output += `     ${idx + 1}. ${commit.commit.message.split("\n")[0]} (${commit.commit.author.name})
`;
        });
      }
      output += "\n" + "=".repeat(80) + "\n\n";
    }
    return output;
  }
  async getContributorReviews(owner, repo, reviewer, limit) {
    const prs = await this.getRecentPRs(owner, repo, {
      limit: limit ? limit * 3 : 150
    });
    const reviewedPRs = [];
    for (const pr of prs) {
      try {
        const reviewsResponse = await this.octokit.rest.pulls.listReviews({
          owner,
          repo,
          pull_number: pr.number
        });
        const hasReviewByUser = reviewsResponse.data.some(
          (review) => review.user?.login.toLowerCase() === reviewer.toLowerCase() && !review.user?.login.includes("[bot]")
        );
        if (hasReviewByUser) {
          const [commentsResponse, commitsResponse] = await Promise.all([
            this.octokit.rest.issues.listComments({
              owner,
              repo,
              issue_number: pr.number
            }),
            this.octokit.rest.pulls.listCommits({
              owner,
              repo,
              pull_number: pr.number
            })
          ]);
          reviewedPRs.push({
            ...pr,
            comments: commentsResponse.data.filter(
              (comment) => !comment.user?.login.includes("[bot]")
            ),
            reviews: reviewsResponse.data.filter(
              (review) => !review.user?.login.includes("[bot]")
            ),
            commits: commitsResponse.data
          });
          if (limit && reviewedPRs.length >= limit) break;
        }
      } catch (error) {
        console.warn(`Could not fetch reviews for PR #${pr.number}:`, error);
      }
    }
    return reviewedPRs;
  }
  async getPRDetails(owner, repo, prNumber) {
    const [prResponse, reviewsResponse] = await Promise.all([
      this.octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber
      }),
      this.octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber
      })
    ]);
    return {
      ...prResponse.data,
      reviews: reviewsResponse.data
    };
  }
  async getRecentReviews(owner, repo, days) {
    const actualDays = days || this.config.defaultDays || 30;
    const prs = await this.getRecentPRs(owner, repo, {
      days: actualDays,
      state: "all",
      limit: 100
    });
    const allReviews = [];
    await Promise.all(
      prs.map(async (pr) => {
        try {
          const reviews = await this.octokit.rest.pulls.listReviews({
            owner,
            repo,
            pull_number: pr.number
          });
          const cutoffDate = new Date(
            Date.now() - actualDays * 24 * 60 * 60 * 1e3
          );
          const recentReviews = reviews.data.filter(
            (review) => review.submitted_at && new Date(review.submitted_at) > cutoffDate
          );
          allReviews.push(...recentReviews);
        } catch (error) {
          console.warn(`Could not fetch reviews for PR #${pr.number}:`, error);
        }
      })
    );
    return allReviews.sort((a, b) => {
      const aDate = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
      const bDate = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
      return bDate - aDate;
    });
  }
};

// server/github/repo-analyzer/repository.ts
var RepositoryAnalyzer = class extends BaseAnalyzer {
  async getRepoInfo(owner, repo) {
    try {
      const response = await this.octokit.rest.repos.get({ owner, repo });
      return response.data;
    } catch (error) {
      console.error(`\u{1F4A5} Error fetching repository info for ${owner}/${repo}:`, error.message);
      throw error;
    }
  }
  async getBranches(owner, repo, limit) {
    const branches = await this.paginate(
      (params) => this.octokit.rest.repos.listBranches({
        owner,
        repo,
        ...params
      }),
      limit
    );
    return branches;
  }
  async getContributors(owner, repo, limit) {
    const contributors = await this.paginate(
      (params) => this.octokit.rest.repos.listContributors({
        owner,
        repo,
        ...params
      }),
      limit || 50
    );
    return contributors;
  }
  async getRepoStats(owner, repo) {
    try {
      const repoResponse = await this.octokit.rest.repos.get({
        owner,
        repo
      });
      const repoData = repoResponse.data;
      const totalIssues = repoData.open_issues_count;
      const contributorsResponse = await this.octokit.rest.repos.listContributors({
        owner,
        repo,
        per_page: 100
        // Get up to 100 contributors
      });
      const totalCommits = contributorsResponse.data.reduce(
        (sum, contributor) => {
          return sum + (contributor.contributions || 0);
        },
        0
      );
      const createdDate = new Date(repoData.created_at);
      const now = /* @__PURE__ */ new Date();
      const ageInYears = Math.round(
        (now.getTime() - createdDate.getTime()) / (365.25 * 24 * 60 * 60 * 1e3) * 10
      ) / 10;
      const stats = {
        stars: repoData.stargazers_count,
        totalIssues,
        totalCommits,
        ageInYears
      };
      return stats;
    } catch (error) {
      console.error(`\u{1F4A5} Error fetching stats for ${owner}/${repo}:`, error.message);
      throw error;
    }
  }
};

// server/github/repo-analyzer/files.ts
var FileAnalyzer = class extends BaseAnalyzer {
  async getKeyFiles(owner, repo) {
    const candidateFiles = [
      // Package managers
      { name: "package.json", type: "package" },
      { name: "Cargo.toml", type: "package" },
      { name: "go.mod", type: "package" },
      { name: "setup.py", type: "package" },
      { name: "requirements.txt", type: "package" },
      { name: "pyproject.toml", type: "package" },
      { name: "pom.xml", type: "package" },
      { name: "build.gradle", type: "package" },
      { name: "build.gradle.kts", type: "package" },
      { name: "composer.json", type: "package" },
      { name: "Gemfile", type: "package" },
      { name: "pubspec.yaml", type: "package" },
      // Documentation
      { name: "README.md", type: "docs" },
      { name: "readme.md", type: "docs" },
      { name: "README.txt", type: "docs" },
      { name: "README.rst", type: "docs" },
      { name: "ARCHITECTURE.md", type: "docs" },
      { name: "CONTRIBUTING.md", type: "docs" },
      { name: "ROADMAP.md", type: "docs" },
      { name: "API.md", type: "docs" },
      { name: "CLAUDE.md", type: "docs" },
      { name: "AGENTS.md", type: "docs" },
      // Configuration files
      { name: ".env.example", type: "config" },
      // Database & schemas
      { name: "prisma/schema.prisma", type: "data" },
      { name: "schema.prisma", type: "data" },
      { name: "schema.sql", type: "data" },
      { name: "migrations.sql", type: "data" },
      { name: "seeds.sql", type: "data" },
      // Docker & deployment
      { name: "Dockerfile", type: "build" },
      { name: "docker-compose.yml", type: "build" },
      { name: "docker-compose.yaml", type: "build" },
      { name: "Makefile", type: "build" },
      { name: "justfile", type: "build" },
      { name: "CMakeLists.txt", type: "build" },
      // Other important files
      { name: "LICENSE", type: "other" },
      { name: "LICENSE.md", type: "other" },
      { name: "LICENSE.txt", type: "other" },
      { name: "CODEOWNERS", type: "other" },
      { name: ".github/CODEOWNERS", type: "other" }
    ];
    const foundFiles = [];
    const fileCheckPromises = candidateFiles.map(async (candidate) => {
      try {
        await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path: candidate.name
        });
        return {
          name: candidate.name,
          path: candidate.name,
          type: candidate.type
        };
      } catch (error) {
        if (error.status !== 404) {
          console.warn(`\u26A0\uFE0F Error checking ${candidate.name}:`, error.message);
        }
        return null;
      }
    });
    const results = await Promise.all(fileCheckPromises);
    foundFiles.push(...results.filter((file) => file !== null));
    return foundFiles;
  }
  async getFileContent(owner, repo, path4) {
    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: path4
      });
      if (Array.isArray(response.data)) {
        console.warn(`\u26A0\uFE0F Path ${path4} is a directory, not a file`);
        return null;
      }
      const fileData = response.data;
      if (fileData.type !== "file") {
        console.warn(`\u26A0\uFE0F Path ${path4} is not a file (type: ${fileData.type})`);
        return null;
      }
      let content = "";
      if (fileData.encoding === "base64" && fileData.content) {
        content = Buffer.from(fileData.content, "base64").toString("utf-8");
      } else if (fileData.content) {
        content = fileData.content;
      }
      const fileContent = {
        name: fileData.name,
        path: fileData.path,
        content,
        encoding: fileData.encoding || "utf-8",
        size: fileData.size || 0
      };
      return fileContent;
    } catch (error) {
      if (error.status === 404) {
        console.log(`\u274C File not found: ${path4}`);
        return null;
      }
      console.error(
        `\u{1F4A5} Error fetching file content for ${path4}:`,
        error.message
      );
      return null;
    }
  }
};

// server/github/repo-analyzer/icons.ts
var IconAnalyzer = class extends BaseAnalyzer {
  async getRepoIcon(owner, repo) {
    try {
      const rootContents = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path: ""
      });
      if (!Array.isArray(rootContents.data)) {
        return null;
      }
      const iconFiles = rootContents.data.filter((file) => {
        const name = file.name.toLowerCase();
        return name.includes("favicon") || name.includes("logo") || name.includes("icon") || name.startsWith("apple-touch") && name.includes("icon");
      });
      const subdirs = ["public", "assets", "static", "images", "img"];
      for (const subdir of subdirs) {
        const subdirExists = rootContents.data.find(
          (item) => item.name === subdir && item.type === "dir"
        );
        if (subdirExists) {
          try {
            const subdirContents = await this.octokit.rest.repos.getContent({
              owner,
              repo,
              path: subdir
            });
            if (Array.isArray(subdirContents.data)) {
              const subdirIcons = subdirContents.data.filter((file) => {
                const name = file.name.toLowerCase();
                return name.includes("favicon") || name.includes("logo") || name.includes("icon");
              });
              iconFiles.push(
                ...subdirIcons.map((f) => ({
                  ...f,
                  path: `${subdir}/${f.name}`
                }))
              );
            }
          } catch (error) {
            continue;
          }
        }
      }
      const sortedIcons = this.sortIconsByResolution(iconFiles);
      for (const iconFile of sortedIcons) {
        const filePath = iconFile.path || iconFile.name;
        try {
          const iconResponse = await this.octokit.rest.repos.getContent({
            owner,
            repo,
            path: filePath
          });
          if ("content" in iconResponse.data && iconResponse.data.content) {
            const iconData = `data:image/png;base64,${iconResponse.data.content}`;
            return iconData;
          }
        } catch (error) {
          continue;
        }
      }
      return null;
    } catch (error) {
      console.error(`\u{1F4A5} Error fetching repo icon for ${owner}/${repo}:`, error.message);
      return null;
    }
  }
  sortIconsByResolution(iconFiles) {
    return iconFiles.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const getResolution = (name) => {
        const match = name.match(/(\d+)x\d+/);
        if (match) return parseInt(match[1]);
        if (name.includes("512")) return 512;
        if (name.includes("256")) return 256;
        if (name.includes("192")) return 192;
        if (name.includes("180")) return 180;
        if (name.includes("apple-touch")) return 180;
        if (name.includes("android-chrome")) return 192;
        if (name === "favicon.ico") return 64;
        if (name.includes("logo")) return 100;
        return 50;
      };
      return getResolution(bName) - getResolution(aName);
    });
  }
};

// server/github/repo-analyzer/index.ts
var RepoAnalyzer = class extends BaseAnalyzer {
  constructor(config = {}) {
    super(config);
    this.commitAnalyzer = new CommitAnalyzer(config);
    this.prAnalyzer = new PullRequestAnalyzer(config);
    this.repoAnalyzer = new RepositoryAnalyzer(config);
    this.fileAnalyzer = new FileAnalyzer(config);
    this.iconAnalyzer = new IconAnalyzer(config);
  }
  // Commit methods
  async getRecentCommits(...args) {
    return this.commitAnalyzer.getRecentCommits(...args);
  }
  async getRecentCommitsWithFiles(...args) {
    return this.commitAnalyzer.getRecentCommitsWithFiles(...args);
  }
  async getContributorCommits(...args) {
    return this.commitAnalyzer.getContributorCommits(...args);
  }
  async getContributorFiles(...args) {
    return this.commitAnalyzer.getContributorFiles(...args);
  }
  // Pull Request methods
  async getRecentPRs(...args) {
    return this.prAnalyzer.getRecentPRs(...args);
  }
  async getContributorPRs(...args) {
    return this.prAnalyzer.getContributorPRs(...args);
  }
  async getContributorReviews(...args) {
    return this.prAnalyzer.getContributorReviews(...args);
  }
  async getPRDetails(...args) {
    return this.prAnalyzer.getPRDetails(...args);
  }
  async getRecentReviews(...args) {
    return this.prAnalyzer.getRecentReviews(...args);
  }
  // Repository methods
  async getRepoInfo(...args) {
    return this.repoAnalyzer.getRepoInfo(...args);
  }
  async getBranches(...args) {
    return this.repoAnalyzer.getBranches(...args);
  }
  async getContributors(...args) {
    return this.repoAnalyzer.getContributors(...args);
  }
  async getRepoStats(...args) {
    return this.repoAnalyzer.getRepoStats(...args);
  }
  // File methods
  async getKeyFiles(...args) {
    return this.fileAnalyzer.getKeyFiles(...args);
  }
  async getFileContent(...args) {
    return this.fileAnalyzer.getFileContent(...args);
  }
  // Icon methods
  async getRepoIcon(...args) {
    return this.iconAnalyzer.getRepoIcon(...args);
  }
};

// server/resources/contributors.ts
var ContributorsResource = class extends BaseResource {
  constructor(cache, githubToken) {
    super(cache);
    this.analyzer = new RepoAnalyzer({
      githubToken,
      defaultLimit: 50
    });
  }
  async getContributors(owner, repo) {
    const cached = await this.getCached(
      owner,
      repo,
      "contributors"
    );
    if (cached) {
      console.log(`\u{1F4BE} Cache hit for contributors: ${owner}/${repo}`);
      return cached;
    }
    console.log(`\u{1F4E1} Fetching contributors for ${owner}/${repo}...`);
    try {
      const contributors = await this.analyzer.getContributors(owner, repo, 50);
      console.log(`\u{1F465} Found ${contributors.length} contributors`);
      this.setCached(owner, repo, "contributors", contributors);
      return contributors;
    } catch (error) {
      console.error(
        `\u{1F4A5} Error fetching contributors for ${owner}/${repo}:`,
        error.message
      );
      if (error.status === 403 || error.message?.includes("rate limit")) {
        console.error(`\u23F1\uFE0F  RATE LIMIT HIT for contributors!`);
      }
      throw error;
    }
  }
};

// server/resources/icons.ts
var IconsResource = class extends BaseResource {
  constructor(cache, githubToken) {
    super(cache);
    this.analyzer = new RepoAnalyzer({
      githubToken
    });
  }
  async getRepoIcon(owner, repo) {
    const cached = await this.getCached(owner, repo, "icon");
    if (cached !== void 0) {
      console.log(
        `\u{1F4BE} Cache hit for ${owner}/${repo} icon:`,
        cached ? "Found" : "Not found"
      );
      console.log(`\u{1F504} Clearing cache to retry (checking for rate limits)...`);
      this.cache.clear();
    }
    console.log(`\u{1F680} Starting fresh icon fetch for ${owner}/${repo}`);
    try {
      const iconData = await this.analyzer.getRepoIcon(owner, repo);
      if (iconData) {
        console.log(`\u2705 Successfully loaded icon`);
        console.log(`\u{1F4CA} Icon data length: ${iconData.length} chars`);
        this.setCached(owner, repo, "icon", iconData);
        return iconData;
      } else {
        console.log("\u274C No icons could be loaded");
        this.setCached(owner, repo, "icon", null);
        return null;
      }
    } catch (error) {
      console.error(`\u{1F4A5} ERROR fetching repo icon for ${owner}/${repo}:`, error);
      if (error.status === 403 || error.message?.includes("rate limit")) {
        console.error(`\u23F1\uFE0F  RATE LIMIT HIT! Error:`, error.message);
      }
      this.setCached(owner, repo, "icon", null);
      return null;
    }
  }
};

// server/resources/repository.ts
var RepositoryResource = class extends BaseResource {
  constructor(cache, githubToken) {
    super(cache);
    this.analyzer = new RepoAnalyzer({
      githubToken
    });
  }
  async getRepoInfo(owner, repo) {
    const cached = await this.getCached(owner, repo, "repo");
    if (cached) {
      console.log(`\u{1F4BE} Cache hit for repo info: ${owner}/${repo}`);
      return cached;
    }
    console.log(`\u{1F4E1} Fetching repository info for ${owner}/${repo}...`);
    try {
      const repoData = await this.analyzer.getRepoInfo(owner, repo);
      console.log(`\u{1F4CB} Repository info loaded: ${repoData.full_name}`);
      this.setCached(owner, repo, "repo", repoData);
      return repoData;
    } catch (error) {
      console.error(
        `\u{1F4A5} Error fetching repository info for ${owner}/${repo}:`,
        error.message
      );
      if (error.status === 403 || error.message?.includes("rate limit")) {
        console.error(`\u23F1\uFE0F  RATE LIMIT HIT for repository!`);
      }
      throw error;
    }
  }
};

// server/resources/commits.ts
var CommitsResource = class extends BaseResource {
  constructor(cache, githubToken) {
    super(cache);
    this.analyzer = new RepoAnalyzer({
      githubToken,
      defaultLimit: 50
    });
  }
  async getCommits(owner, repo) {
    const cached = await this.getCached(owner, repo, "commits");
    if (cached) {
      console.log(`\u{1F4BE} Cache hit for commits: ${owner}/${repo}`);
      return cached;
    }
    console.log(`\u{1F4E1} Fetching commits for ${owner}/${repo}...`);
    try {
      const commits = await this.analyzer.getRecentCommits(owner, repo, {
        limit: 50
      });
      console.log(`\u{1F4DD} Commits fetched successfully`);
      this.setCached(owner, repo, "commits", commits);
      return commits;
    } catch (error) {
      console.error(
        `\u{1F4A5} Error fetching commits for ${owner}/${repo}:`,
        error.message
      );
      if (error.status === 403 || error.message?.includes("rate limit")) {
        console.error(`\u23F1\uFE0F  RATE LIMIT HIT for commits!`);
      }
      throw error;
    }
  }
};

// server/resources/branches.ts
var BranchesResource = class extends BaseResource {
  constructor(cache, githubToken) {
    super(cache);
    this.analyzer = new RepoAnalyzer({
      githubToken
    });
  }
  async getBranches(owner, repo) {
    const cached = await this.getCached(owner, repo, "branches");
    if (cached) {
      console.log(`\u{1F4BE} Cache hit for branches: ${owner}/${repo}`);
      return cached;
    }
    console.log(`\u{1F4E1} Fetching branches for ${owner}/${repo}...`);
    try {
      const branches = await this.analyzer.getBranches(owner, repo);
      console.log(`\u{1F33F} Found ${branches.length} branches`);
      this.setCached(owner, repo, "branches", branches);
      return branches;
    } catch (error) {
      console.error(
        `\u{1F4A5} Error fetching branches for ${owner}/${repo}:`,
        error.message
      );
      if (error.status === 403 || error.message?.includes("rate limit")) {
        console.error(`\u23F1\uFE0F  RATE LIMIT HIT for branches!`);
      }
      throw error;
    }
  }
};

// server/resources/files.ts
var FilesResource = class extends BaseResource {
  constructor(cache, githubToken) {
    super(cache);
    this.analyzer = new RepoAnalyzer({
      githubToken
    });
  }
  async getKeyFiles(owner, repo) {
    const cached = await this.getCached(owner, repo, "files");
    if (cached) {
      console.log("\u{1F4C1} Using cached files data");
      return cached;
    }
    console.log(`\u{1F50D} Fetching key files for ${owner}/${repo}...`);
    const foundFiles = await this.analyzer.getKeyFiles(owner, repo);
    console.log(`\u{1F4C1} Found ${foundFiles.length} key files in ${owner}/${repo}`);
    foundFiles.forEach((file) => console.log(`\u2705 Found file: ${file.name}`));
    this.setCached(owner, repo, "files", foundFiles);
    return foundFiles;
  }
  async getFileContent(owner, repo, path4) {
    const cacheKey = `file-content-${path4}`;
    const cached = await this.getCached(owner, repo, cacheKey);
    if (cached) {
      console.log(`\u{1F4C4} Using cached file content for ${path4}`);
      return cached;
    }
    console.log(`> Fetching file content for ${owner}/${repo}:${path4}...`);
    const fileContent = await this.analyzer.getFileContent(owner, repo, path4);
    if (fileContent) {
      console.log(
        `\u2705 Retrieved file content for ${path4} (${fileContent.size} bytes)`
      );
      this.setCached(owner, repo, cacheKey, fileContent);
    }
    return fileContent;
  }
};

// server/resources/stats.ts
var StatsResource = class extends BaseResource {
  constructor(cache, githubToken) {
    super(cache);
    this.analyzer = new RepoAnalyzer({
      githubToken
    });
  }
  async getRepoStats(owner, repo) {
    const cached = await this.getCached(owner, repo, "stats");
    if (cached) {
      console.log("\u{1F4CA} Using cached stats data");
      return cached;
    }
    console.log(`\u{1F50D} Fetching stats for ${owner}/${repo}...`);
    try {
      const stats = await this.analyzer.getRepoStats(owner, repo);
      console.log(`\u{1F4CA} Stats for ${owner}/${repo}:`, {
        stars: stats.stars,
        totalIssues: stats.totalIssues,
        totalCommits: stats.totalCommits,
        ageInYears: stats.ageInYears
      });
      this.setCached(owner, repo, "stats", stats);
      return stats;
    } catch (error) {
      console.error(
        `\u{1F4A5} Error fetching stats for ${owner}/${repo}:`,
        error.message
      );
      if (error.status === 403 || error.message?.includes("rate limit")) {
        console.error(`\u23F1\uFE0F  RATE LIMIT HIT for stats!`);
      }
      throw error;
    }
  }
};

// server/agent/repo-cloner.ts
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
var RepoCloner = class {
  /**
   * Clone a repository in the background (fire-and-forget)
   */
  static async cloneInBackground(owner, repo, options) {
    const repoKey = `${owner}/${repo}`;
    if (this.clonePromises.has(repoKey)) {
      return;
    }
    const clonePromise = this.cloneRepo(owner, repo, options);
    this.clonePromises.set(repoKey, clonePromise);
    clonePromise.finally(() => {
      setTimeout(() => {
        this.clonePromises.delete(repoKey);
      }, 5e3);
    }).catch((error) => {
      console.error(
        `\u{1F6A8} Background clone failed for ${owner}/${repo}:`,
        error.message
      );
    });
  }
  /**
   * Clone a repository to /tmp/gitsee/{owner}/{repo}
   */
  static async cloneRepo(owner, repo, options) {
    const startTime = Date.now();
    const repoPath = path.join(this.BASE_PATH, owner, repo);
    let githubUrl;
    if (options?.username && options?.token) {
      githubUrl = `https://${options.username}:${options.token}@github.com/${owner}/${repo}.git`;
    } else {
      githubUrl = `https://github.com/${owner}/${repo}.git`;
    }
    console.log(`\u{1F4E5} Starting clone of ${owner}/${repo} to ${repoPath}`);
    try {
      if (fs.existsSync(repoPath)) {
        const hasGit = fs.existsSync(path.join(repoPath, ".git"));
        const hasFiles = fs.readdirSync(repoPath).length > 0;
        if (hasGit || hasFiles) {
          console.log(
            `\u{1F4C2} Repository ${owner}/${repo} already exists at ${repoPath}`
          );
          return {
            success: true,
            localPath: repoPath,
            duration: Date.now() - startTime
          };
        } else {
          console.log(
            `\u{1F5D1}\uFE0F Repository ${owner}/${repo} exists but appears invalid, removing...`
          );
          fs.rmSync(repoPath, { recursive: true, force: true });
        }
      }
      const parentDir = path.dirname(repoPath);
      fs.mkdirSync(parentDir, { recursive: true });
      const result = await this.executeGitClone(
        githubUrl,
        repoPath,
        options?.branch
      );
      const duration = Date.now() - startTime;
      if (result.success) {
        console.log(`\u2705 Successfully cloned ${owner}/${repo} in ${duration}ms`);
        return {
          success: true,
          localPath: repoPath,
          duration
        };
      } else {
        console.error(`\u274C Failed to clone ${owner}/${repo}:`, result.error);
        return {
          success: false,
          localPath: repoPath,
          error: result.error,
          duration
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`\u{1F4A5} Clone error for ${owner}/${repo}:`, error.message);
      return {
        success: false,
        localPath: repoPath,
        error: error.message,
        duration
      };
    }
  }
  /**
   * Execute git clone command with shallow clone and single branch
   */
  static executeGitClone(githubUrl, targetPath, branch) {
    return new Promise((resolve) => {
      const gitArgs = [
        "clone",
        "--depth",
        "1",
        // Shallow clone (only latest commit)
        "--single-branch",
        // Only clone the specified branch
        "--no-tags"
        // Skip tags for speed
      ];
      if (branch) {
        gitArgs.push("--branch", branch);
      }
      gitArgs.push(githubUrl, targetPath);
      const gitProcess = spawn("git", gitArgs);
      let errorOutput = "";
      gitProcess.stderr.on("data", (data) => {
        errorOutput += data.toString();
      });
      gitProcess.stdout.on("data", (data) => {
        const output = data.toString();
        if (output.includes("Cloning") || output.includes("Receiving")) {
          console.log(`\u{1F4E5} ${output.trim()}`);
        }
      });
      gitProcess.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: errorOutput || `Git clone exited with code ${code}`
          });
        }
      });
      gitProcess.on("error", (error) => {
        resolve({
          success: false,
          error: `Failed to start git process: ${error.message}`
        });
      });
    });
  }
  /**
   * Check if a repository is already cloned
   */
  static isRepoCloned(owner, repo) {
    const repoPath = path.join(this.BASE_PATH, owner, repo);
    return fs.existsSync(repoPath) && fs.existsSync(path.join(repoPath, ".git"));
  }
  /**
   * Get the local path for a repository
   */
  static getRepoPath(owner, repo) {
    return path.join(this.BASE_PATH, owner, repo);
  }
  /**
   * Wait for a repository clone to complete
   */
  static async waitForClone(owner, repo, options) {
    const repoKey = `${owner}/${repo}`;
    if (this.isRepoCloned(owner, repo)) {
      return {
        success: true,
        localPath: this.getRepoPath(owner, repo)
      };
    }
    const clonePromise = this.clonePromises.get(repoKey);
    if (clonePromise) {
      console.log(`\u23F3 Waiting for ongoing clone of ${owner}/${repo}...`);
      return await clonePromise;
    }
    console.log(`\u{1F680} Starting new clone for ${owner}/${repo}...`);
    return await this.cloneRepo(owner, repo, options);
  }
  /**
   * Get clone result if available (non-blocking)
   */
  static async getCloneResult(owner, repo) {
    const repoKey = `${owner}/${repo}`;
    if (this.isRepoCloned(owner, repo)) {
      return {
        success: true,
        localPath: this.getRepoPath(owner, repo)
      };
    }
    const clonePromise = this.clonePromises.get(repoKey);
    if (clonePromise) {
      try {
        return await clonePromise;
      } catch (error) {
        return {
          success: false,
          localPath: this.getRepoPath(owner, repo),
          error: error instanceof Error ? error.message : "Unknown error"
        };
      }
    }
    return null;
  }
  /**
   * Clean up old repositories (optional utility)
   */
  static async cleanupOldRepos(maxAgeHours = 24) {
    try {
      if (!fs.existsSync(this.BASE_PATH)) {
        return;
      }
      const cutoffTime = Date.now() - maxAgeHours * 60 * 60 * 1e3;
      const owners = fs.readdirSync(this.BASE_PATH);
      for (const owner of owners) {
        const ownerPath = path.join(this.BASE_PATH, owner);
        if (!fs.statSync(ownerPath).isDirectory()) continue;
        const repos = fs.readdirSync(ownerPath);
        for (const repo of repos) {
          const repoPath = path.join(ownerPath, repo);
          const stats = fs.statSync(repoPath);
          if (stats.isDirectory() && stats.mtime.getTime() < cutoffTime) {
            console.log(`\u{1F5D1}\uFE0F Cleaning up old repo: ${owner}/${repo}`);
            fs.rmSync(repoPath, { recursive: true, force: true });
          }
        }
      }
    } catch (error) {
      console.error("Error cleaning up old repos:", error.message);
    }
  }
};
RepoCloner.BASE_PATH = process.env.GITSEE_BASE_PATH || "/tmp/gitsee";
RepoCloner.clonePromises = /* @__PURE__ */ new Map();

// server/agent/explore.ts
import { generateText, tool, hasToolCall } from "ai";
import { getModel, getApiKeyForProvider } from "aieo";

// server/agent/prompts/index.ts
var prompts_exports = {};
__export(prompts_exports, {
  features: () => features_exports,
  first_pass: () => first_pass_exports,
  generic: () => generic,
  services: () => services_exports
});

// server/agent/prompts/first_pass.ts
var first_pass_exports = {};
__export(first_pass_exports, {
  EXPLORER: () => EXPLORER,
  FILE_LINES: () => FILE_LINES,
  FINAL_ANSWER: () => FINAL_ANSWER
});
var FILE_LINES = 100;
var EXPLORER = `
You are a codebase exploration assistant. Use the provided tools to quickly explore the codebase and get a high-level understanding. DONT GO DEEP. Focus on general language and framework, specific core libraries, integrations, and features. Try to understand the main user story of the codebase just by looking at the file structure. YOU NEED TO RETURN AN ANSWER AS FAST AS POSSIBLE! So the best approach is 3-4 tool calls only: 1) repo_overview 2) file_summary of the package.json (or other main package file), 3) The main router file of page/endpoint names, ONLY if you can identify it first try, and 4) final_answer. DO NOT GO DEEPER THAN THIS.
`;
var FINAL_ANSWER = `
Provide the final answer to the user. YOU **MUST** CALL THIS TOOL AT THE END OF YOUR EXPLORATION.

Return a simple JSON object with the following fields:

- "summary": a SHORT 1-2 sentence synopsis of the codebase.
- "key_files": an array of a few core package and LLM agent files. Focus on package files like package.json, and core markdown files. DO NOT include code files unless they are central to the codebase, such as the main DB schema file.
- "infrastructure"/"dependencies"/"user_stories"/"pages": short arrays of core elements of the application,: 1-2 words each. Include just a few dependencies, ONLY if it seems like they are central to the application. Try to find the main user flows and pages just by looking at file names, or a couple file contents. In total try to target 10-12 items for these four categories. Get at least one in each category, but don't make anything up!

{
  "summary": "This is a next.js project with a postgres database and a github oauth implementation",
  "key_files": ["package.json", "README.md", "CLAUDE.md", "AGENTS.md", "schema.prisma"],
  "infrastructure": ["Next.js", "Postgres", "Typescript"],
  "dependencies": ["Github Integration", "D3.js", "React"],
  "user_stories": ["Authentication", "Payments"],
  "pages": ["User Journeys page", "Admin Dashboard"]
}
`;

// server/agent/prompts/features.ts
var features_exports = {};
__export(features_exports, {
  EXPLORER: () => EXPLORER2,
  FILE_LINES: () => FILE_LINES2,
  FINAL_ANSWER: () => FINAL_ANSWER2
});
var FILE_LINES2 = 40;
var EXPLORER2 = `
You are a codebase exploration assistant. Use the provided tools to explore the codebase and answer the user's question. Focus on general language and framework first, then specific core libraries, integrations, and features. Try to understand the core functionallity (user stories) of the codebase. Explore files, functions, and component names to understand the main user stories, pages, UX components, or workflows in the application.
`;
var FINAL_ANSWER2 = `
Provide the final answer to the user. YOU **MUST** CALL THIS TOOL AT THE END OF YOUR EXPLORATION.

Return a simple JSON object with the following fields:

- "summary": a 1-4 sentence short synopsis of the codebase.
- "key_files": an array of the core package and LLM agent files. Focus on package files like package.json, and core markdown files. DO NOT include code files unless they are central to the codebase, such as the main DB schema file.
- "features": an array of about 20 core user stories or pages, 1-4 words each. Each one should be focused on ONE SINGLE user action... DO NOT flesh these out for not reason!! Keep them short and to the point BUT SPECIFIC, NOT GENERAL! For example "Github Integration" and "Google Oauth Login" are separate, not one "Integrations".

{
  "summary": "This is a next.js project with a postgres database and a github oauth implementation",
  "key_files": ["package.json", "README.md", "CLAUDE.md", "AGENTS.md", "schema.prisma"],
  "features": ["Authentication", "User Journeys page", "Payments", "Admin Dashboard", "Notifications", "User Profile", "Settings page", "Data Visualization", "Github Integration", "File Uploads", "Search Functionality", "Real-time Collaboration Tools", "Activity Logs", "Billing and Subscription Management", "Help and Support"]
}
`;

// server/agent/prompts/services.ts
var services_exports = {};
__export(services_exports, {
  EXPLORER: () => EXPLORER3,
  FILE_LINES: () => FILE_LINES3,
  FINAL_ANSWER: () => FINAL_ANSWER3
});
var FILE_LINES3 = 100;
var EXPLORER3 = `
You are a codebase exploration assistant. Your job is to identify the various services, integrations, and environment variables need to setup and run this codebase. Take your time exploring the codebase to find the most likely setup services, and env vars. You might need to use the fulltext_search tool to find instance of "process.env." or other similar patterns, based on the coding language(s) used in the project. You will be asked to output actual configuration files at the end, so make sure you find everything you need to do that!
`;
var FINAL_ANSWER3 = `
Provide the final answer to the user. YOU **MUST** CALL THIS TOOL AT THE END OF YOUR EXPLORATION.

Return three files: a pm2.config.js, a .env file, and a docker-compose.yml. For each file, put "FILENAME: " followed by the filename (no markdown headers, just the plain filename), then the content in backticks. YOU MUST RETURN ALL 3 FILES!!!

- pm2.config.js: the actual dev services for running this project (MY_REPO_NAME). Often its just one single service! But sometimes the backend/frontend might be separate services. IMPORTANT: each service env should have a INSTALL_COMMAND so our sandbox system knows how to install dependencies! You can also add optional BUILD_COMMAND, TEST_COMMAND, E2E_TEST_COMMAND, and PRE_START_COMMAND if you find those in the package file. (an example of a PRE_START_COMMAND is a db migration script). Please name one of the services "frontend" no matter what. The cwd should start with /workspaces/MY_REPO_NAME. For instance, if the frontend is within an "app" dir, the cwd should be "/workspaces/MY_REPO_NAME/app".
- .env: the environment variables needed to run the project, with example values.
- docker-compose.yml: the auxiliary services needed to run the project, such as databases, caches, queues, etc. IMPORTANT: there is a special "app" service in the docker-compsose.yaml that you MUST include! It is the service in which the codebase is mounted. Here is the EXACT content that it should have:
\`\`\`
  app:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ../..:/workspaces:cached
    command: sleep infinity
    networks:
      - app_network
    extra_hosts:
      - "localhost:172.17.0.1"
      - "host.docker.internal:host-gateway"
\`\`\`

# HERE IS AN EXAMPLE OUTPUT:

FILENAME: pm2.config.js

\`\`\`js
module.exports = {
  apps: [
    {
      name: "frontend",
      script: "npm run dev",
      cwd: "/workspaces/MY_REPO_NAME",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        PORT: "3000",
        INSTALL_COMMAND: "npm install",
        BUILD_COMMAND: "npm run build"
      }
    }
  ],
};
\`\`\`

FILENAME: .env

\`\`\`sh
# Database
DATABASE_URL=postgresql://postgres:password@localhost:5432/backend_db
JWT_KEY=your_jwt_secret_key
\`\`\`

FILENAME: docker-compose.yml

\`\`\`yaml
version: '3.8'
networks:
  app_network:
    driver: bridge
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - ../..:/workspaces:cached
    command: sleep infinity
    networks:
      - app_network
    extra_hosts:
      - "localhost:172.17.0.1"
      - "host.docker.internal:host-gateway"
  postgres:
    image: postgres:15
    container_name: backend-postgres
    environment:
      - POSTGRES_DB=backend_db
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - app_network
    restart: unless-stopped
volumes:
  postgres_data:
\`\`\`

`;

// server/agent/prompts/index.ts
var generic = {
  FILE_LINES: 80,
  EXPLORER: `You are a code exploration assistant. Please use the provided tools to answer the user's prompt.`,
  FINAL_ANSWER: `Provide the final answer to the user. YOU **MUST** CALL THIS TOOL AT THE END OF YOUR EXPLORATION.`
};

// server/agent/explore.ts
import { z } from "zod";

// server/agent/tools.ts
import { spawn as spawn2 } from "child_process";
import * as fs2 from "fs";
import * as path2 from "path";
function execCommand(command, cwd, timeoutMs = 1e4) {
  return new Promise((resolve, reject) => {
    const parts = command.split(" ");
    const rgIndex = parts.findIndex(
      (part) => part === "rg" || part.endsWith("/rg")
    );
    const args = parts.slice(rgIndex + 1).map((arg) => {
      if (arg.startsWith('"') && arg.endsWith('"') || arg.startsWith("'") && arg.endsWith("'")) {
        return arg.slice(1, -1);
      }
      return arg;
    });
    args.push("./");
    const process2 = spawn2("rg", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        process2.kill("SIGKILL");
        resolved = true;
        reject(new Error(`Command timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    process2.stdout.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > 1e4) {
        process2.kill("SIGKILL");
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          const truncated = stdout.substring(0, 1e4) + "\n\n[... output truncated due to size limit ...]";
          resolve(truncated);
        }
        return;
      }
    });
    process2.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    process2.on("close", (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        if (code === 0) {
          if (stdout.length > 1e4) {
            const truncated = stdout.substring(0, 1e4) + "\n\n[... output truncated to 10,000 characters ...]";
            resolve(truncated);
          } else {
            resolve(stdout);
          }
        } else if (code === 1) {
          resolve("No matches found");
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      }
    });
    process2.on("error", (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(error);
      }
    });
  });
}
async function getRepoMap(repoPath) {
  if (!repoPath) {
    return "No repository path provided";
  }
  if (!fs2.existsSync(repoPath)) {
    return "Repository not cloned yet";
  }
  try {
    const result = await execCommand(
      "git ls-tree -r --name-only HEAD | tree -L 3 --fromfile",
      repoPath
    );
    return result;
  } catch (error) {
    return `Error getting repo map: ${error.message}`;
  }
}
function getFileSummary(filePath, repoPath, linesLimit) {
  if (!repoPath) {
    return "No repository path provided";
  }
  const fullPath = path2.join(repoPath, filePath);
  if (!fs2.existsSync(fullPath)) {
    return "File not found";
  }
  try {
    const content = fs2.readFileSync(fullPath, "utf-8");
    const lines = content.split("\n").slice(0, linesLimit || 40).map((line) => {
      return line.length > 200 ? line.substring(0, 200) + "..." : line;
    });
    return lines.join("\n");
  } catch (error) {
    return `Error reading file: ${error.message}`;
  }
}
async function fulltextSearch(query, repoPath) {
  if (!repoPath) {
    return "No repository path provided";
  }
  if (!fs2.existsSync(repoPath)) {
    return "Repository not cloned yet";
  }
  try {
    const result = await execCommand(
      `rg --glob '!dist' --ignore-file .gitignore -C 2 -n --max-count 10 --max-columns 200 "${query}"`,
      repoPath,
      5e3
    );
    if (result.length > 1e4) {
      return result.substring(0, 1e4) + "\n\n[... output truncated to 10,000 characters ...]";
    }
    return result;
  } catch (error) {
    if (error.message.includes("code 1")) {
      return `No matches found for "${query}"`;
    }
    return `Error searching: ${error.message}`;
  }
}

// server/agent/explore.ts
function logStep(contents) {
  if (!Array.isArray(contents)) return;
  for (const content of contents) {
    if (content.type === "tool-call" && content.toolName !== "final_answer") {
      console.log("TOOL CALL:", content.toolName, ":", content.input);
    }
  }
}
function getConfig(mode) {
  const m = prompts_exports[mode];
  return {
    file_lines: m.FILE_LINES,
    system: m.EXPLORER,
    final_answer_description: m.FINAL_ANSWER
  };
}
function makeFad(conf, final_answer_description) {
  let fad = conf.final_answer_description;
  if (final_answer_description) {
    const generic2 = generic.FINAL_ANSWER;
    fad = generic2 + `

` + final_answer_description;
  }
  return fad;
}
async function get_context(prompt, repoPath, mode = "features", overrides) {
  const startTime = Date.now();
  const CONF = getConfig(mode);
  const provider = process.env.LLM_PROVIDER || "anthropic";
  const apiKey = getApiKeyForProvider(provider);
  const model = await getModel(provider, apiKey);
  let fad = makeFad(CONF, overrides?.final_answer_description);
  if (mode == "services") {
    fad = fad.replaceAll(
      "MY_REPO_NAME",
      repoPath.split("/").pop() || "my-repo"
    );
  }
  const tools = {
    repo_overview: tool({
      description: "Get a high-level view of the codebase architecture and structure. Use this to understand the project layout and identify where specific functionality might be located. Call this when you need to: 1) Orient yourself in an unfamiliar codebase, 2) Locate which directories/files might contain relevant code for a user's question, 3) Understand the overall project structure before diving deeper. Don't call this if you already know which specific files you need to examine.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return await getRepoMap(repoPath);
        } catch (e) {
          return "Could not retrieve repository map";
        }
      }
    }),
    file_summary: tool({
      description: "Get a summary of what a specific file contains and its role in the codebase. Use this when you have identified a potentially relevant file and need to understand: 1) What functions/components it exports, 2) What its main responsibility is, 3) Whether it's worth exploring further for the user's question. Only the first 40-100 lines of the file will be returned. Call this with a hypothesis like 'This file probably handles user authentication' or 'This looks like the main dashboard component'. Don't call this to browse random files.",
      inputSchema: z.object({
        file_path: z.string().describe("Path to the file to summarize"),
        hypothesis: z.string().describe(
          "What you think this file might contain or handle, based on its name/location"
        )
      }),
      execute: async ({ file_path }) => {
        try {
          return getFileSummary(file_path, repoPath, CONF.file_lines);
        } catch (e) {
          return "Bad file path";
        }
      }
    }),
    fulltext_search: tool({
      description: `Search the entire codebase for a specific term. Use this when you need to find a specific function, component, or file. Call this when the user provided specific text that might be present in the codebase. For example, if the query is 'Add a subtitle to the User Journeys page', you could call this with the query "User Journeys". Don't call this if you do not have specific text to search for`,
      inputSchema: z.object({
        query: z.string().describe("The term to search for")
      }),
      execute: async ({ query }) => {
        try {
          return await fulltextSearch(query, repoPath);
        } catch (e) {
          return `Search failed: ${e}`;
        }
      }
    }),
    final_answer: tool({
      // The tool that signals the end of the process
      description: fad,
      inputSchema: z.object({ answer: z.string() }),
      execute: async ({ answer }) => answer
    })
  };
  if (mode === "first_pass") {
    delete tools.fulltext_search;
  }
  const { steps } = await generateText({
    model,
    tools,
    prompt,
    system: overrides?.system_prompt || CONF.system,
    stopWhen: hasToolCall("final_answer"),
    onStepFinish: (sf) => logStep(sf.content)
  });
  let final = "";
  let lastText = "";
  for (const step of steps) {
    for (const item of step.content) {
      if (item.type === "text" && item.text && item.text.trim().length > 0) {
        lastText = item.text.trim();
      }
    }
  }
  steps.reverse();
  for (const step of steps) {
    const final_answer = step.content.find((c) => {
      return c.type === "tool-result" && c.toolName === "final_answer";
    });
    if (final_answer) {
      final = final_answer.output;
    }
  }
  if (!final && lastText) {
    console.warn(
      "No final_answer tool call detected; falling back to last reasoning text."
    );
    final = `${lastText}

(Note: Model did not invoke final_answer tool; using last reasoning text as answer.)`;
  }
  const endTime = Date.now();
  const duration = endTime - startTime;
  console.log(
    `\u23F1\uFE0F get_context completed in ${duration}ms (${(duration / 1e3).toFixed(2)}s)`
  );
  return final;
}

// server/agent/explore-wrapper.ts
async function explore(prompt, repoPath, mode = "first_pass") {
  const startTime = Date.now();
  console.log(`\u{1F916} Starting ${mode} exploration...`);
  try {
    const jsonString = await get_context(prompt, repoPath, mode);
    console.log(
      `\u{1F4CB} Raw exploration result:`,
      jsonString.substring(0, 200) + "..."
    );
    if (mode === "services") {
      return jsonString;
    }
    let parsedResult;
    try {
      parsedResult = JSON.parse(jsonString);
    } catch (parseError) {
      console.warn("\u26A0\uFE0F Failed to parse JSON, treating as raw summary");
      if (mode === "first_pass") {
        parsedResult = {
          summary: jsonString,
          key_files: [],
          infrastructure: [],
          dependencies: [],
          user_stories: [],
          pages: []
        };
      } else {
        parsedResult = {
          summary: jsonString,
          key_files: [],
          features: []
        };
      }
    }
    let result;
    if (mode === "first_pass") {
      result = {
        summary: parsedResult.summary || jsonString,
        key_files: parsedResult.key_files || [],
        infrastructure: parsedResult.infrastructure || [],
        dependencies: parsedResult.dependencies || [],
        user_stories: parsedResult.user_stories || [],
        pages: parsedResult.pages || []
      };
    } else {
      result = {
        summary: parsedResult.summary || jsonString,
        key_files: parsedResult.key_files || [],
        features: parsedResult.features || []
      };
    }
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`\u2705 ${mode} exploration completed in ${duration}ms`);
    console.log(
      `\u{1F4CA} Result: ${result.key_files.length} key files, summary: ${result.summary.substring(0, 100)}...`
    );
    return result;
  } catch (error) {
    console.error(`\u{1F4A5} Exploration failed:`, error);
    if (mode === "first_pass") {
      return {
        summary: `Exploration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        key_files: [],
        infrastructure: [],
        dependencies: [],
        user_stories: [],
        pages: []
      };
    } else {
      return {
        summary: `Exploration failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        key_files: [],
        features: []
      };
    }
  }
}

// server/persistence/FileStore.ts
import * as fs3 from "fs";
import * as path3 from "path";
var FileStore = class {
  constructor(dataDir = "./data/repos") {
    this.version = "1.0.0";
    this.dataDir = dataDir;
    this.ensureDataDir();
  }
  ensureDataDir() {
    if (!fs3.existsSync(this.dataDir)) {
      fs3.mkdirSync(this.dataDir, { recursive: true });
    }
  }
  getRepoDir(owner, repo) {
    const repoKey = `${owner}-${repo}`.replace(/[^a-zA-Z0-9-]/g, "_");
    return path3.join(this.dataDir, repoKey);
  }
  ensureRepoDir(owner, repo) {
    const repoDir = this.getRepoDir(owner, repo);
    if (!fs3.existsSync(repoDir)) {
      fs3.mkdirSync(repoDir, { recursive: true });
    }
    return repoDir;
  }
  // Store basic API data (what you already have)
  async storeBasicData(owner, repo, data) {
    const repoDir = this.ensureRepoDir(owner, repo);
    const filePath = path3.join(repoDir, "basic.json");
    const enrichedData = {
      ...data,
      stored_at: (/* @__PURE__ */ new Date()).toISOString(),
      timestamp: Date.now(),
      owner,
      repo
    };
    fs3.writeFileSync(filePath, JSON.stringify(enrichedData, null, 2));
    console.log(`\u{1F4BE} Stored basic data for ${owner}/${repo}`);
  }
  // Get cached basic API data
  async getBasicData(owner, repo) {
    const repoDir = this.getRepoDir(owner, repo);
    const filePath = path3.join(repoDir, "basic.json");
    if (!fs3.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs3.readFileSync(filePath, "utf-8");
      const data = JSON.parse(content);
      console.log(`\u{1F4C2} Retrieved cached basic data for ${owner}/${repo} (stored at: ${data.stored_at})`);
      return data;
    } catch (error) {
      console.error(`Error reading basic data: ${error}`);
      return null;
    }
  }
  // Check if we have recent basic data
  async hasRecentBasicData(owner, repo, maxAgeHours = 24) {
    const data = await this.getBasicData(owner, repo);
    if (!data || !data.timestamp) return false;
    const ageMs = Date.now() - data.timestamp;
    const ageHours = ageMs / (1e3 * 60 * 60);
    return ageHours < maxAgeHours;
  }
  // Store agent exploration results
  async storeExploration(owner, repo, mode, result) {
    const repoDir = this.ensureRepoDir(owner, repo);
    const filePath = path3.join(repoDir, `exploration-${mode}.json`);
    const storedExploration = {
      mode,
      result,
      timestamp: Date.now(),
      owner,
      repo,
      version: this.version
    };
    fs3.writeFileSync(filePath, JSON.stringify(storedExploration, null, 2));
    console.log(`\u{1F50D} Stored ${mode} exploration for ${owner}/${repo}`);
  }
  // Get stored exploration data
  async getExploration(owner, repo, mode) {
    const repoDir = this.getRepoDir(owner, repo);
    const filePath = path3.join(repoDir, `exploration-${mode}.json`);
    if (!fs3.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs3.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error reading exploration data: ${error}`);
      return null;
    }
  }
  // Get all exploration data for a repo
  async getAllExplorations(owner, repo) {
    const repoDir = this.getRepoDir(owner, repo);
    if (!fs3.existsSync(repoDir)) {
      return [];
    }
    const explorations = [];
    const modes = ["first_pass", "features"];
    for (const mode of modes) {
      const exploration = await this.getExploration(owner, repo, mode);
      if (exploration) {
        explorations.push(exploration);
      }
    }
    return explorations;
  }
  // Check if we have recent exploration data
  async hasRecentExploration(owner, repo, mode, maxAgeHours = 24) {
    const exploration = await this.getExploration(owner, repo, mode);
    if (!exploration) return false;
    const ageMs = Date.now() - exploration.timestamp;
    const ageHours = ageMs / (1e3 * 60 * 60);
    return ageHours < maxAgeHours;
  }
  // Helper to get first_pass data typed correctly
  async getFirstPassExploration(owner, repo) {
    const stored = await this.getExploration(owner, repo, "first_pass");
    return stored?.result || null;
  }
  // Helper to get features exploration data typed correctly
  async getFeaturesExploration(owner, repo) {
    const stored = await this.getExploration(owner, repo, "features");
    return stored?.result || null;
  }
  // List all stored repositories with exploration status
  async listRepos() {
    if (!fs3.existsSync(this.dataDir)) {
      return [];
    }
    const repos = [];
    const entries = fs3.readdirSync(this.dataDir);
    for (const entry of entries) {
      const parts = entry.split("-");
      if (parts.length >= 2) {
        const owner = parts[0];
        const repo = parts.slice(1).join("-");
        const explorations = await this.getAllExplorations(owner, repo);
        const hasFirstPass = explorations.some((e) => e.mode === "first_pass");
        const hasFeatures = explorations.some((e) => e.mode === "features");
        const lastExplored = explorations.length > 0 ? Math.max(...explorations.map((e) => e.timestamp)) : void 0;
        repos.push({
          owner,
          repo,
          explorations: {
            first_pass: hasFirstPass,
            features: hasFeatures
          },
          lastExplored
        });
      }
    }
    return repos;
  }
  // Clean up old exploration data
  async cleanupOldExplorations(maxAgeHours = 24 * 7) {
    const repos = await this.listRepos();
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1e3;
    for (const repoInfo of repos) {
      if (repoInfo.lastExplored && repoInfo.lastExplored < cutoff) {
        const repoDir = this.getRepoDir(repoInfo.owner, repoInfo.repo);
        const modes = ["first_pass", "features"];
        for (const mode of modes) {
          const filePath = path3.join(repoDir, `exploration-${mode}.json`);
          if (fs3.existsSync(filePath)) {
            fs3.unlinkSync(filePath);
            console.log(
              `\u{1F9F9} Cleaned up old ${mode} exploration for ${repoInfo.owner}/${repoInfo.repo}`
            );
          }
        }
      }
    }
  }
};

// server/events/ExplorationEmitter.ts
import { EventEmitter } from "events";
var ExplorationEmitter = class _ExplorationEmitter extends EventEmitter {
  static getInstance() {
    if (!this.instance) {
      this.instance = new _ExplorationEmitter();
    }
    return this.instance;
  }
  constructor() {
    super();
    this.setMaxListeners(100);
  }
  getRepoKey(owner, repo) {
    return `${owner}/${repo}`;
  }
  // Emit clone events
  emitCloneStarted(owner, repo) {
    const event = {
      type: "clone_started",
      owner,
      repo,
      timestamp: Date.now()
    };
    this.emit(this.getRepoKey(owner, repo), event);
    console.log(`\u{1F514} Emitted clone_started for ${owner}/${repo}`);
  }
  emitCloneCompleted(owner, repo, success, localPath) {
    const event = {
      type: "clone_completed",
      owner,
      repo,
      data: { success, localPath },
      timestamp: Date.now()
    };
    this.emit(this.getRepoKey(owner, repo), event);
    console.log(`\u{1F514} Emitted clone_completed for ${owner}/${repo}: ${success ? "success" : "failed"}`);
  }
  // Emit exploration events
  emitExplorationStarted(owner, repo, mode) {
    const event = {
      type: "exploration_started",
      owner,
      repo,
      mode,
      timestamp: Date.now()
    };
    this.emit(this.getRepoKey(owner, repo), event);
    console.log(`\u{1F514} Emitted exploration_started for ${owner}/${repo} (${mode})`);
  }
  emitExplorationProgress(owner, repo, mode, progress) {
    const event = {
      type: "exploration_progress",
      owner,
      repo,
      mode,
      data: { progress },
      timestamp: Date.now()
    };
    this.emit(this.getRepoKey(owner, repo), event);
    console.log(`\u{1F514} Emitted exploration_progress for ${owner}/${repo} (${mode}): ${progress}`);
  }
  emitExplorationCompleted(owner, repo, mode, result) {
    const event = {
      type: "exploration_completed",
      owner,
      repo,
      mode,
      data: { result },
      timestamp: Date.now()
    };
    this.emit(this.getRepoKey(owner, repo), event);
    console.log(`\u{1F514} Emitted exploration_completed for ${owner}/${repo} (${mode})`);
  }
  emitExplorationFailed(owner, repo, mode, error) {
    const event = {
      type: "exploration_failed",
      owner,
      repo,
      mode,
      error,
      timestamp: Date.now()
    };
    this.emit(this.getRepoKey(owner, repo), event);
    console.log(`\u{1F514} Emitted exploration_failed for ${owner}/${repo} (${mode}): ${error}`);
  }
  // Subscribe to repository events
  subscribeToRepo(owner, repo, callback) {
    const repoKey = this.getRepoKey(owner, repo);
    this.on(repoKey, callback);
    console.log(`\u{1F4E1} New subscriber for ${owner}/${repo} (total: ${this.listenerCount(repoKey)})`);
    this.emit(`connection:${repoKey}`, { owner, repo });
    return () => {
      this.removeListener(repoKey, callback);
      console.log(`\u{1F4E1} Unsubscribed from ${owner}/${repo} (remaining: ${this.listenerCount(repoKey)})`);
    };
  }
  // Wait for at least one SSE connection
  waitForConnection(owner, repo, timeoutMs = 5e3) {
    return new Promise((resolve, reject) => {
      const repoKey = this.getRepoKey(owner, repo);
      if (this.listenerCount(repoKey) > 0) {
        resolve();
        return;
      }
      const timeout = setTimeout(() => {
        this.removeListener(`connection:${repoKey}`, onConnection);
        reject(new Error(`Timeout waiting for SSE connection to ${owner}/${repo}`));
      }, timeoutMs);
      const onConnection = () => {
        clearTimeout(timeout);
        this.removeListener(`connection:${repoKey}`, onConnection);
        resolve();
      };
      this.once(`connection:${repoKey}`, onConnection);
    });
  }
  // Get current listener count for debugging
  getListenerCount(owner, repo) {
    return this.listenerCount(this.getRepoKey(owner, repo));
  }
  // Cleanup old listeners (optional)
  cleanupRepo(owner, repo) {
    const repoKey = this.getRepoKey(owner, repo);
    this.removeAllListeners(repoKey);
    console.log(`\u{1F9F9} Cleaned up all listeners for ${owner}/${repo}`);
  }
};

// server/handler.ts
var GitSeeHandler = class {
  constructor(options = {}) {
    this.cache = new GitSeeCache(options.cache?.ttl);
    this.store = new FileStore(options.cacheDir);
    this.emitter = ExplorationEmitter.getInstance();
    this.contributors = new ContributorsResource(this.cache, options.token);
    this.icons = new IconsResource(this.cache, options.token);
    this.repository = new RepositoryResource(this.cache, options.token);
    this.commits = new CommitsResource(this.cache, options.token);
    this.branches = new BranchesResource(this.cache, options.token);
    this.files = new FilesResource(this.cache, options.token);
    this.stats = new StatsResource(this.cache, options.token);
  }
  async handleEvents(req, res, owner, repo) {
    console.log(`\u{1F4E1} SSE connection established for ${owner}/${repo}`);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Cache-Control"
    });
    res.write(
      `data: ${JSON.stringify({
        type: "connected",
        owner,
        repo,
        timestamp: Date.now()
      })}

`
    );
    const unsubscribe = this.emitter.subscribeToRepo(owner, repo, (event) => {
      try {
        res.write(`data: ${JSON.stringify(event)}

`);
      } catch (error) {
        console.error(
          `\u{1F4A5} Error writing SSE event for ${owner}/${repo}:`,
          error
        );
      }
    });
    req.on("close", () => {
      console.log(`\u{1F4E1} SSE connection closed for ${owner}/${repo}`);
      unsubscribe();
    });
    req.on("error", (error) => {
      console.error(`\u{1F4A5} SSE connection error for ${owner}/${repo}:`, error);
      unsubscribe();
    });
    const heartbeat = setInterval(() => {
      try {
        res.write(
          `data: ${JSON.stringify({
            type: "heartbeat",
            timestamp: Date.now()
          })}

`
        );
      } catch (error) {
        console.error(`\u{1F4A5} Heartbeat failed for ${owner}/${repo}:`, error);
        clearInterval(heartbeat);
        unsubscribe();
      }
    }, 3e4);
    req.on("close", () => {
      clearInterval(heartbeat);
    });
  }
  async handle(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const body = await this.parseRequestBody(req);
      const request = JSON.parse(body);
      const response = await this.processRequest(request);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (error) {
      console.error("GitSee handler error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Internal server error"
        })
      );
    }
  }
  /**
   * Handle request with pre-parsed JSON body (for Express.js integration)
   * Use this when your framework already parsed the JSON body (e.g., express.json() middleware)
   */
  async handleJson(body, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    try {
      const response = await this.processRequest(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    } catch (error) {
      console.error("GitSee handleJson error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : "Internal server error"
        })
      );
    }
  }
  autoStartFirstPassExploration(owner, repo, cloneOptions) {
    setImmediate(async () => {
      try {
        const hasRecent = await this.store.hasRecentExploration(
          owner,
          repo,
          "first_pass",
          24
        );
        if (!hasRecent) {
          console.log(
            `\u{1F680} Auto-starting first_pass exploration for ${owner}/${repo}...`
          );
          this.emitter.emitExplorationStarted(owner, repo, "first_pass");
          this.runBackgroundExploration(
            owner,
            repo,
            "first_pass",
            cloneOptions
          ).catch((error) => {
            console.error(
              `\u{1F6A8} Background first_pass exploration failed for ${owner}/${repo}:`,
              error.message
            );
            this.emitter.emitExplorationFailed(
              owner,
              repo,
              "first_pass",
              error.message
            );
          });
        } else {
          console.log(
            `\u2705 Recent first_pass exploration found for ${owner}/${repo}, emitting cached result`
          );
          setImmediate(async () => {
            try {
              const cached = await this.store.getExploration(
                owner,
                repo,
                "first_pass"
              );
              if (cached?.result) {
                console.log(
                  `\u23F3 Waiting for SSE connection before emitting cached first_pass exploration for ${owner}/${repo}`
                );
                try {
                  await this.emitter.waitForConnection(owner, repo, 1e4);
                  console.log(
                    `\u{1F514} SSE connected! Emitting cached first_pass exploration for ${owner}/${repo}`
                  );
                  console.log(
                    `\u{1F514} Infrastructure in cached result:`,
                    cached.result.infrastructure
                  );
                  console.log(
                    `\u{1F514} Current SSE listeners:`,
                    this.emitter.getListenerCount(owner, repo)
                  );
                  this.emitter.emitExplorationCompleted(
                    owner,
                    repo,
                    "first_pass",
                    cached.result
                  );
                } catch (timeoutError) {
                  console.warn(
                    `\u23F0 Timeout waiting for SSE connection, emitting anyway for ${owner}/${repo}`
                  );
                  this.emitter.emitExplorationCompleted(
                    owner,
                    repo,
                    "first_pass",
                    cached.result
                  );
                }
              }
            } catch (error) {
              console.error(
                `\u{1F4A5} Error emitting cached exploration for ${owner}/${repo}:`,
                error
              );
            }
          });
        }
      } catch (error) {
        console.error(
          `\u{1F4A5} Error checking exploration status for ${owner}/${repo}:`,
          error
        );
      }
    });
  }
  async runBackgroundExploration(owner, repo, mode, cloneOptions) {
    try {
      await RepoCloner.waitForClone(owner, repo, cloneOptions);
      const cloneResult = await RepoCloner.getCloneResult(owner, repo);
      if (cloneResult?.success && cloneResult.localPath) {
        this.emitter.emitCloneCompleted(
          owner,
          repo,
          true,
          cloneResult.localPath
        );
        const prompt = mode === "first_pass" ? "Analyze this repository and provide a comprehensive overview" : "What are the key features and components of this codebase?";
        console.log(
          `\u{1F916} Running background ${mode} exploration for ${owner}/${repo}...`
        );
        this.emitter.emitExplorationProgress(
          owner,
          repo,
          mode,
          "Running AI analysis..."
        );
        const explorationResult = await explore(
          prompt,
          cloneResult.localPath,
          mode
        );
        await this.store.storeExploration(owner, repo, mode, explorationResult);
        console.log(
          `\u2705 Background ${mode} exploration completed for ${owner}/${repo}`
        );
        this.emitter.emitExplorationCompleted(
          owner,
          repo,
          mode,
          explorationResult
        );
      } else {
        console.error(
          `\u274C Repository clone failed for background exploration: ${owner}/${repo}`
        );
        this.emitter.emitCloneCompleted(owner, repo, false);
        this.emitter.emitExplorationFailed(
          owner,
          repo,
          mode,
          "Repository clone failed"
        );
      }
    } catch (error) {
      console.error(
        `\u{1F4A5} Background ${mode} exploration failed for ${owner}/${repo}:`,
        error
      );
      this.emitter.emitExplorationFailed(
        owner,
        repo,
        mode,
        error instanceof Error ? error.message : "Unknown error"
      );
    }
  }
  async parseRequestBody(req) {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => body += chunk);
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }
  async processRequest(request) {
    const { owner, repo, data, cloneOptions, useCache } = request;
    const response = {};
    if (useCache !== false) {
      const cachedData = await this.store.getBasicData(owner, repo);
      if (cachedData) {
        console.log(`\u{1F4BE} Using cached data for ${owner}/${repo}`);
        const cachedExploration = await this.store.getExploration(
          owner,
          repo,
          "first_pass"
        );
        if (cachedExploration?.result) {
          console.log(
            `\u{1F4E1} Scheduling cached exploration SSE emission for ${owner}/${repo}`
          );
          setImmediate(async () => {
            try {
              await this.emitter.waitForConnection(owner, repo, 5e3);
              console.log(
                `\u{1F4E1} Emitting cached exploration via SSE for ${owner}/${repo}`
              );
              this.emitter.emitExplorationCompleted(
                owner,
                repo,
                "first_pass",
                cachedExploration.result
              );
            } catch (error) {
              console.warn(
                `\u23F0 Timeout waiting for SSE, emitting anyway for ${owner}/${repo}`
              );
              this.emitter.emitExplorationCompleted(
                owner,
                repo,
                "first_pass",
                cachedExploration.result
              );
            }
          });
        }
        return {
          repo: cachedData.repo,
          contributors: cachedData.contributors,
          icon: cachedData.icon,
          files: cachedData.files,
          stats: cachedData.stats,
          exploration: cachedExploration?.result
        };
      } else {
        console.log(
          `\u{1F4BE} No cached data found for ${owner}/${repo}, fetching fresh...`
        );
      }
    } else {
      console.log(
        `\u{1F504} useCache=false, skipping cache and fetching fresh data for ${owner}/${repo}`
      );
    }
    const contributors = cloneOptions?.token ? new ContributorsResource(this.cache, cloneOptions.token) : this.contributors;
    const icons = cloneOptions?.token ? new IconsResource(this.cache, cloneOptions.token) : this.icons;
    const repository = cloneOptions?.token ? new RepositoryResource(this.cache, cloneOptions.token) : this.repository;
    const commits = cloneOptions?.token ? new CommitsResource(this.cache, cloneOptions.token) : this.commits;
    const branches = cloneOptions?.token ? new BranchesResource(this.cache, cloneOptions.token) : this.branches;
    const files = cloneOptions?.token ? new FilesResource(this.cache, cloneOptions.token) : this.files;
    const stats = cloneOptions?.token ? new StatsResource(this.cache, cloneOptions.token) : this.stats;
    console.log(`\u{1F504} Starting background clone for ${owner}/${repo}...`);
    this.emitter.emitCloneStarted(owner, repo);
    RepoCloner.cloneInBackground(owner, repo, cloneOptions);
    this.autoStartFirstPassExploration(owner, repo, cloneOptions);
    if (!owner || !repo) {
      throw new Error("Owner and repo are required");
    }
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error("Data array is required and must not be empty");
    }
    console.log(
      `\u{1F50D} Processing request for ${owner}/${repo} with data: [${data.join(", ")}]`
    );
    for (const dataType of data) {
      try {
        switch (dataType) {
          case "repo_info":
            console.log(`\u{1F50D} Fetching repository info for ${owner}/${repo}...`);
            response.repo = await repository.getRepoInfo(owner, repo);
            console.log(`\u{1F4CB} Repository info result: Found`);
            break;
          case "contributors":
            console.log(`\u{1F50D} Fetching contributors for ${owner}/${repo}...`);
            response.contributors = await contributors.getContributors(
              owner,
              repo
            );
            console.log(
              `\u{1F465} Contributors result: ${response.contributors?.length || 0} found`
            );
            break;
          case "icon":
            console.log(`\u{1F50D} Fetching icon for ${owner}/${repo}...`);
            response.icon = await icons.getRepoIcon(owner, repo);
            console.log(
              `\u{1F4F7} Icon result:`,
              response.icon ? "Found" : "Not found"
            );
            break;
          case "commits":
            console.log(`\u{1F50D} Fetching commits for ${owner}/${repo}...`);
            response.commits = await commits.getCommits(owner, repo);
            console.log(`\u{1F4DD} Commits result: Retrieved commit summary`);
            break;
          case "branches":
            console.log(`\u{1F50D} Fetching branches for ${owner}/${repo}...`);
            response.branches = await branches.getBranches(owner, repo);
            console.log(
              `\u{1F33F} Branches result: ${response.branches?.length || 0} found`
            );
            break;
          case "files":
            console.log(`\u{1F50D} Fetching key files for ${owner}/${repo}...`);
            response.files = await files.getKeyFiles(owner, repo);
            console.log(
              `\u{1F4C1} Files result: ${response.files?.length || 0} found`
            );
            break;
          case "stats":
            console.log(`\u{1F50D} Fetching stats for ${owner}/${repo}...`);
            response.stats = await stats.getRepoStats(owner, repo);
            console.log(
              `\u{1F4CA} Stats result: ${response.stats?.stars} stars, ${response.stats?.totalIssues} issues, ${response.stats?.totalCommits} commits, ${response.stats?.ageInYears}y old`
            );
            break;
          case "file_content":
            if (!request.filePath) {
              console.warn(
                `\u26A0\uFE0F File content requested but no filePath provided`
              );
              break;
            }
            console.log(
              `\u{1F50D} Fetching file content for ${owner}/${repo}:${request.filePath}...`
            );
            response.fileContent = await files.getFileContent(
              owner,
              repo,
              request.filePath
            );
            console.log(
              `\u{1F4C4} File content result: ${response.fileContent ? `Found (${response.fileContent.size} bytes)` : "Not found"}`
            );
            break;
          case "exploration":
            console.log(`\u{1F50D} Fetching exploration data for ${owner}/${repo}...`);
            const explorationMode = request.explorationMode || "features";
            if (await this.store.hasRecentExploration(
              owner,
              repo,
              explorationMode,
              24
            )) {
              console.log(
                `\u267B\uFE0F Using cached ${explorationMode} exploration data`
              );
              const cached = await this.store.getExploration(
                owner,
                repo,
                explorationMode
              );
              response.exploration = cached?.result;
              if (cached?.result) {
                this.emitter.emitExplorationCompleted(
                  owner,
                  repo,
                  explorationMode,
                  cached.result
                );
              }
            } else {
              console.log(`\u{1F916} Running ${explorationMode} agent exploration...`);
              try {
                await RepoCloner.waitForClone(owner, repo, cloneOptions);
                const cloneResult = await RepoCloner.getCloneResult(
                  owner,
                  repo
                );
                if (cloneResult?.success && cloneResult.localPath) {
                  const prompt = request.explorationPrompt || (explorationMode === "first_pass" ? "Analyze this repository and provide a comprehensive overview" : "What are the key features and components of this codebase?");
                  const explorationResult = await explore(
                    prompt,
                    cloneResult.localPath,
                    explorationMode
                  );
                  await this.store.storeExploration(
                    owner,
                    repo,
                    explorationMode,
                    explorationResult
                  );
                  response.exploration = explorationResult;
                  console.log(
                    `\u2705 ${explorationMode} exploration completed and cached`
                  );
                } else {
                  console.error("Repository clone failed or not available");
                  response.exploration = {
                    error: "Repository not accessible for exploration"
                  };
                }
              } catch (error) {
                console.error(
                  `Failed to run ${explorationMode} exploration:`,
                  error
                );
                response.exploration = {
                  error: `Exploration failed: ${error instanceof Error ? error.message : "Unknown error"}`
                };
              }
            }
            break;
          default:
            console.warn(`\u26A0\uFE0F  Unknown data type: ${dataType}`);
        }
      } catch (error) {
        console.error(
          `\u{1F4A5} Error processing ${dataType} for ${owner}/${repo}:`,
          error
        );
      }
    }
    await this.store.storeBasicData(owner, repo, {
      repo: response.repo,
      contributors: response.contributors,
      files: response.files,
      stats: response.stats,
      icon: response.icon
    });
    return response;
  }
};
function createGitSeeHandler(options = {}) {
  const handler = new GitSeeHandler(options);
  return (req, res) => handler.handle(req, res);
}

// server/server.ts
import { createServer } from "http";
import { URL } from "url";
function createGitSeeServer(options = {}) {
  const handler = new GitSeeHandler(options);
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      if (url.pathname.startsWith("/api/gitsee/events/")) {
        const pathParts = url.pathname.split("/");
        if (pathParts.length >= 6) {
          const owner = pathParts[4];
          const repo = pathParts[5];
          console.log(`\u{1F4E1} SSE request for ${owner}/${repo}`);
          return await handler.handleEvents(req, res, owner, repo);
        }
      }
      if (url.pathname === "/api/gitsee") {
        return await handler.handle(req, res);
      }
      if (req.method === "OPTIONS") {
        res.writeHead(200, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Cache-Control"
        });
        res.end();
        return;
      }
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (error) {
      console.error("Server error:", error);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Internal server error"
      }));
    }
  });
}
export {
  BaseAnalyzer,
  BaseResource,
  BranchesResource,
  CommitsResource,
  ContributorsResource,
  ExplorationEmitter,
  GitSeeCache,
  GitSeeHandler,
  IconsResource,
  RepoAnalyzer,
  RepositoryResource,
  createGitSeeHandler,
  createGitSeeServer
};
//# sourceMappingURL=index.js.map