/**
 * PR Summarizer Bot - GitHub App Entry Point
 * Automatically generates AI-powered summaries of pull requests
 */

import { Probot } from 'probot';
import { loadConfig } from './config';
import { handlePullRequestEvent } from './handlers/pullRequest';

export = (app: Probot): void => {
  const config = loadConfig();

  app.log.info('PR Summarizer Bot initialized', {
    provider: config.llm.provider,
    nodeEnv: config.server.nodeEnv,
  });

  // Handle pull_request.opened event
  app.on('pull_request.opened', (context) => {
    handlePullRequestEvent(context, config);
  });

  // Handle pull_request.synchronize event (new commits pushed)
  app.on('pull_request.synchronize', (context) => {
    handlePullRequestEvent(context, config);
  });

  // Handle pull_request.reopened event
  app.on('pull_request.reopened', (context) => {
    handlePullRequestEvent(context, config);
  });

  // Health check endpoint
  app.on('ping', (context) => {
    context.log.info('Received ping event');
  });
};
