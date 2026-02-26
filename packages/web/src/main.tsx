import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Navigate, RouterProvider, createBrowserRouter, useLocation } from 'react-router-dom'
import './terminal.css'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import AppShell from './pages/AppShell'
import TerminalLayout from './pages/Terminal'
import DashboardPage from './pages/terminal/DashboardPage'
import TradingPage from './pages/terminal/TradingPage'
import SocialPage from './pages/terminal/SocialPage'
import PortfolioPage from './pages/terminal/PortfolioPage'
import ContractsPage from './pages/terminal/ContractsPage'
import MarketStressPage from './pages/terminal/MarketStressPage'
import GroupsPage from './pages/terminal/GroupsPage'
import ChatPage from './pages/Chat'
import NewsPage from './pages/News'
import { getAuth } from './lib/auth'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const auth = getAuth()
  console.log('RequireAuth check:', { auth, pathname: location.pathname })
  if (!auth) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { 
        path: '', 
        element: <TerminalLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'groups', element: <GroupsPage /> },
          { path: 'groups/:group', element: <GroupsPage /> },
          { path: 'trading', element: <TradingPage /> },
          { path: 'social', element: <SocialPage /> },
          { path: 'market-stress', element: <MarketStressPage /> },
          { path: 'portfolio', element: <PortfolioPage /> },
          { path: 'contracts', element: <ContractsPage /> },
        ]
      },
      { path: 'chat', element: <ChatPage /> },
      { path: 'news', element: <NewsPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
