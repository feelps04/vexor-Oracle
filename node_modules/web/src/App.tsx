import { Navigate, Route, Routes } from 'react-router-dom'
import HomePage from './pages/Home'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import TerminalLayout from './pages/Terminal'
import DashboardPage from './pages/terminal/DashboardPage'
import SectorsPage from './pages/terminal/SectorsPage'
import SectorDetailPage from './pages/terminal/SectorDetailPage'
import PortfolioPage from './pages/terminal/PortfolioPage'
import ContractsPage from './pages/terminal/ContractsPage'
import SocialPage from './pages/SocialPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/logout" element={<Navigate to="/login" replace />} />

      <Route path="/app" element={<TerminalLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="sector/:sectorId" element={<SectorDetailPage />} />
        <Route path="sectors" element={<SectorsPage />} />
        <Route path="carteira" element={<PortfolioPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="social" element={<SocialPage />} />
      </Route>
      
      <Route path="/social" element={<SocialPage />} />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
