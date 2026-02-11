"use client"

import { useAuth } from "@/components/providers/auth-provider"
import Link from "next/link"
import { Dog, Heart, Mail, MapPin, Phone } from "lucide-react"

export function Footer() {
  const { user, isLoading } = useAuth()
  
  return (
    <footer className="bg-foreground text-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                <Dog className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="text-xl font-bold">PawMatch</span>
            </div>
            <p className="text-background/70 text-sm leading-relaxed">
              Smart pet adoption through data-driven compatibility matching. Making forever homes, not temporary stops.
            </p>
          </div>

          {/* Quick Links */}
          <div className="space-y-4">
            <h4 className="font-semibold">Quick Links</h4>
            <ul className="space-y-2 text-sm text-background/70">
              <li>
                <Link href="/quiz" className="hover:text-background transition-colors">
                  Take the Quiz
                </Link>
              </li>
              <li>
                <Link href="/matches" className="hover:text-background transition-colors">
                  Browse Pets
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="hover:text-background transition-colors">
                  Welfare Tracker
                </Link>
              </li>
              {!isLoading && !user && (
                <li>
                  <Link href="/shelters" className="hover:text-background transition-colors">
                    Partner Shelters
                  </Link>
                </li>
              )}
            </ul>
          </div>

          {/* Resources */}
          <div className="space-y-4">
            <h4 className="font-semibold">Resources</h4>
            <ul className="space-y-2 text-sm text-background/70">
              <li>
                <Link href="/foster-to-adopt" className="hover:text-background transition-colors">
                  Foster to Adopt
                </Link>
              </li>
              <li>
                <Link href="/buddy-check" className="hover:text-background transition-colors">
                  Buddy Check
                </Link>
              </li>
              <li>
                <Link href="/community-report" className="hover:text-background transition-colors">
                  Report an Animal
                </Link>
              </li>
              <li>
                <Link href="/shelters" className="hover:text-background transition-colors">
                  Partner Shelters
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-4">
            <h4 className="font-semibold">Contact Us</h4>
            <ul className="space-y-3 text-sm text-background/70">
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>hello@pawmatch.lk</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <span>+94 11 234 5678</span>
              </li>
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 mt-0.5" />
                <span>Colombo, Sri Lanka</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-background/20 flex flex-col md:flex-row items-center justify-center gap-4 text-sm text-background/60">
          <p className="flex items-center gap-1">
            Made with <Heart className="w-4 h-4 text-primary fill-primary" /> for animals everywhere
          </p>
        </div>
      </div>
    </footer>
  )
}
