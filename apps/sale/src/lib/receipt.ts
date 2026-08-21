import { apiRequest } from './api'
export async function printReceipt(orderId: string, copies: 1 | 2) {
  const view = window.open('', '_blank')
  if (!view) throw new Error('Allow pop-ups to print receipts')
  view.document.write(
    '<p style="font-family:sans-serif;padding:24px">Preparing receipt…</p>',
  )
  try {
    const { html } = await apiRequest<{ html: string }>(
      `/api/receipts/${encodeURIComponent(orderId)}?copies=${copies}`,
    )
    view.document.open()
    view.document.write(html)
    view.document.close()
  } catch (error) {
    view.close()
    throw error
  }
}
