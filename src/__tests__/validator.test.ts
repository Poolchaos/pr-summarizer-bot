/**
 * Unit tests for validator utilities
 */

import { isValidDiffSize, hasMeaningfulContent, shouldIgnoreByLabel, sanitizeInput } from '../utils/validator';

describe('validator utilities', () => {
  describe('isValidDiffSize', () => {
    it('should accept diff within size limit', () => {
      const result = isValidDiffSize(3000, 2000, 10000);

      expect(result).toBe(true);
    });

    it('should reject diff exceeding size limit', () => {
      const result = isValidDiffSize(8000, 7000, 10000);

      expect(result).toBe(false);
    });

    it('should reject zero changes', () => {
      const result = isValidDiffSize(0, 0, 10000);

      expect(result).toBe(false);
    });

    it('should accept changes at exact size limit', () => {
      const result = isValidDiffSize(6000, 4000, 10000);

      expect(result).toBe(true);
    });

    it('should count total additions and deletions', () => {
      const result = isValidDiffSize(100, 200, 10000);

      expect(result).toBe(true);
    });
  });

  describe('hasMeaningfulContent', () => {
    it('should return true for PR with good diff and commits', () => {
      const diff = 'a'.repeat(100);
      const commits = [{ message: 'feat: add feature' }];
      const description = 'Test description';

      const result = hasMeaningfulContent(diff, commits, description);

      expect(result).toBe(true);
    });

    it('should return true for PR with diff and long description', () => {
      const diff = 'a'.repeat(100);
      const commits: Array<{ message: string }> = [];
      const description = 'Detailed description with enough context';

      const result = hasMeaningfulContent(diff, commits, description);

      expect(result).toBe(false); // False because no commits
    });

    it('should return false for PR with insufficient diff', () => {
      const diff = 'short';
      const commits = [{ message: 'test' }];

      const result = hasMeaningfulContent(diff, commits);

      expect(result).toBe(false);
    });

    it('should return false for PR without commits', () => {
      const diff = 'a'.repeat(100);
      const commits: Array<{ message: string }> = [];

      const result = hasMeaningfulContent(diff, commits);

      expect(result).toBe(false);
    });

    it('should return false for PR with short commit messages', () => {
      const diff = 'a'.repeat(100);
      const commits = [{ message: 'short' }];

      const result = hasMeaningfulContent(diff, commits);

      expect(result).toBe(false);
    });

    it('should return true for PR with meaningful commit message', () => {
      const diff = 'a'.repeat(100);
      const commits = [{ message: 'feat: add comprehensive feature implementation' }];

      const result = hasMeaningfulContent(diff, commits);

      expect(result).toBe(true);
    });
  });

  describe('shouldIgnoreByLabel', () => {
    it('should ignore PR with work-in-progress label', () => {
      const labels = ['wip', 'feature'];
      const ignoreLabels = ['wip', 'draft', 'skip-summary'];

      const result = shouldIgnoreByLabel(labels, ignoreLabels);

      expect(result).toBe(true);
    });

    it('should ignore PR with draft label', () => {
      const labels = ['feature', 'draft'];
      const ignoreLabels = ['wip', 'draft', 'skip-summary'];

      const result = shouldIgnoreByLabel(labels, ignoreLabels);

      expect(result).toBe(true);
    });

    it('should not ignore PR with no matching labels', () => {
      const labels = ['feature', 'bugfix'];
      const ignoreLabels = ['wip', 'draft', 'skip-summary'];

      const result = shouldIgnoreByLabel(labels, ignoreLabels);

      expect(result).toBe(false);
    });

    it('should handle empty label list', () => {
      const labels: string[] = [];
      const ignoreLabels = ['wip', 'draft'];

      const result = shouldIgnoreByLabel(labels, ignoreLabels);

      expect(result).toBe(false);
    });

    it('should handle empty ignore list', () => {
      const labels = ['wip', 'feature'];
      const ignoreLabels: string[] = [];

      const result = shouldIgnoreByLabel(labels, ignoreLabels);

      expect(result).toBe(false);
    });

    it('should be case-sensitive by default', () => {
      const labels = ['WIP'];
      const ignoreLabels = ['wip'];

      const result = shouldIgnoreByLabel(labels, ignoreLabels);

      expect(result).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    it('should remove control characters and trim', () => {
      const input = '  test\x00\x01\x02string  ';
      const result = sanitizeInput(input);

      expect(result).toBe('teststring');
      expect(result).not.toContain('\x00');
    });

    it('should preserve normal text', () => {
      const input = 'normal text with spaces';
      const result = sanitizeInput(input);

      expect(result).toBe('normal text with spaces');
    });

    it('should remove newlines and tabs as control characters', () => {
      const input = 'line1\nline2\tline3';
      const result = sanitizeInput(input);

      expect(result).toBe('line1line2line3');
    });

    it('should handle empty string', () => {
      const result = sanitizeInput('');

      expect(result).toBe('');
    });

    it('should trim whitespace', () => {
      const input = '  text with leading and trailing spaces  ';
      const result = sanitizeInput(input);

      expect(result).toBe('text with leading and trailing spaces');
    });
  });
});
