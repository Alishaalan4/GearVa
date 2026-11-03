import { InvoicePage } from '@/features/invoices/invoice-page';

export default async function InvoiceRoute({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return <InvoicePage invoiceId={invoiceId} />;
}
