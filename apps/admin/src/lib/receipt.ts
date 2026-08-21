import { apiRequest } from './api'

export async function printReceipt(orderId: string, copies: 1 | 2) {
  // Open synchronously so browsers do not block it after the authenticated fetch.
  const printWindow = window.open('', '_blank')
  if (!printWindow) throw new Error('Allow pop-ups to print receipts')
  printWindow.document.write(
    '<p style="font-family:sans-serif;padding:24px">Preparing receipt…</p>',
  )
  try {
    const { html } = await apiRequest<{ html: string }>(
      `/api/receipts/${encodeURIComponent(orderId)}?copies=${copies}`,
    )
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
  } catch (error) {
    printWindow.close()
    throw error
  }
}
