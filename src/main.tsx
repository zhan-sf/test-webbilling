import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import CreateOrderPage from './CreateOrderPage.tsx'
import RecordsPage from './RecordsPage.tsx'
import StatisticsPage from './StatisticsPage.tsx'

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/'
const page = normalizedPath === '/records'
  ? <RecordsPage />
  : normalizedPath === '/statistics'
    ? <StatisticsPage />
    : normalizedPath === '/payment' ? <App /> : <CreateOrderPage />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page}
  </StrictMode>,
)
