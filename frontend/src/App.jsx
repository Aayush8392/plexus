import { useState } from 'react'
import Screen0 from './screens/Screen0.jsx'
import Screen1 from './screens/Screen1.jsx'
import Screen2 from './screens/Screen2.jsx'
import Screen2b from './screens/Screen2b.jsx'
import Screen3 from './screens/Screen3.jsx'
import './styles/index.css'

const BREADCRUMBS = {
  '0':  [],
  '1':  [],
  '2':  ['IT & Engineering', 'Entry'],
  '2b': ['IT & Engineering', 'Entry', 'Confirm Role'],
  '3':  ['IT & Engineering', 'Map'],
}

export default function App() {
  const [screen, setScreen]           = useState('0')
  const [cvData, setCvData]           = useState(null)
  const [confirmedRole, setConfirmedRole] = useState(null)
  const [entryScreen, setEntryScreen] = useState('2')

  const nav = (to, payload = {}) => {
    if (payload.cvData !== undefined) setCvData(payload.cvData)
    if (payload.confirmedRole !== undefined) setConfirmedRole(payload.confirmedRole)
    if (to === '3') setEntryScreen(screen)
    setScreen(to)
  }

  const crumbs = BREADCRUMBS[screen] || []

  return (
    <div className="app-root">
      <nav className="breadcrumb" aria-label="breadcrumb">
        <span className="breadcrumb-brand">PLEXUS</span>
        {crumbs.map((label, i) => (
          <span key={i} className="breadcrumb-segment">
            <span className="breadcrumb-sep">//</span>
            {label.toUpperCase()}
          </span>
        ))}
      </nav>

      {screen === '0'  && <Screen0 nav={nav} />}
      {screen === '1'  && <Screen1 nav={nav} />}
      {screen === '2'  && <Screen2 nav={nav} />}
      {screen === '2b' && <Screen2b nav={nav} cvData={cvData} />}
      {screen === '3'  && <Screen3 nav={nav} confirmedRole={confirmedRole} cvData={cvData} entryScreen={entryScreen} />}
    </div>
  )
}
