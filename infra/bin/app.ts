#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ColoringBookStudioStack } from '../lib/stack.js';

const app = new cdk.App();
new ColoringBookStudioStack(app, 'ColoringBookStudioStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
