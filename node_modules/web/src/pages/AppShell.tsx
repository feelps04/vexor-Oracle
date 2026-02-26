import { Outlet } from 'react-router-dom'

export default function AppShell() {
  return (
    <div style={{ minHeight: '100vh' }}>
      <Outlet />
    </div>
  )
}
