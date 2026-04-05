"use client";

import { useEffect, useState } from "react";
import { Settings, User, Mail, Shield, Key } from "lucide-react";
import { fetchApi } from "@/lib/api";

interface UserProfile {
    id: string;
    username: string;
    email: string;
}

export default function SettingsPage() {
    // In a real application, you might use a user profile endpoint.
    // For now, we will decode the JWT or display a generic view.
    // Assuming backend might have a /auth/me or we just display a static placeholder since there's no endpoint built for settings yet.
    
    return (
        <div className="max-w-4xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 border border-primary/20">
                    <Settings className="h-5 w-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        Account Settings
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage your profile and platform preferences.
                    </p>
                </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Profile Card */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="border-b border-border bg-muted/20 px-6 py-4">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <User className="h-4 w-4" /> Profile Information
                        </h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                    Username
                                </label>
                                <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border/50">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm text-foreground">Active User</span>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                                    Email Address
                                </label>
                                <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border border-border/50">
                                    <Mail className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm text-foreground">user@nexussec.com</span>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                This information is managed by your identity provider. Please contact your administrator to make changes.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Security Card */}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="border-b border-border bg-muted/20 px-6 py-4">
                        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                            <Shield className="h-4 w-4" /> Security
                        </h2>
                    </div>
                    <div className="p-6 space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-sm font-medium text-foreground">Password</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Update your password to keep your account secure.
                                    </p>
                                </div>
                                <button className="text-xs font-medium bg-muted text-foreground px-3 py-1.5 rounded-md hover:bg-muted/80 transition-colors">
                                    Update
                                </button>
                            </div>
                            <div className="h-px bg-border/50" />
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="text-sm font-medium text-foreground">API Keys</h3>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Manage API keys for CI/CD integration.
                                    </p>
                                </div>
                                <button className="text-xs font-medium bg-primary/10 text-primary px-3 py-1.5 rounded-md hover:bg-primary/20 transition-colors">
                                    Manage
                                </button>
                            </div>
                            <div className="h-px bg-border/50" />
                            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 mt-6">
                                <Key className="h-5 w-5 text-emerald-500" />
                                <div>
                                    <h4 className="text-sm font-medium text-emerald-500">JWT Authentication Active</h4>
                                    <p className="text-xs text-emerald-500/80">Your session is secured using industry standard tokens.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
