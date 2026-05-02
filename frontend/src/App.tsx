import { useState } from "react"
import { Switch, Route, Router as WouterRouter } from "wouter"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Toaster } from "@/components/ui/toaster"
import { TooltipProvider } from "@/components/ui/tooltip"

import Dashboard   from "@/pages/Dashboard"
import Devices     from "@/pages/Devices"
import Audits      from "@/pages/Audits"
import Anomalies   from "@/pages/Anomalies"
import Results     from "@/pages/Results"
import Topology    from "@/pages/Topology"
import TerminalPage from "@/pages/Terminal"
import Login       from "@/pages/Login"
import Users       from "@/pages/Users"
import Profile     from "@/pages/Profile"
import Scheduler   from "@/pages/Scheduler"
import Policies    from "@/pages/Policies"
import NotFound    from "@/pages/not-found"
import { useAuth } from "@/hooks/use-auth"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
})

function ProtectedRouter() {
  return (
    <Switch>
      <Route path="/"            component={Dashboard}   />
      <Route path="/devices"     component={Devices}     />
      <Route path="/topology"    component={Topology}    />
      <Route path="/audits"      component={Audits}      />
      <Route path="/anomalies"   component={Anomalies}   />
      <Route path="/scheduler"   component={Scheduler}   />
      <Route path="/terminal"    component={TerminalPage} />
      <Route path="/results"     component={Results}     />
      <Route path="/policies"    component={Policies}    />
      <Route path="/users"       component={Users}       />
      <Route path="/profile"     component={Profile}     />
      <Route component={NotFound} />
    </Switch>
  )
}

function AppContent() {
  const { isAuthenticated, logout } = useAuth()
  const [authed, setAuthed] = useState(isAuthenticated)

  const handleLogin = () => {
  window.history.replaceState(null, "", import.meta.env.BASE_URL || "/")
  setAuthed(true)
}
  const handleLogout = async () => {
    await logout()
    setAuthed(false)
    queryClient.clear()
  }

  if (!authed) return <Login onLogin={handleLogin} />

  return (
    <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
      <ProtectedRouter />
    </WouterRouter>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
