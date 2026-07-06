import StepBoard from './StepBoard';
export default async function ScanBoardPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <StepBoard jobId={jobId} />;
}
