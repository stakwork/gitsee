import * as http from 'http';
import { IncomingMessage, ServerResponse } from 'http';
import { EventEmitter } from 'events';
import { Octokit } from '@octokit/rest';

interface CloneOptions {
    username?: string;
    token?: string;
    branch?: string;
}

type RepoContextMode = "generic" | "first_pass" | "features" | "services";
interface FeaturesContextResult {
    summary: string;
    key_files: string[];
    features: string[];
}
interface FirstPassContextResult {
    summary: string;
    key_files: string[];
    infrastructure: string[];
    dependencies: string[];
    user_stories: string[];
    pages: string[];
}

interface GitSeeRequest {
    owner: string;
    repo: string;
    data: ("contributors" | "icon" | "repo_info" | "commits" | "branches" | "files" | "stats" | "file_content" | "exploration")[];
    filePath?: string;
    explorationMode?: "features" | "first_pass";
    explorationPrompt?: string;
    cloneOptions?: CloneOptions;
    useCache?: boolean;
}
interface GitSeeResponse {
    repo?: any;
    contributors?: any[];
    icon?: string | null;
    commits?: string;
    branches?: any[];
    files?: FileInfo$1[];
    fileContent?: FileContent$1 | null;
    stats?: RepoStats$1;
    exploration?: ExplorationResult$1 | {
        error: string;
    } | string;
    error?: string;
}
interface ExplorationResult$1 {
    summary: string;
    key_files: string[];
    features?: string[];
    infrastructure?: string[];
    dependencies?: string[];
    user_stories?: string[];
    pages?: string[];
}
interface GitSeeOptions {
    token?: string;
    cache?: {
        ttl?: number;
    };
    cacheDir?: string;
}
interface Contributor {
    id: number;
    login: string;
    avatar_url: string;
    contributions: number;
    url?: string;
    html_url?: string;
    type?: string;
}
interface Repository {
    id: number;
    name: string;
    full_name: string;
    owner: {
        login: string;
        id: number;
        avatar_url: string;
    };
    description?: string;
    stargazers_count: number;
    forks_count: number;
    language?: string;
    created_at: string;
    updated_at: string;
    clone_url: string;
    html_url: string;
}
interface Commit {
    sha: string;
    commit: {
        author: {
            name: string;
            email: string;
            date: string;
        };
        message: string;
    };
    author: {
        login: string;
        avatar_url: string;
        id: number;
    } | null;
}
interface Branch {
    name: string;
    commit: {
        sha: string;
        url: string;
    };
    protected: boolean;
}
interface FileInfo$1 {
    name: string;
    path: string;
    type: "package" | "config" | "docs" | "build" | "ci" | "data" | "other";
}
interface FileContent$1 {
    name: string;
    path: string;
    content: string;
    encoding: string;
    size: number;
}
interface RepoStats$1 {
    stars: number;
    totalIssues: number;
    totalCommits: number;
    ageInYears: number;
}

declare class GitSeeHandler {
    private cache;
    private store;
    private emitter;
    private contributors;
    private icons;
    private repository;
    private commits;
    private branches;
    private files;
    private stats;
    constructor(options?: GitSeeOptions);
    handleEvents(req: IncomingMessage, res: ServerResponse, owner: string, repo: string): Promise<void>;
    handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
    /**
     * Handle request with pre-parsed JSON body (for Express.js integration)
     * Use this when your framework already parsed the JSON body (e.g., express.json() middleware)
     */
    handleJson(body: GitSeeRequest, res: ServerResponse): Promise<void>;
    private autoStartFirstPassExploration;
    private runBackgroundExploration;
    private parseRequestBody;
    processRequest(request: GitSeeRequest): Promise<GitSeeResponse>;
}
declare function createGitSeeHandler(options?: GitSeeOptions): (req: IncomingMessage, res: ServerResponse) => Promise<void>;

declare function createGitSeeServer(options?: GitSeeOptions): http.Server<typeof IncomingMessage, typeof ServerResponse>;

type ExplorationResult = FeaturesContextResult | FirstPassContextResult | string;

interface ExplorationEvent {
    type: 'clone_started' | 'clone_completed' | 'exploration_started' | 'exploration_progress' | 'exploration_completed' | 'exploration_failed';
    owner: string;
    repo: string;
    mode?: RepoContextMode;
    data?: any;
    error?: string;
    timestamp: number;
}
declare class ExplorationEmitter extends EventEmitter {
    private static instance;
    static getInstance(): ExplorationEmitter;
    private constructor();
    private getRepoKey;
    emitCloneStarted(owner: string, repo: string): void;
    emitCloneCompleted(owner: string, repo: string, success: boolean, localPath?: string): void;
    emitExplorationStarted(owner: string, repo: string, mode: RepoContextMode): void;
    emitExplorationProgress(owner: string, repo: string, mode: RepoContextMode, progress: string): void;
    emitExplorationCompleted(owner: string, repo: string, mode: RepoContextMode, result: ExplorationResult): void;
    emitExplorationFailed(owner: string, repo: string, mode: RepoContextMode, error: string): void;
    subscribeToRepo(owner: string, repo: string, callback: (event: ExplorationEvent) => void): () => void;
    waitForConnection(owner: string, repo: string, timeoutMs?: number): Promise<void>;
    getListenerCount(owner: string, repo: string): number;
    cleanupRepo(owner: string, repo: string): void;
}

interface RepoCommit {
    sha: string;
    commit: {
        author: {
            name: string;
            email: string;
            date: string;
        };
        message: string;
    };
    author: {
        login: string;
        avatar_url: string;
        id: number;
    } | null;
    files?: CommitFile[];
}
interface CommitFile {
    sha: string;
    filename: string;
    status: "added" | "modified" | "removed" | "renamed" | "copied" | "changed" | "unchanged";
    additions: number;
    deletions: number;
    changes: number;
    blob_url: string;
    raw_url: string;
    contents_url: string;
    patch?: string;
    previous_filename?: string;
}
interface RepoPullRequest {
    id: number;
    number: number;
    title: string;
    body: string | null;
    state: "open" | "closed";
    user: {
        login: string;
        avatar_url: string;
        id: number;
    };
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    merged_at: string | null;
    merge_commit_sha: string | null;
    assignees?: Array<{
        login: string;
        avatar_url: string;
        id: number;
        [key: string]: any;
    }> | null;
    requested_reviewers?: Array<{
        login: string;
        avatar_url: string;
        id: number;
        [key: string]: any;
    }> | null;
    head: {
        ref: string;
        sha: string;
        [key: string]: any;
    };
    base: {
        ref: string;
        sha: string;
        [key: string]: any;
    };
    [key: string]: any;
}
interface PRReview {
    id: number;
    user: {
        login: string;
        avatar_url: string;
        id: number;
    };
    body: string | null;
    state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";
    submitted_at?: string;
    pull_request_url?: string;
    [key: string]: any;
}
interface ContributorFile {
    filename: string;
    modifications: number;
    lastModified: string;
}
interface RecentCommitsOptions {
    days?: number;
    limit?: number;
    author?: string;
    since?: string;
    until?: string;
}
interface RecentPRsOptions {
    days?: number | null;
    limit?: number;
    state?: "open" | "closed" | "all";
    author?: string;
}
interface RepoBranch {
    name: string;
    commit: {
        sha: string;
        url: string;
    };
    protected: boolean;
    [key: string]: any;
}
interface RepoStats {
    stars: number;
    totalIssues: number;
    totalCommits: number;
    ageInYears: number;
}
interface FileInfo {
    name: string;
    path: string;
    type: "package" | "config" | "docs" | "build" | "ci" | "data" | "other";
}
interface FileContent {
    name: string;
    path: string;
    content: string;
    encoding: string;
    size: number;
}

interface RepoAnalyzerConfig {
    githubToken?: string;
    defaultLimit?: number;
    defaultDays?: number;
}
declare abstract class BaseAnalyzer {
    protected octokit: Octokit;
    protected config: RepoAnalyzerConfig;
    constructor(config?: RepoAnalyzerConfig);
    protected paginate<T>(request: any, limit?: number): Promise<T[]>;
}

declare class CommitAnalyzer extends BaseAnalyzer {
    private getRecentCommitsRaw;
    private getRecentCommitsWithFilesRaw;
    getRecentCommits(owner: string, repo: string, options?: RecentCommitsOptions): Promise<string>;
    getRecentCommitsWithFiles(owner: string, repo: string, options?: RecentCommitsOptions): Promise<string>;
    getContributorCommits(owner: string, repo: string, contributor: string, limit?: number): Promise<string>;
    getContributorFiles(owner: string, repo: string, contributor: string, limit?: number): Promise<ContributorFile[]>;
}

declare class PullRequestAnalyzer extends BaseAnalyzer {
    getRecentPRs(owner: string, repo: string, options?: RecentPRsOptions): Promise<RepoPullRequest[]>;
    getContributorPRs(owner: string, repo: string, contributor: string, limit?: number): Promise<string>;
    getContributorReviews(owner: string, repo: string, reviewer: string, limit?: number): Promise<RepoPullRequest[]>;
    getPRDetails(owner: string, repo: string, prNumber: number): Promise<RepoPullRequest & {
        reviews: PRReview[];
    }>;
    getRecentReviews(owner: string, repo: string, days?: number): Promise<PRReview[]>;
}

declare class RepositoryAnalyzer extends BaseAnalyzer {
    getRepoInfo(owner: string, repo: string): Promise<any>;
    getBranches(owner: string, repo: string, limit?: number): Promise<RepoBranch[]>;
    getContributors(owner: string, repo: string, limit?: number): Promise<any[]>;
    getRepoStats(owner: string, repo: string): Promise<RepoStats>;
}

declare class FileAnalyzer extends BaseAnalyzer {
    getKeyFiles(owner: string, repo: string): Promise<FileInfo[]>;
    getFileContent(owner: string, repo: string, path: string): Promise<FileContent | null>;
}

declare class IconAnalyzer extends BaseAnalyzer {
    getRepoIcon(owner: string, repo: string): Promise<string | null>;
    private sortIconsByResolution;
}

declare class RepoAnalyzer extends BaseAnalyzer {
    private commitAnalyzer;
    private prAnalyzer;
    private repoAnalyzer;
    private fileAnalyzer;
    private iconAnalyzer;
    constructor(config?: RepoAnalyzerConfig);
    getRecentCommits(...args: Parameters<CommitAnalyzer['getRecentCommits']>): Promise<string>;
    getRecentCommitsWithFiles(...args: Parameters<CommitAnalyzer['getRecentCommitsWithFiles']>): Promise<string>;
    getContributorCommits(...args: Parameters<CommitAnalyzer['getContributorCommits']>): Promise<string>;
    getContributorFiles(...args: Parameters<CommitAnalyzer['getContributorFiles']>): Promise<ContributorFile[]>;
    getRecentPRs(...args: Parameters<PullRequestAnalyzer['getRecentPRs']>): Promise<RepoPullRequest[]>;
    getContributorPRs(...args: Parameters<PullRequestAnalyzer['getContributorPRs']>): Promise<string>;
    getContributorReviews(...args: Parameters<PullRequestAnalyzer['getContributorReviews']>): Promise<RepoPullRequest[]>;
    getPRDetails(...args: Parameters<PullRequestAnalyzer['getPRDetails']>): Promise<RepoPullRequest & {
        reviews: PRReview[];
    }>;
    getRecentReviews(...args: Parameters<PullRequestAnalyzer['getRecentReviews']>): Promise<PRReview[]>;
    getRepoInfo(...args: Parameters<RepositoryAnalyzer['getRepoInfo']>): Promise<any>;
    getBranches(...args: Parameters<RepositoryAnalyzer['getBranches']>): Promise<RepoBranch[]>;
    getContributors(...args: Parameters<RepositoryAnalyzer['getContributors']>): Promise<any[]>;
    getRepoStats(...args: Parameters<RepositoryAnalyzer['getRepoStats']>): Promise<RepoStats>;
    getKeyFiles(...args: Parameters<FileAnalyzer['getKeyFiles']>): Promise<FileInfo[]>;
    getFileContent(...args: Parameters<FileAnalyzer['getFileContent']>): Promise<FileContent | null>;
    getRepoIcon(...args: Parameters<IconAnalyzer['getRepoIcon']>): Promise<string | null>;
}

declare class GitSeeCache {
    private cache;
    private ttl;
    constructor(ttl?: number);
    get(key: string): any | null;
    set(key: string, data: any): void;
    clear(): void;
}

declare abstract class BaseResource {
    protected cache: GitSeeCache;
    constructor(cache: GitSeeCache);
    protected getCacheKey(owner: string, repo: string, type: string): string;
    protected getCached<T>(owner: string, repo: string, type: string): Promise<T | undefined>;
    protected setCached<T>(owner: string, repo: string, type: string, data: T): void;
}

declare class ContributorsResource extends BaseResource {
    private analyzer;
    constructor(cache: any, githubToken?: string);
    getContributors(owner: string, repo: string): Promise<Contributor[]>;
}

declare class IconsResource extends BaseResource {
    private analyzer;
    constructor(cache: any, githubToken?: string);
    getRepoIcon(owner: string, repo: string): Promise<string | null>;
}

declare class RepositoryResource extends BaseResource {
    private analyzer;
    constructor(cache: any, githubToken?: string);
    getRepoInfo(owner: string, repo: string): Promise<Repository>;
}

declare class CommitsResource extends BaseResource {
    private analyzer;
    constructor(cache: any, githubToken?: string);
    getCommits(owner: string, repo: string): Promise<string>;
}

declare class BranchesResource extends BaseResource {
    private analyzer;
    constructor(cache: any, githubToken?: string);
    getBranches(owner: string, repo: string): Promise<Branch[]>;
}

export { BaseAnalyzer, BaseResource, type Branch, BranchesResource, type Commit, type CommitFile, CommitsResource, type Contributor, type ContributorFile, ContributorsResource, ExplorationEmitter, type ExplorationEvent, type FileContent, type FileInfo, GitSeeCache, GitSeeHandler, type GitSeeOptions, type GitSeeRequest, type GitSeeResponse, IconsResource, type PRReview, type RecentCommitsOptions, type RecentPRsOptions, RepoAnalyzer, type RepoAnalyzerConfig, type RepoBranch, type RepoCommit, type RepoPullRequest, type RepoStats, type Repository, RepositoryResource, createGitSeeHandler, createGitSeeServer };
