/**
 * Integration tests for GitHub service
 * Uses mocked Octokit responses
 */

import pino from 'pino';
import { GitHubService } from '../services/github';

// Create mock Octokit instance
const createMockOctokit = (): {
  pulls: {
    listFiles: jest.Mock;
    listCommits: jest.Mock;
  };
  issues: {
    createComment: jest.Mock;
    updateComment: jest.Mock;
    listComments: jest.Mock;
  };
} => ({
  pulls: {
    listFiles: jest.fn(),
    listCommits: jest.fn(),
  },
  issues: {
    createComment: jest.fn(),
    updateComment: jest.fn(),
    listComments: jest.fn(),
  },
});

describe('GitHubService', () => {
  let githubService: GitHubService;
  let mockOctokit: ReturnType<typeof createMockOctokit>;
  let logger: pino.Logger;

  beforeEach(() => {
    mockOctokit = createMockOctokit();
    logger = pino({ level: 'silent' });
    githubService = new GitHubService({ octokit: mockOctokit as never, logger });
    jest.clearAllMocks();
  });

  describe('fetchDiff', () => {
    it('should fetch PR diff with file changes', async () => {
      mockOctokit.pulls.listFiles.mockResolvedValue({
        data: [
          {
            filename: 'src/index.ts',
            status: 'modified',
            additions: 10,
            deletions: 5,
            changes: 15,
            patch: '@@ -1,5 +1,10 @@\n-old line\n+new line',
          },
          {
            filename: 'README.md',
            status: 'modified',
            additions: 2,
            deletions: 1,
            changes: 3,
            patch: '@@ -1,1 +1,2 @@\n-old readme\n+new readme',
          },
        ],
      });

      const diff = await githubService.fetchDiff('test-owner', 'test-repo', 123);

      expect(diff.additions).toBe(12);
      expect(diff.deletions).toBe(6);
      expect(diff.changes).toBe(18);
      expect(diff.files).toHaveLength(2);
      expect(diff.files[0].filename).toBe('src/index.ts');
      expect(diff.files[0].patch).toContain('new line');
    });

    it('should retry on 5xx errors', async () => {
      const error = Object.assign(new Error('Server error'), { status: 500 });
      mockOctokit.pulls.listFiles
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce({ data: [] });

      await githubService.fetchDiff('test-owner', 'test-repo', 123);

      expect(mockOctokit.pulls.listFiles).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const error = Object.assign(new Error('Server error'), { status: 500 });
      mockOctokit.pulls.listFiles.mockRejectedValue(error);

      await expect(githubService.fetchDiff('test-owner', 'test-repo', 123)).rejects.toThrow();

      expect(mockOctokit.pulls.listFiles).toHaveBeenCalledTimes(3);
    });
  });

  describe('fetchCommits', () => {
    it('should fetch PR commits with metadata', async () => {
      mockOctokit.pulls.listCommits.mockResolvedValue({
        data: [
          {
            sha: 'abc123',
            commit: {
              message: 'feat: add new feature',
              author: {
                name: 'Test User',
                date: '2024-01-01T00:00:00Z',
              },
            },
          },
          {
            sha: 'def456',
            commit: {
              message: 'fix: resolve bug',
              author: {
                name: 'Test User',
                date: '2024-01-02T00:00:00Z',
              },
            },
          },
        ],
      });

      const commits = await githubService.fetchCommits('test-owner', 'test-repo', 123);

      expect(commits).toHaveLength(2);
      expect(commits[0].sha).toBe('abc123');
      expect(commits[0].message).toBe('feat: add new feature');
      expect(commits[0].author).toBe('Test User');
      expect(commits[1].sha).toBe('def456');
    });
  });

  describe('postComment', () => {
    it('should post comment to PR', async () => {
      mockOctokit.issues.createComment.mockResolvedValue({
        data: {
          id: 123456,
          body: 'Test comment',
        },
      });

      const commentId = await githubService.postComment('test-owner', 'test-repo', 123, 'Test comment');

      expect(commentId).toBe(123456);
      expect(mockOctokit.issues.createComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 123,
        body: 'Test comment',
      });
    });
  });

  describe('updateComment', () => {
    it('should update existing comment', async () => {
      mockOctokit.issues.updateComment.mockResolvedValue({
        data: {
          id: 999,
          body: 'Updated comment',
        },
      });

      await expect(
        githubService.updateComment('test-owner', 'test-repo', 999, 'Updated comment')
      ).resolves.not.toThrow();

      expect(mockOctokit.issues.updateComment).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        comment_id: 999,
        body: 'Updated comment',
      });
    });
  });

  describe('findBotComment', () => {
    it('should find existing bot comment', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          {
            id: 111,
            body: 'Some other comment',
            user: { login: 'other-user' },
          },
          {
            id: 222,
            body: 'Bot comment',
            user: { login: 'test-bot[bot]' },
          },
        ],
      });

      const commentId = await githubService.findBotComment('test-owner', 'test-repo', 123, 'test-bot[bot]');

      expect(commentId).toBe(222);
    });

    it('should return null if no bot comment exists', async () => {
      mockOctokit.issues.listComments.mockResolvedValue({
        data: [
          {
            id: 111,
            body: 'Some comment',
            user: { login: 'other-user' },
          },
        ],
      });

      const commentId = await githubService.findBotComment('test-owner', 'test-repo', 123, 'test-bot[bot]');

      expect(commentId).toBeNull();
    });
  });
});
