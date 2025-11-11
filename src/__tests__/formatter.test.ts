/**
 * Unit tests for formatter utilities
 */

import { formatSummaryAsMarkdown, formatNeedsInputMessage, truncate, escapeMarkdown } from '../utils/formatter';
import { PRSummary } from '../types';

describe('formatter utilities', () => {
  describe('formatSummaryAsMarkdown', () => {
    it('should format complete summary with all fields', () => {
      const summary: PRSummary = {
        what: 'Added user authentication',
        why: 'To secure the application',
        impact: 'Users must now log in',
        notes: 'Database migration required',
      };

      const result = formatSummaryAsMarkdown(summary);

      expect(result).toContain('## 🤖 AI-Generated PR Summary');
      expect(result).toContain('### What Changed');
      expect(result).toContain('Added user authentication');
      expect(result).toContain('### Why');
      expect(result).toContain('To secure the application');
      expect(result).toContain('### Impact');
      expect(result).toContain('Users must now log in');
      expect(result).toContain('### Additional Notes');
      expect(result).toContain('Database migration required');
    });

    it('should format summary without optional notes', () => {
      const summary: PRSummary = {
        what: 'Fixed bug in login',
        why: 'Bug prevented login',
        impact: 'Users can now log in successfully',
      };

      const result = formatSummaryAsMarkdown(summary);

      expect(result).toContain('Fixed bug in login');
      expect(result).toContain('Bug prevented login');
      expect(result).toContain('Users can now log in successfully');
      expect(result).not.toContain('### Additional Notes');
    });

    it('should handle [NEEDS_INPUT] marker', () => {
      const summary: PRSummary = {
        what: '[NEEDS_INPUT]',
        why: '[NEEDS_INPUT]',
        impact: '[NEEDS_INPUT]',
        notes: 'More context needed',
      };

      const result = formatSummaryAsMarkdown(summary);

      expect(result).toContain('[NEEDS_INPUT]');
      expect(result).toContain('More context needed');
    });
  });

  describe('formatNeedsInputMessage', () => {
    it('should return user-friendly message', () => {
      const result = formatNeedsInputMessage();

      expect(result).toContain('Unable to generate summary');
      expect(result).toContain('more context');
      expect(result).toContain('commit messages');
      expect(result).toContain('PR description');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      const longString = 'a'.repeat(150);
      const result = truncate(longString, 100);

      expect(result.length).toBe(100); // maxLength is maintained
      expect(result.endsWith('...')).toBe(true);
    });

    it('should not truncate short strings', () => {
      const shortString = 'short';
      const result = truncate(shortString, 100);

      expect(result).toBe('short');
      expect(result).not.toContain('...');
    });

    it('should handle empty strings', () => {
      const result = truncate('', 100);

      expect(result).toBe('');
    });

    it('should handle exact max length', () => {
      const longString = 'a'.repeat(500);
      const result = truncate(longString, 500);

      expect(result.length).toBe(500);
      expect(result.endsWith('...')).toBe(false);
    });
  });

  describe('escapeMarkdown', () => {
    it('should escape markdown special characters', () => {
      const text = '# Header * bold * _ italic _ ` code ` [ link ]';
      const result = escapeMarkdown(text);

      expect(result).toContain('\\#');
      expect(result).toContain('\\*');
      expect(result).toContain('\\_');
      expect(result).toContain('\\`');
      expect(result).toContain('\\[');
      expect(result).toContain('\\]');
    });

    it('should handle text without special characters', () => {
      const text = 'plain text';
      const result = escapeMarkdown(text);

      expect(result).toBe('plain text');
    });

    it('should handle empty string', () => {
      const result = escapeMarkdown('');

      expect(result).toBe('');
    });

    it('should escape backslashes', () => {
      const text = 'path\\to\\file';
      const result = escapeMarkdown(text);

      expect(result).toContain('\\\\');
    });
  });
});
