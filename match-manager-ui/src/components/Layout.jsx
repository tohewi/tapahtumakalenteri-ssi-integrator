import { Outlet, NavLink } from 'react-router-dom'
import { Calendar, Home, Wrench, Menu, User } from 'lucide-react'

function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Mobile Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button className="p-2 -ml-2 hover:bg-gray-100 rounded-lg lg:hidden">
              <Menu className="w-5 h-5 text-gray-700" />
            </button>
            <NavLink to="/events" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">MM</span>
              </div>
              <span className="font-semibold text-gray-900 hidden sm:block">Match Manager</span>
            </NavLink>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden md:block text-sm text-gray-500">R8.1 Prototype</span>
            <button className="p-2 hover:bg-gray-100 rounded-full">
              <User className="w-5 h-5 text-gray-600" />
            </button>
          </div>
        </div>
        
        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-1 px-4 pb-2 border-t border-gray-100">
          <NavLink 
            to="/events" 
            className={({ isActive }) => `
              px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}
            `}
          >
            Events
          </NavLink>
          <NavLink 
            to="/calendar" 
            className={({ isActive }) => `
              px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}
            `}
          >
            Calendar
          </NavLink>
          <NavLink 
            to="/templates" 
            className={({ isActive }) => `
              px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}
            `}
          >
            Templates
          </NavLink>
          <NavLink 
            to="/admin" 
            className={({ isActive }) => `
              px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}
            `}
          >
            Admin
          </NavLink>
        </nav>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden bg-white border-t border-gray-200 sticky bottom-0 z-50">
        <div className="flex items-center justify-around h-16 safe-area-pb">
          <NavLink 
            to="/events" 
            className={({ isActive }) => `
              flex flex-col items-center gap-1 py-2 px-4 rounded-lg
              ${isActive ? 'text-blue-600' : 'text-gray-400'}
            `}
          >
            <Home className="w-5 h-5" />
            <span className="text-xs">Events</span>
          </NavLink>
          <NavLink 
            to="/calendar" 
            className={({ isActive }) => `
              flex flex-col items-center gap-1 py-2 px-4 rounded-lg
              ${isActive ? 'text-blue-600' : 'text-gray-400'}
            `}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-xs">Calendar</span>
          </NavLink>
          <NavLink 
            to="/tools" 
            className={({ isActive }) => `
              flex flex-col items-center gap-1 py-2 px-4 rounded-lg
              ${isActive ? 'text-blue-600' : 'text-gray-400'}
            `}
          >
            <Wrench className="w-5 h-5" />
            <span className="text-xs">Tools</span>
          </NavLink>
        </div>
      </nav>
    </div>
  )
}

export default Layout
