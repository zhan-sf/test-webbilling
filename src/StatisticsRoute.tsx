import { lazy, Suspense } from 'react'

const StatisticsPage = lazy(() => import('./StatisticsPage'))

export default function StatisticsRoute() {
  return <Suspense fallback={<div className="route-loading" role="status">正在加载页面…</div>}>
    <StatisticsPage />
  </Suspense>
}
