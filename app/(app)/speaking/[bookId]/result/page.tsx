import { ResultClient } from '@/components/speaking/ResultClient';

type Props = { params: Promise<{ bookId: string }> };

export default async function ResultPage({ params }: Props) {
  const { bookId } = await params;
  return <ResultClient bookId={bookId} />;
}
