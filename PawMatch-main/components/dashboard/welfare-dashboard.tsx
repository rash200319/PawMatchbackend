"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import Link from "next/link"
import {
  Calendar,
  Check,
  AlertTriangle,
  Heart,
  Utensils,
  Moon,
  Smile,
  Activity,
  Award,
  TrendingUp,
  ChevronRight,
  Plus,
  ArrowRight,
  MessageCircle,
  Phone,
  Mail,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const defaultChecklist = [
  { id: "morning_feed", task: "Morning feeding", completed: false, icon: Utensils },
  { id: "walk", task: "Afternoon walk", completed: false, icon: Activity },
  { id: "evening_feed", task: "Evening feeding", completed: false, icon: Utensils },
  { id: "mood", task: "Log mood/behavior", completed: false, icon: Smile },
  { id: "bedtime", task: "Bedtime routine", completed: false, icon: Moon },
]

const moodColors: Record<string, string> = {
  anxious: "bg-red-100 text-red-700",
  cautious: "bg-orange-100 text-orange-700",
  curious: "bg-blue-100 text-blue-700",
  playful: "bg-pink-100 text-pink-700",
  happy: "bg-green-100 text-green-700",
  content: "bg-teal-100 text-teal-700",
}

export function WelfareDashboard() {
  const { user, token, refreshUser } = useAuth()
  const [adoptions, setAdoptions] = useState<any[]>([])
  const [selectedAdoptionId, setSelectedAdoptionId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [dashboardData, setDashboardData] = useState<any>(null)

  const [logForm, setLogForm] = useState({
    mood: "content",
    notes: "",
    checklist: {
      morning_feed: false,
      walk: false,
      evening_feed: false,
      mood: false,
      bedtime: false
    }
  })
  const [isSubmittingLog, setIsSubmittingLog] = useState(false)
  const [isContactOpen, setIsContactOpen] = useState(false)
  const [contactForm, setContactForm] = useState({ subject: "", message: "" })
  const [isSendingContact, setIsSendingContact] = useState(false)

  const fetchUserAdoptions = async () => {
    if (!user || !token) return
    try {
      const res = await fetch('/api/adoptions/me', {
        headers: { 'x-auth-token': token }
      })
      const data = await res.json()
      if (data.success && data.adoptions && data.adoptions.length > 0) {
        // Only show active/approved adoptions in welfare tracker
        // Including 'approved' and 'active' just in case, though backend uses 'active' for tracker
        const activeAdoptions = data.adoptions.filter((a: any) => a.status === 'active' || a.status === 'approved');

        if (activeAdoptions.length > 0) {
          setAdoptions(activeAdoptions)

          // If only one, auto-select it
          if (activeAdoptions.length === 1) {
            setSelectedAdoptionId(activeAdoptions[0].id)
          }

          // Mark application notifications as read
          fetch("/api/notifications/read", {
            method: 'PUT',
            headers: {
              "Content-Type": "application/json",
              "x-auth-token": token || ""
            },
            body: JSON.stringify({ type: 'application' })
          }).then(() => {
            if (user) refreshUser({ ...user, pending_applications: 0 });
          }).catch(err => console.error("Error marking read:", err));
        } else {
          setAdoptions([])
        }
      } else {
        setAdoptions([])
      }
    } catch (err) {
      console.error("Fetch adoptions error:", err)
    } finally {
      setLoading(false)
    }
  }

  const fetchDashboard = async (id: number) => {
    if (!token) return
    setIsFetching(true)
    try {
      const res = await fetch(`/api/welfare/${id}`, {
        headers: { 'x-auth-token': token }
      })
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setDashboardData(data)
    } catch (err) {
      console.error("Dashboard load error", err)
      toast.error("Could not load pet data")
      setSelectedAdoptionId(null)
    } finally {
      setIsFetching(false)
    }
  }

  useEffect(() => {
    fetchUserAdoptions()
  }, [user, token])

  useEffect(() => {
    if (selectedAdoptionId) {
      fetchDashboard(selectedAdoptionId)
    } else {
      setDashboardData(null)
    }
  }, [selectedAdoptionId])

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedAdoptionId || !token) {
      toast.error("You must be logged in to save logs")
      return
    }

    setIsSubmittingLog(true)
    try {
      const res = await fetch(`/api/welfare/${selectedAdoptionId}/log`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify(logForm)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to save log")
      }

      toast.success("Progress logged! You're doing great.")
      setLogForm({
        mood: "content",
        notes: "",
        checklist: { morning_feed: false, walk: false, evening_feed: false, mood: false, bedtime: false }
      })
      fetchDashboard(selectedAdoptionId)
    } catch (err: any) {
      console.error("Log submission error:", err)
      toast.error(err.message || "Failed to save log")
    } finally {
      setIsSubmittingLog(false)
    }
  }

  const toggleChecklist = (id: string) => {
    setLogForm(prev => ({
      ...prev,
      checklist: {
        ...prev.checklist,
        [id]: !prev.checklist[id as keyof typeof prev.checklist]
      }
    }))
  }

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contactForm.message || !selectedAdoptionId || !token) {
      toast.error("Please enter a message")
      return
    }

    setIsSendingContact(true)
    try {
      const res = await fetch('/api/shelter/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': token
        },
        body: JSON.stringify({
          adoptionId: selectedAdoptionId,
          subject: contactForm.subject,
          message: contactForm.message
        })
      })

      const data = await res.json()
      if (res.ok) {
        toast.success("Message sent! The shelter will contact you shortly.")
        setIsContactOpen(false)
        setContactForm({ subject: "", message: "" })
      } else {
        throw new Error(data.error || "Failed to send message")
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to send message")
    } finally {
      setIsSendingContact(false)
    }
  }

  const calculateSimpleProgress = (adoptionDate: string) => {
    const today = new Date()
    const start = new Date(adoptionDate)
    const diffTime = Math.abs(today.getTime() - start.getTime())
    const diffDays = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)))
    const percent = Math.min(100, Math.round((diffDays / 90) * 100))
    let phase = "Decompression"
    if (diffDays > 3) phase = "Learning"
    if (diffDays > 21) phase = "Bonding"
    return { percent, phase, days: diffDays }
  }

  if (!user) return <div className="p-20 text-center">Please sign in to view your welfare tracker.</div>
  if (loading) return <div className="p-20 text-center">Loading tracker...</div>

  if (adoptions.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <Heart className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-20" />
        <h2 className="text-2xl font-bold mb-2">No active adoptions found</h2>
        <p className="text-muted-foreground mb-8 text-lg">Welfare tracking starts once you've completed an adoption.</p>
        <Button asChild size="lg">
          <Link href="/matches">Find your perfect match</Link>
        </Button>
      </div>
    )
  }

  // --- VIEW 1: SELECT PET ---
  if (!selectedAdoptionId) {
    return (
      <div className="py-12 bg-muted/30 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <h1 className="text-4xl font-extrabold text-foreground tracking-tight mb-2">My Adopted Pets</h1>
            <p className="text-muted-foreground text-lg">Select a pet to update their daily welfare log and track progress.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {adoptions.map((a) => {
              const progress = calculateSimpleProgress(a.adoption_date)
              return (
                <Card
                  key={a.id}
                  className="group overflow-hidden border-none shadow-sm hover:shadow-xl transition-all cursor-pointer bg-white rounded-3xl"
                  onClick={() => setSelectedAdoptionId(a.id)}
                >
                  <div className="relative h-64 overflow-hidden">
                    <img
                      src={a.petImage || "/placeholder.svg"}
                      alt={a.petName}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute top-4 left-4">
                      <Badge className="bg-white/90 backdrop-blur-md text-primary font-bold px-4 py-1.5 rounded-full border-none shadow-sm">
                        Day {progress.days}
                      </Badge>
                    </div>
                  </div>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-2xl font-bold">{a.petName}</CardTitle>
                    <CardDescription className="text-sm font-medium">
                      {progress.phase} Phase
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs font-bold uppercase text-muted-foreground">
                        <span>Overall Progress</span>
                        <span>{progress.percent}%</span>
                      </div>
                      <Progress value={progress.percent} className="h-2" />
                    </div>
                    <Button className="w-full rounded-2xl font-bold group-hover:bg-primary/90">
                      View Tracker
                      <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // --- VIEW 2: DETAILED TRACKER ---
  if (isFetching || !dashboardData) {
    return <div className="p-20 text-center min-h-screen">Loading tracker details for {adoptions.find(a => a.id === selectedAdoptionId)?.petName}...</div>
  }

  const isCompleted = dashboardData.isCompleted

  return (
    <div className="py-8 bg-muted/30 min-h-screen animate-in fade-in duration-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4 mb-8">
          {adoptions.length > 1 && (
            <Button
              variant="ghost"
              onClick={() => setSelectedAdoptionId(null)}
              className="rounded-full hover:bg-white/50"
            >
              <ArrowRight className="w-4 h-4 mr-2 rotate-180" />
              All Pets
            </Button>
          )}
          {adoptions.length > 1 && (
            <div className="flex gap-2 overflow-x-auto py-1">
              {adoptions.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAdoptionId(a.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition-all whitespace-nowrap",
                    selectedAdoptionId === a.id ? "bg-primary text-primary-foreground border-primary" : "bg-white hover:bg-muted"
                  )}
                >
                  <img src={a.petImage || "/placeholder.svg"} className="w-4 h-4 rounded-full object-cover" />
                  {a.petName}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="flex items-center gap-6">
            <div className="relative">
              <img
                src={dashboardData.petImage || "/placeholder.svg"}
                alt={dashboardData.petName}
                className="w-24 h-24 rounded-[2rem] object-cover shadow-2xl border-4 border-white ring-1 ring-black/5"
              />
              <div className="absolute -bottom-2 -right-2 bg-primary text-white p-2 rounded-xl shadow-lg">
                <Heart className="w-4 h-4 fill-current" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-4xl font-extrabold text-foreground tracking-tight">{dashboardData.petName}</h1>
                {isCompleted && <Badge className="bg-green-500 hover:bg-green-600 px-3 py-1 rounded-full uppercase text-[10px] font-bold tracking-widest">Graduated!</Badge>}
              </div>
              <p className="text-muted-foreground text-lg font-medium opacity-80">
                Phase {dashboardData.phaseInfo.current}: {dashboardData.phaseInfo.phaseName}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium">{dashboardData.streak} Day Log Streak</p>
              <div className="flex gap-0.5 justify-end">
                {[1, 2, 3, 4, 5, 6, 7].map(i => (
                  <div key={i} className={cn("w-2 h-2 rounded-full", i <= dashboardData.streak ? "bg-accent" : "bg-muted")} />
                ))}
              </div>
            </div>
            <Dialog open={isContactOpen} onOpenChange={setIsContactOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="rounded-xl shadow-sm border-primary/20 hover:bg-primary/5">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Contact Shelter
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] rounded-3xl">
                <DialogHeader>
                  <DialogTitle className="text-2xl font-bold">Message Shelter</DialogTitle>
                  <DialogDescription>
                    Need advice on {dashboardData.petName}'s behavior or health? Our partner shelters are here to help.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleContactSubmit} className="space-y-6 pt-4">
                  <div className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="subject" className="font-bold">Subject</Label>
                      <Input
                        id="subject"
                        placeholder="e.g., Behavior concern, Diet question"
                        className="rounded-xl border-muted focus-visible:ring-primary"
                        value={contactForm.subject}
                        onChange={e => setContactForm(p => ({ ...p, subject: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="message" className="font-bold">Your Message</Label>
                      <Textarea
                        id="message"
                        placeholder="Tell the shelter about your concern..."
                        className="rounded-xl border-muted focus-visible:ring-primary min-h-[150px]"
                        value={contactForm.message}
                        onChange={e => setContactForm(p => ({ ...p, message: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-4 bg-muted/30 rounded-2xl">
                    <Phone className="w-5 h-5 text-primary" />
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">Emergency Contact</p>
                      <p className="font-bold text-sm">+94 77 123 4567</p>
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="submit"
                      className="w-full py-6 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20"
                      disabled={isSendingContact}
                    >
                      {isSendingContact ? "Sending..." : "Send Message"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {isCompleted ? (
          <Card className="mb-12 border-none shadow-2xl bg-white overflow-hidden text-center py-12 px-6 ring-1 ring-green-100">
            <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-green-400 to-green-600" />
            <div className="w-24 h-24 bg-green-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-inner ring-8 ring-green-50">
              <Award className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-3xl font-extrabold text-green-900 mb-2">The 90-Day Milestone!</h2>
            <p className="text-green-700/80 font-semibold mb-6 max-w-lg mx-auto leading-relaxed">
              The critical adjustment period is over. You and {dashboardData.petName} are officially bonded forever!
            </p>
            <div className="bg-muted/30 rounded-3xl p-6 mb-8 max-w-2xl mx-auto border border-dashed border-muted-foreground/20">
              <p className="text-muted-foreground text-sm">
                Thank you for being a responsible pet parent. The shelter has been notified of your success.
                You can still view your logs, but the daily tracker is now complete.
              </p>
            </div>
            <Button onClick={() => window.print()} size="lg" className="bg-green-600 hover:bg-green-700 text-white shadow-xl shadow-green-200 rounded-2xl px-8 h-12">
              Download Graduation Certificate
            </Button>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-8">
              <Card className="border-none shadow-sm bg-card overflow-hidden">
                <div className="h-2 w-full bg-muted">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-1000"
                    style={{ width: `${dashboardData.overallProgress}%` }}
                  />
                </div>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      3-3-3 Bonding Journey
                    </div>
                    <span className="text-primary">{dashboardData.overallProgress}%</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-6">
                    {[
                      { days: 3, name: "Decompression", icon: Moon, id: 1 },
                      { days: 21, name: "Learning", icon: Activity, id: 2 },
                      { days: 90, name: "Bonding", icon: Heart, id: 3 },
                    ].map((phase) => {
                      const isActive = dashboardData.phaseInfo.current === phase.id
                      const isComplete = dashboardData.phaseInfo.current > phase.id
                      return (
                        <div key={phase.id} className={cn(
                          "relative p-5 rounded-2xl border-2 transition-all",
                          isActive ? "border-primary bg-primary/5 ring-4 ring-primary/5" : "border-muted bg-card opacity-60",
                          isComplete && "border-green-200 bg-green-50/30 opacity-100"
                        )}>
                          <div className="flex justify-between items-start mb-3">
                            <div className={cn("p-2 rounded-lg", isActive ? "bg-primary text-white" : "bg-muted text-muted-foreground", isComplete && "bg-green-100 text-green-600")}>
                              <phase.icon className="w-5 h-5" />
                            </div>
                            {isComplete && <Check className="w-5 h-5 text-green-600" />}
                          </div>
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Day 1-{phase.days}</p>
                          <h4 className="font-bold text-lg mb-2">{phase.name}</h4>
                          {isActive && (
                            <div className="space-y-2 mt-4">
                              <div className="flex justify-between text-[10px] font-bold uppercase text-primary">
                                <span>In Phase</span>
                                <span>{dashboardData.phaseInfo.progressInPhase}%</span>
                              </div>
                              <Progress value={dashboardData.phaseInfo.progressInPhase} className="h-1.5" />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-xl overflow-hidden bg-white ring-1 ring-black/5">
                <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-primary/10 py-5">
                  <CardTitle className="flex items-center gap-3 text-xl">
                    <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
                      <Heart className="w-5 h-5 text-primary" />
                    </div>
                    How is {dashboardData.petName} today?
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <form onSubmit={handleLogSubmit} className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-4">
                      {defaultChecklist.map(task => (
                        <button
                          key={task.id}
                          type="button"
                          onClick={() => toggleChecklist(task.id)}
                          className={cn(
                            "flex items-center gap-3 p-4 rounded-2xl border-2 transition-all text-left group relative overflow-hidden",
                            logForm.checklist[task.id as keyof typeof logForm.checklist]
                              ? "border-primary bg-primary/5 shadow-inner"
                              : "border-muted hover:border-primary/20 hover:bg-muted/30"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center",
                            logForm.checklist[task.id as keyof typeof logForm.checklist] ? "bg-primary text-white" : "bg-muted"
                          )}>
                            <task.icon className="w-4 h-4" />
                          </div>
                          <span className="text-sm font-semibold">{task.task}</span>
                        </button>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Overall Mood</p>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                        {Object.keys(moodColors).map(m => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setLogForm(p => ({ ...p, mood: m }))}
                            className={cn(
                              "p-3 rounded-xl border-2 text-center transition-all capitalize text-xs font-bold relative",
                              logForm.mood === m
                                ? "border-primary bg-primary text-white shadow-lg ring-4 ring-primary/10"
                                : "border-muted opacity-60 grayscale hover:grayscale-0 hover:border-primary/40"
                            )}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Behavioral Notes</p>
                      <Textarea
                        placeholder="Any notable behaviors, wins, or concerns? Shelters use this to support you."
                        className="bg-muted/30 border-none rounded-2xl min-h-[120px] focus-visible:ring-primary h-auto"
                        value={logForm.notes}
                        onChange={e => setLogForm(p => ({ ...p, notes: e.target.value }))}
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full py-6 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20"
                      disabled={isSubmittingLog}
                    >
                      {isSubmittingLog ? "Saving Progress..." : "Save Today's Log"}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <h3 className="text-xl font-bold flex items-center gap-2 px-2">
                  <Activity className="w-5 h-5 text-primary" />
                  Recent Progress Logs
                </h3>
                <div className="grid gap-4">
                  {dashboardData.logs?.map((log: any, i: number) => (
                    <Card key={i} className="border-none shadow-sm hover:translate-x-1 transition-transform">
                      <CardContent className="p-4 flex gap-4">
                        <div className="flex flex-col items-center justify-center w-12 h-12 bg-muted rounded-2xl flex-shrink-0">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">{new Date(log.log_date).toLocaleString('default', { month: 'short' })}</span>
                          <span className="text-lg font-bold leading-none">{new Date(log.log_date).getDate()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={cn("text-[10px] font-bold uppercase", moodColors[log.mood] || "bg-muted")}>{log.mood}</Badge>
                            <span className="text-xs text-muted-foreground">{new Date(log.log_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-sm text-foreground line-clamp-2">{log.notes || "No additional notes provided."}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {(!dashboardData.logs || dashboardData.logs.length === 0) && (
                    <div className="text-center py-8 text-muted-foreground">No logs found. Start your first entry above!</div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-8">
              <Card className="border-none shadow-sm bg-primary text-primary-foreground overflow-hidden">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Utensils className="w-5 h-5" />
                    Today's Goals
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-3xl font-bold">Consistent Routine</div>
                  <p className="text-primary-foreground/80 text-sm leading-relaxed">
                    Dogs feel safe when they know exactly what to expect. Try to feed and walk {dashboardData.petName} within 30 mins of the same time daily.
                  </p>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <h3 className="text-lg font-bold px-2">Resources for {dashboardData.phaseInfo.phaseName}</h3>
                <div className="space-y-3">
                  {(dashboardData.phaseInfo.current === 1 ? [
                    { title: "The 3-3-3 Rule: Day 1-3", url: "https://www.rescuedogs101.com/bringing-new-dog-home-3-3-3-rule/" },
                    { title: "Setting up a Safe Space", url: "https://www.humanesociety.org/resources/how-help-your-new-dog-settle-your-home" },
                    { title: "Signs of Decompression", url: "https://pawsforlifeoregon.org/the-3-3-3-rule/" }
                  ] : dashboardData.phaseInfo.current === 2 ? [
                    { title: "Establishing a Solid Routine", url: "https://www.akc.org/expert-advice/training/setting-schedules-and-routines-for-dogs/" },
                    { title: "First Month Training Tips", url: "https://www.aspca.org/pet-care/dog-care/dog-care-tips" },
                    { title: "Switching to a Home Diet", url: "https://www.akc.org/expert-advice/nutrition/switching-dog-foods/" }
                  ] : [
                    { title: "Deepening Your Bond", url: "https://www.akc.org/expert-advice/lifestyle/how-to-bond-with-your-dog/" },
                    { title: "Advanced Trick Training", url: "https://www.akc.org/expert-advice/training/fun-tricks-to-teach-your-dog/" },
                    { title: "Managing Long-term Anxiety", url: "https://www.aspca.org/pet-care/dog-care/common-dog-behavior-issues/separation-anxiety" }
                  ]).map((resource, i) => (
                    <a
                      key={i}
                      href={resource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center p-4 bg-card rounded-2xl border border-transparent hover:border-primary/20 transition-all text-left group cursor-pointer"
                    >
                      <div className="p-2 bg-muted rounded-lg mr-3 group-hover:bg-primary/10 transition-colors">
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                      </div>
                      <span className="text-sm font-medium flex-1 text-foreground">{resource.title}</span>
                    </a>
                  ))}
                </div>
              </div>

              <Card className="border-warning/30 bg-orange-50/50">
                <CardContent className="pt-6">
                  <div className="flex gap-4">
                    <AlertTriangle className="w-8 h-8 text-orange-500 flex-shrink-0" />
                    <div>
                      <h4 className="font-bold text-foreground mb-1">Risk Protection</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Our algorithm monitors {dashboardData.petName}'s mood logs. If we detect signs of severe anxiety for 3+ days, we'll automatically notify the shelter.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
