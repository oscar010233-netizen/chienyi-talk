import { WorkspaceSchedule } from '@/components/workspace/WorkspaceSchedule';
import { getWorkspaceSchedule } from '@/lib/workspace/getWorkspaceSchedule';

export const dynamic = 'force-dynamic';

export default async function WorkspacePage() {
  const workspaceSchedule = await getWorkspaceSchedule();

  return <WorkspaceSchedule data={workspaceSchedule} />;
}
