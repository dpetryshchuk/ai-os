import { Outlet } from 'react-router-dom'

export default function JobSearchLayout() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-hidden min-w-0">
        <Outlet />
      </div>
    </div>
  )
}
