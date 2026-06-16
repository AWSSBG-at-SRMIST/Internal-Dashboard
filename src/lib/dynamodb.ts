import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const db = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE = {
  MEMBERS: 'sbg-members',
  SESSIONS: 'sbg-sessions',
  OTPS: 'sbg-otps',
  TASKS: 'sbg-tasks',
  SUBMISSIONS: 'sbg-submissions',
  RATINGS: 'sbg-ratings',
  LINKS: 'sbg-links',
  COHORTS: 'sbg-cohorts',
  AUDIT_LOGS: 'sbg-audit-logs',
} as const;

export { GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand, ScanCommand };
