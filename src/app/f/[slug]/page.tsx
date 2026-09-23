import { redirect, notFound } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { db, TABLE, QueryCommand } from '@/lib/dynamodb';
import type { FormDef } from '@/types';
import PublicFormClient from './PublicFormClient';

export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const result = await db.send(new QueryCommand({
    TableName: TABLE.FORMS,
    IndexName: 'SlugIndex',
    KeyConditionExpression: 'slug = :s',
    ExpressionAttributeValues: { ':s': slug },
  }));
  const form = result.Items?.[0] as FormDef | undefined;
  if (!form) notFound();

  const user = await getCurrentUser();
  if (form.accessMode === 'MEMBERS_ONLY' && !user) {
    redirect(`/login?next=${encodeURIComponent(`/f/${slug}`)}`);
  }

  return <PublicFormClient form={form} signedInAs={user?.name || null} />;
}
