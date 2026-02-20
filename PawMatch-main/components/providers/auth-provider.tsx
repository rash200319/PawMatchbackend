"use client"

import React, { createContext, useContext, useState, useEffect } from "react"
import { useRouter } from "next/navigation"

interface User {
    id: number
    email: string
    name: string

    role?: string
    shelter_name?: string
    verification_status?: string

    nic?: string
    phone_number?: string
    email_notifications?: boolean
    sms_alerts?: boolean
    created_at?: string
    pawsonality_results?: string | null
    unread_messages?: number
    pending_applications?: number

}

interface AuthContextType {
    user: User | null
    token: string | null
    login: (token: string, user: User) => void
    logout: () => void
    refreshUser: (user: User) => void
    isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [token, setToken] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const router = useRouter()

    useEffect(() => {
        // Check for user in sessionStorage on mount
        const storedUser = sessionStorage.getItem("user")
        const storedToken = sessionStorage.getItem("token")

        if (storedToken) {
            setToken(storedToken)
            // Always fetch fresh user data from server if we have a token
            fetch("/api/me", {
                headers: { "Authorization": `Bearer ${storedToken}` }
            })
                .then(res => res.json())
                .then(data => {
                    if (data.id) {
                        setUser(data)
                        sessionStorage.setItem("user", JSON.stringify(data))
                    } else if (storedUser) {
                        // Fallback to stored user if fetch fails but we have it
                        setUser(JSON.parse(storedUser))
                    }
                })
                .catch(() => {
                    if (storedUser) setUser(JSON.parse(storedUser))
                })
                .finally(() => setIsLoading(false))
        } else {
            setIsLoading(false)
        }
    }, [])

    const login = (newToken: string, newUser: User) => {
        sessionStorage.setItem("token", newToken)
        sessionStorage.setItem("user", JSON.stringify(newUser))
        setToken(newToken)
        setUser(newUser)
        // Optional: redirect or let the component handle it
    }

    const logout = () => {
        sessionStorage.removeItem("token")
        sessionStorage.removeItem("user")
        localStorage.removeItem("pawmatch_matches")
        localStorage.removeItem("pawmatch_quiz_timestamp")
        setToken(null)
        setUser(null)
        router.push("/login")
    }

    const refreshUser = (updatedUser: User) => {
        sessionStorage.setItem("user", JSON.stringify(updatedUser))
        setUser(updatedUser)
    }

    return (
        <AuthContext.Provider value={{ user, token, login, logout, refreshUser, isLoading }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider")
    }
    return context
}
