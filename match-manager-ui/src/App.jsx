import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import EventsList from './pages/EventsList'
import EventDetail from './pages/EventDetail'
import CreateEvent from './pages/CreateEvent'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/events" replace />} />
          <Route path="events" element={<EventsList />} />
          <Route path="events/new" element={<CreateEvent />} />
          <Route path="events/:eventId/*" element={<EventDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
