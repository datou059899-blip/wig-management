import { redirect } from 'next/navigation'

export default function LegacyProductOpportunitiesRedirect() {
  redirect('/dashboard/products/opportunities')
}
